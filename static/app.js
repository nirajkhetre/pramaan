// Pramaan front end: a hearing in four acts. Summon, testimony, the record, the verdict.
const ENG = {
  google_ai_mode: { n: 1, name: 'Google AI Mode', shape: 'circle', color: 'var(--w1)' },
  google_ai_overview: { n: 2, name: 'Google AI Overview', shape: 'square', color: 'var(--w2)' },
  bing_copilot: { n: 3, name: 'Bing Copilot', shape: 'diamond', color: 'var(--w3)' },
  brave_ai_mode: { n: 4, name: 'Brave AI Mode', shape: 'triangle', color: 'var(--w4)' },
};
const ORDER = Object.keys(ENG);
const BY_NAME = Object.fromEntries(ORDER.map((k) => [ENG[k].name, k]));
const VERDICT = {
  split: { stamp: 'CONTESTED', tone: 'red', gloss: 'The witnesses give different figures.' },
  consensus_conflict: { stamp: 'CHECK DATE', tone: 'amber', gloss: 'Witnesses agree, the top official page does not. Dates decide which is stale.' },
  consensus_official: { stamp: 'ON RECORD', tone: 'green', gloss: 'Witnesses agree and an official page states the same figure.' },
  consensus: { stamp: 'UNVERIFIED', tone: 'ink', gloss: 'Witnesses agree, but no official page in the results states a figure.' },
  insufficient: { stamp: 'NO QUORUM', tone: 'muted', gloss: 'Fewer than two witnesses gave a number.' },
};
const MATCH = {
  matches_official: ['On record', 'green', 'official'], differs: ['Not on record', 'red', 'warning'],
  unchecked: ['No record to check', 'muted', 'other'], no_number: ['No figure given', 'muted', 'other'], no_answer: ['Did not answer', 'muted', 'other'],
};
const KIND = {
  official: ['Official', 'official'], news: ['News', 'news'], commercial: ['Company selling it', 'commercial'],
  forum: ['Forum / social', 'forum'], reference: ['Reference', 'reference'], hijacked: ['Hijacked page', 'hijacked'], other: ['Other', 'other'],
};
const KINDS = Object.keys(KIND);
const TOPIC_ICON = { Health: 'health', Savings: 'savings', Tax: 'tax', Law: 'law', Schemes: 'schemes', Prices: 'prices', Money: 'money', Work: 'work' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const kindIcon = (k) => `<svg class="kind-ico" style="color:var(--k-${k})" aria-label="${KIND[k][0]}"><use href="#i-${KIND[k][1]}"/></svg>`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

function glyph(eid, size = 16) {
  const e = ENG[eid], c = e.color;
  const shapes = {
    circle: `<circle cx="8" cy="8" r="6.4"/>`, square: `<rect x="2" y="2" width="12" height="12" rx="2.4"/>`,
    diamond: `<path d="M8 .9 15.1 8 8 15.1.9 8Z"/>`, triangle: `<path d="M8 1.2 15.2 14.4H.8Z"/>`,
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="flex:none"><g fill="${c}" stroke="var(--sheet)" stroke-width="1.2">${shapes[e.shape]}</g></svg>`;
}

function fmt(v, u) {
  if (v === null || v === undefined) return '—';
  if (u === '₹') {
    if (v >= 1e7 && v % 1e5 === 0) return `₹${+(v / 1e7).toFixed(2)} crore`;
    if (v >= 1e5 && v % 1e3 === 0 && v % 1e5 === 0) return `₹${+(v / 1e5).toFixed(2)} lakh`;
    return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  return u === '%' ? `${+v.toFixed(3)}%` : `${+(+v).toFixed(3)} ${u || ''}`.trim();
}
function claimLabel(c) {
  if (!c) return '—';
  if (c.range_with === undefined || c.range_with === null) return fmt(c.value, c.unit);
  const lo = Math.min(c.value, c.range_with), hi = Math.max(c.value, c.range_with);
  return c.unit === '₹' ? `${fmt(lo, '₹')}–${fmt(hi, '₹')}` : `${+lo}–${fmt(hi, c.unit)}`;
}
function highlight(sentence, text) {
  const s = esc(sentence), t = esc(text);
  return t && s.includes(t) ? s.replace(t, `<mark class="hl">${t}</mark>`) : s;
}
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return isNaN(d) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function prettyDate(iso, text) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (/^\D*\d{4}\D*$/.test(text || '')) return String(y);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- motion helpers ----------
function countUp(el) {
  const v = parseFloat(el.dataset.v), u = el.dataset.u;
  if (isNaN(v) || el.dataset.range || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const final = el.textContent, dec = (String(v).split('.')[1] || '').length, t0 = performance.now(), dur = 950;
  const step = (t) => {
    const p = Math.min(1, (t - t0) / dur), now = v * (1 - Math.pow(1 - p, 3));
    if (p >= 1) { el.textContent = final; return; }
    el.textContent = u === '₹' ? '₹' + Math.round(now).toLocaleString('en-IN') : u ? fmt(+now.toFixed(dec), u) : String(Math.round(now));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function inkIn(root, delay = 900) {
  $$('mark.hl', root).forEach((m, i) => setTimeout(() => m.classList.add('on'), delay + i * 140));
  $$('[data-v]', root).forEach(countUp);
}
function swap(fn) {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
  // A transition is skipped (not an error) when the tab is in the background.
  const t = document.startViewTransition(fn);
  t.ready.catch(() => {}); t.finished.catch(() => {});
}

// ---------- boot ----------
let STATUS = null;
async function init() {
  $('#today').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  STATUS = await fetch('/api/status').then((r) => r.json());
  $('#status').innerHTML =
    (STATUS.live ? `<span class="pill"><span class="led"></span>Live via SerpApi</span>` : `<span class="pill replay"><span class="led"></span>Replay · recorded answers</span>`) +
    `<span class="pill">${icon('stamp')}${STATUS.llm ? 'Gemini proposes · code verifies' : 'Rules engine · no AI at runtime'}</span>`;
  $('#cases').innerHTML = STATUS.questions.filter((x) => x.featured).map((x, i) =>
    `<button type="button" class="case" style="--i:${i}" data-q="${esc(x.q)}">${icon(TOPIC_ICON[x.topic] || 'other')}${esc(x.q)}</button>`).join('');
  $$('.case').forEach((b) => b.onclick = () => ask(b.dataset.q));
  $('#glossary').innerHTML = Object.values(VERDICT).map((v) => `<div class="gloss">${stampSvg(v.stamp, v.tone, 12)}<p>${esc(v.gloss)}</p></div>`).join('');
  renderLedger(STATUS.audit);
  setCaseNo(+store.get('pramaan-case') || 1);
  const q = new URLSearchParams(location.search).get('q');
  if (q) ask(q); else renderIntro();
}
function setCaseNo(n) { $('#docketNo').textContent = `Case No. ${String(n).padStart(3, '0')}`; }

$$('.ftab').forEach((t) => t.onclick = () => showTab(t.dataset.tab));
function showTab(name) {
  swap(() => {
    $$('.ftab').forEach((x) => { x.classList.toggle('active', x.dataset.tab === name); x.setAttribute('aria-selected', x.dataset.tab === name); });
    $$('.pane').forEach((p) => p.hidden = p.id !== `tab-${name}`);
  });
}
$('#docket').onsubmit = (e) => { e.preventDefault(); ask($('#q').value.trim()); };

function renderIntro() {
  const a = STATUS.audit;
  const s = a?.summary;
  const teaser = (i, n, text, q, tab) => `<div class="sheet teaser rise" style="--i:${i}" ${q ? `data-q="${esc(q)}"` : ''} ${tab ? `data-tab="${tab}"` : ''}>
      <div class="kicker">From the audit</div><div class="big-n">${n}</div><p>${text}</p>
      <span class="open">${q ? 'Open this hearing' : 'Open the ledger'} ${icon('arrow')}</span></div>`;
  $('#out').innerHTML = `<div class="intro">
    <div class="sheet lead-card rise" style="--i:0"><div class="kicker">How to use</div>
      <h2>Put any number on trial.</h2>
      <p>Ask something whose answer is a number: a rate, a limit, a fine, a price. Four AI search engines testify, the official web is the record, and Pramaan stamps what the evidence shows.</p></div>
    ${teaser(1, '2×', 'Google AI Overview cited a <b>hijacked university page</b> as a source for Indian blood-sugar limits.', 'What is the normal blood sugar level 2 hours after a meal in India?')}
    ${teaser(2, s ? `${s.citation_pct.official}%` : '6%', `Of ${s ? Object.values(s.citation_kinds).reduce((x, y) => x + y, 0) : 462} citations across four engines, this many were <b>official sources</b>.`, null, 'ledger')}
    ${teaser(3, '3 prices', 'Same gold, same day: the engines gave <b>three different figures</b> for 10 grams.', 'What is the price of 24 carat gold per 10 grams in India today?')}
  </div>`;
  $$('.teaser').forEach((t) => t.onclick = () => t.dataset.q ? ask(t.dataset.q) : showTab(t.dataset.tab));
}

// ---------- a hearing ----------
let source = null, ticker = null;
function ask(q) {
  if (!q || q.length < 5) return;
  $('#q').value = q;
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  const n = (+store.get('pramaan-case') || 1) + 1; store.set('pramaan-case', n); setCaseNo(n);
  if ($('#tab-hearing').hidden) showTab('hearing');
  source?.close(); clearInterval(ticker);
  $('.summon').disabled = true;
  $('#out').innerHTML = proceedingsHtml();
  $('.proceed').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const t0 = performance.now();
  ticker = setInterval(() => {
    const s = Math.floor((performance.now() - t0) / 1000);
    const el = $('.timer b'); if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }, 250);

  // Events can arrive all at once from recordings; reveal them at a readable pace.
  const queue = []; let busy = false, done = 0;
  const pump = () => {
    if (busy || !queue.length) return;
    busy = true;
    const ev = queue.shift();
    if (ev.type === 'report' || ev.type === 'error') {
      setTimeout(() => { finish(); ev.type === 'report' ? renderReport(ev.report) : renderError(ev.detail); busy = false; }, 650);
      return;
    }
    done += 1;
    $('.progress i').style.width = `${(done / 5) * 100}%`;
    fillSlot(ev);
    setTimeout(() => { busy = false; pump(); }, 280);
  };
  source = new EventSource('/api/check/stream?q=' + encodeURIComponent(q));
  source.onmessage = (m) => { const ev = JSON.parse(m.data); queue.push(ev); if (ev.type === 'report' || ev.type === 'error') source.close(); pump(); };
  source.onerror = () => { if (source.readyState === 2) return; source.close(); queue.push({ type: 'error', detail: 'Lost the connection to the Pramaan server. Is python app.py still running?' }); pump(); };
}
function finish() { clearInterval(ticker); $('.summon').disabled = false; }

function proceedingsHtml() {
  const slot = (id, name, g, label, color) => `<div class="slot" data-slot="${id}" style="--c:${color}"><div class="slot-inner">
      <div class="slot-face front"><div class="wn">${label}</div><div class="who">${g}${esc(name)}</div>
        <div class="wait">Taking the stand<b>.</b><b>.</b><b>.</b></div></div>
      <div class="slot-face back"><div class="wn">${label}</div><div class="who">${g}${esc(name)}</div><div class="fig"></div><div class="ok"></div></div>
    </div></div>`;
  return `<div class="sheet proceed rise">
    <div class="proceed-head">${icon('gavel')}<h3>In session</h3><span class="timer">${icon('clock')}<b>00:00</b></span><div class="progress"><i></i></div></div>
    <div class="bench">${ORDER.map((k) => slot(k, ENG[k].name, glyph(k, 18), `Witness ${ENG[k].n}`, ENG[k].color)).join('')}
      ${slot('record', 'Official web', icon('official'), 'The record', 'var(--seal)')}</div>
    <p class="meta">${icon('clock')}<span>Live hearings take 20–50 s. Each witness reports the moment its engine answers; recorded hearings replay instantly.</span></p>
  </div>`;
}
function fillSlot(ev) {
  const el = $(`.slot[data-slot="${ev.type === 'record' ? 'record' : ev.engine}"]`);
  if (!el) return;
  const fig = $('.back .fig', el), ok = $('.back .ok', el);
  if (ev.type === 'record') {
    fig.textContent = ev.official_pages; fig.insertAdjacentHTML('beforeend', '<span style="font:500 13px var(--sans);color:var(--muted)"> official pages</span>');
    ok.textContent = 'RECORD PULLED';
  } else if (ev.figure) {
    fig.textContent = ev.figure; ok.textContent = `TESTIFIED · ${ev.mode || ''}`.toUpperCase();
  } else {
    fig.textContent = ev.status === 'ok' ? 'No figure' : 'No answer'; fig.classList.add('none'); ok.textContent = '';
  }
  el.classList.add('done');
}
function renderError(msg) {
  $('#out').innerHTML = `<div class="sheet err rise">${icon('warning')}<span>${esc(msg)}</span></div>`;
}

// ---------- the report ----------
function renderReport(d) {
  $('#out').innerHTML = verdictHtml(d) + rulerHtml(d) + recordHtml(d) +
    `<div class="sec-title wit-head">${icon('quote')}<h3>Testimony</h3><span class="hint">What each engine said, in its own words, and who it cited</span></div>
     <div class="witnesses">${d.answers.map(slipHtml).join('')}</div>` + quoteBoardHtml(d.answers) + evidenceHtml(d.evidence);
  inkIn($('#out'));
  $$('.more').forEach((b) => b.onclick = () => { $$('.ev[hidden]').forEach((e) => e.hidden = false); b.remove(); });
}

function stampSvg(text, tone, fs = 22) {
  const w = Math.round(text.length * fs * 0.74 + fs * 1.9), h = Math.round(fs * 2.4);
  return `<svg class="stamp ${tone}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${text}">
    <g filter="url(#ink)"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${fs * .3}" fill="none" stroke="currentColor" stroke-width="${fs * .13}"/>
    <rect x="${fs * .32}" y="${fs * .32}" width="${w - fs * .64}" height="${h - fs * .64}" rx="${fs * .18}" fill="none" stroke="currentColor" stroke-width="${fs * .05}"/>
    <text x="${w / 2}" y="${h / 2 + fs * .05}" text-anchor="middle" dominant-baseline="central" font-family="IBM Plex Mono, monospace" font-weight="700"
      font-size="${fs}" letter-spacing="${fs * .12}" fill="currentColor">${text}</text></g></svg>`;
}

function verdictHtml(d) {
  const v = d.verdict, V = VERDICT[v.code];
  const sub = v.code === 'split' ? `${v.groups.length} different answers` : v.code === 'insufficient' ? 'not enough figures' : `${v.numbered} of 4 agree`;
  const positions = v.groups.map((g) => `<span class="position"><b>${esc(g.label)}</b>
      <span class="glyphs">${g.engines.map((n) => glyph(BY_NAME[n], 14)).join('')}</span><span class="kicker">${g.engines.length}/4</span></span>`).join('');
  const live = d.answers.some((a) => a.mode === 'live');
  return `<section class="sheet verdict shake" aria-label="Verdict">
    <div class="stamp-wrap">${stampSvg(V.stamp, V.tone)}<div class="stamp-sub">${esc(sub)}</div></div>
    <div>
      <div class="kicker">Verdict · ${esc(d.question)}</div>
      <h2>${esc(v.title)}</h2>
      ${v.note ? `<p class="note">${icon('calendar')}<span>${esc(v.note)}</span></p>` : ''}
      <div class="positions">${positions}</div>
      <div class="meta"><span>${icon('gavel')}${v.answered}/4 answered</span><span>${icon('ruler')}${v.numbered} gave a figure</span>
        <span>${icon('official')}${v.matches_official} on the official record</span>
        <span>${icon(live ? 'live' : 'replay')}${live ? 'live answers' : 'recorded answers'}</span><span>${icon('clock')}${d.seconds}s</span></div>
    </div></section>`;
}

function niceStep(x) { const p = 10 ** Math.floor(Math.log10(x)), f = x / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; }
function rulerHtml(d) {
  const pts = d.answers.filter((a) => a.claim).map((a) => ({ eid: a.engine, v: a.claim.value, lo: a.claim.range_with, name: ENG[a.engine].name, c: ENG[a.engine].color }));
  const off = d.official;
  if (off) pts.push({ official: true, v: off.value, lo: off.range_with, name: `Official page (${off.domain})`, c: 'var(--seal)' });
  const all = pts.flatMap((p) => [p.v, p.lo]).filter((x) => x !== undefined && x !== null);
  if (!all.length) return '';
  const unit = d.unit || d.answers.find((a) => a.claim)?.claim.unit || '';
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { const pad = Math.abs(min) * 0.25 || 1; min -= pad; max += pad; }
  const span = max - min; min -= span * 0.14; max += span * 0.14;
  if (Math.min(...all) >= 0) min = Math.max(0, min);
  const W = 1000, X0 = 46, X1 = 954, x = (v) => X0 + ((v - min) / (max - min)) * (X1 - X0);
  const major = niceStep((max - min) / 6), minor = major / 5;
  let ticks = '';
  for (let t = Math.ceil(min / minor) * minor; t <= max + 1e-9; t += minor) {
    const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
    ticks += `<line class="tick ${isMajor ? 'major' : ''}" x1="${x(t)}" x2="${x(t)}" y1="150" y2="${150 + (isMajor ? 15 : 8)}"/>`;
    if (isMajor) ticks += `<text class="tl" x="${x(t)}" y="182" text-anchor="middle">${esc(fmt(+t.toPrecision(6), unit))}</text>`;
  }
  pts.sort((a, b) => a.v - b.v);
  const rows = [];
  const pins = pts.map((p, i) => {
    const right = x(p.v) > W * 0.62;
    const text = `${p.name} · ${fmt(p.v, unit)}`, lw = 14 + 7.3 * text.length;
    const sp = right ? [x(p.v) - lw, x(p.v) + 12] : [x(p.v) - 12, x(p.v) + lw];
    let lvl = rows.findIndex((r) => r.every(([a, b]) => sp[1] < a || sp[0] > b));
    if (lvl < 0) { rows.push([]); lvl = rows.length - 1; }
    rows[lvl].push(sp);
    const y = 124 - lvl * 28, X = x(p.v);
    const band = p.lo !== undefined && p.lo !== null ? `<rect class="band" x="${Math.min(x(p.lo), X)}" y="150" width="${Math.abs(X - x(p.lo))}" height="40" fill="${p.c}"/>` : '';
    const head = p.official
      ? `<circle cx="${X}" cy="${y}" r="10" fill="var(--seal)"/><path d="M${X - 4.5} ${y} l3 3 6-6.5" fill="none" stroke="var(--sheet)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<g transform="translate(${X - 10} ${y - 10}) scale(1.25)">${glyph(p.eid, 16).replace(/<\/?svg[^>]*>/g, '')}</g>`;
    return `<g class="pin" style="--i:${i}">${band}
      <line class="needle ${p.official ? 'rec-line' : ''}" x1="${X}" x2="${X}" y1="${y + 10}" y2="${p.official ? 192 : 150}" stroke="${p.c}"/>
      ${head}<text class="lbl" x="${X + (right ? -16 : 16)}" y="${y + 4.5}" text-anchor="${right ? 'end' : 'start'}" ${p.official ? 'style="fill:var(--seal)"' : ''}>${esc(p.name)} · <tspan class="v">${esc(fmt(p.v, unit))}</tspan></text></g>`;
  }).join('');
  const top = Math.min(0, 124 - (rows.length - 1) * 28 - 22);
  return `<section class="sheet ruler-sheet rise" style="--i:1">
    <div class="sec-title">${icon('ruler')}<h3>The measuring scale</h3><span class="hint">Every figure on one scale. Gaps you can see are disagreements.</span></div>
    <div class="ruler"><svg viewBox="0 ${top} ${W} ${200 - top}" role="img" aria-label="Figures from each engine on one scale">
      <rect class="body" x="22" y="150" width="${W - 44}" height="42" rx="5"/>${ticks}${pins}</svg></div></section>`;
}

