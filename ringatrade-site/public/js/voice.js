let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let isRecording = false;

// Step logic
function openVoiceModal() {
  document.getElementById('voiceModal').style.display = 'flex';
  document.getElementById('voiceStep1').style.display = 'block';
  document.getElementById('voiceStep2').style.display = 'none';
  document.getElementById('voiceStep3').style.display = 'none';
}

function closeVoiceModal() {
  stopVoiceSession();
  document.getElementById('voiceModal').style.display = 'none';
}

async function initVoiceSession() {
  const postcode = document.getElementById('voiceSetupPostcode').value.trim();
  const phone = document.getElementById('voiceSetupPhone').value.trim();
  
  if (!postcode || !phone) {
    alert("Please enter both your postcode and phone number to continue.");
    return;
  }

  document.getElementById('voiceStep1').style.display = 'none';
  document.getElementById('voiceStep2').style.display = 'block';
  
  startVoiceSession(postcode, phone);
}

// Convert Float32Array to Int16Array for PCM
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToFloat32Array(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32Array;
}

function updateState(state) {
  const statusEl = document.getElementById("voice-status");
  const wave = document.querySelector(".voice-wave");
  if (!statusEl) return;

  statusEl.innerText = state;
  if (state === "Listening...") {
    wave.classList.add("active");
  } else {
    wave.classList.remove("active");
  }
}

async function startVoiceSession(postcode, phone) {
  updateState("Connecting...");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    updateState("Mic permission denied. Use form.");
    return;
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  await audioContext.audioWorklet.addModule('/js/pcm-processor.js');

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/voice?postcode=${encodeURIComponent(postcode)}&phone=${encodeURIComponent(phone)}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateState("Processing...");
  };

  ws.onmessage = async (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === "ready") {
      updateState("Listening...");
      isRecording = true;
      startStreaming();
    } else if (msg.type === "audio") {
      updateState("Listening...");
      playAudio(msg.data);
    } else if (msg.type === "tool_submit_lead") {
      // Gemini has finished collecting data
      updateState("Confirming Details...");
      stopVoiceSession(); // End audio
      showSummaryScreen(msg.data);
    } else if (msg.type === "error") {
      updateState("Error: " + msg.message);
    }
  };

  ws.onclose = () => {
    if (isRecording) {
      updateState("Connection lost.");
      stopVoiceSession();
    }
  };
}

function startStreaming() {
  const source = audioContext.createMediaStreamSource(mediaStream);
  audioWorkletNode = new AudioWorkletNode(audioContext, "pcm-processor");
  
  audioWorkletNode.port.onmessage = (event) => {
    if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;
    
    const float32Data = event.data;
    const pcm16Data = floatTo16BitPCM(float32Data);
    const base64Data = bufferToBase64(pcm16Data);
    
    ws.send(JSON.stringify({
      type: "audio",
      data: base64Data
    }));
  };

  source.connect(audioWorkletNode);
  audioWorkletNode.connect(audioContext.destination);
}

function playAudio(base64Data) {
  if (!audioContext) return;
  const float32Data = base64ToFloat32Array(base64Data);
  const audioBuffer = audioContext.createBuffer(1, float32Data.length, 16000);
  audioBuffer.getChannelData(0).set(float32Data);
  
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioContext.destination);
  source.start();
}

function stopVoiceSession() {
  isRecording = false;
  if (ws) {
    ws.close();
    ws = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}

function showSummaryScreen(data) {
  document.getElementById('voiceStep2').style.display = 'none';
  document.getElementById('voiceStep3').style.display = 'block';

  document.getElementById('v_trade').value = data.trade || '';
  document.getElementById('v_urgency').value = data.urgency || '';
  document.getElementById('v_desc').value = data.job_description || '';
  document.getElementById('v_postcode').value = data.postcode || document.getElementById('voiceSetupPostcode').value;
  document.getElementById('v_name').value = data.customer_name || '';
  document.getElementById('v_phone').value = data.phone || document.getElementById('voiceSetupPhone').value;
  document.getElementById('v_email').value = data.email || '';
  document.getElementById('v_contact').value = data.preferred_contact_method || '';
}

async function submitVoiceJob(event) {
  event.preventDefault();
  const btn = document.getElementById('btnVoiceSubmit');
  btn.disabled = true;
  btn.innerText = "Submitting...";

  const payload = {
    trade: document.getElementById('v_trade').value,
    urgency: document.getElementById('v_urgency').value,
    job_description: document.getElementById('v_desc').value,
    postcode: document.getElementById('v_postcode').value,
    customer_name: document.getElementById('v_name').value,
    phone: document.getElementById('v_phone').value,
    email: document.getElementById('v_email').value,
    preferred_contact_method: document.getElementById('v_contact').value
  };

  try {
    const res = await fetch('/api/submit-voice-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      document.getElementById('voiceStep3').innerHTML = `
        <div style="text-align:center; padding: 2rem;">
          <h2 style="color: green;">✓ Submitted Successfully</h2>
          <p>We'll be in touch shortly!</p>
          <button class="btn btn-primary" onclick="closeVoiceModal()" style="margin-top: 1rem;">Close</button>
        </div>
      `;
    } else {
      throw new Error("Submission failed");
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerText = "Submit Job Request";
    alert("There was an error submitting your request. Please try again.");
  }
}
