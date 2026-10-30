// Pure helpers (tested with vitest)
const FA = '۰۱۲۳۴۵۶۷۸۹';
export const toFa = (v) => String(v).replace(/\d/g, (d) => FA[d]).replace(/\./g, '٫');
export const toEn = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.');
export const WPS = 2.6;
export function wordCount(text) {
  return String(text || '').replace(/[؛،.؟?!:«»"()\-–—]/g, ' ').split(/\s+/).filter(Boolean).length;
}
export function readingTime(text, wps = WPS) {
  const w = wordCount(text);
  return w === 0 ? 0 : Math.round((w / wps + 0.15 * (String(text).match(/[؛،.؟?!]/g) || []).length) * 10) / 10;
}
export function cueFit(cue, wps = WPS) {
  const window = Math.max(0, cue.end - cue.start);
  const need = readingTime(cue.text, wps);
  const ratio = window ? need / window : Infinity;
  const status = ratio <= 0.9 ? 'ok' : ratio <= 1.05 ? 'tight' : 'long';
  return { window: Math.round(window * 10) / 10, need, ratio, status, wordsMax: Math.floor(window * wps) };
}
export function validateCues(cues) {
  const errs = [];
  const s = [...cues].sort((a, b) => a.start - b.start);
  s.forEach((c, i) => {
    if (c.end <= c.start) errs.push({ i, msg: 'end<=start' });
    if (i && c.start < s[i - 1].end) errs.push({ i, msg: 'overlap' });
  });
  return errs;
}
const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
export function srtTime(sec) {
  const ms = Math.round(Math.max(0, sec) * 1000);
  return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)},${pad(ms % 1000, 3)}`;
}
export function toSRT(segs) {
  return segs.filter((s) => (s.text || '').trim()).map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text.trim()}\n`).join('\n');
}
export function clock(sec) { sec = Math.max(0, sec || 0); return toFa(`${Math.floor(sec / 60)}:${pad(sec % 60)}`); }

export const VOICES = {
  natural: { name: 'طبیعی', pitch: 0, warmth: 0, bright: 0, reverb: 0, radio: false },
  cinematic: { name: 'راوی سینمایی', pitch: -2, warmth: 4, bright: 1, reverb: 0.22, radio: false },
  lawyer: { name: 'وکیل مطمئن', pitch: -1, warmth: 2, bright: 2, reverb: 0.06, radio: false },
  friendly: { name: 'صمیمی', pitch: 1, warmth: 1, bright: 1, reverb: 0.03, radio: false },
  radio: { name: 'رادیویی', pitch: 0, warmth: -2, bright: 3, reverb: 0, radio: true },
  hall: { name: 'تالار دادگاه', pitch: -1, warmth: 1, bright: 0, reverb: 0.4, radio: false },
};
const KW = [
  [/سینما|حماسی|فیلم|تریلر/, { reverb: 0.2, pitch: -2, warmth: 3 }],
  [/بم|عمیق|کلفت|سنگین|پایین/, { pitch: -3, warmth: 3 }],
  [/زیر|نازک|جوان|بالا/, { pitch: 2, bright: 2 }],
  [/گرم|نرم|مخملی|آرام/, { warmth: 4, bright: -1 }],
  [/شفاف|روشن|تیز|واضح/, { bright: 4 }],
  [/رادیو|تلفن|بی‌سیم|قدیمی/, { radio: true }],
  [/سالن|تالار|اکو|پژواک|کلیسا|دادگاه/, { reverb: 0.4 }],
  [/صمیمی|دوستانه|خودمانی/, { pitch: 1, reverb: 0.03 }],
  [/رسمی|مطمئن|محکم|قاطع|وکیل/, { pitch: -1, bright: 2, warmth: 2 }],
];
export function designFromText(desc) {
  const p = { ...VOICES.natural, name: 'صدای طراحی‌شده' };
  const hits = [];
  for (const [re, d] of KW) if (re.test(desc || '')) {
    hits.push(re.source.split('|')[0]);
    for (const k in d) p[k] = typeof d[k] === 'boolean' ? d[k] : Math.max(-6, Math.min(6, (p[k] || 0) + d[k]));
  }
  p.reverb = Math.min(0.5, p.reverb);
  return { preset: p, hits };
}
