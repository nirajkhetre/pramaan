// Pramaan front end. Black and white; colour only ever carries data.
const ENG = {
  google_ai_mode: { n: 1, name: 'Google AI Mode', short: 'AI Mode', shape: 'circle', color: 'var(--e1)' },
  google_ai_overview: { n: 2, name: 'Google AI Overview', short: 'AI Overview', shape: 'square', color: 'var(--e2)' },
  bing_copilot: { n: 3, name: 'Bing Copilot', short: 'Copilot', shape: 'diamond', color: 'var(--e3)' },
  brave_ai_mode: { n: 4, name: 'Brave AI Mode', short: 'Brave AI', shape: 'triangle', color: 'var(--e4)' },
};
const ORDER = Object.keys(ENG);
const BY_NAME = Object.fromEntries(ORDER.map((k) => [ENG[k].name, k]));
const VERDICT = {
  split: { word: 'Contested', tone: 'red', gloss: 'The engines give different figures for the same question.' },
  consensus_conflict: { word: 'Check the date', tone: 'orange', gloss: 'The engines agree, but the top official page says something else. Dates show which side is probably stale.' },
  consensus_official: { word: 'On record', tone: 'green', gloss: 'The engines agree, and an official page states the same figure.' },
  consensus: { word: 'Unverified', tone: 'white', gloss: 'The engines agree, but no official page in the results states a figure.' },
  insufficient: { word: 'No quorum', tone: 'muted', gloss: 'Fewer than two engines gave a number.' },
};
const TONE = { red: 'var(--red)', orange: 'var(--orange)', green: 'var(--green)', white: 'var(--fg)', muted: 'var(--muted)' };
const MATCH = { matches_official: ['On record', 'green'], differs: ['Not on record', 'red'], unchecked: ['No record to check', 'muted'], no_number: ['No figure', 'muted'], no_answer: ['No answer', 'muted'] };
const KIND = { official: ['Official', 'official'], news: ['News', 'news'], commercial: ['Company selling it', 'commercial'], forum: ['Forum', 'forum'],
  reference: ['Reference', 'reference'], hijacked: ['Hijacked', 'hijacked'], other: ['Other', 'other'] };
const KINDS = Object.keys(KIND);
const TOPIC = { Health: 'health', Savings: 'savings', Tax: 'tax', Law: 'law', Schemes: 'schemes', Prices: 'prices', Money: 'money', Work: 'work' };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (n, cls = 'i') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const kico = (k) => `<svg class="kico" style="stroke:var(--k-${k})" aria-label="${KIND[k][0]}"><use href="#i-${KIND[k][1]}"/></svg>`;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function shapePath(eid) {
  return { circle: '<circle cx="8" cy="8" r="6.6"/>', square: '<rect x="1.6" y="1.6" width="12.8" height="12.8" rx="2.6"/>',
    diamond: '<path d="M8 .6 15.4 8 8 15.4.6 8Z"/>', triangle: '<path d="M8 1 15.4 14.6H.6Z"/>' }[ENG[eid].shape];
}
const shape = (eid, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" style="flex:none;fill:${ENG[eid].color}">${shapePath(eid)}</svg>`;
const badge = (eid) => `<span class="badge" style="--c:${ENG[eid].color}">${shape(eid, 15)}</span>`;

function fmt(v, u) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (u === '₹') {
    if (v >= 1e7 && v % 1e5 === 0) return `₹${+(v / 1e7).toFixed(2)} crore`;
    if (v >= 1e5 && v % 1e5 === 0) return `₹${+(v / 1e5).toFixed(2)} lakh`;
    return '₹' + (+v).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }
  return u === '%' ? `${+(+v).toFixed(3)}%` : `${+(+v).toFixed(3)} ${u || ''}`.trim();
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
  return isNaN(d) ? '' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
const yearOnly = (text) => /^\D*\d{4}\D*$/.test(text || '');
function prettyDate(iso, text) {
  if (!iso) return '';
  if (yearOnly(text)) return iso.slice(0, 4);
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function diffText(a, b, unit) {
  const lo = Math.min(a, b), hi = Math.max(a, b), d = hi - lo;
  if (unit === '%') return `${+d.toFixed(2)} pp`;
  if (unit === '₹') return `${fmt(Math.round(d), '₹')}`;
  return `${+d.toFixed(2)} ${unit}`;
}

// Odometer: every digit is a 0–9 strip that rolls to its value.
function odo(text, delay = 0) {
  let j = 0;
  const strip = '0123456789'.split('').map((n) => `<span>${n}</span>`).join('');
  const inner = [...String(text)].map((ch) => /\d/.test(ch)
    ? `<span class="d"><span class="g">${ch}</span><span class="s" style="--v:${ch};--j:${j++}">${strip}</span></span>`
    : `<span class="c">${esc(ch)}</span>`).join('');
  return `<span class="odo" style="--delay:${delay}ms" role="text" aria-label="${esc(text)}">${inner}</span>`;
}
function spin(root = document) {
  // Timers rather than animation frames, so final values land even in a background tab.
  setTimeout(() => {
    $$('.odo:not(.on)', root).forEach((o) => o.classList.add('on'));
    $$('mark.hl:not(.on)', root).forEach((m, i) => setTimeout(() => m.classList.add('on'), 700 + i * 120));
  }, 40);
}
function waffle(mix, cls = 'waffle') {
  const cells = KINDS.flatMap((k) => Array(mix?.[k] || 0).fill(k));
  return `<div class="${cls}">${cells.map((k, q) => `<i style="--q:${q};background:var(--k-${k})" title="${KIND[k][0]}"></i>`).join('')}</div>`;
}

// ---------- shell ----------
let STATUS = null;
const VERDICT_OF = {};
function moveInd() {
  const on = $('.seg button.on'), ind = $('.seg-ind');
  if (on && ind) { ind.style.left = on.offsetLeft + 'px'; ind.style.width = on.offsetWidth + 'px'; }
}
function showTab(name) {
  const apply = () => {
    $$('.seg button').forEach((b) => { b.classList.toggle('on', b.dataset.tab === name); b.setAttribute('aria-selected', b.dataset.tab === name); });
    $$('.pane').forEach((p) => p.hidden = p.id !== `tab-${name}`);
    moveInd(); window.scrollTo({ top: 0 });
  };
  if (!document.startViewTransition || calm()) return apply();
  const t = document.startViewTransition(apply);
  t.ready.catch(() => {}); t.finished.catch(() => {});
}
$$('.seg button').forEach((b) => b.onclick = () => showTab(b.dataset.tab));
addEventListener('resize', moveInd);
addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); showTab('check'); $('#q').focus(); } });
$('#ask').onsubmit = (e) => { e.preventDefault(); ask($('#q').value.trim()); };

