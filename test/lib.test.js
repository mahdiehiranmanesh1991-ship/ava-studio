import { describe, it, expect } from 'vitest';
import { wordCount, readingTime, cueFit, toSRT, srtTime, toFa, toEn, validateCues, designFromText } from '../public/js/lib.js';
describe('reading', () => {
  it('counts Persian words', () => expect(wordCount('ماده ۹ ابطال شد؛ بیست‌وسوم تیر ۱۴۰۵.')).toBe(7));
  it('estimates time', () => expect(readingTime('')).toBe(0));
  it('flags long cue', () => {
    expect(cueFit({ start: 22.2, end: 25.9, text: 'اصل بدهی و ضمانت باقی است. برداشت شده؟ قرارداد و گردش حساب را بررسی کن.' }).status).toBe('long');
    expect(cueFit({ start: 16.4, end: 21.7, text: 'استناد به ماده ۹ دیگر کافی نیست.' }).status).toBe('ok');
  });
  it('detects overlap', () => expect(validateCues([{ start: 0, end: 2 }, { start: 1, end: 3 }]).length).toBe(1));
});
describe('srt', () => {
  it('formats time', () => expect(srtTime(3661.5)).toBe('01:01:01,500'));
  it('builds srt', () => expect(toSRT([{ start: 0.3, end: 3.7, text: 'سلام' }])).toBe('1\n00:00:00,300 --> 00:00:03,700\nسلام\n'));
});
describe('digits & design', () => {
  it('fa digits', () => { expect(toFa('12.5')).toBe('۱۲٫۵'); expect(toEn('۱۲٫۵')).toBe('12.5'); });
  it('maps description', () => { const r = designFromText('صدای بم و سینمایی با اکو'); expect(r.preset.pitch).toBeLessThan(0); expect(r.preset.reverb).toBeGreaterThan(0); });
});
