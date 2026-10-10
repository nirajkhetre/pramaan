const ENGINE_COLOR = { google_ai_mode: 'var(--e0)', google_ai_overview: 'var(--e1)', bing_copilot: 'var(--e2)', brave_ai_mode: 'var(--e3)' };
const KINDS = ['official', 'news', 'commercial', 'forum', 'reference', 'hijacked', 'other'];
const KIND_LABEL = { official: 'Official', news: 'News', commercial: 'Company selling a product', forum: 'Forum / social', reference: 'Reference / academic', hijacked: 'Hijacked page', other: 'Other' };
const MATCH_LABEL = { matches_official: 'Matches official page', differs: 'Not on official page', unchecked: 'No official figure', no_number: 'No number given', no_answer: 'No answer' };
const STAMP = { split: 'Split', consensus_conflict: 'Check date', consensus_official: 'Backed', consensus: 'Agree · unbacked', insufficient: 'Too little' };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(v, u) {
  if (v === null || v === undefined) return '—';
  if (u === '₹') {
    if (v >= 1e7 && v % 1e5 === 0) return `₹${+(v / 1e7).toFixed(2)} crore`;
    if (v >= 1e5 && v % 1e3 === 0) return `₹${+(v / 1e5).toFixed(2)} lakh`;
    return '₹' + v.toLocaleString('en-IN');
  }
  return u === '%' ? `${v}%` : `${v} ${u || ''}`.trim();
}
function claimLabel(c) {
  if (!c) return '';
  return c.range_with !== undefined && c.range_with !== null
    ? `${fmt(Math.min(c.value, c.range_with), c.unit)} – ${fmt(Math.max(c.value, c.range_with), c.unit)}`
    : fmt(c.value, c.unit);
}
function highlight(sentence, text) {
  const s = esc(sentence), t = esc(text);
  return t && s.includes(t) ? s.replace(t, `<mark>${t}</mark>`) : s;
}
function when(iso) {
  if (!iso) return '';
  const d = new Date(iso.replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return isNaN(d) ? iso : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

let STATUS = null;
async function init() {
  STATUS = await fetch('/api/status').then((r) => r.json());
  $('#pills').innerHTML =
    `<span class="pill">${STATUS.live ? '<b>●</b> Live SerpApi' : '<i>●</i> Replay mode (recorded answers)'}</span>` +
    `<span class="pill">${STATUS.llm ? '<b>●</b> Gemini proposes, code verifies' : 'Rules-only extraction'}</span>`;
  $('#samples').innerHTML = STATUS.questions.filter((x) => x.featured).map((x) => `<button class="chip" data-q="${esc(x.q)}"><span>${esc(x.topic)}</span>${esc(x.q)}</button>`).join('');
  document.querySelectorAll('.chip').forEach((b) => b.onclick = () => { $('#q').value = b.dataset.q; ask(b.dataset.q); });
  renderAudit(STATUS.audit);
  const q = new URLSearchParams(location.search).get('q');
  if (q) { $('#q').value = q; ask(q); }
}

document.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#tab-check').hidden = t.dataset.tab !== 'check';
  $('#tab-audit').hidden = t.dataset.tab !== 'audit';
});
$('#ask').onsubmit = (e) => { e.preventDefault(); ask($('#q').value); };

async function ask(q) {
  $('#q').value = q;
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  $('#out').innerHTML = `<div class="loading">Asking four AI search engines and the official web at once…
    <div class="dots"><span>Google AI Mode</span><span>AI Overview</span><span>Bing Copilot</span><span>Brave AI</span></div></div>`;
  try {
    const r = await fetch('/api/check?q=' + encodeURIComponent(q));
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || r.statusText);
    render(data);
  } catch (e) {
    $('#out').innerHTML = `<div class="err">${esc(e.message)}</div>`;
  }
}

