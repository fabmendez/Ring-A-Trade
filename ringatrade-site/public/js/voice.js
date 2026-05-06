let ws = null;
let audioContext = null;
let mediaStream = null;
let audioWorkletNode = null;
let isRecording = false;

// Convert Float32Array to Int16Array for PCM
function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

// Convert Int16Array to Base64
function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer.buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 back to Float32Array for playback
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

async function startVoiceSession() {
  document.getElementById("voiceModal").style.display = "flex";
  updateState("Connecting...");

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    updateState("Mic permission denied. Use form.");
    return;
  }

  // Use 16000 Hz which is required by Gemini Multimodal Live API
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  await audioContext.audioWorklet.addModule('/js/pcm-processor.js');

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/voice`);

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
    } else if (msg.type === "submitted") {
      updateState("Submitted! Thank you.");
      isRecording = false;
      setTimeout(() => {
        stopVoiceSession();
      }, 3000);
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
    if (!isRecording || ws.readyState !== WebSocket.OPEN) return;
    
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