function splitHeadline() {
  const h = $('.hero h1'); let k = 0;
  [...h.childNodes].forEach((n) => {
    if (n.nodeType === 3) {
      const frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((w) => {
        if (!w.trim()) { frag.append(w); return; }
        const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--k', k++); s.textContent = w; frag.append(s);
      });
      n.replaceWith(frag);
    } else if (n.classList?.contains('mark')) { n.classList.add('w'); n.style.setProperty('--k', k++); }
  });
}

async function init() {
  splitHeadline(); moveInd();
  STATUS = await fetch('/api/status').then((r) => r.json());
  (STATUS.audit?.questions || []).forEach((q) => VERDICT_OF[q.question] = q.verdict);
  $('#status').innerHTML = (STATUS.live ? `<span class="chip"><span class="led"></span>Live · SerpApi</span>` : `<span class="chip rec"><span class="led"></span>Replay mode</span>`) +
    `<span class="chip">${STATUS.llm ? 'Gemini + verifier' : 'No AI at runtime'}</span>`;
  renderCases(); renderFindings(); renderAudit(STATUS.audit); renderGloss();
  const q = new URLSearchParams(location.search).get('q');
  if (q) ask(q);
}
function renderCases() {
  $('#cases').innerHTML = STATUS.questions.filter((x) => x.featured).map((x, k) => {
    const v = VERDICT[VERDICT_OF[x.q]];
    return `<button type="button" class="case" style="--k:${k}" data-q="${esc(x.q)}">
      <span class="ic">${icon(TOPIC[x.topic] || 'other')}</span><span class="q">${esc(x.q)}</span>
      <span class="ft">${v ? `<span class="vt ${v.tone}">${v.word}</span>` : ''}<span class="open">${icon('arrow')}</span></span></button>`;
  }).join('');
  $$('.case').forEach((b) => b.onclick = () => ask(b.dataset.q));
}
function renderFindings() {
  const s = STATUS.audit?.summary; if (!s) return;
  const cites = Object.values(s.citation_kinds).reduce((a, b) => a + b, 0);
  const f = (n, tone, text) => `<div class="finding"><div class="n ${tone}">${odo(n, 400)}</div><p>${text}</p></div>`;
  $('#findings').innerHTML = f(`${s.agree}/${s.comparable}`, 'white', 'questions where the four engines gave the same figure')
    + f(`${s.citation_pct.official}%`, 'green', `of their ${cites} citations were official sources`)
    + f(`${s.citation_pct.commercial}%`, 'orange', 'came from companies selling the loan, policy or test asked about')
    + f(`${s.hijacked}`, 'red', 'hijacked pages (spam injected into real sites) in Google’s results');
  $$('.finding').forEach((el) => el.onclick = () => showTab('audit'));
  spin($('#findings'));
}

