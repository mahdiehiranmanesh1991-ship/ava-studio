// Web Audio engine: recording, processing, encoding (original implementation)
export const AC = window.AudioContext || window.webkitAudioContext;
let ctx; export const audioCtx = () => (ctx ||= new AC());

export function pickMime() {
  const c = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
  return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported?.(m)) || '';
}
export async function startRecorder(onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const ac = audioCtx(); await ac.resume();
  const src = ac.createMediaStreamSource(stream); const an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
  const buf = new Float32Array(an.fftSize); let raf;
  const loop = () => { an.getFloatTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v)); onLevel?.(m, buf); raf = requestAnimationFrame(loop); };
  loop(); rec.start(250); const t0 = performance.now();
  return {
    stream, elapsed: () => (performance.now() - t0) / 1000,
    stop: () => new Promise((res) => { rec.onstop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); src.disconnect(); res(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' })); }; rec.stop(); }),
  };
}
export async function decode(blob) {
  const ab = await blob.arrayBuffer();
  return await new Promise((res, rej) => audioCtx().decodeAudioData(ab, res, rej));
}
export function peaks(buffer, n = 400) {
  const d = buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = [];
  for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j++) m = Math.max(m, Math.abs(d[j])); out.push(m); }
  return out;
}
export function trim(buffer, a, b) {
  const sr = buffer.sampleRate, s = Math.floor(a * sr), e = Math.min(buffer.length, Math.floor(b * sr));
  const out = new AudioBuffer({ length: Math.max(1, e - s), numberOfChannels: 1, sampleRate: sr });
  out.copyToChannel(buffer.getChannelData(0).slice(s, e), 0); return out;
}
function impulse(oc, sec = 2.2, decay = 3) {
  const len = Math.floor(oc.sampleRate * sec), ir = oc.createBuffer(2, len, oc.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return ir;
}
export const EQ = {
  flat: { low: 0, mid: 0, high: 0, name: 'بدون EQ' },
  voice: { low: -2, mid: 2, high: 3, name: 'وضوح گفتار' },
  warm: { low: 3, mid: 0, high: -1, name: 'گرم' },
  phone: { low: -6, mid: 4, high: 1, name: 'موبایل‌پسند' },
};
// opts: {hpf, gate, comp, eq, deess, normalize, voice:{pitch,warmth,bright,reverb,radio}}
export async function processBuffer(input, opts = {}) {
  const v = opts.voice || {};
  const rate = Math.pow(2, (v.pitch || 0) / 12);
  const sr = 44100, len = Math.ceil((input.duration / rate + (v.reverb ? 2 : 0.1)) * sr);
  const oc = new OfflineAudioContext(1, len, sr);
  const src = oc.createBufferSource(); src.buffer = input; src.playbackRate.value = rate;
  let node = src; const chain = (n) => { node.connect(n); node = n; return n; };
  if (opts.hpf !== false) { const f = chain(oc.createBiquadFilter()); f.type = 'highpass'; f.frequency.value = 80; f.Q.value = 0.7; }
  const eq = EQ[opts.eq || 'flat'];
  const low = chain(oc.createBiquadFilter()); low.type = 'lowshelf'; low.frequency.value = 220; low.gain.value = eq.low + (v.warmth || 0);
  const mid = chain(oc.createBiquadFilter()); mid.type = 'peaking'; mid.frequency.value = 2500; mid.Q.value = 1; mid.gain.value = eq.mid;
  const hi = chain(oc.createBiquadFilter()); hi.type = 'highshelf'; hi.frequency.value = 6000; hi.gain.value = eq.high + (v.bright || 0);
  if (opts.deess) { const d = chain(oc.createBiquadFilter()); d.type = 'peaking'; d.frequency.value = 7000; d.Q.value = 3; d.gain.value = -6; }
  if (v.radio) {
    const bp = chain(oc.createBiquadFilter()); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 0.9;
    const ws = chain(oc.createWaveShaper()); const c = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; c[i] = Math.tanh(2.5 * x); } ws.curve = c;
  }
  if (opts.comp !== false) { const k = chain(oc.createDynamicsCompressor()); k.threshold.value = -24; k.ratio.value = 3.5; k.knee.value = 8; k.attack.value = 0.005; k.release.value = 0.15; }
  node.connect(oc.destination);
  if (v.reverb) { const cv = oc.createConvolver(); cv.buffer = impulse(oc); const g = oc.createGain(); g.gain.value = v.reverb; node.connect(cv); cv.connect(g); g.connect(oc.destination); }
  src.start();
  const out = await oc.startRendering();
  const d = out.getChannelData(0);
  if (opts.gate) gate(d, sr);
  if (opts.normalize !== false) normalizeLufs(d, sr, -16);
  return out;
}
function gate(d, sr, thrDb = -50) {
  const thr = Math.pow(10, thrDb / 20), w = Math.floor(sr * 0.02); let env = 0, g = 1;
  for (let i = 0; i < d.length; i++) {
    env = Math.max(Math.abs(d[i]), env * (1 - 1 / w));
    const target = env > thr ? 1 : 0.06; g += (target - g) * (target > g ? 0.01 : 0.0005); d[i] *= g;
  }
}
// Approximate integrated loudness: RMS of 400ms blocks above -70 dBFS & relative gate (no K-weighting, ~±1.5 LU)
export function loudness(d, sr) {
  const b = Math.floor(sr * 0.4), ms = [];
  for (let i = 0; i + b <= d.length; i += b / 4) { let s = 0; for (let j = i; j < i + b; j++) s += d[j] * d[j]; ms.push(s / b); }
  const lk = (m) => -0.691 + 10 * Math.log10(m + 1e-12);
  let g = ms.filter((m) => lk(m) > -70); if (!g.length) return -70;
  const rel = lk(g.reduce((a, c) => a + c, 0) / g.length) - 10; g = g.filter((m) => lk(m) > rel);
  return lk(g.reduce((a, c) => a + c, 0) / g.length);
}
function normalizeLufs(d, sr, target) {
  const L = loudness(d, sr); let gain = Math.pow(10, (target - L) / 20);
  let pk = 0; for (const x of d) pk = Math.max(pk, Math.abs(x));
  gain = Math.min(gain, 0.89 / (pk || 1));
  for (let i = 0; i < d.length; i++) d[i] *= gain;
}
export function encodeWav(buffer) {
  const ch = buffer.numberOfChannels, sr = buffer.sampleRate, n = buffer.length;
  const ab = new ArrayBuffer(44 + n * ch * 2), v = new DataView(ab);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, sr, true); v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const chans = [...Array(ch)].map((_, i) => buffer.getChannelData(i)); let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, chans[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
// Re-encode with MediaRecorder (m4a on Safari, webm elsewhere) in realtime
export async function encodeCompressed(buffer) {
  const ac = audioCtx(); await ac.resume();
  const dst = ac.createMediaStreamDestination(); const s = ac.createBufferSource(); s.buffer = buffer; s.connect(dst);
  const mime = pickMime(); const rec = new MediaRecorder(dst.stream, mime ? { mimeType: mime } : undefined); const ch = [];
  rec.ondataavailable = (e) => e.data.size && ch.push(e.data);
  const done = new Promise((r) => (rec.onstop = () => r(new Blob(ch, { type: rec.mimeType || mime }))));
  rec.start(); s.start(); s.onended = () => setTimeout(() => rec.stop(), 150);
  return done;
}
export function mixTimeline(items, duration, sr = 44100) {
  // items: [{buffer, at}] -> mono AudioBuffer of `duration` seconds
  const out = new AudioBuffer({ length: Math.ceil(duration * sr), numberOfChannels: 1, sampleRate: sr }); const d = out.getChannelData(0);
  for (const it of items) {
    const b = it.buffer, src = b.getChannelData(0), ratio = b.sampleRate / sr, off = Math.floor(it.at * sr);
    for (let i = 0; off + i < d.length && i * ratio < src.length; i++) if (off + i >= 0) d[off + i] += src[Math.floor(i * ratio)];
  }
  for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i]));
  return out;
}
export async function to16kMono(buffer) {
  const oc = new OfflineAudioContext(1, Math.ceil(buffer.duration * 16000), 16000);
  const s = oc.createBufferSource(); s.buffer = buffer; s.connect(oc.destination); s.start();
  return (await oc.startRendering()).getChannelData(0);
}
export function playBuffer(buffer, onEnd) {
  const ac = audioCtx(); ac.resume(); const s = ac.createBufferSource(); s.buffer = buffer; s.connect(ac.destination); s.onended = onEnd; s.start(); return s;
}
