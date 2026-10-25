'use strict';

/* =========================================================
   Kelime Avcısı — altyazılı videolardan kelime yakala,
   aralıklı tekrarla öğren. Sunucu gerektirmez.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- kalıcı depolama ---------------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { console.warn('kaydedilemedi', k, e); return false; } }
};

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('kelime-avcisi', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  try {
    const db = await idbOpen();
    return await new Promise((res, rej) => {
      const q = db.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
    });
  } catch { return undefined; }
}
async function idbSet(k, v) {
  try {
    const db = await idbOpen();
    await new Promise((res, rej) => {
      const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch (e) { console.warn(e); }
}

/* ---------------- ayarlar ---------------- */
const DEFAULTS = {
  theme: 'auto', lang: 'tr', split: true, clipLen: 60, shuffle: false, onEnd: 'loop',
  resumeAfterSheet: true, rate: 1, muted: false, email: ''
};
let settings = { ...DEFAULTS, ...store.get('ka.settings', {}) };
const saveSettings = () => store.set('ka.settings', settings);

const LANGS = {
  tr: 'Türkçe', az: 'Azerbaycan Türkçesi', de: 'Almanca', fr: 'Fransızca', es: 'İspanyolca', it: 'İtalyanca',
  ru: 'Rusça', ar: 'Arapça', fa: 'Farsça', nl: 'Felemenkçe', pt: 'Portekizce', uk: 'Ukraynaca'
};

/* ---------------- kelimeler (hazine) ---------------- */
let words = store.get('ka.words', []);
let wordsVersion = 0;
let caughtForms = new Map();
function refreshCaughtIndex() {
  caughtForms = new Map();
  for (const w of words) {
    caughtForms.set(w.word, w);
    for (const f of w.forms || []) caughtForms.set(f, w);
  }
}
function saveWords() {
  if (!store.set('ka.words', words)) toast('Kelimeler kaydedilemedi: tarayıcı depolaması dolu ya da kapalı.');
  wordsVersion++;
  refreshCaughtIndex();
  updateBadges();
}
refreshCaughtIndex();

/* Aralıklı tekrar: "Hatırladım" bir sonraki aralığa çıkarır, "Unuttum" geri düşürür. */
const INTERVALS_DAYS = [1, 3, 7, 14, 30, 60, 120, 240, 365];
const nextInterval = w => INTERVALS_DAYS[Math.min(w.level, INTERVALS_DAYS.length - 1)] * DAY;
function grade(w, remembered) {
  const now = Date.now();
  if (remembered) {
    w.due = now + nextInterval(w);
    w.level++;
    w.reps++;
  } else {
    w.level = Math.max(0, w.level - 2);
    w.lapses++;
    w.due = now + 10 * MIN;
  }
  w.lastReview = now;
  saveWords();
}
const dueWords = () => { const now = Date.now(); return words.filter(w => w.due <= now).sort((a, b) => a.due - b.due); };
const tierOf = level => level >= 5 ? 'gem' : level >= 2 ? 'gold' : 'ore';
const TIER_NAME = { ore: 'Ham maden', gold: 'Altın', gem: 'Mücevher' };

