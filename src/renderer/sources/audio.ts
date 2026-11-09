/** Mixes the source's live media and exposes a smoothed bass envelope. */
export class AudioMeter {
  private context = new AudioContext();
  private analyser = this.context.createAnalyser();
  private bins = new Uint8Array(1024);

  constructor() {
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.55;
    this.analyser.connect(this.context.destination);
  }

  connect(media: HTMLMediaElement): () => void {
    const input = this.context.createMediaElementSource(media);
    input.connect(this.analyser);
    this.resume();
    return () => input.disconnect();
  }

  resume(): void {
    if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
  }

  bass(): number {
    if (this.context.state !== 'running') return 0;
    this.analyser.getByteFrequencyData(this.bins);
    const hzPerBin = this.context.sampleRate / this.analyser.fftSize;
    const first = Math.max(1, Math.ceil(40 / hzPerBin));
    const last = Math.floor(150 / hzPerBin);
    let sum = 0;
    for (let i = first; i <= last; i++) sum += (this.bins[i] / 255) ** 2;
    return Math.sqrt(sum / (last - first + 1));
  }

  dispose(): void {
    void this.context.close().catch(() => {});
  }
}
