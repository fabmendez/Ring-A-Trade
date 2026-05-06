class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(0);
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