/* ---------------- yardımcılar ---------------- */
let toastTimer;
function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function fmtRel(ms) {
  if (ms <= 0) return 'şimdi';
  if (ms < HOUR) return Math.max(1, Math.round(ms / MIN)) + ' dk';
  if (ms < DAY) return Math.round(ms / HOUR) + ' saat';
  return Math.round(ms / DAY) + ' gün';
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s;
  return t.value;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const ICON = {
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
  replay: '<path d="M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z"/>',
  prev: '<path d="M6 6h2v12H6zM9.5 12 18 18V6z"/>',
  next: '<path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/>',
  vol: '<path d="M4 9v6h4l5 5V4L8 9zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>',
  mute: '<path d="M4 9v6h4l5 5V4L8 9zm15.6 3 2.1-2.1-1.4-1.4-2.1 2.1-2.1-2.1-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4z"/>'
};
const icon = (n, s = 22, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" width="${s}" height="${s}" fill="currentColor" aria-hidden="true">${ICON[n]}</svg>`;

function coinSVG(w, size = 56) {
  const t = tierOf(w.level);
  // Aynı katmanda bile tekrar ettikçe biraz daha parlar
  const shine = t === 'ore' ? 0 : Math.min(14, 3 + (w.level - (t === 'gold' ? 2 : 5)) * 3);
  const glow = shine ? `filter:drop-shadow(0 0 ${shine}px ${t === 'gem' ? 'rgba(120,140,255,.75)' : 'rgba(242,182,48,.75)'})` : '';
  const ch = esc((w.display || w.word || '?')[0].toUpperCase());
  let body;
  if (t === 'ore') {
    body = `<path d="M14 24 L25 11 L43 12 L55 27 L50 47 L31 55 L11 45 Z" fill="url(#g-ore)" stroke="#4d4337" stroke-width="2" stroke-linejoin="round"/>
      <path d="M25 11 L30 27 L14 24 M30 27 L55 27 M30 27 L31 55" stroke="#4d4337" stroke-opacity=".35" stroke-width="1.5" fill="none"/>
      <circle cx="37" cy="21" r="2.6" fill="#f2c230"/><circle cx="41" cy="38" r="2" fill="#f2c230"/><circle cx="22" cy="38" r="2.2" fill="#f2c230" opacity=".85"/>`;
  } else if (t === 'gold') {
    body = `<circle cx="32" cy="32" r="26" fill="url(#g-gold)" stroke="#9c6f00" stroke-width="2"/>
      <circle cx="32" cy="32" r="19.5" fill="none" stroke="#b8860b" stroke-width="1.6" opacity=".75"/>
      <text x="32" y="40" text-anchor="middle" font-size="22" font-weight="800" fill="#7a5200" font-family="system-ui,sans-serif">${ch}</text>
      <path d="M17 23 Q22 14 33 12" stroke="#fffbe0" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`;
  } else {
    body = `<path d="M13 24 L23 11 H41 L51 24 L32 55 Z" fill="url(#g-gem)" stroke="#3b2a8c" stroke-width="2" stroke-linejoin="round"/>
      <path d="M13 24 H51 M23 11 L27 24 L32 55 L37 24 L41 11 M27 24 L32 11 L37 24" stroke="#fff" stroke-opacity=".5" stroke-width="1.3" fill="none"/>
      <path d="M52 6 l1.6 3.6 3.6 1.6 -3.6 1.6 -1.6 3.6 -1.6 -3.6 -3.6 -1.6 3.6 -1.6z" fill="#fff"/>`;
  }
  return `<svg class="coin-svg ${t}" viewBox="0 0 64 64" width="${size}" height="${size}" style="${glow}" aria-label="${TIER_NAME[t]}">${body}</svg>`;
}

/* ---------------- kelime işleme ---------------- */
const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
const normWord = w => w.toLowerCase().replace(/’/g, "'");
function baseForm(w) {
  w = normWord(w);
  const SPECIAL = { "can't": 'can', "won't": 'will', "shan't": 'shall', "ain't": 'be', "i'm": 'i' };
  if (SPECIAL[w]) return SPECIAL[w];
  if (/n't$/.test(w)) return w.slice(0, -3);
  const m = w.match(/^(.+)'(s|re|ll|ve|d|m)$/);
  return m ? m[1] : w;
}
function lemmaCandidates(surface) {
  const w = normWord(surface), b = baseForm(surface);
  const c = [];
  const add = x => { if (x && x.length > 1 && !c.includes(x)) c.push(x); };
  add(w); add(b);
  const dbl = s => /([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : null;
  let m;
  if ((m = b.match(/^(.+)ies$/))) add(m[1] + 'y');
  if ((m = b.match(/^(.+)ied$/))) add(m[1] + 'y');
  if ((m = b.match(/^(.+[sxz]|.+[cs]h)es$/))) add(m[1]);
  if ((m = b.match(/^(.+[^s])s$/))) add(m[1]);
  if ((m = b.match(/^(.+)ing$/))) { add(dbl(m[1])); add(m[1]); add(m[1] + 'e'); }
  if ((m = b.match(/^(.+)ed$/))) { add(dbl(m[1])); add(m[1]); add(m[1] + 'e'); }
  if ((m = b.match(/^(.+)ily$/))) add(m[1] + 'y');
  if ((m = b.match(/^(.+)ly$/))) add(m[1]);
  if ((m = b.match(/^(.+)i(er|est)$/))) add(m[1] + 'y');
  if ((m = b.match(/^(.+)(er|est)$/))) { add(dbl(m[1])); add(m[1]); add(m[1] + 'e'); }
  return c;
}
function lineHTML(line, curSurface) {
  let out = '', last = 0;
  for (const m of line.matchAll(WORD_RE)) {
    out += esc(line.slice(last, m.index));
    const n = normWord(m[0]);
    let cls = 'w';
    if (caughtForms.has(n) || caughtForms.has(baseForm(n))) cls += ' caught';
    if (curSurface && n === normWord(curSurface)) { cls += ' cur'; curSurface = null; }
    out += `<span class="${cls}" data-w="${esc(m[0])}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(line.slice(last));
}

/* ---------------- sözlük ve çeviri ---------------- */
const cache = store.get('ka.cache', { dict: {}, tr: {} });
cache.dict ||= {}; cache.tr ||= {};
// Eski sürümün önbelleğe ve hazineye yazdığı tanımlardaki Wiktionary stil kodunu temizle
const WIKI_CSS = /\.mw-parser-output[^{}]*\{[^}]*\}\s*/g;
for (const m of [...Object.values(cache.dict), ...words]) for (const g of m.meanings || []) for (const x of g.defs) x.d = x.d.replace(WIKI_CSS, '').trim();
let cacheTimer;
function saveCache() {
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => {
    for (const k of ['dict', 'tr']) {
      const keys = Object.keys(cache[k]);
      if (keys.length > 4000) for (const x of keys.slice(0, keys.length - 4000)) delete cache[k][x];
    }
    store.set('ka.cache', cache);
  }, 400);
}
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
/* İngilizce sözlük: Wiktionary (anlamlar + örnekler), Datamuse (IPA telaffuz) */
// Wiktionary tanımlarında <style> gelebiliyor; metne karışmasın
function htmlDoc(h) {
  const doc = new DOMParser().parseFromString(h || '', 'text/html');
  doc.querySelectorAll('style, script, link').forEach(e => e.remove());
  return doc;
}
const htmlText = h => htmlDoc(h).body.textContent.replace(/\s+/g, ' ').trim();
const INFLECTION = /participle|past|plural|singular|third-person|comparative|superlative|gerund|present|inflection/i;
async function wiktionary(title) {
  const r = await fetch('https://en.wiktionary.org/api/rest_v1/page/definition/' + encodeURIComponent(title));
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  const j = await r.json();
  return j.en?.length ? j.en : null;
}
function parseWikt(en) {
  const meanings = [];
  let lemma = null;
  for (const sec of en) {
    const pos = (sec.partOfSpeech || '').toLowerCase();
    for (const d of sec.definitions || []) {
      const doc = htmlDoc(d.definition);
      const text = doc.body.textContent.replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const fo = doc.querySelector('.form-of-definition');
      const link = fo?.querySelector('.form-of-definition-link a');
      const isInflection = !!(link && INFLECTION.test(fo.textContent));
      if (isInflection && !lemma) lemma = link.textContent.trim();
      let g = meanings.find(x => x.pos === pos);
      if (!g) { g = { pos, defs: [] }; meanings.push(g); }
      if (g.defs.length < 3) g.defs.push({ d: text, ex: htmlText(d.parsedExamples?.[0]?.example || d.examples?.[0] || ''), form: isInflection });
    }
  }
  return { meanings, lemma };
}
async function ipaOf(word) {
  try {
    const j = await fetchJSON(`https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=r&ipa=1&max=1`);
    const tag = (j[0]?.word === word.toLowerCase()) && j[0].tags?.find(t => t.startsWith('ipa_pron:'));
    return tag ? '/' + tag.slice(9) + '/' : '';
  } catch { return ''; }
}
async function lookupDict(surface) {
  const key = normWord(surface);
  if (cache.dict[key]) return cache.dict[key].miss ? null : cache.dict[key];
  const cands = [key];
  if (surface !== key && /^[A-Z]/.test(surface)) cands.push(surface);  // özel isimler
  for (const c of lemmaCandidates(surface)) if (!cands.includes(c)) cands.push(c);
  for (const c of cands.slice(0, 6)) {
    const en = await wiktionary(c);
    if (!en) continue;
    const p = parseWikt(en);
    let word = c, meanings = p.meanings;
    if (p.lemma && p.lemma.toLowerCase() !== c.toLowerCase()) {
      const en2 = await wiktionary(p.lemma).catch(() => null);
      if (en2) {
        word = p.lemma;
        // Önce kök kelimenin anlamları, sonra bu biçime özgü (çekim olmayan) anlamlar
        const own = p.meanings.map(g => ({ ...g, defs: g.defs.filter(d => !d.form) })).filter(g => g.defs.length);
        meanings = parseWikt(en2).meanings.concat(own);
      }
    }
    const nonForm = meanings.map(g => ({ ...g, defs: g.defs.filter(d => !d.form) })).filter(g => g.defs.length);
    if (nonForm.length) meanings = nonForm;
    const res = { word, phonetic: await ipaOf(word), audio: '', meanings: meanings.slice(0, 4) };
    cache.dict[key] = res; saveCache();
    return res;
  }
  cache.dict[key] = { miss: true }; saveCache();
  return null;
}
/* Kelimeyi hem göründüğü biçimiyle hem kökü ve "to + fiil" olarak çevir; seçenek çoğalınca bağlama uyan anlam bulunur */
async function translateWord(surface, d) {
  const qs = [normWord(surface)];
  const lem = d?.word?.toLowerCase() || baseForm(surface);
  if (lem !== qs[0]) qs.push(lem);
  if (d?.meanings.some(g => g.pos === 'verb')) qs.push('to ' + lem);
  const res = await Promise.allSettled(qs.map(q => translate(q)));
  const alts = [];
  let err;
  for (const r of res) {
    if (r.status !== 'fulfilled') { err ||= r.reason; continue; }
    for (const a of r.value.alts) if (!alts.some(x => x.toLocaleLowerCase('tr') === a.toLocaleLowerCase('tr'))) alts.push(a);
  }
  if (!alts.length) throw err || new Error('Çeviri alınamadı.');
  return { main: alts[0], alts: alts.slice(0, 6) };
}
async function translate(text) {
  text = text.replace(/\s+/g, ' ').trim();
  const key = settings.lang + '|' + text.toLowerCase();
  if (cache.tr[key]) return cache.tr[key];
  let url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${settings.lang}`;
  if (settings.email) url += '&de=' + encodeURIComponent(settings.email);
  const j = await fetchJSON(url);
  const main = decodeEntities(j.responseData?.translatedText || '');
  if (String(j.responseStatus) !== '200' || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(main)) {
    throw new Error(/MYMEMORY WARNING/i.test(main)
      ? 'Günlük ücretsiz çeviri kotası doldu. Ayarlar\'dan e-posta ekleyerek artırabilirsin.'
      : 'Çeviri alınamadı.');
  }
  const alts = [];
  const add = t => {
    t = decodeEntities(t || '').trim().replace(/[.!]+$/, '');
    if (!t || t.length > 60 || /[<>]/.test(t)) return;
    if (!alts.some(a => a.toLocaleLowerCase('tr') === t.toLocaleLowerCase('tr'))) alts.push(t);
  };
  add(main);
  for (const m of j.matches || []) {
    if ((m.segment || '').toLowerCase().trim() === text.toLowerCase() && (m.quality == null || +m.quality >= 50)) add(m.translation);
  }
  const res = { main: alts[0] || main, alts: alts.slice(0, 5) };
  cache.tr[key] = res; saveCache();
  return res;
}
/* Kelimenin çevirilerinden hangisi cümlenin çevirisinde geçiyor? O, bu cümledeki anlamdır. */
function pickInContext(alts, sentenceTr) {
  if (!sentenceTr || !alts?.length) return -1;
  const s = sentenceTr.toLocaleLowerCase('tr');
  for (let i = 0; i < alts.length; i++) {
    for (const part of alts[i].toLocaleLowerCase('tr').split(/[\s,;/]+/)) {
      if (part.length < 3) continue;
      const stem = part.slice(0, Math.max(3, Math.min(5, part.length - 1)));
      if (s.includes(stem)) return i;
    }
  }
  return -1;
}
function speak(text, { onEnd = null, rate = .95 } = {}) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = rate;
    const vs = speechSynthesis.getVoices();
    const v = vs.find(v => /^en[-_]US/i.test(v.lang)) || vs.find(v => /^en/i.test(v.lang));
    if (v) u.voice = v;
    if (onEnd) { u.onend = onEnd; u.onerror = onEnd; }
    speechSynthesis.speak(u);
  } catch {
    toast('Bu tarayıcı seslendirmeyi desteklemiyor.');
    if (onEnd) onEnd();
  }
}
function sayWord(text, audioUrl) {
  if (!audioUrl) return speak(text);
  new Audio(audioUrl).play().catch(() => speak(text));
}
function highlight(sentence, surface) {
  return sentence.split('\n').map(l => lineHTML(l, surface)).join(' ');
}

/* ---------------- altyazı okuma ---------------- */
async function readText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf);
  if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
function parseTime(t) {
  let s = 0;
  for (const p of t.trim().replace(',', '.').split(':')) s = s * 60 + parseFloat(p);
  return s;
}
const TIME_RE = /((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/;
function parseSubs(text) {
  text = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const cues = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n');
    const i = lines.findIndex(l => TIME_RE.test(l));
    if (i < 0) continue;
    const [, a, z] = lines[i].match(TIME_RE);
    const start = parseTime(a), end = parseTime(z);
    const body = lines.slice(i + 1).join('\n')
      .replace(/\{\\[^}]*\}/g, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
      .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
    if (!body || !(end > start)) continue;
    const prev = cues[cues.length - 1];
    if (prev && prev.text === body && start - prev.end < .5) { prev.end = end; continue; }
    cues.push({ start, end, text: body });
  }
  return tidyCues(cues.sort((x, y) => x.start - y.start));
}
/* YouTube otomatik dökümleri: satırlar zamanda çakışır ve cümleler parçalanır.
   Çakışmaları kırp; döküm bu türdense parçaları tam cümlelerde birleştir. */
const NOISE_CUE = /^[\s♪]*[[(][^\])]*[\])][\s♪]*$|^[\s♪]+$/;
const ABBR_END = /\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|etc|e\.g|i\.e)\.$/i;
const endsSentence = t => /[.?!…]["')\]]?$/.test(t) && !ABBR_END.test(t);
function tidyCues(cues, forceMerge = false) {
  cues = cues.filter(q => !NOISE_CUE.test(q.text));
  let overlaps = 0;
  for (let i = 0; i < cues.length - 1; i++) {
    const q = cues[i], next = cues[i + 1];
    if (next.start < q.end - .05) { overlaps++; q.end = Math.max(q.start + .3, next.start); }
  }
  if (!forceMerge && overlaps < cues.length * .3) return cues;

  // Her parçayı cümle sınırlarından ve ">>" (konuşmacı değişimi) işaretlerinden böl,
  // parçanın süresini harf sayısına göre paylaştır.
  const pieces = [];
  for (const q of cues) {
    const text = q.text.replace(/\n/g, ' ').trim();
    const parts = [];
    text.split(/\s*>>\s*/).forEach((seg, si) => {
      seg.split(/(?<=[.?!…]["')\]]?)\s+/).filter(Boolean).forEach((p, pi) => parts.push({ text: p, speaker: si > 0 && pi === 0 }));
    });
    const total = parts.reduce((s, p) => s + p.text.length + 1, 0) || 1;
    let t = q.start;
    for (const p of parts) {
      const end = t + (q.end - q.start) * (p.text.length + 1) / total;
      pieces.push({ ...p, start: t, end });
      t = end;
    }
  }
  const out = [];
  let cur = null;
  const flush = () => { if (cur) out.push(cur); cur = null; };
  for (const p of pieces) {
    if (cur && (p.speaker || p.start - cur.end > 2)) flush();
    if (!cur) cur = { start: p.start, end: p.end, text: p.text };
    else { cur.text += ' ' + p.text; cur.end = p.end; }
    if (endsSentence(cur.text) || cur.text.length > 140) flush();
  }
  flush();
  return out;
}
function segmentCues(cues, finite) {
  if (!cues.length) return [];
  const lastEnd = cues[cues.length - 1].end + 1;
  if (!settings.split) return [{ start: 0, end: finite ? lastEnd : Infinity, cues }];
  const L = Math.max(15, +settings.clipLen || 60);
  const segs = [];
  let cur = { start: Math.max(0, cues[0].start - .4), cues: [cues[0]] };
  for (let i = 1; i < cues.length; i++) {
    const q = cues[i], last = cur.cues[cur.cues.length - 1];
    const tooLong = q.end - cur.start > L;
    const bigGap = q.start - last.end > 6 && last.end - cur.start > L * .5;
    if (tooLong || bigGap) {
      cur.end = Math.min(q.start - .05, last.end + .6);
      segs.push(cur);
      cur = { start: Math.max(cur.end, q.start - .4), cues: [q] };
    } else cur.cues.push(q);
  }
  cur.end = lastEnd;
  segs.push(cur);
  return segs;
}
function wpm(seg) {
  const n = seg.cues.reduce((s, q) => s + (q.text.match(WORD_RE) || []).length, 0);
  const speech = seg.cues.reduce((s, q) => s + (q.end - q.start), 0);
  return speech > 0 ? Math.round(n / (speech / 60)) : 0;
}

/* ---------------- kütüphane ---------------- */
const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|ogv)$/i;
const SUB_EXT = /\.(srt|vtt)$/i;
const OTHER_LANG = /(^|[._\s-])(tr|tur|turkish|türkçe|turkce|de|ger|deu|german|fr|fre|fra|french|es|spa|spanish|it|ita|ru|rus|ar|ara|pt|por|nl|dut|pl|pol|fa|per|jp|jpn|ja|ko|kor|zh|chi)([._\s-]|$)/i;
const EN_LANG = /(^|[._\s-])(en|eng|english|en-us|en-gb)([._\s-]|$)/i;
const baseName = n => n.replace(/\.[^.]+$/, '');
function stripLang(b) {
  let prev;
  do { prev = b; b = b.replace(/[._\s-](en|eng|english|en-us|en-gb|forced|sdh|cc|hi)$/i, ''); } while (b !== prev);
  return b;
}
function langScore(name) {
  const b = baseName(name);
  if (/forced/i.test(b)) return .2;
  if (EN_LANG.test(b)) return 2;
  if (OTHER_LANG.test(b.slice(-12))) return -1;
  return 1;
}
const prettyTitle = b => b.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
const dirOf = p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '';

let library = [];
const DEMO_SRT = `1
00:00:00,500 --> 00:00:03,200
Morning! You look exhausted. Rough night?

2
00:00:03,600 --> 00:00:07,000
Tell me about it. My neighbor's dog
kept barking until dawn.

3
00:00:07,400 --> 00:00:10,500
That's awful. Have you tried talking to them?

4
00:00:10,900 --> 00:00:14,800
I did, but they just shrugged
and said it wasn't a big deal.

5
00:00:15,200 --> 00:00:18,600
Honestly, I'd be furious.
You deserve a decent night's sleep.

6
00:00:19,000 --> 00:00:22,700
I know. I'm thinking of filing
a complaint with the landlord.

7
00:00:23,100 --> 00:00:26,400
Good idea. In the meantime, grab a coffee. It's on me.

8
00:00:26,800 --> 00:00:29,500
You're a lifesaver. I owe you one.

9
00:00:30,000 --> 00:00:33,800
Don't mention it. Just don't fall asleep
during the meeting.

10
00:00:34,200 --> 00:00:37,000
No promises. I can barely keep my eyes open.
`;

/* Videolu örnek: Tears of Steel'in açılış sahnesi (filmde 0:20-0:46). Film CC BY 3.0, kaynak belirtmek gerekir.
   Altyazı filmin resmî İngilizce altyazısı, kesilen parçanın başına göre kaydırıldı. */
const DEMO_VIDEO = { name: 'tears-of-steel.mp4', url: 'demo/tears-of-steel.mp4' };
const DEMO_VIDEO_CREDIT = 'Tears of Steel · (CC) Blender Foundation · mango.blender.org · CC BY 3.0';
const DEMO_VIDEO_SRT = `1
00:00:03,000 --> 00:00:04,500
You're a jerk, Thom.

2
00:00:05,000 --> 00:00:07,000
Look Celia, we have to follow our passions;

3
00:00:07,000 --> 00:00:10,500
...you have your robotics, and I
just want to be awesome in space.

4
00:00:10,800 --> 00:00:14,000
Why don't you just admit that
you're freaked out by my robot hand?

5
00:00:14,500 --> 00:00:16,000
I'm not freaked out by- it's...

6
00:00:17,000 --> 00:00:18,000
...alright! Fine!

7
00:00:18,000 --> 00:00:21,000
I'm freaked out! I have nightmares
that I'm being chased...

8
00:00:21,000 --> 00:00:22,000
...by these giant robotic claws of death...

9
00:00:22,200 --> 00:00:25,000
Whatever, Thom. We're done.
`;
const isDemo = e => e.key.startsWith('demo');

async function loadFiles(list, { append = false, label = '' } = {}) {
  const vids = list.filter(it => VIDEO_EXT.test(it.file.name));
  const subs = list.filter(it => SUB_EXT.test(it.file.name)).map(s => ({
    ...s, dir: dirOf(s.path), key: stripLang(baseName(s.file.name)).toLowerCase(), score: langScore(s.file.name)
  })).filter(s => s.score >= 0);

  const entries = [], noSub = [], used = new Set();
  for (const v of vids) {
    const vb = baseName(v.file.name), dir = dirOf(v.path);
    const cands = subs.filter(s => s.dir === dir && s.key === stripLang(vb).toLowerCase()).sort((a, b) => b.score - a.score);
    let cues = [];
    for (const s of cands) {
      cues = parseSubs(await readText(s.file));
      if (cues.length) { used.add(s); break; }
    }
    if (!cues.length) { noSub.push(v.file.name); continue; }
    entries.push({ key: dir + vb, title: prettyTitle(vb), video: v.file, cues });
  }
  const vidKeys = new Set(vids.map(v => dirOf(v.path) + '|' + stripLang(baseName(v.file.name)).toLowerCase()));
  for (const s of subs) {
    if (used.has(s) || vidKeys.has(s.dir + '|' + s.key)) continue;
    const cues = parseSubs(await readText(s.file));
    if (cues.length) entries.push({ key: s.dir + baseName(s.file.name), title: prettyTitle(baseName(s.file.name)), video: null, cues });
  }
  entries.sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));

  if (!entries.length) {
    toast(vids.length
      ? 'Videolar bulundu ama eşleşen İngilizce altyazı (.srt / .vtt) yok. Altyazı dosyası videoyla aynı adı taşımalı.'
      : 'Video ya da altyazı dosyası bulunamadı.', 6000);
    return;
  }
  library = (append ? library.filter(e => !isDemo(e)) : library.filter(e => e.yt)).concat(entries);
  buildFeed();
  closeSheet();
  const clips = cards.length;
  let msg = `${entries.length} kaynak, ${clips} klip yüklendi${label ? ' (' + label + ')' : ''}.`;
  if (noSub.length) msg += ` Altyazısı bulunamayan ${noSub.length} video atlandı.`;
  toast(msg, 5000);
  if (noSub.length) console.info('Altyazısı bulunamayan videolar:', noSub);
}
function loadDemo() {
  library = [
    { key: 'demo-video', title: 'Örnek sahne: Tears of Steel', credit: DEMO_VIDEO_CREDIT, video: DEMO_VIDEO, cues: parseSubs(DEMO_VIDEO_SRT) },
    { key: 'demo', title: 'Örnek diyalog (videosuz)', video: null, cues: parseSubs(DEMO_SRT) },
    ...library.filter(e => e.yt)
  ];
  buildFeed();
  closeSheet();
}

/* ---------------- YouTube videoları ----------------
   Video YouTube'dan oynar; altyazıyı kullanıcı verir (.srt/.vtt ya da "Transkripti göster" metni).
   Link ve altyazı tarayıcıda saklanır, uygulama her açıldığında akışa gelir. */
const loadYTStore = () => store.get('ka.yt', []);
const ytEntry = v => ({ key: 'yt:' + v.id, yt: v.id, title: v.title, video: null, cues: v.cues.map(([start, end, text]) => ({ start, end, text })) });
function parseYouTubeId(s) {
  s = String(s || '').trim();
  const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#\s]*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(s) ? s : null;
}
async function ytInfo(id) {
  try {
    const j = await fetchJSON('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id));
    return { title: j.title, author: j.author_name };
  } catch (e) { return { title: null, error: e.status }; }
}
/* YouTube "Transkripti göster" kopyası: "0:10" satırı + metin (ya da "0:10 metin") */
const TS_LINE = /^\s*((?:\d{1,2}:)?\d{1,2}:\d{2})(?:\s+(.*))?$/;
function parseTranscript(text) {
  const raw = [];
  for (const line of text.replace(/\r/g, '').split('\n')) {
    const m = line.match(TS_LINE);
    if (m) raw.push({ start: parseTime(m[1]), text: (m[2] || '').trim() });
    else if (raw.length && line.trim()) {
      const last = raw[raw.length - 1];
      last.text += (last.text ? ' ' : '') + line.trim();
    }
  }
  const cues = raw.filter(q => q.text).sort((a, b) => a.start - b.start);
  cues.forEach((q, i) => {
    const next = cues[i + 1];
    q.end = next ? Math.min(next.start, q.start + 10) : q.start + 5;
    if (q.end <= q.start) q.end = q.start + 1;
  });
  return tidyCues(cues, true);
}
const parseAnySubs = text => /-->/.test(text) ? parseSubs(text) : parseTranscript(text);

function saveYouTube(id, title, cues) {
  const list = loadYTStore().filter(v => v.id !== id);
  const v = { id, title, addedAt: Date.now(), cues: cues.map(q => [+q.start.toFixed(2), +q.end.toFixed(2), q.text]) };
  list.unshift(v);
  if (!store.set('ka.yt', list)) { toast('Kaydedilemedi: tarayıcı depolaması dolu. Eski bir YouTube videosunu silmeyi dene.', 6000); return null; }
  library = [ytEntry(v), ...library.filter(e => e.key !== 'yt:' + id && !isDemo(e))];
  buildFeed();
  return v;
}
function deleteYouTube(id) {
  store.set('ka.yt', loadYTStore().filter(v => v.id !== id));
  library = library.filter(e => e.key !== 'yt:' + id);
  buildFeed();
}

let ytDraft = null;
function openYouTubeAdd(link = '') {
  const m = mounted.get(activeIdx);
  if (m) m.player.pause();
  ytDraft = { id: null, title: null, token: 0 };
  openSheet(`
    <div class="lib ytadd">
      <h1>YouTube'dan ekle</h1>
      <label class="label" for="ytUrl">Video linki</label>
      <input class="field" id="ytUrl" type="url" inputmode="url" placeholder="https://youtu.be/…" value="${esc(link)}" autocomplete="off">
      <div class="ytinfo" id="ytInfo"></div>
      <div class="label">İngilizce altyazı</div>
      <p class="hint">Altyazıyı <b>.srt / .vtt</b> dosyası olarak seç ya da YouTube'da videonun açıklamasındaki
        <b>"Transkripti göster"</b> metnini kopyalayıp aşağıya yapıştır.</p>
      <div class="btns"><button data-act="yt-file">.srt / .vtt dosyası seç</button></div>
      <textarea class="field" id="ytText" rows="7" placeholder="0:10&#10;Hello everyone and welcome back…&#10;0:14&#10;…"></textarea>
      <div class="hint" id="ytCount"></div>
      <div class="lk-actions"><button class="primary" data-act="yt-save">Ekle ve izle</button></div>
    </div>`);
  const url = $('#ytUrl'), txt = $('#ytText');
  let timer;
  url.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(resolveYouTubeLink, 350); });
  txt.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(countYouTubeCues, 300); });
  if (link) resolveYouTubeLink(); else url.focus();
}
async function resolveYouTubeLink() {
  const box = $('#ytInfo');
  if (!box || !ytDraft) return;
  const id = parseYouTubeId($('#ytUrl').value);
  const token = ++ytDraft.token;
  ytDraft.id = id; ytDraft.title = null;
  if (!id) { box.innerHTML = $('#ytUrl').value.trim() ? '<p class="err">Bu bir YouTube video linkine benzemiyor.</p>' : ''; return; }
  box.innerHTML = `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt=""><div><div class="skeleton sm"></div></div>`;
  const info = await ytInfo(id);
  if (token !== ytDraft.token) return;
  ytDraft.title = info.title;
  const saved = loadYTStore().some(v => v.id === id);
  box.innerHTML = `<img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="">
    <div><b>${esc(info.title || 'YouTube videosu')}</b>
    ${info.author ? `<div class="muted">${esc(info.author)}</div>` : ''}
    ${info.error ? '<div class="err">Video bulunamadı, gizli ya da başka sitelerde oynatılmaya kapalı olabilir.</div>' : ''}
    ${saved ? '<div class="muted">Bu video zaten ekli; kaydedersen altyazısı güncellenir.</div>' : ''}</div>`;
}
function countYouTubeCues() {
  const t = $('#ytText')?.value || '';
  const el = $('#ytCount');
  if (!el) return;
  if (!t.trim()) { el.textContent = ''; return; }
  const n = parseAnySubs(t).length;
  el.innerHTML = n ? `${n} cümle bulundu.` : '<span class="err">Zaman damgası bulunamadı. Metin "0:10" gibi zamanlar içermeli.</span>';
}
async function pickYouTubeSubFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  if (!isTouch) inp.accept = '.srt,.vtt,text/vtt';
  inp.onchange = async () => {
    const f = inp.files[0];
    if (!f) return;
    $('#ytText').value = await readText(f);
    countYouTubeCues();
  };
  inp.click();
}
function saveYouTubeDraft() {
  const id = parseYouTubeId($('#ytUrl')?.value);
  if (!id) return toast('Önce geçerli bir YouTube linki gir.');
  const text = $('#ytText').value;
  const cues = text.trim() ? parseAnySubs(text) : [];
  if (!cues.length) return toast('Altyazı ekle: .srt dosyası seç ya da transkripti yapıştır.');
  const title = (ytDraft?.id === id && ytDraft.title) || 'YouTube videosu';
  if (!saveYouTube(id, title, cues)) return;
  closeSheet();
  const i = cards.findIndex(c => c.entry.key === 'yt:' + id);
  if (i >= 0) { goTo(i); setActive(i); }
  toast(`"${title}" eklendi: ${cues.length} cümle.`);
}
/* Android paylaş menüsünden gelen link (manifest share_target) */
function takeSharedLink() {
  const p = new URLSearchParams(location.search);
  if (!['url', 'text', 'title'].some(k => p.has(k))) return null;
  const s = ['url', 'text', 'title'].map(k => p.get(k) || '').join(' ');
  history.replaceState(null, '', location.pathname);
  const link = (s.match(/https?:\/\/\S+/g) || []).find(u => parseYouTubeId(u));
  if (!link) toast('Paylaşılan bağlantıda YouTube videosu bulunamadı.');
  return link || null;
}
async function filesFromHandle(dir, path = '', depth = 0) {
  const out = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind === 'file') {
      if (VIDEO_EXT.test(name) || SUB_EXT.test(name)) out.push({ file: await h.getFile(), path: path + name });
    } else if (depth < 4 && !name.startsWith('.')) {
      out.push(...await filesFromHandle(h, path + name + '/', depth + 1));
    }
  }
  return out;
}
async function pickDirectory() {
  if (!window.showDirectoryPicker) return $('#pickDir').click();
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'kelime-avcisi', mode: 'read' }); }
  catch (e) { if (e.name !== 'AbortError') $('#pickDir').click(); return; }
  await idbSet('lastDir', dir);
  await loadFromHandle(dir);
}
async function loadFromHandle(dir) {
  toast('Klasör okunuyor…', 10000);
  try { await loadFiles(await filesFromHandle(dir), { label: dir.name }); }
  catch (e) { console.error(e); toast('Klasör okunamadı: ' + e.message, 6000); }
}
async function reopenLastDir() {
  const dir = await idbGet('lastDir');
  if (!dir) return toast('Kayıtlı klasör yok.');
  try {
    let p = await dir.queryPermission({ mode: 'read' });
    if (p !== 'granted') p = await dir.requestPermission({ mode: 'read' });
    if (p !== 'granted') return toast('Klasöre erişim izni verilmedi.');
    await loadFromHandle(dir);
  } catch (e) { toast('Klasör açılamadı: ' + e.message, 6000); }
}
const fileListToItems = fl => [...fl].map(f => ({ file: f, path: f.webkitRelativePath || f.name }));