// ---------- a check ----------
let source = null, ticker = null;
const WAVE = 'M0 17' + ' q10 -13 20 0 t20 0'.repeat(25);
function ask(q) {
  if (!q || q.length < 5) return;
  $('#q').value = q;
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  if ($('#tab-check').hidden) showTab('check');
  $('.hero').hidden = true; $('#landing').hidden = true;
  source?.close(); clearInterval(ticker);
  $('.go').disabled = true;
  $('#out').innerHTML = acquireHtml();
  window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
  const t0 = performance.now();
  ticker = setInterval(() => { const el = $('.timer b'); if (el) el.textContent = ((performance.now() - t0) / 1000).toFixed(1) + 's'; }, 100);
  const queue = []; let busy = false;
  const pump = () => {
    if (busy || !queue.length) return;
    busy = true;
    const ev = queue.shift();
    if (ev.type === 'report' || ev.type === 'error') {
      setTimeout(() => { clearInterval(ticker); $('.go').disabled = false; ev.type === 'report' ? renderReport(ev.report) : renderError(ev.detail); busy = false; }, 700);
      return;
    }
    lock(ev);
    setTimeout(() => { busy = false; pump(); }, 320);
  };
  source = new EventSource('/api/check/stream?q=' + encodeURIComponent(q));
  source.onmessage = (m) => { const ev = JSON.parse(m.data); queue.push(ev); if (ev.type === 'report' || ev.type === 'error') source.close(); pump(); };
  source.onerror = () => { if (source.readyState === 2) return; source.close(); queue.push({ type: 'error', detail: 'Lost the connection to the Pramaan server. Is python app.py still running?' }); pump(); };
}
function acquireHtml() {
  const lane = (id, who, color) => `<div class="lane" data-lane="${id}" style="--c:${color}"><div class="who">${who}</div>
      <div class="wave"><svg viewBox="0 0 1000 34" preserveAspectRatio="none"><path d="${WAVE}"/></svg></div><div class="res"><span class="pending">LISTENING…</span></div></div>`;
  return `<section class="panel acq reveal">
    <div class="acq-head"><span class="label">Asking all five at once</span><span class="timer">${icon('clock')}<b>0.0s</b></span></div>
    ${ORDER.map((k) => lane(k, `${badge(k)}${esc(ENG[k].name)}`, ENG[k].color)).join('')}
    ${lane('record', `<span class="badge" style="--c:var(--green)">${icon('official')}</span>Official web`, 'var(--green)')}
    <div class="acq-foot">${icon('bolt')}A live check takes 20–50 s and fills in as each engine answers. Recorded checks replay instantly.</div></section>`;
}
function lock(ev) {
  const el = $(`.lane[data-lane="${ev.type === 'record' ? 'record' : ev.engine}"]`);
  if (!el) return;
  const res = $('.res', el);
  if (ev.type === 'record') res.innerHTML = `${odo(String(ev.official_pages))}<small>official pages</small>`;
  else if (ev.figure) res.innerHTML = `${odo(ev.figure)}<small>${ev.mode === 'live' ? 'answered live' : 'recorded answer'}</small>`;
  else res.innerHTML = `<span style="font-size:16px">${ev.status === 'ok' ? 'No figure' : 'No answer'}</span><small>—</small>`;
  el.classList.add('locked'); spin(el);
}
function renderError(msg) { $('#out').innerHTML = `<div class="panel err reveal">${icon('warning')}<span>${esc(msg)}</span></div>`; }

function renderReport(d) {
  $('#out').innerHTML = verdictHtml(d) + flowHtml(d) + timelineHtml(d)
    + `<div class="wgrid">${d.answers.map(cardHtml).join('')}</div>`
    + `<div class="lower">${recordHtml(d)}${tamperHtml(d) || legendHtml()}</div>` + evidenceHtml(d.evidence);
  $$('.wcard .more-btn').forEach((b) => b.onclick = () => b.closest('.wcard').classList.toggle('open'));
  $('.share')?.addEventListener('click', async (e) => { try { await navigator.clipboard.writeText(location.href); e.currentTarget.innerHTML = `${icon('check')}Link copied`; } catch { /* blocked */ } });
  $('.btn-ghost')?.addEventListener('click', (e) => { $$('.ev[hidden]').forEach((x) => x.hidden = false); e.currentTarget.remove(); });
  spin($('#out'));
}

