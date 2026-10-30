import { toFa, toEn, readingTime, wordCount, cueFit, validateCues, toSRT, clock, VOICES, designFromText, WPS } from './lib.js';
import * as A from './audio.js';
import * as DB from './db.js';
import * as C from './cloud.js';

const $ = (s, r = document) => r.querySelector(s);
const el = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstElementChild; };
const toast = (m) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
const ext = (b) => (b.type.includes('wav') ? 'wav' : b.type.includes('mp4') || b.type.includes('aac') ? 'm4a' : b.type.includes('mpeg') ? 'mp3' : 'webm');
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fa = (n, d = 1) => toFa((+n).toFixed(d));

const state = { take: null, takeBlob: null, processed: null, trim: [0, 0], voice: 'natural', designed: null, project: null };

/* ---------- Tabs ---------- */
const TABS = [
  ['record', '🎙', 'ضبط'], ['design', '✦', 'طراحی'], ['tts', '🗣', 'گفتار'], ['dub', '🎬', 'دوبله'], ['stt', '✎', 'متن'], ['lib', '▤', 'پروژه‌ها'],
];
const views = $('#views'), tabs = $('#tabs');
TABS.forEach(([id, ic, t]) => {
  views.append(el(`<section class="view" id="v-${id}"></section>`));
  const b = el(`<button data-t="${id}"><span>${ic}</span>${t}</button>`); b.onclick = () => go(id); tabs.append(b);
});
function go(id) { document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'v-' + id)); tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.t === id)); location.hash = id; window.scrollTo(0, 0); }

/* ---------- Waveform ---------- */
function drawWave(cv, pk, sel, playhead) {
  const r = devicePixelRatio || 1, w = cv.clientWidth * r, h = cv.clientHeight * r; cv.width = w; cv.height = h;
  const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
  if (sel) { g.fillStyle = '#d4af6a1c'; g.fillRect(sel[0] * w, 0, (sel[1] - sel[0]) * w, h); }
  const bw = w / pk.length;
  pk.forEach((p, i) => { const x = i * bw, y = Math.max(2 * r, p * h * 0.9); const inSel = !sel || (i / pk.length >= sel[0] && i / pk.length <= sel[1]); g.fillStyle = inSel ? '#d4af6a' : '#3a4a7a'; g.fillRect(x, (h - y) / 2, Math.max(1, bw - r), y); });
  if (sel) { g.fillStyle = '#f1d9a0'; [sel[0], sel[1]].forEach((s) => g.fillRect(s * w - r, 0, 3 * r, h)); }
  if (playhead != null) { g.fillStyle = '#fff'; g.fillRect(playhead * w, 0, 2 * r, h); }
}