function recordHtml(d) {
  const o = d.official, conflict = d.verdict.code === 'consensus_conflict';
  const hijacked = [...new Map([...d.evidence.filter((e) => e.kind === 'hijacked').map((e) => [e.link, { ...e, by: [] }])]).values()];
  d.answers.forEach((a) => a.references.filter((r) => r.kind === 'hijacked').forEach((r) => {
    let h = hijacked.find((x) => x.link === r.link);
    if (!h) { h = { ...r, by: [] }; hijacked.push(h); }
    h.by.push(a.label);
  }));
  // Group hijacked pages by victim site and the spam host the injected include pulls from.
  const groups = {};
  hijacked.forEach((h) => {
    let raw = h.link || ''; try { raw = decodeURIComponent(decodeURIComponent(raw)); } catch { /* keep raw */ }
    const spam = (raw.match(/include\s+url=["']?(?:https?:)?\/+\\?\/?([^/"'?\s]+)/i) || [])[1] || 'an outside host';
    const key = `${h.domain}|${spam}`;
    (groups[key] ||= { domain: h.domain, spam, n: 0, by: new Set() }).n += 1;
    h.by.forEach((b) => groups[key].by.add(b));
  });
  const rows = Object.values(groups).sort((a, b) => b.by.size - a.by.size || b.n - a.n);
  const tamper = hijacked.length ? `<details class="tamper"><summary>${icon('hijacked')}Tampering detected: ${hijacked.length} hijacked page${hijacked.length > 1 ? 's' : ''} in this hearing${hijacked.some((h) => h.by.length) ? ', one cited as a source' : ''}${icon('chevron', 'i chev')}</summary>
      <ul>${rows.map((g) => `<li>${g.by.size ? `<b>Cited by ${esc([...g.by].join(', '))}</b> · ` : ''}<b>${esc(g.domain)}</b> serving content injected from <b>${esc(g.spam)}</b>${g.n > 1 ? ` · ${g.n} pages` : ''}</li>`).join('')}
      <li class="why">Spam planted on real institutional sites through a vulnerable panorama viewer (krpano). Pramaan never counts these pages as official.</li></ul></details>` : '';
  const body = o
    ? `<div class="rec-fig ${conflict ? 'warn' : ''}" ${o.range_with == null ? `data-v="${o.value}" data-u="${esc(o.unit)}"` : ''}>${esc(claimLabel(o))}</div>
       <div><p class="rec-quote">“${highlight(o.sentence, o.text)}”</p>
       <div class="src"><a class="chip" href="${esc(o.link)}" target="_blank" rel="noopener" title="${esc(o.title)}">${icon('official')}${esc(o.domain)}${icon('external')}</a>
         <span class="chip">${icon('calendar')}${o.date ? 'dated ' + esc(prettyDate(o.date, o.date_text)) : 'undated'}</span></div></div>`
    : `<div class="rec-fig none">—</div><div><p class="rec-quote">No official page in the results (gov.in, nic.in, RBI, WHO) states a figure for this. Treat every witness's figure as unverified.</p></div>`;
  return `<div class="record-wrap"><div class="clipping">
    <div class="clip-head">${icon('official')}<span class="title">The record</span><span class="scope">official pages only · gov.in · nic.in · RBI · WHO</span></div>
    <div class="clip-body">${body}</div>${tamper}</div></div>`;
}

function slipHtml(a, i) {
  const e = ENG[a.engine], c = a.claim, [mLabel, mTone, mIcon] = MATCH[a.match] || MATCH.no_answer;
  const total = a.references.length || 1;
  const prov = KINDS.map((k) => `<i style="width:${(a.citation_mix?.[k] || 0) / total * 100}%;background:var(--k-${k})"></i>`).join('');
  const counts = KINDS.filter((k) => a.citation_mix?.[k]).map((k) => `<span title="${KIND[k][0]}">${kindIcon(k)}${a.citation_mix[k]}</span>`).join('');
  const others = (a.values || []).filter((v) => !c || (v !== c.value && v !== c.range_with)).slice(0, 6).map((v) => `<span>${esc(fmt(v, c?.unit || ''))}</span>`).join('');
  const refs = a.references.slice(0, 14).map((r) => `<li class="${r.kind}">${kindIcon(r.kind)}<a href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.domain || r.title)}</a>
      ${r.kind === 'hijacked' ? '<span class="tag">HIJACKED</span>' : icon('external', 'i ext')}</li>`).join('');
  const figure = c
    ? `<div class="fig" ${c.range_with == null ? `data-v="${c.value}" data-u="${esc(c.unit)}"` : 'data-range="1"'}>${esc(claimLabel(c))}</div>`
    : `<div class="fig none">${esc(a.status === 'ok' ? 'Answered without a figure' : (a.error || 'Did not answer'))}</div>`;
  return `<article class="slip" style="--i:${i};--w:${e.color}">
    <div class="top">${glyph(a.engine, 22)}<div><div class="wnum">Witness ${e.n}</div><div class="ename">${esc(e.name)}</div>
      <span class="mode" title="${esc(a.fetched_at || '')}">${icon(a.mode === 'live' ? 'live' : 'replay')}${a.mode === 'live' ? 'live' : 'recorded'} ${esc(when(a.fetched_at))}</span></div></div>
    ${figure}
    <span class="mini-stamp ${mTone}" style="--i:${i}">${icon(mIcon)}${mLabel}</span>
    ${c ? `<blockquote class="testimony">“${highlight(c.sentence, c.text)}”</blockquote>` : ''}
    ${c?.date ? `<span class="datechip">${icon('calendar')}latest date it mentions: ${esc(prettyDate(c.date, c.date_text))}</span>` : ''}
    ${others ? `<div class="others">Also mentions ${others}</div>` : ''}
    <div class="prov" style="--i:${i}">${a.references.length ? prov : ''}</div>
    <div class="prov-counts">${counts || '<span class="kicker">no citations</span>'}</div>
    ${refs ? `<ul class="exhibits">${refs}</ul>` : ''}
    ${a.text ? `<details class="full"><summary>Full testimony ${icon('chevron')}</summary><div class="txt">${esc(a.text)}</div></details>` : ''}
  </article>`;
}

function quoteBoardHtml(answers) {
  const rows = answers.map((a, i) => {
    const total = a.references.length || 1;
    return `<div class="qrow"><div class="nm">${glyph(a.engine, 15)}${esc(ENG[a.engine].name)}</div>
      <div class="qbar">${KINDS.map((k) => `<i style="--i:${i};width:${(a.citation_mix?.[k] || 0) / total * 100}%;background:var(--k-${k})" title="${KIND[k][0]}: ${a.citation_mix?.[k] || 0}"></i>`).join('')}</div>
      <div class="tot">${a.references.length} cited</div></div>`;
  }).join('');
  return `<section class="sheet quote-board rise" style="--i:3"><div class="sec-title">${icon('reference')}<h3>Who the witnesses quote</h3><span class="hint">Every citation, classified</span></div>
    ${rows}<div class="legend">${KINDS.map((k) => `<span>${kindIcon(k)}${KIND[k][0]}</span>`).join('')}</div></section>`;
}

function evidenceHtml(ev) {
  if (!ev.length) return '';
  return `<section class="sheet evidence rise" style="--i:4"><div class="sec-title">${icon('search')}<h3>Search record</h3><span class="hint">Google India results used as evidence, official pages first</span></div>
    ${ev.map((e, i) => `<div class="ev ${e.kind}" ${i >= 5 ? 'hidden' : ''}>${kindIcon(e.kind)}<div>
      <a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a><span class="d">${esc(e.domain)}${e.date ? ' · ' + esc(e.date) : ''}${e.kind === 'hijacked' ? ' · HIJACKED' : ''}</span>
      <p>${esc(e.snippet)}</p></div></div>`).join('')}
    ${ev.length > 5 ? `<button class="more" type="button">Show all ${ev.length} results</button>` : ''}</section>`;
}

// ---------- ledger ----------
function renderLedger(a) {
  if (!a) { $('#ledger').innerHTML = `<div class="sheet">No audit yet. Run <code>python audit.py</code>.</div>`; return; }
  const s = a.summary, cites = Object.values(s.citation_kinds).reduce((x, y) => x + y, 0);
  const headline = esc(s.headline).replace(/(\d+ of \d+|\d+%|a hijacked page \([^)]*\))/g, '<em>$1</em>');
  const tile = (i, n, tone, text, ic, raw) => `<div class="sheet tile rise" style="--i:${i}">${icon(ic, 'i bg')}<div class="n ${tone}" ${raw !== undefined ? `data-v="${raw}" data-u=""` : ''}>${n}</div><p>${text}</p></div>`;
  const VT = (code) => `<span class="vtag ${VERDICT[code].tone}">${VERDICT[code].stamp}</span>`;
  $('#ledger').innerHTML = `
    <div class="sheet ledger-head rise"><div class="kicker">Audit ledger · run ${esc(when(a.run_at))} · ${a.questions.length} questions Indians ask about health, money, tax, law and prices</div>
      <p class="headline">${headline}</p><p class="sub">${esc(s.subline)}</p></div>
    <div class="tiles">
      ${tile(1, `${s.agree}/${s.comparable}`, 'green', 'questions where every engine that answered gave the same figure', 'gavel')}
      ${tile(2, `${s.citation_pct.official}%`, 'red', `of ${cites} citations point to an official source`, 'official')}
      ${tile(3, `${s.citation_pct.commercial}%`, 'amber', 'come from companies selling the loan, policy, test or product', 'commercial')}
      ${tile(4, `${s.hijacked}`, 'red', 'hijacked pages found in Google’s results, with spam injected into real sites', 'hijacked', s.hijacked)}
    </div>
    <section class="sheet quote-board rise" style="--i:5"><div class="sec-title">${icon('reference')}<h3>Who the four engines cite, across every hearing</h3></div>
      <div class="qbar" style="height:26px">${KINDS.map((k) => `<i style="--i:0;width:${s.citation_pct[k]}%;background:var(--k-${k})" title="${KIND[k][0]} ${s.citation_pct[k]}%"></i>`).join('')}</div>
      <div class="legend">${KINDS.map((k) => `<span>${kindIcon(k)}${KIND[k][0]} <b class="mono">${s.citation_pct[k]}%</b></span>`).join('')}</div></section>
    <section class="sheet book rise" style="--i:6"><div class="sec-title">${icon('ledger')}<h3>Scorecard</h3></div><div class="scroll"><table>
      <thead><tr><th>Witness</th><th>Answered</th><th>Gave a figure</th><th>On record</th><th>Not on record</th><th>Official citations</th></tr></thead><tbody>
      ${a.engines.map((e) => `<tr><td><span style="display:inline-flex;gap:8px;align-items:center;font-weight:600">${glyph(e.engine, 15)}${esc(e.label)}</span></td>
        <td class="num">${e.answered}/${a.questions.length}</td><td class="num">${e.numbered}</td><td class="num" style="color:var(--seal)">${e.matched}</td>
        <td class="num" style="color:var(--stamp)">${e.differed}</td><td class="num">${e.official_citations}/${e.citations} <span class="kicker">${e.citations ? Math.round(e.official_citations / e.citations * 100) : 0}%</span></td></tr>`).join('')}
      </tbody></table></div></section>
    <section class="sheet book rise" style="--i:7"><div class="sec-title">${icon('gavel')}<h3>Every hearing</h3><span class="hint">Click a question to reopen it</span></div><div class="scroll"><table>
      <thead><tr><th>Question</th><th>Verdict</th>${a.engines.map((e) => `<th>${glyph(e.engine, 12)} ${esc(e.label.replace('Google ', ''))}</th>`).join('')}<th>Official</th></tr></thead><tbody>
      ${a.questions.map((q) => `<tr><td><span class="qlink" data-q="${esc(q.question)}">${esc(q.question)}</span></td><td>${VT(q.verdict)}</td>
        ${q.cells.map((c) => `<td><span class="cell ${c.match}">${esc(c.label || '—')}</span></td>`).join('')}<td><span class="cell">${esc(q.official || '—')}</span></td></tr>`).join('')}
      </tbody></table></div></section>`;
  $$('#ledger .qlink').forEach((el) => el.onclick = () => ask(el.dataset.q));
  $$('#ledger [data-v]').forEach(countUp);
}

init();