/* Telefonda klasör seçilemez; dosyalar tek tek (çoklu) seçilir */
const isTouch = matchMedia('(pointer: coarse)').matches;
const canPickDir = !!window.showDirectoryPicker || !isTouch;

/* baslat.bat ile açıldıysa sunucudaki videos/ klasörünü listele (telefona kopyalamadan oynatmak için) */
async function listServerVideos() {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const r = await fetch('videos/', { cache: 'no-store' });
    if (!r.ok) return null;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    return [...doc.querySelectorAll('a[href]')]
      .map(a => { try { return decodeURIComponent(a.getAttribute('href')); } catch { return ''; } })
      .filter(n => !n.includes('/') && (VIDEO_EXT.test(n) || SUB_EXT.test(n)));
  } catch { return null; }
}
async function loadServerVideos() {
  const names = await listServerVideos();
  if (!names?.some(n => VIDEO_EXT.test(n))) return toast('Bilgisayardaki videos klasöründe video bulunamadı.');
  toast('Videolar yükleniyor…', 10000);
  const items = [];
  for (const n of names) {
    const url = 'videos/' + encodeURIComponent(n);
    if (VIDEO_EXT.test(n)) { items.push({ file: { name: n, url }, path: 'videos/' + n }); continue; }
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) items.push({ file: new File([await r.blob()], n), path: 'videos/' + n });
  }
  await loadFiles(items, { label: 'bilgisayardaki videos klasörü' });
}