/* ---------- 1. Record ---------- */
const vRec = $('#v-record');
vRec.innerHTML = `
<h1>استودیوی <em>ضبط</em></h1><p class="sub">صدای خودت را با متن‌خوان ضبط کن، برش بزن و با زنجیره‌ی پردازش استودیویی تمیزش کن.</p>
<div class="card"><h3>متن‌خوان</h3><textarea id="r-script" placeholder="متن نریشن را اینجا بنویس…"></textarea>
<div class="row" style="margin-top:8px"><small class="grow" id="r-est"></small><label style="margin:0">سرعت</label><input id="r-speed" type="range" min="0.6" max="1.6" step="0.1" value="1" style="width:110px"></div>
<div class="prompter" style="margin-top:10px"><div id="r-prompt"></div></div></div>
<div class="card"><div class="timer" id="r-timer">۰:۰۰</div><button class="rec" id="r-btn" aria-label="ضبط"></button>
<canvas class="wave" id="r-live"></canvas><p class="note" id="r-mime"></p></div>
<div class="card hidden" id="r-edit"><h3>برش و پردازش</h3>
<canvas class="wave" id="r-wave"></canvas><div class="row" style="margin-top:6px;font-size:12px;color:var(--mut)"><span class="grow" id="r-sel"></span><span>دو سر طلایی را بکش</span></div>
<div class="toggle">فیلتر بالاگذر (حذف غرش)<input type="checkbox" id="p-hpf" checked></div>
<div class="toggle">دروازه‌ی نویز<input type="checkbox" id="p-gate" checked></div>
<div class="toggle">کمپرسور<input type="checkbox" id="p-comp" checked></div>
<div class="toggle">کاهش «س» تیز (دی‌اسر)<input type="checkbox" id="p-deess" checked></div>
<div class="toggle">نرمال‌سازی به حدود −۱۶ LUFS<input type="checkbox" id="p-norm" checked></div>
<label>پیش‌تنظیم EQ</label><div class="chips" id="p-eq"></div>
<div class="row" style="margin-top:14px"><button class="btn" id="r-play">▶ خام</button><button class="btn gold grow" id="r-proc">✦ پردازش و پخش</button></div>
<div class="row" style="margin-top:8px"><button class="btn sm" id="r-wav">WAV</button><button class="btn sm" id="r-m4a">M4A / WebM</button><button class="btn sm" id="r-save">ذخیره در پروژه</button></div>
<p class="note" id="r-info"></p></div>`;
let eqSel = 'voice';
const eqBox = $('#p-eq'); Object.entries(A.EQ).forEach(([k, v]) => { const c = el(`<button class="chip ${k === eqSel ? 'on' : ''}">${v.name}</button>`); c.onclick = () => { eqSel = k; eqBox.querySelectorAll('.chip').forEach((x) => x.classList.remove('on')); c.classList.add('on'); }; eqBox.append(c); });
const rScript = $('#r-script');
const updEst = () => { const t = rScript.value; $('#r-est').textContent = `${toFa(wordCount(t))} کلمه · حدود ${fa(readingTime(t))} ثانیه`; $('#r-prompt').textContent = t || 'متن تو اینجا آرام بالا می‌رود…'; };
rScript.oninput = updEst;
$('#r-mime').textContent = window.MediaRecorder ? `قالب ضبط این دستگاه: ${A.pickMime() || 'پیش‌فرض مرورگر'}` : 'این مرورگر ضبط صدا را پشتیبانی نمی‌کند.';
let recorder = null, promptRaf;
$('#r-btn').onclick = async () => {
  const btn = $('#r-btn');
  if (!recorder) {
    try {
      const live = $('#r-live'); const hist = [];
      recorder = await A.startRecorder((m) => { hist.push(m); if (hist.length > 200) hist.shift(); drawWave(live, hist.length < 200 ? [...Array(200 - hist.length).fill(0), ...hist] : hist); });
    } catch (e) { toast('دسترسی به میکروفون داده نشد'); return; }
    btn.classList.add('on');
    const p = $('#r-prompt'), est = Math.max(3, readingTime(rScript.value)), H = p.scrollHeight;
    const tick = () => { const t = recorder.elapsed(); $('#r-timer').textContent = clock(t); p.style.transform = `translateY(${Math.min(1, t * +$('#r-speed').value / est) * -(H - 110)}px)`; promptRaf = requestAnimationFrame(tick); };
    tick();
  } else {
    cancelAnimationFrame(promptRaf); btn.classList.remove('on');
    const blob = await recorder.stop(); recorder = null; await loadTake(blob);
  }
};
async function loadTake(blob) {
  try { state.take = await A.decode(blob); } catch { toast('رمزگشایی صدا ناموفق بود'); return; }
  state.takeBlob = blob; state.processed = null; state.trim = [0, 1];
  $('#r-edit').classList.remove('hidden'); renderTrim(); syncTakeViews();
  toast(`برداشت ${clock(state.take.duration)} ثانیه‌ای آماده است`);
}
function renderTrim() { const pk = A.peaks(state.take, 220); drawWave($('#r-wave'), pk, state.trim); const d = state.take.duration; $('#r-sel').textContent = `${fa(state.trim[0] * d)} تا ${fa(state.trim[1] * d)} ثانیه`; }
(() => { const cv = $('#r-wave'); let h = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return Math.max(0, Math.min(1, ((e.touches?.[0] || e).clientX - r.left) / r.width)); };
  cv.addEventListener('pointerdown', (e) => { const x = pos(e); h = Math.abs(x - state.trim[0]) < Math.abs(x - state.trim[1]) ? 0 : 1; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => { if (h == null || !state.take) return; const x = pos(e); state.trim[h] = h ? Math.max(x, state.trim[0] + 0.02) : Math.min(x, state.trim[1] - 0.02); renderTrim(); });
  cv.addEventListener('pointerup', () => { h = null; state.processed = null; });
})();
const trimmed = () => A.trim(state.take, state.trim[0] * state.take.duration, state.trim[1] * state.take.duration);
const procOpts = (voice) => ({ hpf: $('#p-hpf').checked, gate: $('#p-gate').checked, comp: $('#p-comp').checked, deess: $('#p-deess').checked, normalize: $('#p-norm').checked, eq: eqSel, voice });
let playing;
const stopPlay = () => { try { playing?.stop(); } catch {} playing = null; };
$('#r-play').onclick = () => { stopPlay(); playing = A.playBuffer(trimmed()); };
$('#r-proc').onclick = async () => { stopPlay(); $('#r-info').textContent = 'در حال پردازش…'; state.processed = await A.processBuffer(trimmed(), procOpts()); const L = A.loudness(state.processed.getChannelData(0), state.processed.sampleRate); $('#r-info').textContent = `بلندی تقریبی: ${fa(L)} LUFS · طول ${fa(state.processed.duration)} ثانیه`; playing = A.playBuffer(state.processed); };
const ensureProc = async () => (state.processed ||= await A.processBuffer(trimmed(), procOpts()));
$('#r-wav').onclick = async () => download(A.encodeWav(await ensureProc()), 'ava-take.wav');
$('#r-m4a').onclick = async () => { toast('در حال فشرده‌سازی (به اندازه‌ی طول صدا)…'); const b = await A.encodeCompressed(await ensureProc()); download(b, 'ava-take.' + ext(b)); };
$('#r-save').onclick = async () => { const p = await currentProject(); const k = 'take-' + uid(); await DB.putBlob(k, A.encodeWav(await ensureProc())); p.takes.push({ key: k, name: 'برداشت ' + toFa(p.takes.length + 1), at: Date.now(), dur: state.processed.duration }); p.script ||= rScript.value; await DB.put(p); renderLib(); toast('در پروژه ذخیره شد'); };