function verdictHtml(d) {
  const v = d.verdict, V = VERDICT[v.code], o = d.official;
  const word = [...V.word].map((ch, j) => `<span style="--j:${j}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('');
  const groups = v.groups.map((g, i) => `<div class="stat"><div class="label">${g.engines.length === 4 ? 'All four engines' : `${g.engines.length} of 4 engines`}</div>
      <div class="big">${odo(g.label, 250 + i * 150)}</div><div class="who">${g.engines.map((n) => shape(BY_NAME[n], 13)).join('')}<span>${esc(g.engines.map((n) => ENG[BY_NAME[n]].short).join(' · '))}</span></div></div>`).join('');
  const match = v.code === 'consensus_official', clash = v.code === 'consensus_conflict';
  const off = o ? `<div class="op ${match ? 'eq' : ''}">${match ? '=' : '≠'}</div><div class="stat" style="border-left:0;padding-left:0">
      <div class="label">Official page · ${esc(o.domain)}</div><div class="big ${clash ? 'o' : 'g'}">${odo(claimLabel(o), 500)}</div>
      <div class="who">${icon('calendar')}${o.date ? 'dated ' + esc(prettyDate(o.date, o.date_text)) : 'undated'}</div></div>` : '';
  const ev = d.answers.filter((a) => a.claim).map((a) => a.claim.value);
  let gap = '';
  if (v.code === 'split' && ev.length) gap = `<div class="stat"><div class="label">Spread</div><div class="big r">${odo(diffText(Math.min(...ev), Math.max(...ev), d.unit), 700)}</div>
      <div class="who">${((Math.max(...ev) - Math.min(...ev)) / Math.min(...ev) * 100).toFixed(1)}% between the highest and lowest answer</div></div>`;
  const live = d.answers.some((a) => a.mode === 'live');
  return `<section class="vhead" style="--vc:${TONE[V.tone]}">
    <div class="vtop"><span class="label">Verdict</span><span>${esc(d.question)}</span></div>
    <div class="vword"><span class="letters">${word}</span></div>
    <p class="vsub">${esc(v.title)}</p>
    ${v.note ? `<p class="vnote">${icon('calendar')}<span>${esc(v.note)}</span></p>` : ''}
    <div class="stats">${groups}${off}${gap}</div>
    <div class="vmeta"><span>${icon(live ? 'live' : 'replay')}${live ? 'Live answers' : 'Recorded answers'}</span>
      <span>${icon('check')}${v.answered}/4 answered · ${v.numbered} gave a figure</span><span>${icon('official')}${v.matches_official} on the official record</span>
      <span>${icon('clock')}${d.seconds}s</span><button type="button" class="share">${icon('link')}Copy link</button></div>
  </section>`;
}

// Flow graph: each engine's line runs into the value it gave. Agreement merges; disagreement fans out.
function flowHtml(d) {
  const answered = d.answers.filter((a) => a.claim);
  if (!answered.length) return '';
  const o = d.official, unit = d.unit || answered[0].claim.unit;
  const W = 1200, PX = 290, NX = 800, TOP = 60, BOT = o ? 330 : 300;
  const groups = [];
  answered.forEach((a) => {
    const g = groups.find((x) => x.label === claimLabel(a.claim) || Math.abs(x.v - a.claim.value) < 1e-9);
    if (g) g.eng.push(a.engine); else groups.push({ v: a.claim.value, label: claimLabel(a.claim), eng: [a.engine] });
  });
  const nodes = groups.map((g) => ({ ...g }));
  if (o) nodes.push({ v: o.value, label: claimLabel(o), official: true, eng: [] });
  const vs = nodes.map((n) => n.v), mn = Math.min(...vs), mx = Math.max(...vs);
  nodes.forEach((n) => n.y = mx === mn ? (TOP + BOT) / 2 + (n.official ? 70 : 0) : TOP + (mx - n.v) / (mx - mn) * (BOT - TOP));
  nodes.sort((a, b) => a.y - b.y);
  for (let i = 1; i < nodes.length; i++) nodes[i].y = Math.max(nodes[i].y, nodes[i - 1].y + 62); // keep labels apart
  const H = Math.max(nodes[nodes.length - 1].y + 50, 380);
  const ports = ORDER.map((eid, i) => ({ eid, y: 50 + i * 72 }));
  const portO = { y: 50 + 4 * 72 + 6 };
  let curves = '', k = 0;
  ports.forEach((p) => {
    const a = d.answers.find((x) => x.engine === p.eid);
    const n = a?.claim && nodes.find((x) => !x.official && x.eng.includes(p.eid));
    const c = ENG[p.eid].color;
    if (n) {
      const path = `M${PX} ${p.y} C${PX + 260} ${p.y} ${NX - 250} ${n.y} ${NX} ${n.y}`;
      curves += `<path class="curve" style="--k:${k}" d="${path}" stroke="${c}"/><path class="pulse" style="--k:${k++}" d="${path}" stroke="${c}"/>`;
    }
  });
  const on = nodes.find((x) => x.official);
  if (o && on) {
    const path = `M${PX} ${portO.y} C${PX + 260} ${portO.y} ${NX - 250} ${on.y} ${NX} ${on.y}`;
    curves += `<path class="curve" style="--k:${k};stroke-dasharray:7 7;animation:fade .8s ease both ${k * 120 + 300}ms" d="${path}" stroke="var(--green)"/>`;
  }
  const portsSvg = ports.map((p) => `<g class="port"><g transform="translate(30 ${p.y - 9}) scale(1.125)" fill="${ENG[p.eid].color}">${shapePath(p.eid)}</g>
      <text x="58" y="${p.y + 6}">${esc(ENG[p.eid].name)}</text><circle cx="${PX}" cy="${p.y}" r="4" fill="${ENG[p.eid].color}"/></g>`).join('')
    + (o ? `<g class="port"><circle cx="39" cy="${portO.y}" r="9" fill="none" stroke="var(--green)" stroke-width="2.4"/><text x="58" y="${portO.y + 6}" style="fill:var(--green)">Official web</text>
      <circle cx="${PX}" cy="${portO.y}" r="4" fill="var(--green)"/></g>` : '');
  const nodesSvg = nodes.map((n, i) => {
    const color = n.official ? 'var(--green)' : 'var(--fg)';
    const who = n.official ? `official · ${o.domain}${o.date ? ' · ' + prettyDate(o.date, o.date_text) : ''}` : n.eng.length === 4 ? 'all four engines' : n.eng.map((e) => ENG[e].short).join(' · ');
    return `<g class="node" style="--k:${i}"><circle cx="${NX}" cy="${n.y}" r="${n.official ? 13 : 11 + n.eng.length * 2.5}" fill="${n.official ? 'var(--bg)' : color}" stroke="${color}" stroke-width="3"/>
      ${n.official ? '' : `<circle cx="${NX}" cy="${n.y}" r="4" fill="var(--bg)"/>`}
      <text class="nv" x="${NX + 36}" y="${n.y + 6}" ${n.official ? 'style="fill:var(--green)"' : ''}>${esc(n.label)}</text>
      <text class="nn" x="${NX + 38}" y="${n.y + 28}">${esc(who)}</text></g>`;
  }).join('');
  // A red gap marker when the official figure sits away from the engines.
  let gap = '';
  const eNodes = nodes.filter((n) => !n.official);
  if (on && !eNodes.some((n) => Math.abs(n.v - on.v) < 1e-9) && eNodes.length) {
    const near = eNodes.reduce((a, b) => Math.abs(b.y - on.y) < Math.abs(a.y - on.y) ? b : a);
    const gx = NX - 40, y1 = Math.min(near.y, on.y), y2 = Math.max(near.y, on.y);
    gap = `<g class="fadein"><path class="gap" d="M${gx + 8} ${y1} H${gx} V${y2} H${gx + 8}"/><text class="gapt" x="${gx - 10}" y="${(y1 + y2) / 2 + 5}" text-anchor="end">${esc(diffText(near.v, on.v, unit))} apart</text></g>`;
  }
  return `<section class="panel flowp"><div class="ph">${icon('flow')}<h3>Where each answer lands</h3><span class="hint">Lines that meet agree. Lines that split disagree.</span></div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Each engine's answer as a line ending at the value it gave">
      <line class="axis" x1="${NX}" x2="${NX}" y1="${TOP - 30}" y2="${H - 20}"/>${curves}${portsSvg}${gap}${nodesSvg}</svg></section>`;
}

// Timeline: how far apart the official page and the engines' sources are in time.
function timelineHtml(d) {
  const o = d.official;
  if (d.verdict.code !== 'consensus_conflict' || !o?.date) return '';
  const latest = d.answers.filter((a) => a.claim?.date && !yearOnly(a.claim.date_text)).map((a) => a.claim).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!latest) return '';
  const t = (iso) => new Date(iso + 'T00:00:00').getTime();
  const today = Date.now(), a = t(o.date), b = t(latest.date);
  const lo = Math.min(a, b, today) - 864e5 * 10, hi = Math.max(a, b, today) + 864e5 * 10;
  const W = 1200, X0 = 40, X1 = 1160, x = (ms) => X0 + (ms - lo) / (hi - lo) * (X1 - X0), Y = 92;
  let ticks = '';
  for (let m = new Date(lo); m <= new Date(hi); m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
    const mm = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
    if (mm < lo) continue;
    ticks += `<line class="tkl" x1="${x(mm)}" x2="${x(mm)}" y1="${Y - 6}" y2="${Y + 6}"/><text class="tk" x="${x(mm)}" y="${Y + 30}" text-anchor="middle">${new Date(mm).toLocaleDateString('en-IN', { month: 'short' })}</text>`;
  }
  const days = Math.round(Math.abs(b - a) / 864e5);
  return `<section class="panel tl"><div class="ph">${icon('calendar')}<h3>Which source is newer</h3><span class="hint">Dates read from the official page and the engines' own sentences</span></div>
    <svg class="chart" viewBox="0 0 ${W} 150" role="img" aria-label="Timeline of the official page date and the date the engines cite">
      <line class="ax" x1="${X0}" x2="${X1}" y1="${Y}" y2="${Y}"/>${ticks}
      <line class="span" x1="${x(Math.min(a, b))}" x2="${x(Math.max(a, b))}" y1="${Y}" y2="${Y}"/>
      <text class="dur" x="${(x(a) + x(b)) / 2}" y="${Y - 16}" text-anchor="middle">${days} days</text>
      <circle cx="${x(a)}" cy="${Y}" r="9" fill="var(--bg)" stroke="var(--green)" stroke-width="3"/>
      <text class="lab g" x="${x(a)}" y="${Y + 54}" text-anchor="middle">Official page · ${esc(prettyDate(o.date, o.date_text))}</text>
      <circle cx="${x(b)}" cy="${Y}" r="9" fill="var(--fg)"/>
      <text class="lab" x="${x(b)}" y="${Y - 44}" text-anchor="middle">Engines cite · ${esc(prettyDate(latest.date, latest.date_text))}</text>
      <line x1="${x(today)}" x2="${x(today)}" y1="${Y - 20}" y2="${Y + 20}" stroke="var(--muted)" stroke-dasharray="3 3"/>
      <text class="tk" x="${x(today)}" y="${Y + 54}" text-anchor="middle">Today</text></svg></section>`;
}

function cardHtml(a, k) {
  const e = ENG[a.engine], c = a.claim, [mLabel, mTone] = MATCH[a.match] || MATCH.no_answer;
  const cites = a.references.slice(0, 16).map((r) => `<li class="${r.kind}">${kico(r.kind)}<a href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.domain || r.title)}</a>${r.kind === 'hijacked' ? '<span class="glitch">Hijacked</span>' : ''}</li>`).join('');
  return `<article class="panel wcard" style="--c:${e.color};--k:${k}"><div class="strip"></div><div class="in">
    <div class="top">${badge(a.engine)}<div><div class="nm">${esc(e.name)}</div><div class="sub">${a.mode === 'live' ? 'live' : 'recorded'} ${esc(when(a.fetched_at))}</div></div></div>
    ${c ? `<div class="fig">${odo(claimLabel(c), 400 + k * 120)}</div>` : `<div class="fig none">${esc(a.status === 'ok' ? 'No figure in the answer' : (a.error || 'No answer'))}</div>`}
    <span class="vt ${mTone}" style="align-self:flex-start">${mLabel}</span>
    ${c ? `<blockquote>${highlight(c.sentence, c.text)}</blockquote>` : ''}
    ${c?.date ? `<span class="when">${icon('calendar')}mentions ${esc(prettyDate(c.date, c.date_text))}</span>` : ''}
    <div class="wcap">${a.references.length} sources · <b>${a.official_citations} official</b></div>
    ${waffle(a.citation_mix)}
    <button type="button" class="more-btn">Sources &amp; full answer ${icon('chevron')}</button>
  </div><div class="more"><div><ul class="cites">${cites || '<li>No sources</li>'}</ul></div></div></article>`;
}

function recordHtml(d) {
  const o = d.official, bad = d.verdict.code === 'consensus_conflict';
  const body = o
    ? `<div class="big">${odo(claimLabel(o), 400)}</div><p class="q">${highlight(o.sentence, o.text)}</p>
       <div class="srcs"><a class="src" href="${esc(o.link)}" target="_blank" rel="noopener" title="${esc(o.title)}">${icon('official')}${esc(o.domain)}${icon('external')}</a>
       <span class="src">${icon('calendar')}${o.date ? esc(prettyDate(o.date, o.date_text)) : 'undated'}</span></div>`
    : `<div class="none">—</div><p>No official page in the results (gov.in, nic.in, RBI, WHO) states a figure for this. Treat every engine’s figure as unverified.</p>`;
  return `<section class="panel side-p rec ${bad ? 'bad' : ''}"><div class="label">The official record</div>${body}</section>`;
}

function tamperHtml(d) {
  const pages = new Map();
  d.evidence.filter((e) => e.kind === 'hijacked').forEach((e) => pages.set(e.link, { ...e, by: new Set() }));
  d.answers.forEach((a) => a.references.filter((r) => r.kind === 'hijacked').forEach((r) => {
    if (!pages.has(r.link)) pages.set(r.link, { ...r, by: new Set() });
    pages.get(r.link).by.add(a.label);
  }));
  if (!pages.size) return '';
  const groups = {};
  pages.forEach((h) => {
    let raw = h.link || ''; try { raw = decodeURIComponent(decodeURIComponent(raw)); } catch { /* keep */ }
    const spam = (raw.match(/include\s+url=["']?(?:https?:)?\/+\\?\/?([^/"'?\s]+)/i) || [])[1] || 'an outside host';
    const key = `${h.domain}|${spam}`;
    const g = (groups[key] ||= { domain: h.domain, spam, n: 0, by: new Set() });
    g.n += 1; h.by.forEach((b) => g.by.add(b));
  });
  const rows = Object.values(groups).sort((a, b) => b.by.size - a.by.size || b.n - a.n);
  const RH = 86, W = 560;
  const svg = rows.map((g, i) => {
    const y = i * RH;
    return `<g transform="translate(0 ${y})">
      ${g.by.size ? `<text class="by" x="0" y="12">CITED BY ${esc([...g.by].join(', ').toUpperCase())}</text>` : `<text class="s" x="0" y="12">IN SEARCH RESULTS${g.n > 1 ? ' · ' + g.n + ' PAGES' : ''}</text>`}
      <rect class="box" x="0" y="22" width="220" height="44" rx="10"/><text class="s" x="14" y="38">Real site</text><text x="14" y="58">${esc(g.domain)}</text>
      <path class="arrow" d="M${W - 236} 44 H232"/><path d="M240 44 l10 -6 v12z" fill="var(--red)"/>
      <text class="s" x="${(232 + W - 236) / 2 + 6}" y="36" text-anchor="middle" style="fill:var(--red)">injects</text>
      <rect class="box bad" x="${W - 230}" y="22" width="230" height="44" rx="10"/><text class="s" x="${W - 216}" y="38">Spam host</text><text x="${W - 216}" y="58">${esc(g.spam)}</text></g>`;
  }).join('');
  return `<section class="tamper"><h4>${icon('hijacked')}Hijacked sources</h4>
    <p>Spam planted on real institutional sites through a vulnerable panorama viewer (krpano). Pramaan never counts these pages as official.</p>
    <svg class="inj" viewBox="0 0 ${W} ${rows.length * RH}" role="img" aria-label="Hijacked sites and the spam hosts injecting into them">${svg}</svg></section>`;
}
function legendHtml() {
  return `<section class="panel side-p"><div class="label">Reading the source squares</div>
    <p style="color:var(--text-2);margin:12px 0 0">Under each engine, every square is one source it cited, coloured by who published it.</p>
    <div class="legend">${KINDS.map((x) => `<span><i class="sq" style="background:var(--k-${x})"></i>${KIND[x][0]}</span>`).join('')}</div></section>`;
}
function evidenceHtml(ev) {
  if (!ev.length) return '';
  return `<section class="panel ev-p"><div class="ph">${icon('search')}<h3>Search record</h3><span class="hint">Google India results used as evidence, official pages first</span></div>
    ${ev.map((e, i) => `<div class="ev ${e.kind}" ${i >= 4 ? 'hidden' : ''}>${kico(e.kind)}<div><a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a>
      <span class="d">${esc(e.domain)}${e.date ? ' · ' + esc(e.date) : ''}</span><p>${esc(e.snippet)}</p></div></div>`).join('')}
    ${ev.length > 4 ? `<button type="button" class="btn-ghost">Show all ${ev.length} results</button>` : ''}
    <div class="legend">${KINDS.map((x) => `<span><i class="sq" style="background:var(--k-${x})"></i>${KIND[x][0]}</span>`).join('')}</div></section>`;
}

// ---------- audit ----------
function renderAudit(a) {
  if (!a) { $('#audit').innerHTML = `<div class="a-hero"><h1>No audit yet</h1><p class="lede">Run <code>python audit.py</code>.</p></div>`; return; }
  const s = a.summary, cites = Object.values(s.citation_kinds).reduce((x, y) => x + y, 0);
  const citedHijack = a.engines.filter((e) => e.kinds?.hijacked).map((e) => e.label);
  const when2 = new Date(a.run_at.replace(/([+-]\d\d)(\d\d)$/, '$1:$2')).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const VT = (code) => `<span class="vt ${VERDICT[code].tone}">${VERDICT[code].word}</span>`;
  const head = `<tr><th>Question</th><th>Verdict</th>${a.engines.map((e) => `<th><span style="display:inline-flex;gap:7px;align-items:center">${shape(e.engine, 11)}${esc(ENG[e.engine].short)}</span></th>`).join('')}<th>Official page</th></tr>`;
  const rows = a.questions.map((q, i) => `<tr data-q="${esc(q.question)}"><td class="qt">${esc(q.question)}</td><td>${VT(q.verdict)}</td>
      ${q.cells.map((c, j) => `<td><span class="cell ${c.match}" style="--k:${i * 4 + j}"><span class="ring"></span>${esc(c.label || '—')}</span></td>`).join('')}
      <td><span class="cell" style="--k:${i * 4 + 4}">${esc(q.official || '—')}</span></td></tr>`).join('');
  const kstats = KINDS.map((x) => `<div class="kstat"><div class="n" style="color:${x === 'other' ? 'var(--muted)' : `var(--k-${x})`}">${odo(String(s.citation_kinds[x]), 300)}</div><p><i class="sq" style="width:10px;height:10px;border-radius:2px;background:var(--k-${x})"></i>${KIND[x][0]}</p></div>`).join('');
  const multi = a.engines.map((e) => `<div class="m"><h4>${shape(e.engine, 13)}${esc(e.label)}<span>${e.citations} · ${e.official_citations} official</span></h4>${waffle(e.kinds, 'waffle')}</div>`).join('');
  $('#audit').innerHTML = `
    <div class="a-hero"><div class="eyebrow"><span class="dot"></span>Audit · ${a.questions.length} everyday questions · asked live on ${esc(when2)}</div>
      <h1>The engines agreed on <em>${s.agree} of ${s.comparable}</em> numbers. Only <em class="r">${s.citation_pct.official}%</em> of their ${cites} citations were official.</h1>
      <p class="lede">${s.citation_pct.commercial}% came from companies selling the loan, policy or test being asked about.${citedHijack.length ? ` ${esc(citedHijack.join(' and '))} cited a hijacked university page for Indian blood-sugar limits.` : ''} On ${s.conflict} questions the top official page said something different, and on ${s.verified} it confirmed the engines.</p></div>
    <section class="panel a-sec"><div class="ph">${icon('reference')}<h3>All ${cites} citations, one square each</h3><span class="hint">Coloured by who published the page</span></div>
      <div class="bigwaffle">${KINDS.flatMap((k) => Array(s.citation_kinds[k] || 0).fill(k)).map((k, q) => `<i style="--q:${q};background:var(--k-${k})" title="${KIND[k][0]}"></i>`).join('')}</div>
      <div class="kstats">${kstats}</div></section>
    <section class="panel a-sec"><div class="ph">${icon('flow')}<h3>Engine by engine</h3><span class="hint">Every square is one source that engine cited</span></div><div class="multi">${multi}</div></section>
    <section class="panel a-sec"><div class="ph">${icon('spectrum')}<h3>Every question, every engine</h3><span class="hint">Click a row to open that check</span></div>
      <div class="scroll"><table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
      <div class="legend"><span><span class="cell matches_official" style="animation:none"><span class="ring"></span></span>matches an official page</span>
        <span><span class="cell differs" style="animation:none"><span class="ring"></span></span>official page says otherwise</span>
        <span><span class="cell" style="animation:none"><span class="ring"></span></span>no official figure found</span></div></section>`;
  $$('#audit tbody tr').forEach((tr) => tr.onclick = () => ask(tr.dataset.q));
  spin($('#audit'));
}
function renderGloss() {
  $('#gloss').innerHTML = Object.values(VERDICT).map((v) => `<div class="g"><span class="vt ${v.tone}">${v.word}</span><p>${esc(v.gloss)}</p></div>`).join('');
}
init();