async function libPanelHTML(inSheet) {
  const last = window.showDirectoryPicker ? await idbGet('lastDir') : null;
  const serverVids = (await listServerVideos() || []).filter(n => VIDEO_EXT.test(n)).length;
  const stats = library.length
    ? `<div class="libstats">Şu an yüklü: ${library.length} kaynak, ${cards.length} klip.</div>` : '';
  const primary = serverVids ? 'server' : last ? 'last' : canPickDir ? 'dir' : 'files';
  const cls = k => k === primary ? 'primary' : '';
  const yts = loadYTStore();
  return `<div class="lib">
    ${inSheet ? '<h1>Videolar</h1>' : '<h1>Kaydır, dokun, yakala.</h1>'}
    <p class="lead">Altyazılı videolarını aç; altyazıdaki bilmediğin kelimeye dokun, anlamını gör, hazinene ekle.</p>
    <div class="ytbox">
      <div><b>YouTube'dan izle</b><div class="muted">Video indirmeden: linki ve altyazısını ver.${isTouch ? ' YouTube\'da Paylaş → Kelime Avcısı da olur.' : ''}</div></div>
      <button class="primary" data-act="yt-add">YouTube linki ekle</button>
    </div>
    ${yts.length ? `<ul class="ytlist">${yts.map(v => `<li>
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/default.jpg" alt="">
      <span><b>${esc(v.title)}</b><small>${v.cues.length} cümle</small></span>
      <button class="btn" data-act="yt-del" data-id="${esc(v.id)}" title="Sil">Sil</button></li>`).join('')}</ul>` : ''}
    <div class="drop" id="drop">
      <div><b>${isTouch ? 'Video ve altyazı dosyalarını seç' : 'Video ve altyazı dosyalarını buraya sürükle'}</b></div>
      <div class="muted">${isTouch ? 'videoyu ve .srt dosyasını birlikte işaretle' : 'ya da'}</div>
      <div class="btns">
        ${serverVids ? `<button class="${cls('server')}" data-act="server-videos">Bilgisayardaki videolar (${serverVids})</button>` : ''}
        ${last ? `<button class="${cls('last')}" data-act="reopen-dir">Son klasörü aç: ${esc(last.name)}</button>` : ''}
        ${canPickDir ? `<button class="${cls('dir')}" data-act="pick-dir">Klasör seç</button>` : ''}
        <button class="${cls('files')}" data-act="pick-files">Dosya seç</button>
        ${inSheet && library.length ? '<button data-act="add-files">Mevcutlara ekle</button>' : ''}
        <button data-act="demo">Örnekle dene</button>
      </div>
    </div>
    <ol class="steps">
      <li>Video ile altyazı aynı klasörde ve aynı adda olmalı: <code>Bolum1.mp4</code> + <code>Bolum1.srt</code> (ya da <code>Bolum1.en.srt</code>).</li>
      <li>Desteklenen: <code>.mp4 .webm .mkv .mov</code> videolar, <code>.srt .vtt</code> altyazılar. Türkçe altyazılar atlanır.</li>
      <li>Uzun videolar otomatik olarak ~${settings.clipLen} saniyelik kliplere bölünür (Ayarlar'dan değişir).</li>
      <li>Videosu olmayan bir altyazı dosyası da açılabilir; cümleler zamanında ekrana gelir.</li>
    </ol>
    ${stats}
  </div>`;
}
async function renderWelcome() {
  const wel = $('#welcome');
  wel.innerHTML = await libPanelHTML(false);
  bindDrop($('#drop', wel));
}

/* ---------------- metin oynatıcı (videosuz altyazı) ---------------- */
class TextPlayer extends EventTarget {
  constructor(duration) {
    super();
    this._t = 0; this._at = 0; this._rate = 1;
    this.paused = true; this.muted = false; this.duration = duration; this.readyState = 4;
  }
  get currentTime() { return this.paused ? this._t : this._t + (performance.now() - this._at) / 1000 * this._rate; }
  set currentTime(v) { this._t = v; this._at = performance.now(); }
  get playbackRate() { return this._rate; }
  set playbackRate(r) { this._t = this.currentTime; this._at = performance.now(); this._rate = r; }
  play() {
    if (this.paused) { this._at = performance.now(); this.paused = false; this.dispatchEvent(new Event('play')); }
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) { this._t = this.currentTime; this.paused = true; this.dispatchEvent(new Event('pause')); }
  }
}

/* ---------------- YouTube oynatıcı (resmî IFrame API) ----------------
   HTMLVideoElement'in kullandığımız kısmını taklit eder: currentTime, paused, play/pause,
   playbackRate, muted ve play/pause/ended olayları. */
let ytApi = null;
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (!ytApi) ytApi = new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApi = null; rej(new Error('YouTube oynatıcısı yüklenemedi. İnternet bağlantını kontrol et.')); };
    document.head.appendChild(s);
  });
  return ytApi;
}
const YT_ERRORS = {
  2: 'Geçersiz YouTube video kimliği.',
  5: 'YouTube oynatıcısı bu videoyu oynatamadı.',
  100: 'Video bulunamadı ya da gizli.',
  101: 'Videonun sahibi başka sitelerde oynatılmasına izin vermiyor.',
  150: 'Videonun sahibi başka sitelerde oynatılmasına izin vermiyor.',
  153: 'YouTube oynatıcısı bu sayfada açılamadı.'
};
class YTPlayer extends EventTarget {
  constructor(host, videoId, start = 0) {
    super();
    this.readyState = 0; this.duration = NaN; this.destroyed = false;
    this._state = -1; this._want = false; this._rate = 1; this._muted = false;
    this._seek = start; this._seekAt = 0; this._raw = start; this._rawAt = performance.now();
    this.el = document.createElement('div');
    this.el.className = 'yt-frame';
    const inner = document.createElement('div');
    this.el.appendChild(inner);
    host.prepend(this.el);
    loadYouTubeApi().then(() => {
      if (this.destroyed) return;
      this.p = new YT.Player(inner, {
        videoId, width: '100%', height: '100%', host: 'https://www.youtube-nocookie.com',
        playerVars: {
          playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, cc_load_policy: 0,
          start: Math.floor(start), origin: location.origin
        },
        events: {
          onReady: () => this._onReady(),
          onStateChange: e => this._onState(e.data),
          onError: e => this._fail(YT_ERRORS[e.data] || 'YouTube hatası: ' + e.data)
        }
      });
    }).catch(e => this._fail(e.message));
  }
  _fail(message) {
    const e = new Event('error');
    e.message = message;
    this.dispatchEvent(e);
  }
  _onReady() {
    if (this.destroyed) return;
    this.readyState = 4;
    this.duration = this.p.getDuration() || NaN;
    try { this.p.unloadModule('captions'); } catch { }  // YouTube'un kendi altyazısı bizimkiyle çakışmasın
    this.playbackRate = this._rate;
    this.muted = this._muted;
    // seekTo henüz başlamamış oynatıcıyı kendiliğinden oynatır; komşu (önceden yüklenen) kartta yapma,
    // konumu zaten playerVars.start veriyor
    if (this._want && this._seek != null) { this.p.seekTo(this._seek, true); this._seekAt = performance.now(); }
    if (this._want) this.p.playVideo();
  }
  _onState(s) {
    this._state = s;
    // İstenmeden başladıysa (ör. etkin olmayan kartta seekTo) durdur: yoksa arkada başka videoyla üst üste çalar
    if ((s === 1 || s === 3) && !this._want) { this.p.pauseVideo(); return; }
    if (s === 1) { this.duration = this.p.getDuration() || this.duration; this.dispatchEvent(new Event('play')); }
    else if (s === 2 || s === 0) {
      this._want = false;
      this.dispatchEvent(new Event('pause'));
      if (s === 0) this.dispatchEvent(new Event('ended'));
    }
  }
  get paused() { return !(this._state === 1 || this._want); }
  get currentTime() {
    if (!this.p || this.readyState < 4) return this._seek ?? 0;
    const now = performance.now();
    const raw = this.p.getCurrentTime() || 0;
    // seekTo sonrası oynatıcı bir süre eski zamanı bildirir; o arada istenen zamanı kullan
    if (this._seekAt && now - this._seekAt < 1500 && Math.abs(raw - this._seek) > 1) {
      return this._seek + (this._state === 1 ? (now - this._seekAt) / 1000 * this._rate : 0);
    }
    this._seekAt = 0;
    if (raw !== this._raw) { this._raw = raw; this._rawAt = now; }
    // getCurrentTime ~4 kez/sn güncellenir; altyazı akıcı olsun diye aradaki zamanı tahmin et
    return this._state === 1 ? raw + Math.min(.5, (now - this._rawAt) / 1000) * this._rate : raw;
  }
  set currentTime(v) {
    this._seek = v;
    this._seekAt = performance.now();
    if (this.p && this.readyState >= 4) this.p.seekTo(v, true);
  }
  get playbackRate() { return this._rate; }
  set playbackRate(r) {
    this._rate = r;
    if (!this.p || this.readyState < 4) return;
    const rates = this.p.getAvailablePlaybackRates?.() || [r];
    this.p.setPlaybackRate(rates.reduce((a, b) => Math.abs(b - r) < Math.abs(a - r) ? b : a));
  }
  get muted() { return this._muted; }
  set muted(v) {
    this._muted = v;
    if (this.p && this.readyState >= 4) v ? this.p.mute() : this.p.unMute();
  }
  play() {
    this._want = true;
    if (this.p && this.readyState >= 4) this.p.playVideo();
    return Promise.resolve();
  }
  pause() {
    const was = !this.paused;
    this._want = false;
    if (this.p && this.readyState >= 4) this.p.pauseVideo();
    if (was) this.dispatchEvent(new Event('pause'));
  }
  destroy() {
    this.destroyed = true;
    try { this.p?.destroy(); } catch { }
    this.el.remove();
  }
}
const hasMedia = e => !!(e && (e.video || e.yt));