/* ---------- 2. Voice design ---------- */
const vDes = $('#v-design');
vDes.innerHTML = `
<h1>طراحی <em>صدا</em></h1><p class="sub">صدایی را که می‌خواهی به فارسی توصیف کن؛ آوا آن را به رنگ‌آمیزی صوتی روی صدای ضبط‌شده‌ی خودت تبدیل می‌کند. همه‌چیز روی گوشی پردازش می‌شود.</p>
<div class="card"><h3>صداهای آماده</h3><div class="voices" id="d-voices"></div></div>
<div class="card"><h3>توصیف صدا</h3><textarea id="d-desc" placeholder="مثلاً: صدای بم، گرم و سینمایی با کمی پژواک تالار"></textarea>
<button class="btn gold" id="d-make" style="margin-top:10px;width:100%">✦ بساز</button><p class="note" id="d-hits"></p>
<label>زیر و بمی <span id="d-pv"></span></label><input type="range" id="d-pitch" min="-6" max="6" step="1">
<label>گرمی</label><input type="range" id="d-warm" min="-6" max="6" step="1">
<label>شفافیت</label><input type="range" id="d-bright" min="-6" max="6" step="1">
<label>پژواک</label><input type="range" id="d-rev" min="0" max="0.5" step="0.02">
<div class="toggle">حالت رادیویی<input type="checkbox" id="d-radio"></div></div>
<div class="card"><div id="d-src" class="note"></div><div class="row" style="margin-top:10px"><button class="btn gold grow" id="d-play">▶ پیش‌شنود</button><button class="btn" id="d-wav">WAV</button></div>
<p class="note">تغییر زیر و بمی با سرعت پخش انجام می‌شود، پس طول صدا هم کمی کوتاه یا بلند می‌شود.</p></div>`;
const dv = $('#d-voices');
const dDesc = { natural: 'بدون رنگ', cinematic: 'بم، گرم، پژواک', lawyer: 'محکم و شفاف', friendly: 'روشن و نزدیک', radio: 'باند باریک', hall: 'پژواک دادگاه' };
Object.entries(VOICES).forEach(([k, v]) => { const b = el(`<button class="voice ${k === state.voice ? 'on' : ''}" data-k="${k}"><b>${v.name}</b><small>${dDesc[k]}</small></button>`); b.onclick = () => { setVoice({ ...v }); dv.querySelectorAll('.voice').forEach((x) => x.classList.toggle('on', x === b)); }; dv.append(b); });
function setVoice(p) { state.designed = p; $('#d-pitch').value = p.pitch; $('#d-warm').value = p.warmth; $('#d-bright').value = p.bright; $('#d-rev').value = p.reverb; $('#d-radio').checked = p.radio; $('#d-pv').textContent = toFa(p.pitch) + ' نیم‌پرده'; }
const readVoice = () => ({ name: state.designed?.name || 'سفارشی', pitch: +$('#d-pitch').value, warmth: +$('#d-warm').value, bright: +$('#d-bright').value, reverb: +$('#d-rev').value, radio: $('#d-radio').checked });
['#d-pitch', '#d-warm', '#d-bright', '#d-rev', '#d-radio'].forEach((s) => ($(s).oninput = () => { state.designed = readVoice(); $('#d-pv').textContent = toFa($('#d-pitch').value) + ' نیم‌پرده'; }));
setVoice({ ...VOICES.natural });
$('#d-make').onclick = () => { const { preset, hits } = designFromText($('#d-desc').value); setVoice(preset); dv.querySelectorAll('.voice').forEach((x) => x.classList.remove('on')); $('#d-hits').textContent = hits.length ? 'ویژگی‌های شناخته‌شده: ' + hits.join('، ') : 'کلمه‌ی شناخته‌شده‌ای پیدا نشد؛ مثلاً بنویس: بم، گرم، سینمایی، رادیویی، تالار، صمیمی، شفاف.'; };
function syncTakeViews() { const s = state.take ? `منبع: آخرین برداشت (${fa(state.take.duration)} ثانیه)` : 'اول در تب «ضبط» صدایت را ضبط کن یا از «پروژه‌ها» یک برداشت را باز کن.'; document.querySelectorAll('#d-src,#s-src').forEach((n) => (n.textContent = s)); }
syncTakeViews();
const designed = async () => { if (!state.take) { toast('اول صدا ضبط کن'); go('record'); return null; } return A.processBuffer(trimmed(), procOpts(readVoice())); };
$('#d-play').onclick = async () => { const b = await designed(); if (b) { stopPlay(); playing = A.playBuffer(b); } };
$('#d-wav').onclick = async () => { const b = await designed(); if (b) download(A.encodeWav(b), 'ava-designed.wav'); };

