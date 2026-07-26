/**
 * VoiceInput — continuous mic → utterance endpointing → local Whisper → matched word.
 *
 * The game's "ear". Feed it the level's grammar (tiny word set); it calls onMatch
 * the instant Whisper + server-side constrained matching resolve a spoken word.
 * Same loop proven in the Phase 0 spike (client/public/spike-whisper.html).
 */

export type VoiceState = "idle" | "listening" | "speaking" | "thinking";

export interface VoiceMatch {
  word: string;
  score: number;
  transcript: string;
  latencyMs: number; // "stopped talking" → result
  decodeMs?: number;
}

export interface VoiceInputOptions {
  lang: "russian" | "spanish";
  grammar: string[];
  onMatch: (m: VoiceMatch) => void;
  onState?: (s: VoiceState) => void;
  onError?: (e: string) => void;
  onLevel?: (rms: number) => void;
  endpointSilenceMs?: number; // trailing silence that ends an utterance
  asrUrl?: string;
}

export class VoiceInput {
  private opts: Required<Pick<VoiceInputOptions, "endpointSilenceMs" | "asrUrl">> & VoiceInputOptions;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: ScriptProcessorNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;

  private inSpeech = false;
  private sinceVoiceMs = 0;
  private lastVoiceAt = 0;
  private busy = false;
  private buf: Float32Array[] = [];
  private preroll: Float32Array[] = [];

  private readonly ON = 0.02;
  private readonly OFF = 0.012;
  private readonly PREROLL = 14; // ~300ms of lead-in at 1024-frame granularity

  constructor(options: VoiceInputOptions) {
    this.opts = {
      endpointSilenceMs: 150,
      asrUrl: "/api/asr-local",
      ...options,
    };
  }

  setGrammar(words: string[]) { this.opts.grammar = words; }
  setLang(lang: "russian" | "spanish") { this.opts.lang = lang; }
  setEndpointSilenceMs(ms: number) { this.opts.endpointSilenceMs = ms; }

  async start() {
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await this.ctx.resume();
    if (!this.stream) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }, video: false,
      });
      this.src = this.ctx.createMediaStreamSource(this.stream);
      // small frame (~21ms @48k) → tight endpoint detection instead of 85ms steps
      this.node = this.ctx.createScriptProcessor(1024, 1, 1);
      this.node.onaudioprocess = (e) => this.onAudio(e);
      this.src.connect(this.node);
      this.node.connect(this.ctx.destination);
    }
    this.opts.onState?.("listening");
  }

  stop() {
    this.node?.disconnect(); this.src?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = this.src = this.stream = null;
    this.inSpeech = false; this.buf = []; this.preroll = [];
    this.opts.onState?.("idle");
  }

  private onAudio(e: AudioProcessingEvent) {
    const inb = e.inputBuffer.getChannelData(0);
    const chunk = new Float32Array(inb);
    let sum = 0; for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i];
    const rms = Math.sqrt(sum / chunk.length);
    this.opts.onLevel?.(rms);
    const dtMs = (chunk.length / this.ctx!.sampleRate) * 1000;

    this.preroll.push(chunk);
    while (this.preroll.length > this.PREROLL) this.preroll.shift();

    if (!this.inSpeech) {
      if (rms > this.ON) {
        this.inSpeech = true; this.sinceVoiceMs = 0; this.lastVoiceAt = performance.now();
        this.buf.push(...this.preroll);
        this.opts.onState?.("speaking");
      }
    } else {
      this.buf.push(chunk);
      if (rms > this.OFF) { this.sinceVoiceMs = 0; this.lastVoiceAt = performance.now(); }
      else {
        this.sinceVoiceMs += dtMs;
        if (this.sinceVoiceMs >= this.opts.endpointSilenceMs) { this.inSpeech = false; this.flush(); }
      }
    }
  }

  private async flush() {
    if (this.busy) return;
    this.busy = true;
    const endAt = this.lastVoiceAt;
    const chunks = this.buf.splice(0, this.buf.length);
    const float48 = flatten(chunks);
    const float16 = resample(float48, this.ctx!.sampleRate, 16000);
    if (float16.length < 16000 * 0.15) { this.busy = false; return; } // <150ms → noise
    this.opts.onState?.("thinking");
    try {
      const audioBase64 = await wavBase64(float16, 16000);
      const resp = await fetch(this.opts.asrUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64, targets: this.opts.grammar.join(" "), lang: this.opts.lang }),
      });
      const latencyMs = Math.round(performance.now() - endAt);
      const data = await resp.json();
      this.opts.onState?.("listening");
      if (data.matched) {
        this.opts.onMatch({ word: data.matched, score: data.score ?? 0, transcript: data.transcript ?? "", latencyMs, decodeMs: data.decode_ms });
      }
    } catch (err: any) {
      this.opts.onState?.("listening");
      this.opts.onError?.(err?.message || String(err));
    } finally {
      this.busy = false;
    }
  }
}

function flatten(chunks: Float32Array[]): Float32Array {
  let n = 0; for (const c of chunks) n += c.length;
  const out = new Float32Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; } return out;
}
function resample(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate, n = Math.floor(input.length / ratio), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const idx = i * ratio, i0 = Math.floor(idx), i1 = Math.min(i0 + 1, input.length - 1);
    out[i] = input[i0] + (input[i1] - input[i0]) * (idx - i0);
  }
  return out;
}
function wavBase64(f32: Float32Array, rate: number): Promise<string> {
  const buffer = new ArrayBuffer(44 + f32.length * 2), v = new DataView(buffer);
  const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wr(0, "RIFF"); v.setUint32(4, 36 + f32.length * 2, true); wr(8, "WAVE"); wr(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wr(36, "data"); v.setUint32(40, f32.length * 2, true);
  let o = 44; for (let i = 0; i < f32.length; i++) { const s = Math.max(-1, Math.min(1, f32[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  const blob = new Blob([buffer], { type: "audio/wav" });
  return new Promise((res) => { const r = new FileReader(); r.onloadend = () => res((r.result as string).split(",")[1]); r.readAsDataURL(blob); });
}