/* ---------------- akış ---------------- */
const feedEl = $('#feed');
let cards = [];
let activeIdx = -1;
const mounted = new Map();
const urls = new Map();
const urlFor = entry => { if (entry.video.url) return entry.video.url; if (!urls.has(entry.video)) urls.set(entry.video, URL.createObjectURL(entry.video)); return urls.get(entry.video); };

const io = new IntersectionObserver(ents => {
  for (const e of ents) if (e.isIntersecting) setActive(+e.target.dataset.i);
}, { root: feedEl, threshold: .6 });

function buildFeed() {
  for (const k of [...mounted.keys()]) unmount(k);
  io.disconnect();
  feedEl.innerHTML = '';
  activeIdx = -1;
  cards = [];
  for (const entry of library) {
    entry.segments = segmentCues(entry.cues, !hasMedia(entry));
    entry.segments.forEach((seg, si) => cards.push({ entry, seg, si }));
  }
  if (settings.shuffle) shuffle(cards);
  const frag = document.createDocumentFragment();
  cards.forEach((c, i) => { c.el = makeCardEl(c, i); frag.appendChild(c.el); });
  feedEl.appendChild(frag);
  cards.forEach(c => io.observe(c.el));
  const has = cards.length > 0;
  $('#welcome').classList.toggle('on', !has);
  $('#libBtn').hidden = !has;
  if (!has) renderWelcome();
  feedEl.scrollTop = 0;
}
function makeCardEl(c, i) {
  const el = document.createElement('section');
  el.className = 'clip is-paused';
  el.dataset.i = i;
  const n = c.entry.segments.length;
  const rate = wpm(c.seg);
  const pace = rate < 120 ? 'yavaş' : rate < 165 ? 'orta' : 'hızlı';
  el.innerHTML = `
    <div class="stage">${hasMedia(c.entry) ? '' : '<div class="textbg"><span>Videosuz · cümleler sesli okunur</span></div>'}<div class="tapzone" data-act="toggle"></div></div>
    <div class="playhint"><div>${icon('play', 44)}</div></div>
    <div class="meta">
      <div class="title">${esc(c.entry.title)}</div>
      <div class="info">${n > 1 ? `Klip ${c.si + 1}/${n} · ` : ''}${fmtTime(c.seg.start)} · ~${rate} kelime/dk (${pace})</div>
      ${c.entry.credit ? `<div class="credit">${esc(c.entry.credit)}</div>` : ''}
    </div>
    <div class="sub"></div>
    <div class="side">
      <button data-act="toggle" title="Oynat / duraklat (Boşluk)">${icon('play', 22, 'ic-play')}${icon('pause', 22, 'ic-pause')}</button>
      <button data-act="replay" title="Cümleyi tekrar oynat (R)">${icon('replay')}</button>
      <button data-act="prev-cue" title="Önceki cümle (←)">${icon('prev')}</button>
      <button data-act="next-cue" title="Sonraki cümle (→)">${icon('next')}</button>
      <button data-act="tr-line" title="Cümleyi çevir (T)">TR</button>
      <button data-act="rate" title="Hız" class="rate">${fmtRate(settings.rate)}</button>
      <button data-act="mute" title="Ses" class="mute">${icon(settings.muted ? 'mute' : 'vol')}</button>
    </div>
    <div class="progress"><i></i></div>`;
  return el;
}
const fmtRate = r => (r === 1 ? '1' : String(r).replace(/^0/, '')) + '×';

function mount(k) {
  if (mounted.has(k) || k < 0 || k >= cards.length) return;
  const c = cards[k];
  let player;
  if (c.entry.video) {
    const v = document.createElement('video');
    v.playsInline = true;
    v.preload = 'auto';
    v.src = urlFor(c.entry);
    v.currentTime = c.seg.start;
    v.addEventListener('error', () => {
      if (c.el.querySelector('.err-msg')) return;
      c.el.classList.add('has-err');
      c.el.querySelector('.stage').insertAdjacentHTML('beforeend',
        `<div class="err-msg">Bu video tarayıcıda oynatılamıyor.<br>Dosya biçimi ya da codec (ör. HEVC/H.265, AC3 ses) desteklenmiyor olabilir. MP4 (H.264 + AAC) en sorunsuz seçenektir.</div>`);
    });
    v.addEventListener('ended', () => { if (k === activeIdx) onClipEnd(); });
    v.addEventListener('playing', () => setTimeout(() => checkAudio(v, c.entry), 2500));
    c.el.querySelector('.stage').prepend(v);
    player = v;
  } else if (c.entry.yt) {
    player = new YTPlayer(c.el.querySelector('.stage'), c.entry.yt, c.seg.start);
    player.addEventListener('error', e => {
      if (c.el.querySelector('.err-msg')) return;
      c.el.classList.add('has-err');
      c.el.querySelector('.stage').insertAdjacentHTML('beforeend', `<div class="err-msg">${esc(e.message)}</div>`);
    });
    player.addEventListener('ended', () => { if (k === activeIdx) onClipEnd(); });
    player.addEventListener('play', () => c.el.classList.remove('yt-tap'));
  } else {
    player = new TextPlayer(c.seg.end);
    player.currentTime = c.seg.start;
  }
  player.muted = settings.muted;
  const m = { player, shownKey: null, shown: [], lastCue: null, trFor: -1, trText: '', speaking: false, spokenCue: -1, speakTok: 0 };
  player.addEventListener('play', () => c.el.classList.remove('is-paused'));
  player.addEventListener('pause', () => { c.el.classList.add('is-paused'); if (!hasMedia(c.entry)) resetNarration(m); });
  mounted.set(k, m);
}
/* Chrome AC3/E-AC3/DTS sesi çözemez: görüntü oynar ama ses gelmez. Bunu fark edip söyle. */
const audioChecked = new Set();
function checkAudio(v, entry) {
  if (audioChecked.has(entry.key) || v.paused || v.muted || !('webkitAudioDecodedByteCount' in v)) return;
  if (v.webkitAudioDecodedByteCount > 0) { audioChecked.add(entry.key); return; }
  if (v.webkitVideoDecodedByteCount > 0) {
    audioChecked.add(entry.key);
    toast(`"${entry.title}" için ses çalınamıyor. Videoda ses yok ya da ses biçimi (ör. AC3, E-AC3, DTS) bu tarayıcıda desteklenmiyor. Edge'de açmayı dene ya da sesi AAC'ye dönüştür.`, 10000);
  }
}
/* Videosuz (yalnız altyazı) kartlarda cümleleri sesli oku; okuma bitmeden sonraki cümleye geçme */
function resetNarration(m) {
  m.speakTok++;
  m.speaking = false;
  m.spokenCue = -1;
  try { speechSynthesis.cancel(); } catch { }
}
function narrate(c, m) {
  const p = m.player;
  if (p.paused || settings.muted || !('speechSynthesis' in window)) return;
  if (m.speaking) {
    const q = c.seg.cues[m.spokenCue];
    if (q && p.currentTime > q.end - .05) p.currentTime = q.end - .05;
    return;
  }
  const i = m.shown.length ? m.shown[m.shown.length - 1] : -1;
  if (i < 0 || i === m.spokenCue || p.currentTime >= c.seg.cues[i].end) return;
  const tok = ++m.speakTok;
  m.spokenCue = i;
  m.speaking = true;
  speak(c.seg.cues[i].text.replace(/\n/g, ' '), { rate: .95 * settings.rate, onEnd: () => { if (m.speakTok === tok) m.speaking = false; } });
}
function unmount(k) {
  const m = mounted.get(k);
  if (!m) return;
  m.player.pause();
  if (m.player instanceof HTMLVideoElement) { m.player.removeAttribute('src'); m.player.load(); m.player.remove(); }
  if (m.player instanceof YTPlayer) m.player.destroy();
  const c = cards[k];
  if (c) { c.el.querySelector('.sub').innerHTML = ''; c.el.classList.add('is-paused'); c.el.classList.remove('yt-tap', 'has-err'); c.el.querySelector('.err-msg')?.remove(); }
  mounted.delete(k);
}
function setActive(i) {
  if (i === activeIdx || !cards[i]) return;
  const old = mounted.get(activeIdx);
  if (old) old.player.pause();
  activeIdx = i;
  const keep = new Set([i - 1, i, i + 1]);
  for (const k of [...mounted.keys()]) if (!keep.has(k)) unmount(k);
  for (const k of keep) mount(k);
  const m = mounted.get(i);
  m.player.currentTime = cards[i].seg.start;
  m.player.playbackRate = settings.rate;
  m.lastCue = null; m.trFor = -1;
  if (!hasMedia(cards[i].entry)) resetNarration(m);
  if (currentView === 'feed' && !sheetOpen) playActive();
}
function playActive() {
  const m = mounted.get(activeIdx);
  if (!m) return;
  const p = m.player.play();
  if (p && p.catch) p.catch(() => cards[activeIdx]?.el.classList.add('is-paused'));
  if (m.player instanceof YTPlayer) {
    // Bazı tarayıcılar (özellikle iPhone) YouTube'un ilk oynatmasında videoya doğrudan dokunulmasını ister
    const idx = activeIdx;
    setTimeout(() => {
      if (idx === activeIdx && m.player._want && m.player._state !== 1 && m.player._state !== 3 && m.player.readyState >= 4
        && !cards[idx].el.classList.contains('has-err')) {
        cards[idx].el.classList.add('yt-tap');
      }
    }, 2500);
  }
}
function onClipEnd() {
  const c = cards[activeIdx], m = mounted.get(activeIdx);
  if (!c || !m) return;
  if (settings.onEnd === 'next' && activeIdx < cards.length - 1) { m.player.pause(); goTo(activeIdx + 1); return; }
  m.player.currentTime = c.seg.start;
  m.lastCue = null;
  if (!hasMedia(c.entry)) resetNarration(m);
  playActive();
}
function goTo(i) {
  if (!cards[i]) return;
  cards[i].el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

function tick() {
  requestAnimationFrame(tick);
  if (currentView !== 'feed') return;
  const c = cards[activeIdx], m = mounted.get(activeIdx);
  if (!c || !m) return;
  const p = m.player, seg = c.seg;
  const t = p.currentTime;
  const end = isFinite(seg.end) ? seg.end : (p.duration || Infinity);
  if (!p.paused && t >= end - .05) { onClipEnd(); return; }
  renderSubs(c, m, t);
  if (!hasMedia(c.entry)) narrate(c, m);
  const pct = isFinite(end) ? Math.min(100, Math.max(0, (t - seg.start) / (end - seg.start) * 100)) : 0;
  c.el.querySelector('.progress i').style.width = pct + '%';
}
function renderSubs(c, m, t) {
  const cues = c.seg.cues;
  let act = [];
  for (let i = 0; i < cues.length; i++) {
    const q = cues[i];
    if (q.start > t) break;
    if (t < q.end) act.push(i);
  }
  if (act.length) m.lastCue = act[act.length - 1];
  else if (m.lastCue != null) {
    // Kısa bir süre son cümleyi ekranda tut ki dokunmaya vakit olsun
    const q = cues[m.lastCue];
    if (t >= q.end && (t - q.end < 2.5 || m.player.paused)) act = [m.lastCue];
  }
  const key = act.join(',') + '|' + wordsVersion + '|' + m.trFor;
  if (key === m.shownKey) return;
  m.shownKey = key;
  m.shown = act;
  c.el.querySelector('.sub').innerHTML = act.map(i =>
    `<div class="cue" data-ci="${i}">${cues[i].text.split('\n').map(l => lineHTML(l)).join('<br>')}</div>` +
    (m.trFor === i ? `<div class="cue-tr">${esc(m.trText)}</div>` : '')
  ).join('');
}
function currentCueIdx(m, c) {
  if (m.shown.length) return m.shown[m.shown.length - 1];
  const t = m.player.currentTime;
  let best = -1;
  c.seg.cues.forEach((q, i) => { if (q.start <= t) best = i; });
  return best;
}
function seekCue(delta) {
  const c = cards[activeIdx], m = mounted.get(activeIdx);
  if (!c || !m) return;
  const cues = c.seg.cues;
  let i = currentCueIdx(m, c);
  if (delta === 0) i = Math.max(0, i);
  else if (delta < 0) {
    // Cümlenin ortasındaysak önce başına dön
    const midCue = i >= 0 && m.shown.includes(i) && m.player.currentTime - cues[i].start > 1.2;
    if (!midCue) i = Math.max(0, i - 1);
  } else i = Math.min(cues.length - 1, i + 1);
  if (i < 0) return;
  m.player.currentTime = Math.max(c.seg.start, cues[i].start - .15);
  m.lastCue = null; m.shownKey = null;
  if (!hasMedia(c.entry)) resetNarration(m);
  playActive();
}
async function translateLine() {
  const c = cards[activeIdx], m = mounted.get(activeIdx);
  if (!c || !m) return;
  const i = currentCueIdx(m, c);
  if (i < 0) return;
  if (m.trFor === i) { m.trFor = -1; m.shownKey = null; return; }
  try {
    const r = await translate(c.seg.cues[i].text.replace(/\n/g, ' '));
    m.trFor = i; m.trText = r.main; m.shownKey = null;
    if (m.player.paused && !m.shown.includes(i)) m.lastCue = i;
  } catch (e) { toast(e.message); }
}
function togglePlay() {
  const m = mounted.get(activeIdx);
  if (!m) return;
  if (m.player.paused) playActive(); else m.player.pause();
}
function cycleRate() {
  const R = [1, .85, .7];
  settings.rate = R[(R.indexOf(settings.rate) + 1) % R.length];
  saveSettings();
  const m = mounted.get(activeIdx);
  if (m) m.player.playbackRate = settings.rate;
  $$('.clip .rate').forEach(b => b.textContent = fmtRate(settings.rate));
}
function toggleMute() {
  settings.muted = !settings.muted;
  saveSettings();
  for (const m of mounted.values()) {
    m.player.muted = settings.muted;
    if (settings.muted && m.player instanceof TextPlayer) resetNarration(m);
  }
  $$('.clip .mute').forEach(b => b.innerHTML = icon(settings.muted ? 'mute' : 'vol'));
}

/* ---------------- alt kart ---------------- */
let sheetOpen = false, sheetOnClose = null, sheetActions = {};
function openSheet(html, { onClose = null, actions = {} } = {}) {
  if (sheetOpen && sheetOnClose) { const f = sheetOnClose; sheetOnClose = null; f(true); }
  $('#sheetBody').innerHTML = html;
  sheetOnClose = onClose;
  sheetActions = actions;
  sheetOpen = true;
  $('#sheet').classList.add('on');
  $('#backdrop').classList.add('on');
  $('#sheet').scrollTop = 0;
}
function setSheet(html) { if (sheetOpen) $('#sheetBody').innerHTML = html; }
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  $('#sheet').classList.remove('on');
  $('#backdrop').classList.remove('on');
  const f = sheetOnClose;
  sheetOnClose = null; sheetActions = {};
  if (f) f(false);
}