function render(d) {
  const v = d.verdict;
  const groups = v.groups.map((g) => `<span class="group"><b>${esc(g.label)}</b> · ${esc(g.engines.join(', '))}</span>`).join('');
  const mode = d.answers.some((a) => a.mode === 'live') ? 'live' : 'recorded';
  $('#out').innerHTML = `
    <div class="verdict">
      <div class="stamp ${v.code}">${STAMP[v.code]}</div>
      <div>
        <h2>${esc(v.title)}</h2>
        ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
        <div class="groups">${groups}</div>
        <div class="meta">${v.answered}/4 engines answered · ${v.numbered} gave a number · ${v.matches_official} match the official source · ${mode} data · ${d.seconds}s</div>
      </div>
    </div>
    <div class="panel map"><h3>Disagreement map</h3>${numberLine(d)}</div>
    <div class="panel"><h3>What the official web says</h3>${officialCard(d)}</div>
    <div class="grid">${d.answers.map(engineCard).join('')}</div>
    <div class="panel"><h3>Where each engine's citations come from</h3>${mixTable(d.answers)}
      <div class="legend">${KINDS.map((k) => `<span><i style="background:var(--k-${k})"></i>${KIND_LABEL[k]}</span>`).join('')}</div></div>
    <div class="panel"><h3>Official and top search results used as evidence</h3>${d.evidence.slice(0, 8).map(evRow).join('') || '<span class="quote">None</span>'}</div>`;
}

function numberLine(d) {
  const pts = d.answers.filter((a) => a.claim).map((a) => ({ v: a.claim.value, lo: a.claim.range_with, label: a.label, c: ENGINE_COLOR[a.engine] }));
  const off = d.official;
  const all = pts.flatMap((p) => [p.v, p.lo]).concat(off ? [off.value] : []).filter((x) => x !== undefined && x !== null);
  if (!all.length) return '<span class="quote">No engine gave a comparable number.</span>';
  let min = Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= Math.abs(min) * 0.2 || 1; max += Math.abs(max) * 0.2 || 1; }
  const pad = (max - min) * 0.12; const floor = Math.min(...all) >= 0 ? 0 : -Infinity;
  min = Math.max(floor, min - pad); max += pad;
  const W = 1000, x = (v) => 40 + ((v - min) / (max - min)) * (W - 80);
  const unit = d.unit || pts[0]?.label;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  // Each label takes the lowest row where its text span overlaps no other label.
  pts.sort((a, b) => a.v - b.v);
  const rows = [];
  const dots = pts.map((p) => {
    const right = x(p.v) > W * 0.6;
    const lw = 10 + 7.2 * `${p.label} · ${fmt(p.v, d.unit || '')}`.length;
    const span = right ? [x(p.v) - lw, x(p.v) + 10] : [x(p.v) - 10, x(p.v) + lw];
    let lvl = rows.findIndex((row) => row.every(([a, b]) => span[1] < a || span[0] > b));
    if (lvl < 0) { rows.push([]); lvl = rows.length - 1; }
    rows[lvl].push(span);
    const y = 100 - lvl * 24;
    const bar = p.lo !== undefined && p.lo !== null ? `<line x1="${x(p.lo)}" x2="${x(p.v)}" y1="${y}" y2="${y}" stroke="${p.c}" stroke-width="6" stroke-linecap="round" opacity=".45"/>` : '';
    return `${bar}<line x1="${x(p.v)}" x2="${x(p.v)}" y1="${y}" y2="120" stroke="${p.c}" stroke-dasharray="3 3"/>
      <circle cx="${x(p.v)}" cy="${y}" r="8" fill="${p.c}"/>
      <text x="${x(p.v) + (right ? -12 : 12)}" y="${y + 4}" text-anchor="${right ? 'end' : 'start'}">${esc(p.label)} · ${esc(fmt(p.v, d.unit || ''))}</text>`;
  }).join('');
  const offRight = off && x(off.value) > W * 0.6;
  const offMark = off ? `<g><rect x="${x(off.value) - 8}" y="122" width="16" height="16" transform="rotate(45 ${x(off.value)} 130)" fill="var(--green)"/>
      <text x="${x(off.value) + (offRight ? -14 : 14)}" y="${offRight ? 160 : 160}" text-anchor="${offRight ? 'end' : 'start'}" style="fill:var(--green)">Official page (${esc(off.domain)}) · ${esc(fmt(off.value, off.unit))}</text></g>` : '';
  return `<svg viewBox="0 0 ${W} 180" role="img" aria-label="Values given by each engine on a number line">
    <line class="axis" x1="30" x2="${W - 30}" y1="130" y2="130"/>
    ${ticks.map((t) => `<text class="tick" x="${x(t)}" y="176" text-anchor="middle">${esc(fmt(+t.toPrecision(3), d.unit || ''))}</text>`).join('')}
    ${dots}${offMark}</svg>`;
}