/* ---------- 3. TTS / Clone ---------- */
const vTts = $('#v-tts');
vTts.innerHTML = `
<h1>متن به <em>گفتار</em></h1><p class="sub">با کلید شخصی ElevenLabs، متن فارسی را با صدای حرفه‌ای یا صدای شبیه‌سازی‌شده‌ی خودت بخوان. بدون کلید، صدای داخلی دستگاه (اگر فارسی داشته باشد) استفاده می‌شود.</p>
<div class="card"><div class="row"><h3 class="grow" style="margin:0">وضعیت</h3><span id="t-badge" class="badge"></span></div><p class="note" id="t-state"></p></div>
<div class="card"><h3>متن</h3><textarea id="t-text">بانک از حساب ضامنت برداشت کرده؟</textarea><small id="t-est" class="note"></small>
<label>صدا</label><select id="t-voice"><option value="">— صداها بعد از وارد کردن کلید می‌آیند —</option></select>
<label>مدل</label><select id="t-model"><option value="eleven_v3">eleven_v3 (پشتیبانی فارسی)</option><option value="eleven_multilingual_v2">eleven_multilingual_v2</option><option value="eleven_flash_v2_5">eleven_flash_v2_5</option></select>
<label>ثبات <span id="t-stv"></span></label><input type="range" id="t-stab" min="0" max="1" step="0.05" value="0.5">
<div class="row" style="margin-top:12px"><button class="btn gold grow" id="t-go">🗣 بخوان</button><button class="btn" id="t-dl" disabled>دانلود</button></div><audio id="t-audio" controls class="hidden" style="width:100%;margin-top:10px"></audio></div>
<div class="card"><h3>شبیه‌سازی صدای خودم</h3><p class="note" id="s-src"></p>
<label>نام صدا</label><input id="c-name" value="صدای مهدیه">
<div class="toggle" style="align-items:flex-start;gap:10px"><span style="line-height:1.9">تأیید می‌کنم این صدا متعلق به خودم است (یا رضایت کتبی صاحب صدا را دارم) و از آن برای جعل هویت یا فریب استفاده نمی‌کنم.</span><input type="checkbox" id="c-consent"></div>
<button class="btn gold" id="c-go" style="width:100%;margin-top:10px" disabled>ساخت صدای شبیه‌سازی‌شده</button>
<p class="note">نمونه‌ی خوب: ۱ تا ۳ دقیقه گفتار تمیز، بدون موسیقی. نمونه به سرور ElevenLabs ارسال می‌شود.</p></div>`;
syncTakeViews();
$('#c-consent').onchange = (e) => ($('#c-go').disabled = !e.target.checked);
$('#t-text').oninput = () => ($('#t-est').textContent = `حدود ${fa(readingTime($('#t-text').value))} ثانیه`); $('#t-text').oninput();
$('#t-stab').oninput = () => ($('#t-stv').textContent = fa($('#t-stab').value, 2)); $('#t-stab').oninput();
const faVoice = () => speechSynthesis?.getVoices().find((v) => /^fa|pes/i.test(v.lang));
async function refreshTts() {
  const has = !!C.getKey(); $('#t-badge').className = 'badge ' + (has ? 'live' : 'demo'); $('#t-badge').textContent = has ? 'متصل' : 'حالت دمو';
  const fv = window.speechSynthesis && faVoice();
  $('#t-state').textContent = has ? 'کلید ElevenLabs فقط روی همین دستگاه ذخیره شده است.' : `کلیدی وارد نشده. از ⚙︎ کلید ElevenLabs را وارد کن. تا آن موقع: ${fv ? 'صدای فارسی دستگاه «' + fv.name + '» استفاده می‌شود.' : 'صدای فارسی داخلی روی این دستگاه پیدا نشد.'}`;
  if (has) { try { const vs = await C.listVoices(); $('#t-voice').innerHTML = vs.map((v) => `<option value="${v.voice_id}">${v.name}${v.category === 'cloned' ? ' · شبیه‌سازی‌شده' : ''}</option>`).join(''); } catch (e) { $('#t-state').textContent = 'خطا در اتصال: ' + e.message; } }
}
speechSynthesis?.addEventListener?.('voiceschanged', refreshTts);
let ttsBlob;
$('#t-go').onclick = async () => {
  const text = $('#t-text').value.trim(); if (!text) return;
  if (!C.getKey()) { const fv = faVoice(); if (!fv) { toast('کلید وارد نشده و صدای فارسی داخلی هم نیست'); openSettings(); return; } const u = new SpeechSynthesisUtterance(text); u.voice = fv; u.lang = fv.lang; speechSynthesis.speak(u); return; }
  $('#t-go').disabled = true; $('#t-go').textContent = 'در حال ساخت…';
  try { ttsBlob = await C.tts(text, $('#t-voice').value, $('#t-model').value, { stability: +$('#t-stab').value }); const a = $('#t-audio'); a.src = URL.createObjectURL(ttsBlob); a.classList.remove('hidden'); a.play(); $('#t-dl').disabled = false; }
  catch (e) { toast('خطا: ' + e.message); } finally { $('#t-go').disabled = false; $('#t-go').textContent = '🗣 بخوان'; }
};
$('#t-dl').onclick = () => ttsBlob && download(ttsBlob, 'ava-tts.mp3');
$('#c-go').onclick = async () => {
  if (!C.getKey()) { openSettings(); return; } if (!state.take) { toast('اول نمونه‌ی صدایت را ضبط کن'); go('record'); return; }
  try { toast('در حال ارسال نمونه…'); await C.cloneVoice($('#c-name').value || 'Ava voice', [A.encodeWav(trimmed())], 'Created in Ava Studio with owner consent'); toast('صدا ساخته شد'); refreshTts(); } catch (e) { toast('خطا: ' + e.message); }
};