/* ---------------- kelime kartı ---------------- */
let lookupToken = 0;
function caughtFor(info) { return words.find(w => w.word === info.lemma) || caughtForms.get(normWord(info.surface)) || null; }

function openLookup(ctx) {
  const m = mounted.get(activeIdx);
  const wasPlaying = ctx.resume || (ctx.fromFeed && m && !m.player.paused);
  if (ctx.fromFeed && m) m.player.pause();
  const token = ++lookupToken;
  const info = {
    surface: ctx.surface, lemma: baseForm(ctx.surface), sentence: ctx.sentence, source: ctx.source,
    fromFeed: ctx.fromFeed, dict: undefined, tr: null, sentenceTr: '', ctxIdx: -1
  };
  const rerender = () => { if (token === lookupToken) { info.ctxIdx = pickInContext(info.tr?.alts, info.sentenceTr); setSheet(lookupHTML(info)); } };
  openSheet(lookupHTML(info), {
    onClose: replaced => { if (!replaced && wasPlaying && settings.resumeAfterSheet && currentView === 'feed') playActive(); },
    actions: {
      say: () => sayWord(info.dict?.word || info.surface, info.dict?.audio),
      replay: () => replaySource(info.source, info.sentence),
      catch: () => { catchWord(info); rerender(); },
      release: () => {
        const w = caughtFor(info);
        if (w) { words = words.filter(x => x !== w); saveWords(); toast(`"${w.display}" hazineden çıkarıldı.`); }
        rerender();
      },
      word: el => openLookup({ ...ctx, surface: el.dataset.w, fromFeed: false, resume: wasPlaying })
    }
  });
  lookupDict(info.surface).then(d => {
    info.dict = d;
    if (d) {
      const lem = d.word.toLowerCase();
      const w = caughtFor(info);
      if (w && w.word !== lem && !words.some(x => x.word === lem)) w.word = lem;
      info.lemma = lem;
    }
    patchCaught(info); rerender();
    return d;
  }).catch(e => { info.dict = null; info.dictErr = 'Sözlüğe ulaşılamadı (' + e.message + ').'; rerender(); return null; })
    .then(d => translateWord(info.surface, d))
    .then(r => { info.tr = r; patchCaught(info); rerender(); })
    .catch(e => { info.trErr = e.message; rerender(); });
  translate(info.sentence).then(r => { info.sentenceTr = r.main; patchCaught(info); rerender(); })
    .catch(() => { info.sTrErr = true; rerender(); });
}
function lookupHTML(info) {
  const d = info.dict, w = caughtFor(info);
  const lemmaNote = d && d.word.toLowerCase() !== normWord(info.surface)
    ? `kök: <b>${esc(d.word)}</b> ${esc(d.phonetic || '')}` : esc(d?.phonetic || '');
  let tr;
  if (info.trErr) tr = `<p class="err">${esc(info.trErr)}</p>`;
  else if (!info.tr) tr = '<div class="skeleton"></div>';
  else {
    // Cümleye uyan anlam en başta
    const order = info.tr.alts.map((a, i) => i).sort((a, b) => (b === info.ctxIdx) - (a === info.ctxIdx));
    tr = `<div class="chips">${order.map(i =>
      `<span class="chip ${i === info.ctxIdx ? 'ctx' : ''}">${esc(info.tr.alts[i])}${i === info.ctxIdx ? '<small>bu cümlede</small>' : ''}</span>`).join('')}</div>`;
  }

  let defs;
  if (d === undefined) defs = '<div class="skeleton sm"></div><div class="skeleton sm"></div>';
  else if (info.dictErr) defs = `<p class="err">${esc(info.dictErr)}</p>`;
  else if (d === null) defs = '<p class="muted">Sözlükte bulunamadı (özel isim, argo ya da kısaltma olabilir).</p>';
  else defs = `<ul class="defs">${d.meanings.map(g => g.defs.slice(0, 2).map((x, j) =>
    `<li>${j === 0 ? `<span class="pos">${esc(POS_TR[g.pos] || g.pos)}</span>` : ''}${esc(x.d)}${x.ex ? `<span class="ex">“${esc(x.ex)}”</span>` : ''}</li>`).join('')).join('')}</ul>`;

  const canReplay = info.source && (info.fromFeed || libraryEntry(info.source.key));
  const action = w
    ? `<div class="caught-box">${coinSVG(w, 34)}<div>Hazinende · ${TIER_NAME[tierOf(w.level)]}<div class="muted" style="font-weight:400;font-size:13px">Sonraki tekrar: ${fmtRel(w.due - Date.now())}</div></div></div>
       <button class="btn" data-act="release">Çıkar</button>`
    : `<button class="primary" data-act="catch">Yakala</button>`;

  return `
    <div class="lk-head">
      <button class="round" data-act="say" title="Dinle">${icon('vol')}</button>
      <div><h2 class="lk-word">${esc(info.surface)}</h2><div class="lk-sub">${lemmaNote}</div></div>
    </div>
    <div class="label">${esc(LANGS[settings.lang] || settings.lang)}</div>
    ${tr}
    <div class="label">Duyduğun cümle</div>
    <p class="sent">${highlight(info.sentence, info.surface)}</p>
    ${info.sentenceTr ? `<p class="sent-tr">${esc(info.sentenceTr)}</p>` : info.sTrErr ? '' : '<div class="skeleton sm"></div>'}
    <button class="link" data-act="replay">${icon(canReplay ? 'replay' : 'vol', 16)} ${canReplay ? 'Cümleyi tekrar oynat' : 'Cümleyi seslendir'}</button>
    <div class="label">İngilizce sözlük</div>
    ${defs}
    <div class="lk-actions">${action}</div>`;
}
const POS_TR = {
  noun: 'isim', verb: 'fiil', adjective: 'sıfat', adverb: 'zarf', pronoun: 'zamir', preposition: 'edat',
  conjunction: 'bağlaç', interjection: 'ünlem', exclamation: 'ünlem', determiner: 'belirteç', article: 'tanımlık'
};
function catchWord(info) {
  const ex = { sentence: info.sentence, sentenceTr: info.sentenceTr || '', surface: info.surface, source: info.source };
  let w = caughtFor(info);
  if (w) {
    if (!w.examples.some(e => e.sentence === ex.sentence)) w.examples = [ex, ...w.examples].slice(0, 5);
  } else {
    w = {
      id: uid(), word: info.lemma, display: info.dict?.word || info.lemma, forms: [],
      tr: '', trAlts: [], trCtx: '', phonetic: '', audio: '', meanings: [],
      examples: [ex], level: 0, reps: 0, lapses: 0, createdAt: Date.now(), due: Date.now(), lastReview: 0
    };
    words.unshift(w);
    toast(`"${w.display}" yakalandı! Tekrar listene eklendi.`);
  }
  const f = normWord(info.surface);
  if (!w.forms.includes(f)) w.forms.push(f);
  fillWord(w, info);
  saveWords();
  return w;
}
function fillWord(w, info) {
  if (info.dict) {
    w.display = info.dict.word; w.phonetic ||= info.dict.phonetic; w.audio ||= info.dict.audio;
    if (!w.meanings?.length) w.meanings = info.dict.meanings;
  }
  if (info.tr) { w.tr ||= info.tr.main; if (!w.trAlts?.length) w.trAlts = info.tr.alts; }
  if (info.tr && info.ctxIdx >= 0) w.trCtx ||= info.tr.alts[info.ctxIdx];
  const ex = w.examples.find(e => e.sentence === info.sentence);
  if (ex && info.sentenceTr) ex.sentenceTr ||= info.sentenceTr;
}
function patchCaught(info) {
  const w = caughtFor(info);
  if (!w) return;
  info.ctxIdx = pickInContext(info.tr?.alts, info.sentenceTr);
  fillWord(w, info);
  saveWords();
}
const libraryEntry = key => library.find(e => e.key === key);