function officialCard(d) {
  const o = d.official;
  const hj = d.evidence.filter((e) => e.kind === 'hijacked').length;
  if (!o) return `<div class="official"><div class="big none">—</div><div><div class="quote">No official (gov.in, nic.in, RBI, WHO) page in the results stated a number for this. Treat every engine's figure as unverified.</div>
    ${hj ? `<div class="meta hj">⚠ ${hj} result(s) in the official-only search were hijacked pages planted on institutional domains, serving copied health or finance content.</div>` : ''}</div></div>`;
  const hijacked = d.evidence.filter((e) => e.kind === 'hijacked').length;
  return `<div class="official"><div class="big ${d.verdict.code === 'consensus_conflict' ? 'warn' : ''}">${esc(claimLabel(o))}</div>
    <div><div class="quote">“${highlight(o.sentence, o.text)}”</div>
    <div class="meta"><a href="${esc(o.link)}" target="_blank" rel="noopener">${esc(o.title)}</a> · ${esc(o.domain)}
      · ${o.date ? 'dated ' + esc(o.date_text || o.date) : 'undated'}</div>
    ${hijacked ? `<div class="meta hj">⚠ ${hijacked} result(s) were hijacked pages planted on institutional domains. Pramaan never counts them as official.</div>` : ''}</div></div>`;
}

function engineCard(a) {
  const c = a.claim;
  const refs = a.references.slice(0, 12).map((r) => `<li><span class="kind" style="background:var(--k-${r.kind})">${esc(r.kind)}</span>
     <a href="${esc(r.link)}" target="_blank" rel="noopener" title="${esc(r.title)}">${esc(r.domain || r.title)}</a></li>`).join('');
  const total = a.references.length || 1;
  const mix = KINDS.map((k) => `<i style="width:${(a.citation_mix?.[k] || 0) / total * 100}%;background:var(--k-${k})"></i>`).join('');
  const others = (a.values || []).filter((v) => !c || v !== c.value).slice(0, 8).map((v) => `<span>${esc(fmt(v, a.claim?.unit || ''))}</span>`).join('');
  return `<article class="eng" style="--c:${ENGINE_COLOR[a.engine]}">
    <header><b>${esc(a.label)}</b><span class="mode">${a.mode ? esc(a.mode) + ' · ' + esc(when(a.fetched_at)) : ''}</span></header>
    <div class="num ${c ? '' : 'none'}">${c ? esc(claimLabel(c)) : esc(a.status === 'ok' ? 'Answered without a number' : (a.error || 'No answer'))}</div>
    <span class="badge ${a.match}">${MATCH_LABEL[a.match] || ''}</span>
    ${c ? `<div class="quote">“${highlight(c.sentence, c.text)}”</div>` : ''}
    ${c && c.date ? `<div class="meta">Latest date it mentions: ${esc(c.date_text)}</div>` : ''}
    ${others ? `<div class="meta">Other figures in this answer</div><div class="vals">${others}</div>` : ''}
    <div class="meta">${a.references.length} citations · ${a.official_citations || 0} official</div>
    <div class="mix">${a.references.length ? mix : ''}</div>
    <ul class="refs">${refs}</ul>
    ${a.text ? `<details><summary>Full answer</summary><div class="full">${esc(a.text)}</div></details>` : ''}
  </article>`;
}