/* ---------- 4. Dub ---------- */
const vDub = $('#v-dub');
vDub.innerHTML = `
<h1>دوبله و <em>نریشن ریلز</em></h1><p class="sub">ویدیو را بی‌صدا پخش کن و هر صحنه را دقیقاً در پنجره‌ی زمانی خودش ضبط کن. آخر کار یک ترک صدای هم‌زمان با ویدیو بگیر.</p>
<div class="card"><label style="margin-top:0">ویدیو (روی گوشی می‌ماند، آپلود نمی‌شود)</label><label class="filebtn">🎞 انتخاب ویدیو<input type="file" id="u-file" accept="video/*" class="hidden"></label><video id="u-vid" playsinline muted class="hidden" style="margin-top:10px"></video>
<div class="row" style="margin-top:8px"><span class="grow note" id="u-dur">طول تایم‌لاین: ${toFa(30)} ثانیه</span><button class="btn sm" id="u-add">+ صحنه</button></div></div>
<div id="u-cues"></div>
<div class="card"><h3>میکس و خروجی</h3><canvas class="wave" id="u-wave"></canvas>
<div class="row" style="margin-top:10px"><button class="btn gold grow" id="u-prev">▶ پیش‌نمایش با ویدیو</button><button class="btn" id="u-wav">ترک WAV</button></div>
<div class="row" style="margin-top:8px"><button class="btn grow" id="u-mp4">🎞 ویدیو + صدا (آزمایشی)</button><button class="btn" id="u-srt">SRT</button></div>
<div class="progress hidden" id="u-prog" style="margin-top:10px"><i></i></div><p class="note" id="u-note">ترک WAV دقیقاً از ثانیه‌ی صفر ویدیو شروع می‌شود؛ در CapCut یا InShot آن را روی ویدیو بگذار و صدای اصلی را ببند.</p></div>`;
const vid = $('#u-vid'); let dubDur = 30; const cueBuf = {};
$('#u-file').onchange = (e) => { const f = e.target.files[0]; if (!f) return; vid.src = URL.createObjectURL(f); vid.classList.remove('hidden'); vid.onloadedmetadata = () => { dubDur = vid.duration; $('#u-dur').textContent = `طول تایم‌لاین: ${fa(dubDur)} ثانیه`; state.videoFile = f; }; };
$('#u-add').onclick = async () => { const p = await currentProject(); const last = p.cues.at(-1); p.cues.push({ id: uid(), start: last ? +(last.end + 0.5).toFixed(1) : 0.3, end: last ? +(last.end + 4).toFixed(1) : 3.5, text: '' }); await DB.put(p); renderCues(); };
function fitHTML(c) { const f = cueFit(c); const lbl = { ok: 'جا می‌شود', tight: 'تنگ است', long: 'بلند است' }[f.status]; return `<span class="${f.status}">● ${lbl}: ${fa(f.need)} از ${fa(f.window)} ثانیه (حداکثر حدود ${toFa(f.wordsMax)} کلمه)</span>`; }
function renderCues() {
  const p = state.project, box = $('#u-cues'); box.innerHTML = '';
  const errs = validateCues(p.cues); if (errs.length) box.append(el(`<p class="note long">برخی صحنه‌ها هم‌پوشانی دارند یا پایانشان قبل از شروع است.</p>`));
  p.cues.forEach((c, i) => {
    const n = el(`<div class="cue" data-id="${c.id}"><div class="meta"><b style="color:var(--gold2)">صحنه‌ی ${toFa(i + 1)}</b><span><input class="t-s" value="${toFa(c.start)}" style="width:62px;padding:4px 6px;display:inline;text-align:center"> تا <input class="t-e" value="${toFa(c.end)}" style="width:62px;padding:4px 6px;display:inline;text-align:center"> ث</span></div>
      <textarea>${c.text}</textarea><div class="fit"><i></i></div><div class="meta" style="margin:6px 0 0"><span class="f">${fitHTML(c)}</span></div>
      <div class="row" style="margin-top:8px"><button class="btn sm gold rc">● ضبط هم‌زمان</button><button class="btn sm pl" ${cueBuf[c.id] ? '' : 'disabled'}>▶</button><span class="grow"></span><button class="btn sm dl">حذف</button></div></div>`);
    const upd = () => { const f = cueFit(c); n.querySelector('.f').innerHTML = fitHTML(c); const bar = n.querySelector('.fit i'); bar.style.width = Math.min(100, f.ratio * 100) + '%'; bar.style.background = f.status === 'ok' ? 'var(--ok)' : f.status === 'tight' ? 'var(--warn)' : 'var(--red)'; };
    const save = () => DB.put(p);
    n.querySelector('textarea').oninput = (e) => { c.text = e.target.value; upd(); save(); };
    n.querySelector('.t-s').onchange = (e) => { c.start = +toEn(e.target.value) || 0; upd(); save(); };
    n.querySelector('.t-e').onchange = (e) => { c.end = +toEn(e.target.value) || 0; upd(); save(); };
    n.querySelector('.dl').onclick = async () => { p.cues = p.cues.filter((x) => x !== c); await save(); renderCues(); };
    n.querySelector('.pl').onclick = () => { stopPlay(); playing = A.playBuffer(cueBuf[c.id]); };
    n.querySelector('.rc').onclick = () => recordCue(c, n);
    upd(); box.append(n);
  });
  drawMix();
}
async function recordCue(c, n) {
  const btn = n.querySelector('.rc'); n.classList.add('active');
  const pre = Math.min(1.5, c.start), from = c.start - pre;
  if (vid.src) { vid.muted = true; vid.currentTime = from; }
  btn.textContent = 'آماده…'; let rec;
  try { rec = await A.startRecorder(); } catch { toast('دسترسی میکروفون لازم است'); n.classList.remove('active'); btn.textContent = '● ضبط هم‌زمان'; return; }
  const t0 = performance.now(); if (vid.src) vid.play();
  const total = (c.end - from) * 1000 + 300;
  const iv = setInterval(() => { const t = from + (performance.now() - t0) / 1000; btn.textContent = t < c.start ? `${toFa(Math.ceil(c.start - t))}…` : `🔴 ${fa(Math.max(0, c.end - t))}`; }, 100);
  await new Promise((r) => setTimeout(r, total)); clearInterval(iv); vid.pause();
  const blob = await rec.stop(); let buf = await A.decode(blob);
  // drop the pre-roll so the take starts exactly at cue.start
  const lag = 0.06; buf = A.trim(buf, Math.min(buf.duration - 0.1, pre + lag), buf.duration);
  cueBuf[c.id] = await A.processBuffer(buf, { gate: true, deess: true, eq: 'voice', voice: readVoice(), normalize: true });
  const k = 'cue-' + state.project.id + '-' + c.id; await DB.putBlob(k, A.encodeWav(cueBuf[c.id])); c.take = k; await DB.put(state.project);
  n.classList.remove('active'); btn.textContent = '↻ ضبط دوباره'; n.querySelector('.pl').disabled = false; drawMix(); toast(`صحنه‌ی ${toFa(state.project.cues.indexOf(c) + 1)} ضبط شد`);
}
const mixBuffer = () => A.mixTimeline(state.project.cues.filter((c) => cueBuf[c.id]).map((c) => ({ buffer: cueBuf[c.id], at: c.start })), dubDur);
function drawMix() { const cv = $('#u-wave'); if (!state.project) return; const m = mixBuffer(); drawWave(cv, A.peaks(m, 240)); const g = cv.getContext('2d'); state.project.cues.forEach((c) => { g.fillStyle = '#ffffff14'; g.fillRect((c.start / dubDur) * cv.width, cv.height - 6, ((c.end - c.start) / dubDur) * cv.width, 6); }); }
$('#u-prev').onclick = () => { stopPlay(); const m = mixBuffer(); if (vid.src) { vid.muted = true; vid.currentTime = 0; vid.play(); } playing = A.playBuffer(m, () => vid.pause()); };
$('#u-wav').onclick = () => download(A.encodeWav(mixBuffer()), 'ava-dub-track.wav');
$('#u-srt').onclick = () => download(new Blob([toSRT(state.project.cues)], { type: 'text/plain' }), 'ava-cues.srt');
$('#u-mp4').onclick = async () => {
  if (!state.videoFile) { toast('اول ویدیو را انتخاب کن'); return; }
  const prog = $('#u-prog'), bar = prog.querySelector('i'); prog.classList.remove('hidden'); $('#u-note').textContent = 'بارگیری ffmpeg (حدود ۳۰ مگابایت، فقط یک بار)…';
  try {
    const U = 'https://cdn.jsdelivr.net/npm/@ffmpeg/'; const blobURL = async (u, t) => URL.createObjectURL(new Blob([await (await fetch(u)).arrayBuffer()], { type: t }));
    const { FFmpeg } = await import('./ff/index.js');
    const ff = new FFmpeg(); ff.on('progress', ({ progress }) => (bar.style.width = Math.round(progress * 100) + '%'));
    await ff.load({ classWorkerURL: new URL('./ff/worker.js', import.meta.url).href, coreURL: await blobURL(U + 'core@0.12.6/dist/esm/ffmpeg-core.js', 'text/javascript'), wasmURL: await blobURL(U + 'core@0.12.6/dist/esm/ffmpeg-core.wasm', 'application/wasm') });
    $('#u-note').textContent = 'در حال ترکیب (ویدیو کپی می‌شود، فقط صدا کد می‌شود)…';
    await ff.writeFile('in.mp4', new Uint8Array(await state.videoFile.arrayBuffer()));
    await ff.writeFile('a.wav', new Uint8Array(await A.encodeWav(mixBuffer()).arrayBuffer()));
    await ff.exec(['-i', 'in.mp4', '-i', 'a.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', 'out.mp4']);
    download(new Blob([(await ff.readFile('out.mp4')).buffer], { type: 'video/mp4' }), 'ava-dubbed.mp4'); $('#u-note').textContent = 'ویدیو آماده شد.';
  } catch (e) { $('#u-note').textContent = 'ساخت ویدیو روی این دستگاه ممکن نشد (' + (e.message || e) + '). ترک WAV را بگیر و در CapCut/InShot روی ویدیو بگذار.'; }
};

