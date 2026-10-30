# آوا استودیو · Ava Studio

استودیوی صدای فارسی، موبایل‌محور و آفلاین برای «آوای عدالت» — ضبط با متن‌خوان، پردازش استودیویی، طراحی صدا، متن به گفتار (ElevenLabs با کلید شخصی)، دوبله‌ی ریلز روی پنجره‌های زمانی، و متن‌نویسی با Whisper داخل مرورگر.

Inspired by the feature set of the open-source [VoiceStudio](https://voicestudio.sh/) (Clone · Design · Dub · Transcribe). Written from scratch; no VoiceStudio code is used.
Voice cloning only with the voice owner's consent.

- No build step: static files in `public/`. Tests: `npm test` (vitest).
- Vendored `public/js/ff/` is @ffmpeg/ffmpeg 0.12.10 (MIT).
- API keys live only in the browser's localStorage.
