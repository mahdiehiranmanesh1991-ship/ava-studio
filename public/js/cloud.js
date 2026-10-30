// Optional cloud TTS / instant clone via ElevenLabs. Key stays in localStorage on this device.
const BASE = 'https://api.elevenlabs.io/v1';
export const getKey = () => localStorage.getItem('ava.elevenKey') || '';
export const setKey = (k) => (k ? localStorage.setItem('ava.elevenKey', k.trim()) : localStorage.removeItem('ava.elevenKey'));
const h = () => ({ 'xi-api-key': getKey() });
async function ok(r) { if (!r.ok) { let m = r.status; try { const j = await r.json(); m += ' ' + (j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j)); } catch {} throw new Error(m); } return r; }
export async function listVoices() { const r = await ok(await fetch(BASE + '/voices', { headers: h() })); return (await r.json()).voices || []; }
export async function tts(text, voiceId, model = 'eleven_v3', settings = {}) {
  const r = await ok(await fetch(`${BASE}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { ...h(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: settings.stability ?? 0.5, similarity_boost: settings.similarity ?? 0.8 } }),
  }));
  return await r.blob();
}
export async function cloneVoice(name, blobs, description) {
  const fd = new FormData(); fd.append('name', name); if (description) fd.append('description', description);
  blobs.forEach((b, i) => fd.append('files', b, `sample-${i}.${(b.type || '').includes('wav') ? 'wav' : (b.type || '').includes('mp4') ? 'm4a' : 'webm'}`));
  const r = await ok(await fetch(BASE + '/voices/add', { method: 'POST', headers: h(), body: fd }));
  return (await r.json()).voice_id;
}