/* ---------- 5. Transcribe ---------- */
const vStt = $('#v-stt');
vStt.innerHTML = `
<h1><em>متن‌نویسی</em></h1><p class="sub">صدا را با Whisper، مستقیم داخل مرورگر و بدون ارسال به سرور، به متن فارسی با زمان‌بندی تبدیل کن.</p>
<div class="card"><label style="margin-top:0">منبع</label><div class="chips"><button class="chip on" id="s-take">آخرین برداشت</button><label class="chip" style="margin:0">فایل صوتی/ویدیو<input type="file" id="s-file" accept="audio/*,video/*" class="hidden"></label></div>
<label>مدل</label><select id="s-model"><option value="onnx-community/whisper-tiny">Whisper Tiny · حدود ۴۰ مگابایت · سریع</option><option value="onnx-community/whisper-base">Whisper Base · حدود ۸۰ مگابایت · دقیق‌تر</option><option value="onnx-community/whisper-small">Whisper Small · حدود ۲۵۰ مگابایت · کند، فقط کامپیوتر</option></select>
<button class="btn gold" id="s-go" style="width:100%;margin-top:12px">✎ متن کن</button>
<div class="progress hidden" id="s-prog" style="margin-top:10px"><i></i></div><p class="note" id="s-msg">مدل فقط بار اول دانلود و بعد در حافظه‌ی مرورگر نگه داشته می‌شود. روی آیفون مدل Tiny یا Base را انتخاب کن و صفحه را باز نگه دار.</p></div>
<div class="card hidden" id="s-out"><h3>متن</h3><div id="s-segs"></div><div class="row" style="margin-top:10px"><button class="btn sm" id="s-srt">SRT</button><button class="btn sm" id="s-copy">کپی</button><button class="btn sm" id="s-tocue">← به صحنه‌های دوبله</button></div></div>`;
let sttSrc = null, segs = [];
$('#s-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { sttSrc = await A.decode(f); $('#s-msg').textContent = `فایل ${f.name} (${fa(sttSrc.duration)} ثانیه) آماده است.`; } catch { toast('این فایل خوانده نشد'); } };
let asr, asrModel;
$('#s-go').onclick = async () => {
  const src = sttSrc || (state.take && trimmed()); if (!src) { toast('اول صدایی ضبط یا انتخاب کن'); return; }
  const prog = $('#s-prog'), bar = prog.querySelector('i'), msg = $('#s-msg'); prog.classList.remove('hidden'); $('#s-go').disabled = true;
  try {
    const model = $('#s-model').value;
    if (!asr || asrModel !== model) {
      msg.textContent = 'بارگیری کتابخانه…';
      const T = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1');
      const files = {};
      asr = await T.pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm', progress_callback: (p) => { if (p.status === 'progress' && p.total) { files[p.file] = [p.loaded, p.total]; const l = Object.values(files).reduce((a, b) => a + b[0], 0), t = Object.values(files).reduce((a, b) => a + b[1], 0); bar.style.width = (100 * l) / t + '%'; msg.textContent = `دانلود مدل: ${toFa(Math.round(l / 1e6))} از ${toFa(Math.round(t / 1e6))} مگابایت`; } } });
      asrModel = model;
    }
    msg.textContent = 'در حال شنیدن و نوشتن… (چند برابر طول صدا طول می‌کشد)'; bar.style.width = '100%';
    const pcm = await A.to16kMono(src);
    const r = await asr(pcm, { language: 'persian', task: 'transcribe', return_timestamps: true, chunk_length_s: 30, stride_length_s: 5 });
    segs = (r.chunks || [{ timestamp: [0, src.duration], text: r.text }]).map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? src.duration, text: c.text.trim() }));
    $('#s-segs').innerHTML = segs.map((s) => `<div class="seg"><small>${clock(s.start)}–${clock(s.end)}</small>${s.text}</div>`).join(''); $('#s-out').classList.remove('hidden'); msg.textContent = 'تمام شد. متن را حتماً بازخوانی کن؛ Whisper کوچک در فارسی خطا دارد.';
  } catch (e) { msg.textContent = 'خطا: ' + (e.message || e) + ' — اگر حافظه‌ی گوشی کم است مدل Tiny را امتحان کن.'; }
  finally { $('#s-go').disabled = false; }
};
$('#s-take').onclick = () => { sttSrc = null; $('#s-msg').textContent = state.take ? 'آخرین برداشت انتخاب شد.' : 'هنوز برداشتی نداری.'; };
$('#s-srt').onclick = () => download(new Blob([toSRT(segs)], { type: 'text/plain' }), 'ava-transcript.srt');
$('#s-copy').onclick = () => navigator.clipboard?.writeText(segs.map((s) => s.text).join('\n')).then(() => toast('کپی شد'));
$('#s-tocue').onclick = async () => { const p = await currentProject(); p.cues = segs.map((s) => ({ id: uid(), start: +s.start.toFixed(1), end: +s.end.toFixed(1), text: s.text })); await DB.put(p); renderCues(); go('dub'); };