/* Cümleyi videodan (ya da yoksa sesli okuyarak) yeniden çal */
function replaySource(src, sentence) {
  const c = cards[activeIdx], m = mounted.get(activeIdx);
  if (src && c && m && c.entry.key === src.key && currentView === 'feed') {
    m.player.currentTime = Math.max(c.seg.start, src.start - .15);
    m.lastCue = null;
    if (!hasMedia(c.entry)) resetNarration(m);
    playActive();
    const stopAt = src.end + .1;
    const stop = () => {
      if (m.player.currentTime >= stopAt || m.player.paused) { m.player.pause(); return; }
      requestAnimationFrame(stop);
    };
    requestAnimationFrame(stop);
    return;
  }
  const entry = src && libraryEntry(src.key);
  if (hasMedia(entry)) return playClipInReview(entry, src);
  speak(sentence.replace(/\n/g, ' '));
}

/* ---------------- tekrar ---------------- */
let rq = [], rCur = null, revealed = false;
function startReview() {
  rq = dueWords().map(w => w.id);
  nextReview();
}
function nextReview() {
  rCur = null;
  while (rq.length && !rCur) { const id = rq.shift(); rCur = words.find(w => w.id === id) || null; }
  revealed = false;
  stopReviewVideo();
  renderReview();
}
function renderReview() {
  const box = $('#review');
  if (!words.length) {
    box.innerHTML = `<div class="empty-state">${coinSVG({ level: 0, word: '?' }, 80)}
      <div class="big">Henüz kelime yakalamadın</div>
      <p class="muted">Akış'ta altyazıdaki bir kelimeye dokun ve "Yakala"ya bas.</p>
      <button class="primary btn" data-view-go="feed">Akış'a git</button></div>`;
    return;
  }
  if (!rCur) {
    const upcoming = words.map(w => w.due).filter(d => d > Date.now()).sort((a, b) => a - b)[0];
    box.innerHTML = `<div class="empty-state">${coinSVG({ level: 5, word: '★' }, 80)}
      <div class="big">Şimdilik tekrar edecek kelime yok</div>
      <p class="muted">${upcoming ? `Sıradaki tekrar ${fmtRel(upcoming - Date.now())} sonra.` : ''} Hazinende ${words.length} kelime var.</p>
      <div class="btns" style="justify-content:center"><button class="btn" data-view-go="treasure">Hazineye bak</button><button class="primary btn" data-view-go="feed">Kelime avla</button></div></div>`;
    return;
  }
  const w = rCur;
  const ex = w.examples[0] || { sentence: '', surface: w.display, source: null };
  const entry = ex.source && libraryEntry(ex.source.key);
  const meaning = w.trCtx || w.tr;
  const alts = (w.trAlts || []).filter(a => a !== meaning).slice(0, 3);
  const def = w.meanings?.[0]?.defs?.[0];
  box.innerHTML = `
    <div class="rv-top"><span>Kalan: ${rq.length + 1}</span><span>${TIER_NAME[tierOf(w.level)]} · ${w.reps} tekrar</span></div>
    <div class="rv-card">
      ${coinSVG(w, 64)}
      <h2>${esc(w.display)}</h2>
      <div class="phon">${esc(w.phonetic || '')}</div>
      <p class="sent">${highlight(ex.sentence, ex.surface)}</p>
      <div class="src">${ex.source ? esc(ex.source.title) + (ex.source.start != null ? ' · ' + fmtTime(ex.source.start) : '') : ''}</div>
      <div class="rv-tools">
        <button class="btn" data-act="rv-say">${icon('vol', 16)} Kelimeyi dinle</button>
        <button class="btn" data-act="rv-clip">${icon(hasMedia(entry) ? 'play' : 'vol', 16)} ${hasMedia(entry) ? 'Sahneyi oynat' : 'Cümleyi dinle'}</button>
      </div>
      ${revealed ? `<div class="rv-back">
        <div class="chips" style="justify-content:center"><span class="chip ctx">${esc(meaning || '—')}</span>${alts.map(a => `<span class="chip">${esc(a)}</span>`).join('')}</div>
        ${ex.sentenceTr ? `<p class="sent-tr">${esc(ex.sentenceTr)}</p>` : ''}
        ${def ? `<p class="muted" style="margin:10px 0 0"><span class="pos">${esc(POS_TR[w.meanings[0].pos] || w.meanings[0].pos)}</span>${esc(def.d)}</p>` : ''}
      </div>` : ''}
    </div>
    <div class="rv-actions">
      ${revealed
        ? `<button class="forgot" data-act="rv-grade" data-ok="0">Unuttum<small>10 dk sonra yine gelir</small></button>
           <button class="remember" data-act="rv-grade" data-ok="1">Hatırladım<small>${fmtRel(nextInterval(w))} sonra</small></button>`
        : `<button class="primary" data-act="rv-reveal">Anlamını göster</button>`}
    </div>`;
}
function gradeCurrent(ok) {
  if (!rCur) return;
  const before = tierOf(rCur.level);
  grade(rCur, ok);
  const after = tierOf(rCur.level);
  if (ok && before !== after) toast(`"${rCur.display}" artık ${TIER_NAME[after].toLocaleLowerCase('tr')}! ✨`);
  if (!ok && rq.length) rq.push(rCur.id);
  nextReview();
}
let rvStop = null, rvYT = null;
function playClipInReview(entry, src) {
  const v = $('#rvVideo');
  stopReviewVideo();
  if (entry.yt) {
    // Hazine ayrıntısından çağrıldıysa kartın içinde, değilse tekrar kartının üstünde göster
    const host = currentView === 'review' ? $('#review .rv-card') : $('#sheetBody .wd-video');
    if (!host) return;
    const box = document.createElement('div');
    box.className = 'rv-yt';
    host.prepend(box);
    const start = Math.max(0, src.start - .2), end = src.end + .2;
    const p = new YTPlayer(box, entry.yt, start);
    p.addEventListener('error', e => { box.innerHTML = `<div class="err-msg">${esc(e.message)}</div>`; });
    p.play();
    rvYT = { p, box, iv: setInterval(() => { if (p.readyState >= 4 && !p.paused && p.currentTime >= end) p.pause(); }, 100) };
    return;
  }
  v.hidden = false;
  v.src = urlFor(entry);
  v.currentTime = Math.max(0, src.start - .2);
  v.muted = false;
  const end = src.end + .2;
  rvStop = () => { if (v.currentTime >= end) { v.pause(); } };
  v.addEventListener('timeupdate', rvStop);
  v.play().catch(() => { });
  if (currentView !== 'review') {
    // Hazine ayrıntısından çağrıldıysa videoyu kartın içinde göster
    const slot = $('#sheetBody .wd-video');
    if (slot) slot.appendChild(v);
  } else {
    const card = $('#review .rv-card');
    if (card) card.prepend(v);
  }
}
function stopReviewVideo() {
  if (rvYT) { clearInterval(rvYT.iv); rvYT.p.destroy(); rvYT.box.remove(); rvYT = null; }
  const v = $('#rvVideo');
  if (!v) return;
  v.pause();
  if (rvStop) v.removeEventListener('timeupdate', rvStop);
  rvStop = null;
  v.hidden = true;
  v.removeAttribute('src');
  $('#reviewView').appendChild(v);
}

/* ---------------- hazine ---------------- */
let tFilter = '', tSort = 'new';
function renderTreasure() {
  const box = $('#treasure');
  const cnt = { ore: 0, gold: 0, gem: 0 };
  for (const w of words) cnt[tierOf(w.level)]++;
  const due = dueWords().length;
  let list = words.filter(w => !tFilter || w.display.toLowerCase().includes(tFilter) ||
    (w.trCtx || w.tr || '').toLocaleLowerCase('tr').includes(tFilter));
  const sorters = {
    new: (a, b) => b.createdAt - a.createdAt,
    level: (a, b) => b.level - a.level || b.createdAt - a.createdAt,
    az: (a, b) => a.display.localeCompare(b.display),
    due: (a, b) => a.due - b.due
  };
  list = list.slice().sort(sorters[tSort]);
  const now = Date.now();
  const head = `
    <h1>Hazinen</h1>
    <div class="tiers">
      <div class="tier">${coinSVG({ level: 0, word: 'a' }, 40)}<div><b>${cnt.ore}</b><span>Ham maden</span></div></div>
      <div class="tier">${coinSVG({ level: 2, word: 'A' }, 40)}<div><b>${cnt.gold}</b><span>Altın</span></div></div>
      <div class="tier">${coinSVG({ level: 5, word: 'A' }, 40)}<div><b>${cnt.gem}</b><span>Mücevher</span></div></div>
    </div>
    <p class="muted">${words.length} kelime · bugün tekrar bekleyen: <b>${due}</b>. Tekrar ettikçe kelimeler ham madenden altına, altından mücevhere dönüşür.</p>`;
  if (!words.length) {
    box.innerHTML = head + `<div class="empty-state"><div class="big">Sandığın boş</div><p class="muted">Akış'ta kelimelere dokunup yakaladıkça burası dolacak.</p></div>`;
    return;
  }
  box.innerHTML = head + `
    <div class="tbar">
      <input type="search" id="tSearch" placeholder="Kelime ya da anlam ara…" value="${esc(tFilter)}">
      <select id="tSort">
        <option value="new">En yeni</option><option value="level">En parlak</option>
        <option value="az">A → Z</option><option value="due">Tekrar sırası</option>
      </select>
    </div>
    <div class="chest">${list.map(w => `
      <button class="coin ${w.due <= now ? 'due' : ''}" data-act="word-detail" data-id="${w.id}" title="${esc(w.trCtx || w.tr)}">
        ${coinSVG(w, 52)}<span>${esc(w.display)}</span><small>${esc((w.trCtx || w.tr || '').slice(0, 18))}</small>
      </button>`).join('')}
    </div>`;
  $('#tSort').value = tSort;
  $('#tSearch').addEventListener('input', e => {
    tFilter = e.target.value.trim().toLocaleLowerCase('tr');
    const pos = e.target.selectionStart;
    renderTreasure();
    const s = $('#tSearch'); s.focus(); s.setSelectionRange(pos, pos);
  });
  $('#tSort').addEventListener('change', e => { tSort = e.target.value; renderTreasure(); });
}
function openWordDetail(id) {
  const w = words.find(x => x.id === id);
  if (!w) return;
  const meaning = w.trCtx || w.tr;
  const html = `
    <div class="wd-head">${coinSVG(w, 72)}
      <div><h2 class="lk-word">${esc(w.display)}</h2>
      <div class="lk-sub">${esc(w.phonetic || '')} · ${TIER_NAME[tierOf(w.level)]} · ${w.reps} tekrar${w.lapses ? `, ${w.lapses} unutma` : ''}</div>
      <div class="lk-sub">Sonraki tekrar: ${fmtRel(w.due - Date.now())}</div></div>
    </div>
    <div class="label">${esc(LANGS[settings.lang] || settings.lang)}</div>
    <div class="chips">${[meaning, ...(w.trAlts || []).filter(a => a !== meaning)].filter(Boolean).map((a, i) =>
      `<span class="chip ${i === 0 ? 'ctx' : ''}">${esc(a)}</span>`).join('') || '<span class="muted">—</span>'}</div>
    <div class="label">Karşına çıktığı cümleler</div>
    <div class="wd-video"></div>
    ${w.examples.map((ex, i) => `<div class="wd-ex">
      <p class="sent">${highlight(ex.sentence, ex.surface)}</p>
      ${ex.sentenceTr ? `<p class="sent-tr">${esc(ex.sentenceTr)}</p>` : ''}
      <div class="src"><span>${esc(ex.source?.title || '')}${ex.source?.start != null ? ' · ' + fmtTime(ex.source.start) : ''}</span>
        <button class="link" data-act="wd-play" data-i="${i}">${icon(ex.source && hasMedia(libraryEntry(ex.source.key)) ? 'play' : 'vol', 16)} Dinle</button></div>
    </div>`).join('')}
    ${w.meanings?.length ? `<div class="label">İngilizce sözlük</div><ul class="defs">${w.meanings.map(g => g.defs.slice(0, 2).map((x, j) =>
      `<li>${j === 0 ? `<span class="pos">${esc(POS_TR[g.pos] || g.pos)}</span>` : ''}${esc(x.d)}${x.ex ? `<span class="ex">“${esc(x.ex)}”</span>` : ''}</li>`).join('')).join('')}</ul>` : ''}
    <div class="lk-actions">
      <button class="round" data-act="wd-say" title="Dinle">${icon('vol')}</button>
      <button class="btn" data-act="wd-now">Şimdi tekrar et</button>
      <button class="btn danger" data-act="wd-del">Hazineden çıkar</button>
    </div>`;
  openSheet(html, {
    onClose: () => stopReviewVideo(),
    actions: {
      'wd-say': () => sayWord(w.display, w.audio),
      'wd-play': el => {
        const ex = w.examples[+el.dataset.i];
        const entry = ex.source && libraryEntry(ex.source.key);
        if (hasMedia(entry)) playClipInReview(entry, ex.source); else speak(ex.sentence.replace(/\n/g, ' '));
      },
      'wd-now': () => { w.due = Date.now(); saveWords(); closeSheet(); switchView('review'); },
      'wd-del': () => {
        if (!confirm(`"${w.display}" hazineden çıkarılsın mı?`)) return;
        words = words.filter(x => x !== w); saveWords(); closeSheet(); renderTreasure();
      },
      word: el => openLookup({ surface: el.dataset.w, sentence: el.closest('.sent')?.textContent || '', source: null, fromFeed: false })
    }
  });
}