function mixTable(answers) {
  return `<div class="scroll"><table><tr><th>Engine</th>${KINDS.map((k) => `<th>${KIND_LABEL[k]}</th>`).join('')}<th>Total</th></tr>
    ${answers.map((a) => `<tr><td>${esc(a.label)}</td>${KINDS.map((k) => `<td>${a.citation_mix?.[k] || 0}</td>`).join('')}<td>${a.references.length}</td></tr>`).join('')}</table></div>`;
}

function evRow(e) {
  return `<div class="ev"><span class="kind" style="background:var(--k-${e.kind})">${esc(e.kind)}</span>
    <a href="${esc(e.link)}" target="_blank" rel="noopener">${esc(e.title)}</a> <span class="meta">${esc(e.domain)}${e.date ? ' · ' + esc(e.date) : ''}</span>
    <div class="quote">${esc(e.snippet)}</div></div>`;
}

function renderAudit(a) {
  if (!a) { $('#audit').innerHTML = '<div class="panel">No audit yet. Run <code>python audit.py</code> to ask every benchmark question to all four engines.</div>'; return; }
  const s = a.summary;
  const engines = a.engines;
  $('#audit').innerHTML = `
    <div class="panel"><div class="meta">Audit run ${esc(when(a.run_at))} · ${a.questions.length} questions Indians ask about health, money, tax, law and schemes</div>
      <p class="headline">${esc(s.headline)}</p>
      <div class="meta">${esc(s.subline)}</div>
      ${s.citation_pct ? `<h3 style="margin-top:16px">Who the four engines cite, across all questions</h3>
        <div class="mix" style="height:18px">${KINDS.map((k) => `<i title="${KIND_LABEL[k]} ${s.citation_pct[k]}%" style="width:${s.citation_pct[k]}%;background:var(--k-${k})"></i>`).join('')}</div>
        <div class="legend">${KINDS.map((k) => `<span><i style="background:var(--k-${k})"></i>${KIND_LABEL[k]} ${s.citation_pct[k]}%</span>`).join('')}</div>` : ''}</div>
    <div class="panel"><h3>Scorecard</h3><div class="scroll"><table>
      <tr><th>Engine</th><th>Answered</th><th>Gave a number</th><th>Matched official figure</th><th>Differed from official</th><th>Citations that are official</th></tr>
      ${engines.map((e) => `<tr><td><b style="color:${ENGINE_COLOR[e.engine]}">${esc(e.label)}</b></td><td>${e.answered}/${a.questions.length}</td><td>${e.numbered}</td>
        <td>${e.matched}</td><td>${e.differed}</td><td>${e.official_citations}/${e.citations} (${e.citations ? Math.round(e.official_citations / e.citations * 100) : 0}%)</td></tr>`).join('')}
    </table></div></div>
    <div class="panel"><h3>Every question, every engine</h3><div class="scroll"><table>
      <tr><th>Question</th><th>Verdict</th>${engines.map((e) => `<th>${esc(e.label)}</th>`).join('')}<th>Official</th></tr>
      ${a.questions.map((q) => `<tr><td><span class="qlink" data-q="${esc(q.question)}">${esc(q.question)}</span></td><td>${esc(STAMP[q.verdict])}</td>
        ${q.cells.map((c) => `<td class="v ${c.match}">${esc(c.label || '—')}</td>`).join('')}<td class="v">${esc(q.official || '—')}</td></tr>`).join('')}
    </table></div></div>`;
  document.querySelectorAll('.qlink').forEach((el) => el.onclick = () => {
    document.querySelector('.tab[data-tab=check]').click(); $('#q').value = el.dataset.q; ask(el.dataset.q);
  });
}

init();