/* ---------- 6. Projects ---------- */
const vLib = $('#v-lib');
vLib.innerHTML = `<h1><em>پروژه‌ها</em></h1><p class="sub">همه‌چیز فقط روی همین دستگاه (IndexedDB) ذخیره می‌شود؛ هیچ سروری در کار نیست.</p>
<button class="btn gold" id="l-new" style="width:100%">+ پروژه‌ی تازه</button><div id="l-list"></div>`;
const SEED = { id: 'seed-madde9', title: 'ریلز ماده ۹ · برداشت از حساب ضامن', created: Date.now(), takes: [], script: '', cues: [
  [0.3, 3.7, 'بانک از حساب ضامنت برداشت کرده؟'], [4.5, 9.7, 'ماده ۹ قرارداد قرض‌الحسنه؛ اختیار برداشت گسترده.'], [10.4, 15.7, 'ماده ۹ ابطال شد؛ بیست‌وسوم تیر ۱۴۰۵.'],
  [16.4, 21.7, 'استناد به ماده ۹ دیگر کافی نیست.'], [22.2, 25.9, 'اصل بدهی و ضمانت باقی است. برداشت شده؟ قرارداد و گردش حساب را بررسی کن.'], [26.4, 29.8, 'این محتوا آموزش عمومی است و جایگزین مشاوره حقوقی نیست.'],
].map(([start, end, text], i) => ({ id: 'c' + (i + 1), start, end, text })) };
SEED.script = SEED.cues.map((c) => c.text).join('\n');
async function currentProject() { if (!state.project) { const all = await DB.all(); state.project = all.find((p) => p.id === localStorage.getItem('ava.cur')) || all[0]; } return state.project; }
async function openProject(p) {
  state.project = p; localStorage.setItem('ava.cur', p.id); rScript.value = p.script || ''; updEst();
  for (const c of p.cues) if (c.take && !cueBuf[c.id]) { const b = await DB.getBlob(c.take); if (b) cueBuf[c.id] = await A.decode(b); }
  renderCues(); renderLib();
}
async function renderLib() {
  const list = $('#l-list'), all = (await DB.all()).sort((a, b) => b.created - a.created); list.innerHTML = '';
  all.forEach((p) => {
    const n = el(`<div class="card"><div class="proj"><div class="ic">🎙</div><div class="grow"><b>${p.title}</b><div class="note" style="margin:0">${toFa(p.cues.length)} صحنه · ${toFa(p.takes.length)} برداشت ${state.project?.id === p.id ? '· <span style="color:var(--gold)">باز</span>' : ''}</div></div></div>
      <div class="row" style="margin-top:10px"><button class="btn sm gold op">باز کن</button><button class="btn sm rn">تغییر نام</button><span class="grow"></span><button class="btn sm rm">حذف</button></div><div class="tk"></div></div>`);
    n.querySelector('.op').onclick = async () => { await openProject(p); go('dub'); };
    n.querySelector('.rn').onclick = async () => { const t = prompt('نام تازه', p.title); if (t) { p.title = t; await DB.put(p); renderLib(); } };
    n.querySelector('.rm').onclick = async () => { if (!confirm('این پروژه و برداشت‌هایش حذف شود؟')) return; for (const t of p.takes) await DB.delBlob(t.key); for (const c of p.cues) if (c.take) await DB.delBlob(c.take); await DB.del(p.id); if (state.project?.id === p.id) state.project = null; await boot(true); };
    p.takes.forEach((t) => { const r = el(`<div class="row" style="margin-top:8px;font-size:13px"><span class="grow">🎧 ${t.name} · ${fa(t.dur)} ث</span><button class="btn sm">بارگذاری</button></div>`); r.querySelector('button').onclick = async () => { await loadTake(await DB.getBlob(t.key)); go('record'); }; n.querySelector('.tk').append(r); });
    list.append(n);
  });
}
$('#l-new').onclick = async () => { const p = { id: uid(), title: 'پروژه‌ی ' + toFa(new Date().toLocaleDateString('fa-IR')), created: Date.now(), takes: [], cues: [], script: '' }; await DB.put(p); await openProject(p); toast('پروژه ساخته شد'); };