/* ---------------- görünümler ---------------- */
let currentView = 'feed';
function switchView(v) {
  if (v !== 'feed') { const m = mounted.get(activeIdx); if (m) m.player.pause(); }
  if (v !== 'review') stopReviewVideo();
  closeSheet();
  currentView = v;
  $$('nav.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === v + 'View'));
  if (v === 'review') startReview();
  if (v === 'treasure') renderTreasure();
  if (v === 'feed') { const m = mounted.get(activeIdx); if (m) m.shownKey = null; }
}
function updateBadges() {
  const d = dueWords().length;
  const db = $('#dueBadge'), wb = $('#wordBadge');
  db.hidden = !d; db.textContent = d;
  wb.hidden = !words.length; wb.textContent = words.length;
}
function applyTheme() {
  if (settings.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = settings.theme;
}

/* ---------------- olaylar ---------------- */
const actions = {
  'pick-dir': pickDirectory,
  'pick-files': () => { $('#pickFiles').dataset.append = ''; $('#pickFiles').click(); },
  'add-files': () => { $('#pickFiles').dataset.append = '1'; $('#pickFiles').click(); },
  'reopen-dir': reopenLastDir,
  'demo': loadDemo,
  'server-videos': loadServerVideos,
  'yt-add': () => openYouTubeAdd(),
  'yt-file': pickYouTubeSubFile,
  'yt-save': saveYouTubeDraft,
  'yt-del': async el => {
    const v = loadYTStore().find(x => x.id === el.dataset.id);
    if (!v || !confirm(`"${v.title}" listeden silinsin mi? Yakaladığın kelimeler hazinende kalır.`)) return;
    deleteYouTube(v.id);
    if (sheetOpen) actions['open-lib']();
  },
  'open-lib': async () => {
    const m = mounted.get(activeIdx); if (m) m.player.pause();
    openSheet(await libPanelHTML(true));
    bindDrop($('#sheetBody #drop'));
  },
  'close-sheet': closeSheet,
  'toggle': togglePlay,
  'replay': () => seekCue(0),
  'prev-cue': () => seekCue(-1),
  'next-cue': () => seekCue(1),
  'tr-line': translateLine,
  'rate': cycleRate,
  'mute': toggleMute,
  'rv-reveal': () => { revealed = true; renderReview(); },
  'rv-grade': el => gradeCurrent(el.dataset.ok === '1'),
  'rv-say': () => rCur && sayWord(rCur.display, rCur.audio),
  'rv-clip': () => {
    const ex = rCur?.examples[0];
    if (!ex) return;
    const entry = ex.source && libraryEntry(ex.source.key);
    if (hasMedia(entry)) playClipInReview(entry, ex.source); else speak(ex.sentence.replace(/\n/g, ' '));
  },
  'word-detail': el => openWordDetail(el.dataset.id),
  'export': () => {
    const blob = new Blob([JSON.stringify({ app: 'kelime-avcisi', version: 1, exportedAt: new Date().toISOString(), words }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kelime-avcisi-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  'import': () => $('#pickImport').click(),
  'install': async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    $('#installBtn').hidden = true;
  },
  'clear-cache': () => { cache.dict = {}; cache.tr = {}; store.set('ka.cache', cache); toast('Sözlük önbelleği temizlendi.'); },
  'wipe': () => {
    if (!words.length) return toast('Hazine zaten boş.');
    if (!confirm(`${words.length} kelimenin tamamı silinsin mi? Bu geri alınamaz (önce dışa aktarmak isteyebilirsin).`)) return;
    words = []; saveWords(); toast('Tüm kelimeler silindi.');
  }
};

document.addEventListener('click', e => {
  const go = e.target.closest('[data-view-go]');
  if (go) return switchView(go.dataset.viewGo);
  const tab = e.target.closest('nav.tabs [data-view]');
  if (tab) return switchView(tab.dataset.view);

  const inSheet = e.target.closest('#sheet');
  const wordEl = e.target.closest('.w');
  if (wordEl && inSheet && sheetActions.word) return sheetActions.word(wordEl);
  if (wordEl && e.target.closest('.clip')) {
    e.stopPropagation();
    const cueEl = wordEl.closest('.cue');
    const c = cards[activeIdx];
    if (!c || !cueEl) return;
    const q = c.seg.cues[+cueEl.dataset.ci];
    return openLookup({
      surface: wordEl.dataset.w, sentence: q.text.replace(/\n/g, ' '), fromFeed: true,
      source: { key: c.entry.key, title: c.entry.title, start: q.start, end: q.end }
    });
  }
  if (wordEl && e.target.closest('#review')) {
    return openLookup({ surface: wordEl.dataset.w, sentence: wordEl.closest('.sent').textContent, source: rCur?.examples[0]?.source || null, fromFeed: false });
  }

  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  if (inSheet && sheetActions[act]) return sheetActions[act](a, e);
  if (actions[act]) actions[act](a, e);
});
$('#backdrop').addEventListener('click', closeSheet);

$('#pickFiles').addEventListener('change', e => {
  const items = fileListToItems(e.target.files);
  const append = e.target.dataset.append === '1';
  e.target.value = '';
  if (items.length) loadFiles(items, { append });
});
$('#pickDir').addEventListener('change', e => {
  const items = fileListToItems(e.target.files);
  e.target.value = '';
  if (items.length) loadFiles(items);
});
$('#pickImport').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const incoming = Array.isArray(data) ? data : data.words;
    if (!Array.isArray(incoming)) throw new Error('Geçersiz dosya');
    let added = 0;
    for (const w of incoming) {
      if (!w || !w.word || words.some(x => x.word === w.word)) continue;
      words.push({ id: uid(), forms: [], examples: [], level: 0, reps: 0, lapses: 0, due: Date.now(), createdAt: Date.now(), ...w });
      added++;
    }
    saveWords();
    toast(`${added} kelime içe aktarıldı.`);
  } catch (err) { toast('İçe aktarılamadı: ' + err.message); }
});

function bindDrop(el) {
  if (!el) return;
  el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
}
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', async e => {
  e.preventDefault();
  $$('.drop.over').forEach(d => d.classList.remove('over'));
  const dt = e.dataTransfer;
  // Klasör sürüklendiyse (Chrome/Edge) içini oku; tutamaçları olay bitmeden almak gerekiyor
  const handles = [...dt.items].filter(i => i.kind === 'file').map(i => i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null);
  const plain = fileListToItems(dt.files);
  const items = [];
  let usedHandles = false;
  for (const hp of handles) {
    const h = hp && await hp.catch(() => null);
    if (h?.kind === 'directory') { usedHandles = true; items.push(...await filesFromHandle(h, h.name + '/')); }
    else if (h?.kind === 'file') { usedHandles = true; const f = await h.getFile(); items.push({ file: f, path: f.name }); }
  }
  const list = usedHandles ? items : plain;
  if (list.length) loadFiles(list, { append: library.length > 0 && !isDemo(library[0]) && sheetOpen });
});

document.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape' && sheetOpen) return closeSheet();
  if (currentView === 'review' && !sheetOpen) {
    if (e.key === ' ' && !revealed && rCur) { e.preventDefault(); revealed = true; renderReview(); }
    else if (revealed && (e.key === '1' || e.key === '2')) gradeCurrent(e.key === '2');
    return;
  }
  if (currentView !== 'feed' || sheetOpen || !cards.length) return;
  const map = {
    ' ': togglePlay, k: togglePlay,
    ArrowDown: () => goTo(activeIdx + 1), PageDown: () => goTo(activeIdx + 1), j: () => goTo(activeIdx + 1),
    ArrowUp: () => goTo(activeIdx - 1), PageUp: () => goTo(activeIdx - 1),
    ArrowLeft: () => seekCue(-1), ArrowRight: () => seekCue(1),
    r: () => seekCue(0), t: translateLine, m: toggleMute
  };
  const f = map[e.key] || map[e.key.toLowerCase?.()];
  if (f) { e.preventDefault(); f(); }
});

/* ---------------- ayar bağlama ---------------- */
$('#langSelect').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
$$('[data-setting]').forEach(inp => {
  const k = inp.dataset.setting;
  if (inp.type === 'checkbox') inp.checked = !!settings[k]; else inp.value = settings[k];
  inp.addEventListener('change', () => {
    let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'number' ? +inp.value : inp.value.trim();
    if (k === 'clipLen') { v = Math.min(300, Math.max(15, v || 60)); inp.value = v; }
    settings[k] = v;
    saveSettings();
    if (k === 'theme') applyTheme();
    if ((k === 'split' || k === 'clipLen' || k === 'shuffle') && library.length) buildFeed();
  });
});

/* ---------------- PWA: çevrimdışı açılma ve ana ekrana yükleme ---------------- */
let installPrompt = null;
function showInstall(hint, withButton) {
  $('#installGroup').hidden = false;
  $('#installHint').textContent = hint;
  $('#installBtn').hidden = !withButton;
}
if ('serviceWorker' in navigator && window.isSecureContext && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker kaydedilemedi', e));
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  installPrompt = e;
  showInstall('Kelime Avcısı\'nı ana ekrana ekle; kendi ikonuyla, tam ekran açılır.', true);
});
window.addEventListener('appinstalled', () => {
  installPrompt = null;
  showInstall('Uygulama yüklendi. Ana ekrandaki ikondan açabilirsin.', false);
});
if (!(matchMedia('(display-mode: standalone)').matches || navigator.standalone) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
  showInstall('Ana ekrana eklemek için Safari\'de Paylaş düğmesine, sonra "Ana Ekrana Ekle"ye dokun.', false);
}

/* ---------------- başlat ---------------- */
applyTheme();
// Android, .srt uzantısını bir türe eşleyemeyince altyazı dosyalarını seçilemez gösteriyor
if (isTouch) $('#pickFiles').removeAttribute('accept');
updateBadges();
library = loadYTStore().map(ytEntry);
buildFeed();
requestAnimationFrame(tick);
setInterval(updateBadges, MIN);
if ('speechSynthesis' in window) speechSynthesis.getVoices();
{
  const shared = takeSharedLink();
  const id = shared && parseYouTubeId(shared);
  const i = id ? cards.findIndex(c => c.entry.key === 'yt:' + id) : -1;
  if (i >= 0) { goTo(i); toast('Bu video zaten ekli; kaldığın yerden izleyebilirsin.'); }
  else if (shared) openYouTubeAdd(shared);
}