/* ---------- Settings ---------- */
function openSettings() {
  const d = $('#dlg');
  d.innerHTML = `<h3 style="margin:0 0 6px;color:var(--gold2)">تنظیمات</h3><p class="note">کلید ElevenLabs فقط در حافظه‌ی همین مرورگر (localStorage) می‌ماند و فقط برای api.elevenlabs.io فرستاده می‌شود.</p>
  <label>کلید API الون‌لبز</label><input id="k" dir="ltr" type="password" value="${C.getKey()}" placeholder="sk_…">
  <div class="row" style="margin-top:14px"><button class="btn gold grow" id="ks">ذخیره</button><button class="btn" id="kd">پاک کردن</button><button class="btn" id="kc">بستن</button></div>
  <p class="note">آوا استودیو با الهام از VoiceStudio (متن‌باز) از صفر ساخته شده است. قانون طلایی: شبیه‌سازی صدا فقط با رضایت صاحب صدا.</p>`;
  d.showModal(); $('#ks', d).onclick = () => { C.setKey($('#k', d).value); d.close(); refreshTts(); toast('ذخیره شد'); };
  $('#kd', d).onclick = () => { C.setKey(''); d.close(); refreshTts(); toast('کلید پاک شد'); }; $('#kc', d).onclick = () => d.close();
}
$('#btn-settings').onclick = openSettings;

/* ---------- Boot ---------- */
async function boot(reset) {
  let all = await DB.all();
  if (!all.length && !localStorage.getItem('ava.seeded')) { await DB.put(SEED); localStorage.setItem('ava.seeded', '1'); all = [SEED]; }
  if (!all.length) { const p = { id: uid(), title: 'پروژه‌ی من', created: Date.now(), takes: [], cues: [], script: '' }; await DB.put(p); all = [p]; }
  if (reset) state.project = null;
  await openProject(await currentProject() || all[0]);
}
boot().then(() => { updEst(); refreshTts(); go((location.hash || '#record').slice(1).split('?')[0] || 'record'); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
