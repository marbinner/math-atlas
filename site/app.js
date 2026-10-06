'use strict';
(() => {
  const A = window.ATLAS;
  const page = document.getElementById('page');
  const tip = document.getElementById('tip');

  /* ---------- helpers ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => n.toLocaleString('en');
  const plural = (n, one, many = one + 's') => `${fmt(n)} ${n === 1 ? one : many}`;
  // Split a formula at top-level \quad / \qquad gaps (not inside braces, environments or \left...\right).
  const splitTop = latex => {
    const parts = [];
    let depth = 0, start = 0;
    for (let i = 0; i < latex.length; i++) {
      const c = latex[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '\\') {
        const m = latex.slice(i).match(/^\\([a-zA-Z]+|.)/);
        if (m[1] === 'begin' || m[1] === 'left') depth++;
        else if (m[1] === 'end' || m[1] === 'right') depth--;
        else if ((m[1] === 'quad' || m[1] === 'qquad') && depth === 0) { parts.push(latex.slice(start, i)); start = i + m[0].length; }
        i += m[0].length - 1;
      }
    }
    parts.push(latex.slice(start));
    return parts.map(x => x.trim()).filter(Boolean);
  };
  // Block formulas: each \quad-separated part is rendered in inline mode with \displaystyle (same look
  // as display mode), so long formulas wrap between parts, or after relations, instead of being clipped.
  const tex = (latex, block = false) => {
    try {
      if (!block) return katex.renderToString(latex, { throwOnError: false });
      const parts = splitTop(latex).map(x => katex.renderToString(`\\displaystyle ${x}`, { throwOnError: true }));
      return `<div class="math-block">${parts.map(h => `<span class="part">${h}</span>`).join('')}</div>`;
    } catch {
      try { return `<div class="math-block">${katex.renderToString(`\\displaystyle ${latex}`, { throwOnError: false })}</div>`; }
      catch { return `<code>${esc(latex)}</code>`; }
    }
  };
  const measureCtx = document.createElement('canvas').getContext('2d');
  const textWidth = (s, font) => { measureCtx.font = font; return measureCtx.measureText(s).width; };
  const fit = (s, maxW, font) => {
    if (textWidth(s, font) <= maxW) return s;
    while (s.length > 1 && textWidth(s + '…', font) > maxW) s = s.slice(0, -1);
    return s.trimEnd() + '…';
  };
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  // Prose fields may contain inline maths as $...$; render those spans with KaTeX and escape the rest.
  // A span that fails to parse falls back to its source text.
  const prose = s => String(s ?? '').split(/(\$[^$]+\$)/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    try { return katex.renderToString(part.slice(1, -1), { throwOnError: true, strict: 'ignore' }); }
    catch { return esc(part); }
  }).join('');
  const firstSentence = s => {
    let inMath = false;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '$') inMath = !inMath;
      else if (!inMath && '.!?'.includes(s[i]) && (i + 1 === s.length || s[i + 1] === ' ')) return s.slice(0, i + 1);
    }
    return s;
  };

  const LEVEL = { 1: 'Foundations', 2: 'Undergraduate', 3: 'Advanced undergraduate', 4: 'Graduate' };
  const KIND = { theorem: 'Theorem', definition: 'Definition', identity: 'Identity', method: 'Method', model: 'Model' };

  /* ---------- indexes ---------- */
  const F = new Map(A.nodes.map(n => [n.id, n]));
  const P = new Map(A.patterns.map(p => [p.id, p]));
  const M = new Map(A.metaphors.map(m => [m.id, m]));
  const nbrs = new Map(A.nodes.map(n => [n.id, []]));
  for (const [s, t, rel, text] of A.links) {
    nbrs.get(s).push({ id: t, rel, dir: 'out', text });
    nbrs.get(t).push({ id: s, rel, dir: 'in', text });
  }
  const nextOf = new Map(A.nodes.map(n => [n.id, []]));
  for (const n of A.nodes) for (const p of n.prerequisites) nextOf.get(p)?.push(n.id);
  const picturesOf = new Map();
  for (const m of A.metaphors) for (const [f, role] of m.mappings) {
    if (!picturesOf.has(f)) picturesOf.set(f, []);
    picturesOf.get(f).push({ m, role });
  }
  const membersOf = new Map(A.patterns.map(p => [p.id, []]));
  for (const n of A.nodes) for (const [pid, why] of n.patterns) membersOf.get(pid)?.push({ n, why });
  const picturesOfPattern = new Map(A.patterns.map(p => [p.id, []]));
  for (const m of A.metaphors) for (const pid of m.patterns) picturesOfPattern.get(pid)?.push(m);
  const regionOf = new Map();
  for (const r of A.regions) for (const d of r.domains) regionOf.set(d, r.name);

  const fLink = id => { const n = F.get(id); return n ? `<a href="#/f/${n.id}">${esc(n.name)}</a>` : esc(id); };
  const pLink = id => { const p = P.get(id); return p ? `<a href="#/p/${p.id}">${esc(p.name)}</a>` : esc(id); };
  const mLink = id => { const m = M.get(id); return m ? `<a href="#/m/${m.id}">${esc(m.title)}</a>` : esc(id); };
  const dLink = d => `<a href="#/field/${encodeURIComponent(d)}">${esc(d)}</a>`;

  /* ---------- relation groups ---------- */
  // Directions follow the dataset: generalization goes simpler -> more general,
  // derivation goes tool -> consequence, application goes idea -> use.
  const GROUPS = [
    { key: 'generalization:in', rel: 'generalization', side: 'L', label: 'Special cases', hint: 'simpler results this one generalizes' },
    { key: 'derivation:in', rel: 'derivation', side: 'L', label: 'Derived from', hint: 'tools used to obtain this result' },
    { key: 'application:in', rel: 'application', side: 'L', label: 'Uses', hint: 'ideas applied here' },
    { key: 'generalization:out', rel: 'generalization', side: 'R', label: 'Generalizations', hint: 'more general results' },
    { key: 'derivation:out', rel: 'derivation', side: 'R', label: 'Consequences', hint: 'results derived from this one' },
    { key: 'application:out', rel: 'application', side: 'R', label: 'Used in', hint: 'where this idea is applied' },
    { key: 'equivalence', rel: 'equivalence', side: 'S', label: 'Equivalent forms', hint: 'the same content stated differently' },
    { key: 'duality', rel: 'duality', side: 'S', label: 'Dual results', hint: 'mirror statements' },
    { key: 'analogy', rel: 'analogy', side: 'S', label: 'Analogies', hint: 'parallel structure, not equivalence' },
  ];
  const PRE_IN = { key: 'pre:in', rel: 'prerequisite', side: 'L', label: 'Prerequisites' };
  const PRE_OUT = { key: 'pre:out', rel: 'prerequisite', side: 'R', label: 'Prepares for' };
  const SYMMETRIC = new Set(['equivalence', 'analogy', 'duality']);
  const groupKey = e => SYMMETRIC.has(e.rel) ? e.rel : `${e.rel}:${e.dir}`;

  function connectionGroups(id) {
    const by = new Map();
    for (const e of nbrs.get(id)) {
      const k = groupKey(e);
      if (!by.has(k)) by.set(k, []);
      if (!by.get(k).some(x => x.id === e.id)) by.get(k).push(e);
    }
    return GROUPS.filter(g => by.has(g.key)).map(g => ({ def: g, items: by.get(g.key) }));
  }

  const swatch = rel => `<svg width="22" height="8" aria-hidden="true"><line x1="1" y1="4" x2="21" y2="4" class="r-${rel}" stroke-width="2"/></svg>`;

  /* ---------- ego graph ---------- */
  const ROW = 21, HEAD = 26, GAP = 12;
  const LABEL_FONT = '12.5px ' + css('--sans');
  const FOCAL_FONT = '600 13px ' + css('--sans');

  function egoGraph(id, withPrereq, width) {
    const n = F.get(id);
    const groups = connectionGroups(id);
    const L = groups.filter(g => g.def.side === 'L');
    const R = groups.filter(g => g.def.side === 'R');
    if (withPrereq) {
      const pre = n.prerequisites.filter(p => F.has(p)).map(p => ({ id: p, rel: 'prerequisite', text: 'Suggested background (a learning dependency, not a logical implication).' }));
      const nxt = nextOf.get(id).map(p => ({ id: p, rel: 'prerequisite', text: 'Suggested next step that lists this as background.' }));
      if (pre.length) L.push({ def: PRE_IN, items: pre });
      if (nxt.length) R.push({ def: PRE_OUT, items: nxt });
    }
    const colH = gs => gs.reduce((h, g) => h + HEAD + g.items.length * ROW + GAP, 0);
    for (const g of groups.filter(g => g.def.side === 'S')) (colH(L) <= colH(R) ? L : R).push(g);

    const W = Math.max(760, Math.min(width, 1100)), cx = W / 2, xL = cx - 180, xR = cx + 180, pad = 20;
    const labelW = xL - 40;
    const H = Math.max(colH(L), colH(R), 80) + pad * 2;
    const cy = H / 2;
    const name = fit(n.name, 190, FOCAL_FONT);
    const pw = textWidth(name, FOCAL_FONT) + 28;

    const edges = [], nodes = [];
    let k = 0;
    const place = (col, side) => {
      let y = (H - colH(col)) / 2 + 4;
      for (const g of col) {
        const x = side === 'L' ? xL : xR;
        const anchor = side === 'L' ? 'end' : 'start';
        const tx = side === 'L' ? x - 14 : x + 14;
        nodes.push(`<line x1="${x - 10}" y1="${y + 10}" x2="${x + 10}" y2="${y + 10}" class="r-${g.def.rel}" stroke-width="2"/>`
          + `<text class="head" x="${tx}" y="${y + 14}" text-anchor="${anchor}">${esc(g.def.label)}</text>`);
        y += HEAD;
        for (const it of g.items) {
          const m = F.get(it.id);
          const ey = y + 6;
          const x0 = side === 'L' ? x + 4 : x - 4;
          const x1 = side === 'L' ? cx - pw / 2 : cx + pw / 2;
          const bend = (x1 - x0) * 0.55;
          edges.push(`<path class="edge r-${it.rel}" data-k="${k}" d="M${x0},${ey} C${x0 + bend},${ey} ${x1 - bend},${cy} ${x1},${cy}"/>`);
          const label = fit(m.name, labelW, LABEL_FONT);
          const lw = textWidth(label, LABEL_FONT);
          const hx = side === 'L' ? tx - lw - 4 : x - 6;
          nodes.push(`<g class="nb" data-k="${k}" data-id="${m.id}" data-text="${esc(it.text)}" data-group="${esc(g.def.label)}">`
            + `<rect class="hit" x="${hx}" y="${ey - 10}" width="${lw + 24}" height="${ROW}"/>`
            + `<circle cx="${x}" cy="${ey}" r="3.6" class="r-${it.rel}" style="stroke-dasharray:none"/>`
            + `<text x="${tx}" y="${ey + 4}" text-anchor="${anchor}">${esc(label)}</text></g>`);
          y += ROW;
          k++;
        }
        y += GAP;
      }
    };
    place(L, 'L');
    place(R, 'R');
    const empty = k === 0 ? `<text class="empty" x="${cx}" y="${cy + 40}" text-anchor="middle">No explained mathematical links yet.</text>` : '';
    return `<svg class="ego" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Connections of ${esc(n.name)}">`
      + edges.join('') + nodes.join('')
      + `<g class="focal"><rect x="${cx - pw / 2}" y="${cy - 15}" width="${pw}" height="30" rx="15"/>`
      + `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle">${esc(name)}</text></g>${empty}</svg>`;
  }

  function mountEgo(el, id) {
    const body = el.querySelector('.figure-scroll');
    const box = el.querySelector('input');
    const draw = () => {
      body.innerHTML = egoGraph(id, box.checked, body.clientWidth);
      const svg = body.querySelector('svg');
      svg.addEventListener('mouseover', e => {
        const g = e.target.closest('.nb');
        if (!g) return;
        svg.classList.add('hot');
        svg.querySelectorAll(`[data-k="${g.dataset.k}"]`).forEach(x => x.classList.add('on'));
        const m = F.get(g.dataset.id);
        showTip(e, `<b>${esc(m.name)}</b><span class="m">${esc(g.dataset.group)} · ${esc(m.domain)}</span><p>${prose(g.dataset.text)}</p>`);
      });
      svg.addEventListener('mousemove', moveTip);
      svg.addEventListener('mouseout', e => {
        const g = e.target.closest('.nb');
        if (!g || g.contains(e.relatedTarget)) return;
        svg.classList.remove('hot');
        svg.querySelectorAll('.on').forEach(x => x.classList.remove('on'));
        hideTip();
      });
      svg.addEventListener('click', e => {
        const g = e.target.closest('.nb');
        if (g) { hideTip(); location.hash = `#/f/${g.dataset.id}`; }
      });
    };
    box.addEventListener('change', draw);
    draw();
  }

  /* ---------- tooltip ---------- */
  function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; moveTip(e); }
  function moveTip(e) {
    if (tip.hidden) return;
    const r = tip.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- shared page pieces ---------- */
  const toc = sections => `<nav class="toc"><b>Contents</b>${sections.map(([id, label, n]) =>
    `<a href="#" data-to="${id}">${esc(label)}${n != null ? ` <span class="n">${n}</span>` : ''}</a>`).join('')}</nav>`;
  const h2 = (id, label, n) => `<h2 id="${id}">${esc(label)}${n != null ? `<span class="n">${n}</span>` : ''}</h2>`;
  const sourceList = ids => {
    const items = ids.map(id => A.sources[id]).filter(Boolean);
    if (!items.length) return '<p class="muted">No references listed.</p>';
    return `<ol class="small">${items.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a> <span class="muted">· ${esc(s.kind)}</span><br><span class="muted">${esc(s.note)}</span></li>`).join('')}</ol>`;
  };
  const article = (sections, body) => `<div class="wrap"><div class="layout">${toc(sections)}<article>${body}</article></div></div>`;

  /* ---------- pages ---------- */
  function formulaPage(id) {
    const n = F.get(id);
    if (!n) return notFound();
    const groups = connectionGroups(id);
    const linkCount = groups.reduce((s, g) => s + g.items.length, 0);
    const pre = n.prerequisites.filter(p => F.has(p));
    const nxt = nextOf.get(id);
    const pics = picturesOf.get(id) || [];
    const sections = [
      ['connections', 'Connections', linkCount],
      ['learning', 'Learning path', pre.length + nxt.length],
      ['patterns', 'Patterns', n.patterns.length],
      ...(pics.length ? [['pictures', 'Mental pictures', pics.length]] : []),
      ['references', 'References', n.sources.length],
    ];
    const relSections = groups.map(g => `<h3 class="rel-h">${swatch(g.def.rel)}${esc(g.def.label)} <span class="count">${g.items.length}</span></h3>`
      + `<ul class="rels">${g.items.map(e => `<li>${fLink(e.id)} <span class="x">— ${prose(e.text)}</span></li>`).join('')}</ul>`).join('');

    const body = `
      <div class="crumbs">${dLink(n.domain)} › ${esc(n.subdomain)}</div>
      <h1>${esc(n.name)}</h1>
      <div class="tagline">${KIND[n.kind] || n.kind} · ${LEVEL[n.level]}</div>
      <aside class="infobox">
        <div class="formula">${tex(n.latex, true)}</div>
        <table>
          <tr><th>Field</th><td>${dLink(n.domain)}</td></tr>
          <tr><th>Subfield</th><td>${esc(n.subdomain)}</td></tr>
          <tr><th>Type</th><td>${KIND[n.kind] || esc(n.kind)}</td></tr>
          <tr><th>Level</th><td>${LEVEL[n.level]}</td></tr>
          <tr><th>Patterns</th><td>${n.patterns.map(([p]) => pLink(p)).join(', ') || '—'}</td></tr>
          <tr><th>Map</th><td><a href="#/map/${n.id}">Show on map</a></td></tr>
        </table>
      </aside>
      <p class="lead">${prose(n.intuition)}</p>
      <h3>Conditions</h3><p>${prose(n.conditions)}</p>
      <h3>Example</h3><p>${prose(n.example)}</p>
      ${h2('connections', 'Connections', linkCount)}
      <div class="figure">
        <div class="figure-bar"><span>Left: what it builds on · Right: where it leads · Hover for the explanation</span><span class="spacer"></span>
          <label><input type="checkbox"> Include learning path</label></div>
        <div class="figure-scroll"></div>
      </div>
      ${relSections || '<p class="muted">No explained mathematical links yet.</p>'}
      ${h2('learning', 'Learning path')}
      <p class="muted small">Prerequisites are an editorial scaffold: suggested background, not logical dependencies.</p>
      <h3>Suggested background</h3>
      ${pre.length ? `<ul class="plain cols">${pre.map(p => `<li>${fLink(p)}</li>`).join('')}</ul>` : '<p class="muted">None — a good starting point.</p>'}
      <h3>Prepares for</h3>
      ${nxt.length ? `<ul class="plain cols">${nxt.map(p => `<li>${fLink(p)}</li>`).join('')}</ul>` : '<p class="muted">Nothing in the atlas lists this as background yet.</p>'}
      ${h2('patterns', 'Patterns')}
      <ul class="rels">${n.patterns.map(([p, why]) => `<li>${pLink(p)} <span class="x">— ${prose(why)}</span></li>`).join('')}</ul>
      ${pics.length ? `${h2('pictures', 'Mental pictures')}
        <ul class="rels">${pics.map(({ m, role }) => `<li>${mLink(m.id)} <span class="x">— ${prose(role)}</span></li>`).join('')}</ul>` : ''}
      ${h2('references', 'References')}
      ${sourceList(n.sources)}`;
    page.innerHTML = article(sections, body);
    mountEgo(page.querySelector('.figure'), id);
    return n.name;
  }

  function patternPage(id) {
    const p = P.get(id);
    if (!p) return notFound();
    const members = membersOf.get(id);
    const byDomain = d3.group(members, x => x.n.domain);
    const domains = [...byDomain.keys()].sort((a, b) => byDomain.get(b).length - byDomain.get(a).length);
    const pics = picturesOfPattern.get(id);
    const sections = [['examples', 'Representative examples', p.examples.length], ['members', 'Members by field', members.length],
      ...(pics.length ? [['pictures', 'Mental pictures', pics.length]] : [])];
    const body = `
      <div class="crumbs"><a href="#/patterns">Recurring patterns</a></div>
      <h1>${esc(p.name)}</h1>
      <div class="tagline">Pattern · appears in ${plural(members.length, 'formula', 'formulas')} across ${plural(domains.length, 'field')}</div>
      <aside class="infobox">
        <div class="formula">${tex(p.latex, true)}</div>
        <table>
          <tr><th>Members</th><td>${fmt(members.length)}</td></tr>
          <tr><th>Fields</th><td>${domains.length}</td></tr>
          <tr><th>Pictures</th><td>${pics.length}</td></tr>
        </table>
      </aside>
      <p class="lead">${prose(p.intuition)}</p>
      <h3>Question to ask</h3><p class="callout">${prose(p.question)}</p>
      <h3>Common trap</h3><p class="callout">${prose(p.trap)}</p>
      <p class="muted small">A pattern is an organizing template, not a theorem applying to every member. Check each formula's own hypotheses.</p>
      ${h2('examples', 'Representative examples')}
      <ul class="rels">${p.examples.map(e => {
        const w = members.find(x => x.n.id === e);
        return `<li>${fLink(e)}${w ? ` <span class="x">— ${prose(w.why)}</span>` : ''}</li>`;
      }).join('')}</ul>
      ${h2('members', 'Members by field', members.length)}
      ${domains.map((d, i) => `<details${i < 2 ? ' open' : ''}><summary>${esc(d)}<span class="count">${byDomain.get(d).length}</span></summary>
        <ul class="rels">${byDomain.get(d).map(({ n, why }) => `<li>${fLink(n.id)} <span class="x">— ${prose(why)}</span></li>`).join('')}</ul></details>`).join('')}
      ${pics.length ? `${h2('pictures', 'Mental pictures', pics.length)}
        <ul class="rels">${pics.map(m => `<li>${mLink(m.id)} <span class="x">— ${prose(firstSentence(m.story))}</span></li>`).join('')}</ul>` : ''}`;
    page.innerHTML = article(sections, body);
    return p.name;
  }

  function metaphorPage(id) {
    const m = M.get(id);
    if (!m) return notFound();
    const sections = [['structure', 'Shared structure'], ['mapping', 'What maps to what', m.mappings.length], ['limits', 'Where it breaks'],
      ['question', 'Transfer question'], ['references', 'References', m.sources.length]];
    const body = `
      <div class="crumbs"><a href="#/metaphors">Mental pictures</a></div>
      <h1>${esc(m.title)}</h1>
      <div class="tagline">Mental picture · ${m.patterns.map(pLink).join(', ')}</div>
      <p class="lead">${prose(m.story)}</p>
      <p class="muted small">A teaching device: it maps a picture onto formulas, but does not establish an equivalence or a prerequisite.</p>
      ${h2('structure', 'Shared structure')}<p>${prose(m.structure)}</p>
      ${h2('mapping', 'What maps to what')}
      <table class="table"><thead><tr><th>Formula</th><th>Role in the picture</th><th>Statement</th></tr></thead><tbody>
      ${m.mappings.map(([f, role]) => { const n = F.get(f); return `<tr><td>${fLink(f)}<div class="muted small">${esc(n?.domain)}</div></td><td>${prose(role)}</td><td class="formula">${n ? tex(n.latex) : ''}</td></tr>`; }).join('')}
      </tbody></table>
      ${h2('limits', 'Where it breaks')}<p class="callout">${prose(m.limits)}</p>
      ${h2('question', 'Transfer question')}<p class="callout">${prose(m.question)}</p>
      ${h2('references', 'References')}${sourceList(m.sources)}`;
    page.innerHTML = article(sections, body);
    return m.title;
  }

  function fieldPage(d) {
    const nodes = A.nodes.filter(n => n.domain === d);
    if (!nodes.length) return notFound();
    const bySub = d3.group(nodes, n => n.subdomain);
    const subs = [...bySub.keys()].sort((a, b) => bySub.get(b).length - bySub.get(a).length);
    const cross = new Map();
    for (const n of nodes) for (const e of nbrs.get(n.id)) {
      const od = F.get(e.id).domain;
      if (od !== d) cross.set(od, (cross.get(od) || 0) + 1);
    }
    const crossSorted = [...cross].sort((a, b) => b[1] - a[1]);
    const slug = s => 'sub-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const sections = [...subs.map(s => [slug(s), s, bySub.get(s).length]), ['neighbors', 'Connected fields', crossSorted.length]];
    const body = `
      <div class="crumbs"><a href="#/fields">Fields</a> › ${esc(regionOf.get(d))}</div>
      <h1>${esc(d)}</h1>
      <div class="tagline">${plural(nodes.length, 'entry', 'entries')} in ${plural(subs.length, 'subfield')} · <a href="#/map/field/${encodeURIComponent(d)}">Show on map</a></div>
      ${subs.map(s => `${h2(slug(s), s, bySub.get(s).length)}
        <ul class="rels">${bySub.get(s).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name)).map(n =>
          `<li>${fLink(n.id)} <span class="muted small">${KIND[n.kind]} · ${LEVEL[n.level]}</span><br><span class="x">${prose(firstSentence(n.intuition))}</span></li>`).join('')}</ul>`).join('')}
      ${h2('neighbors', 'Connected fields')}
      <p class="muted small">Number of explained mathematical links between entries of ${esc(d)} and each other field.</p>
      <ul class="plain cols">${crossSorted.map(([od, c]) => `<li>${dLink(od)} <span class="count">${c}</span></li>`).join('')}</ul>`;
    page.innerHTML = article(sections, body);
    return d;
  }

  function fieldsIndex() {
    page.innerHTML = `<div class="wrap"><article style="max-width:900px">
      <h1>Fields</h1><div class="tagline">${A.regions.reduce((s, r) => s + r.domains.length, 0)} fields in ${A.regions.length} regions. Every entry has one primary field; links carry the overlaps.</div>
      ${A.regions.map(r => `<h2>${esc(r.name)}</h2><table class="table"><thead><tr><th>Field</th><th>Subfields</th><th style="text-align:right">Entries</th></tr></thead><tbody>
        ${r.domains.map(d => {
          const subs = [...new Set(A.nodes.filter(n => n.domain === d).map(n => n.subdomain))];
          return `<tr><td style="white-space:nowrap">${dLink(d)}</td><td class="muted small">${esc(subs.join(' · '))}</td><td class="num">${A.domains[d].count}</td></tr>`;
        }).join('')}</tbody></table>`).join('')}
    </article></div>`;
    return 'Fields';
  }

  function patternsIndex() {
    const rows = [...A.patterns].sort((a, b) => membersOf.get(b.id).length - membersOf.get(a.id).length);
    page.innerHTML = `<div class="wrap"><article style="max-width:1000px">
      <h1>Recurring patterns</h1>
      <div class="tagline">${A.patterns.length} structures that recur across fields. Sharing a pattern is a classification, not an equivalence.</div>
      <table class="table"><thead><tr><th>Pattern</th><th>Archetype</th><th>Question to ask</th><th style="text-align:right">Members</th></tr></thead><tbody>
      ${rows.map(p => `<tr><td style="white-space:nowrap">${pLink(p.id)}</td><td class="formula">${tex(p.latex)}</td><td class="muted">${prose(p.question)}</td><td class="num">${membersOf.get(p.id).length}</td></tr>`).join('')}
      </tbody></table></article></div>`;
    return 'Patterns';
  }

  function metaphorsIndex() {
    const rows = [...A.metaphors].sort((a, b) => a.title.localeCompare(b.title));
    page.innerHTML = `<div class="wrap"><article style="max-width:900px">
      <h1>Mental pictures</h1>
      <div class="tagline">${A.metaphors.length} teaching metaphors, each with explicit formula mappings and stated limits.</div>
      <ul class="rels">${rows.map(m => `<li>${mLink(m.id)} <span class="muted small">· ${m.patterns.map(p => esc(P.get(p)?.name || p)).join(', ')}</span><br><span class="x">${prose(firstSentence(m.story))}</span></li>`).join('')}</ul>
    </article></div>`;
    return 'Mental pictures';
  }

  function home() {
    const start = [
      ['arithmetic-mean', 'Begin with the plain average.'],
      ['mean-as-minimizer', 'The same mean, seen as the point minimizing squared error.'],
      ['mean-as-projection', 'And again as an orthogonal projection.'],
      ['weighted-mean', 'Generalize: let points carry different weights.'],
      ['expectation', 'Generalize again: average over a probability distribution.'],
      ['least-squares', 'Compare: fitting a line is the same projection idea.'],
    ].filter(([id]) => F.has(id));
    const featured = A.metaphors[Math.floor(Date.now() / 864e5) % A.metaphors.length];
    page.innerHTML = `<div class="wrap home">
      <section class="hero">
        <h1>Mathematics Atlas</h1>
        <p>A map of ${fmt(A.nodes.length)} formulas, definitions and theorems — from foundations to graduate level — joined by explained relationships, recurring patterns and mental pictures.</p>
        <div class="stats">
          <span><b>${fmt(A.nodes.length)}</b>entries</span>
          <span><b>${fmt(A.links.length)}</b>explained links</span>
          <span><b>${A.patterns.length}</b>patterns</span>
          <span><b>${A.metaphors.length}</b>mental pictures</span>
          <span><b>${Object.keys(A.domains).length}</b>fields</span>
        </div>
      </section>
      <div class="home-grid">
        <div>
          <a class="preview" href="#/map"><canvas></canvas><span>Open the map →</span></a>
          <h2>Fields</h2>
          ${A.regions.map(r => `<div class="region"><h3>${esc(r.name)}</h3><ul>${r.domains.map(d => `<li>${dLink(d)}<span class="n">${A.domains[d].count}</span></li>`).join('')}</ul></div>`).join('')}
          <h2>Recurring patterns</h2>
          <ul class="plain cols">${[...A.patterns].sort((a, b) => a.name.localeCompare(b.name)).map(p => `<li>${pLink(p.id)} <span class="count">${membersOf.get(p.id).length}</span></li>`).join('')}</ul>
        </div>
        <aside>
          <h2>Start here</h2>
          <ol class="path">${start.map(([id, x]) => `<li>${fLink(id)}<span class="x">${esc(x)}</span></li>`).join('')}</ol>
          <h2>Mental picture of the day</h2>
          <div class="card"><h3>${mLink(featured.id)}</h3><p>${prose(featured.story)}</p>
            <p class="small">Maps onto ${featured.mappings.map(([f]) => fLink(f)).join(', ')}.</p></div>
          <h2>How to read a link</h2>
          <ul class="plain small">
            <li class="rel-h">${swatch('generalization')} Generalization — simpler → more general</li>
            <li class="rel-h">${swatch('derivation')} Derivation — tool → consequence</li>
            <li class="rel-h">${swatch('application')} Application — idea → use</li>
            <li class="rel-h">${swatch('equivalence')} Equivalence — same content</li>
            <li class="rel-h">${swatch('analogy')} Analogy — parallel structure</li>
            <li class="rel-h">${swatch('duality')} Duality — mirror statement</li>
          </ul>
        </aside>
      </div></div>`;
    const canvas = page.querySelector('.preview canvas');
    const draw = () => {
      if (!canvas.isConnected) return;
      const { ctx, w, h } = sizeCanvas(canvas);
      drawAtlas(ctx, w, h, fitTransform(w, h, 16), { fieldLabels: false });
    };
    draw();
    redraw = draw;
    return '';
  }

  function notFound() {
    page.innerHTML = `<div class="wrap"><article><h1>Not found</h1><p>No entry with that name. Try the search box above.</p></article></div>`;
    return 'Not found';
  }

  /* ---------- map ---------- */
  let redraw = null;
  const worldBounds = (() => {
    const xs = A.nodes.map(n => n.x), ys = A.nodes.map(n => n.y);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  })();
  const degreeOf = new Map(A.nodes.map(n => [n.id, nbrs.get(n.id).length]));
  const quad = d3.quadtree(A.nodes, n => n.x, n => n.y);
  // padded convex hull per field, drawn as a smooth blob
  const fieldHulls = Object.entries(A.domains).map(([d, v]) => {
    const hull = d3.polygonHull(A.nodes.filter(n => n.domain === d).map(n => [n.x, n.y]));
    return [d, hull.map(([x, y]) => {
      const dx = x - v.x, dy = y - v.y, len = Math.hypot(dx, dy) || 1;
      return [x + dx / len * 12, y + dy / len * 12];
    })];
  });

  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function fitTransform(w, h, pad, b = worldBounds) {
    const k = Math.min((w - pad * 2) / (b.x1 - b.x0 || 1), (h - pad * 2) / (b.y1 - b.y0 || 1));
    return d3.zoomIdentity.translate(w / 2 - k * (b.x0 + b.x1) / 2, h / 2 - k * (b.y0 + b.y1) / 2).scale(k);
  }

  const REL_TOKEN = { generalization: '--rel-gen', derivation: '--rel-der', application: '--rel-app', equivalence: '--ink', analogy: '--ink-2', duality: '--ink-2' };
  const REL_DASH = { analogy: [5, 4], duality: [1, 3.5] };

  function drawAtlas(ctx, w, h, t, st = {}) {
    const c = { land: css('--map-land'), landOn: css('--map-land-on'), bg: css('--bg'), ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), node: css('--map-node'), edge: css('--map-edge'), accent: css('--accent') };
    const sans = css('--sans');
    const X = n => t.x + t.k * n.x, Y = n => t.y + t.k * n.y;
    const zoom = t.k / (st.k0 || t.k);
    const sel = st.sel ? F.get(st.sel) : null;
    const field = st.field || null;
    const lit = new Set();
    if (sel) { lit.add(sel.id); for (const e of nbrs.get(sel.id)) lit.add(e.id); }

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, w, h);

    // each field as a faint rounded "continent" behind its entries
    const blob = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.5)).context(ctx);
    for (const [d, hull] of fieldHulls) {
      ctx.fillStyle = field === d ? c.landOn : c.land;
      ctx.beginPath();
      blob(hull.map(([x, y]) => [t.x + t.k * x, t.y + t.k * y]));
      ctx.fill();
    }

    // all links, as one faint hairline layer
    ctx.globalAlpha = sel || field ? 0.5 : 1;
    ctx.strokeStyle = c.edge;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [s, tg] of A.links) {
      const a = F.get(s), b = F.get(tg);
      ctx.moveTo(X(a), Y(a));
      ctx.lineTo(X(b), Y(b));
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // links of the selection, coloured by relation
    if (sel) {
      ctx.lineWidth = 1.6;
      for (const e of nbrs.get(sel.id)) {
        const b = F.get(e.id);
        ctx.strokeStyle = css(REL_TOKEN[e.rel]);
        ctx.setLineDash(REL_DASH[e.rel] || []);
        ctx.beginPath();
        ctx.moveTo(X(sel), Y(sel));
        ctx.lineTo(X(b), Y(b));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // nodes
    const rOf = n => (1.1 + 0.32 * Math.sqrt(degreeOf.get(n.id))) * Math.min(Math.sqrt(zoom), 3.2);
    for (const n of A.nodes) {
      const dim = (sel && !lit.has(n.id)) || (field && n.domain !== field);
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.fillStyle = sel && lit.has(n.id) ? c.ink : field && n.domain === field ? c.ink : c.node;
      ctx.beginPath();
      ctx.arc(X(n), Y(n), rOf(n), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const occupied = [];
    const free = (x, y, wd, ht) => !occupied.some(r => x < r[0] + r[2] && x + wd > r[0] && y < r[1] + r[3] && y + ht > r[1]);
    const label = (text, x, y, font, color, force) => {
      ctx.font = font;
      const tw = ctx.measureText(text).width;
      const bx = x - tw / 2 - 3, by = y - 11, bw = tw + 6, bh = 15;
      if (!force && !free(bx, by, bw, bh)) return null;
      occupied.push([bx, by, bw, bh]);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = c.bg;
      ctx.lineJoin = 'round';
      ctx.textAlign = 'center';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
      return [bx, by, bw, bh];
    };

    // field labels, fading as you zoom in (drawn faint underneath when something is selected)
    st.fieldRects = [];
    if (st.fieldLabels !== false) {
      const a = Math.max(0, Math.min(1, 1.6 - zoom * 0.25)) * (sel ? 0.35 : 1);
      if (a > 0.05) {
        ctx.globalAlpha = a;
        for (const [d, v] of Object.entries(A.domains)) {
          const on = field === d;
          ctx.font = `600 ${on ? 12 : 10.5}px ${sans}`;
          const x = t.x + t.k * v.x, y = t.y + t.k * v.y;
          const tw = ctx.measureText(d.toUpperCase()).width;
          const r = [x - tw / 2 - 3, y - 11, tw + 6, 15];
          ctx.lineWidth = 3.5; ctx.strokeStyle = c.bg; ctx.lineJoin = 'round'; ctx.textAlign = 'center';
          ctx.strokeText(d.toUpperCase(), x, y);
          ctx.fillStyle = on ? c.ink : c.muted;
          ctx.fillText(d.toUpperCase(), x, y);
          if (!sel) occupied.push(r);
          st.fieldRects.push([d, r]);
        }
        ctx.globalAlpha = 1;
      }
    }

    // highlighted node labels
    if (sel) {
      ctx.fillStyle = c.accent;
      ctx.beginPath();
      ctx.arc(X(sel), Y(sel), rOf(sel) + 2.5, 0, Math.PI * 2);
      ctx.fill();
      label(sel.name, X(sel), Y(sel) - rOf(sel) - 7, `600 13px ${sans}`, c.ink, true);
      const ns = [...lit].filter(id => id !== sel.id).map(id => F.get(id)).sort((a, b) => degreeOf.get(b.id) - degreeOf.get(a.id));
      for (const n of ns) label(n.name, X(n), Y(n) - rOf(n) - 5, `11.5px ${sans}`, c.ink2);
    }
    if (st.hover && st.hover !== st.sel) {
      const n = F.get(st.hover);
      ctx.strokeStyle = c.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(X(n), Y(n), rOf(n) + 3, 0, Math.PI * 2);
      ctx.stroke();
      label(n.name, X(n), Y(n) - rOf(n) - 7, `600 12px ${sans}`, c.ink, true);
    }

    // ordinary node labels once zoomed in
    if (zoom > 1.8) {
      const budget = Math.round(30 * zoom);
      const pool = (sel ? [] : A.nodes)
        .filter(n => X(n) > -50 && X(n) < w + 50 && Y(n) > -20 && Y(n) < h + 20)
        .sort((a, b) => degreeOf.get(b.id) - degreeOf.get(a.id))
        .slice(0, budget * 3);
      let placed = 0;
      for (const n of pool) {
        if (placed >= budget) break;
        if (field && n.domain !== field) continue;
        if (label(n.name, X(n), Y(n) - rOf(n) - 5, `11px ${sans}`, c.ink2)) placed++;
      }
    }
  }

  let mapState = null;

  function mapPage(arg) {
    const mounted = mapState && mapState.canvas.isConnected;
    if (!mounted) mountMap();
    const [a, b] = arg ? arg.split('/') : [];
    if (a === 'field') mapState.focusField(decodeURIComponent(b || ''));
    else mapState.select(F.has(a) ? a : null, !mounted);
    return 'Map';
  }

  function mountMap() {
    page.innerHTML = `<div class="map"><canvas></canvas>
      <div class="map-legend">${['generalization', 'derivation', 'application', 'equivalence', 'analogy', 'duality'].map(r => `<span>${swatch(r)}${r[0].toUpperCase() + r.slice(1)}</span>`).join('')}</div>
      <div class="map-hint">Scroll to zoom · drag to pan · click a dot or a field name</div>
      <aside class="map-panel" hidden>
        <div class="grip" title="Drag to resize"></div>
        <div class="panel-tools">
          <button class="icon-btn expand" type="button" aria-label="Widen panel" title="Widen panel"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6 3 12l6 6M15 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>
          <button class="icon-btn close" type="button" aria-label="Close" title="Close">✕</button>
        </div>
        <div class="panel-body"></div>
      </aside></div>`;
    const canvas = page.querySelector('.map canvas');
    const panel = page.querySelector('.map-panel');
    const legend = page.querySelector('.map-legend');
    const panelBody = panel.querySelector('.panel-body');
    const expandBtn = panel.querySelector('.expand');
    let w, h, ctx, t, k0;
    const st = { k0: 1 };

    const draw = () => drawAtlas(ctx, w, h, t, st);
    const resize = () => {
      ({ ctx, w, h } = sizeCanvas(canvas));
      const t0 = fitTransform(w, h, 40);
      k0 = t0.k;
      st.k0 = k0;
      if (!t) t = t0;
      zoom.scaleExtent([k0 * 0.6, k0 * 30]);
      draw();
    };
    const zoom = d3.zoom().on('zoom', e => { t = e.transform; draw(); });
    const sel = d3.select(canvas).call(zoom).on('dblclick.zoom', null);
    resize();
    sel.call(zoom.transform, t);

    const pick = ev => {
      const [mx, my] = d3.pointer(ev, canvas);
      const n = quad.find((mx - t.x) / t.k, (my - t.y) / t.k, 12 / t.k);
      return { n, mx, my };
    };
    const fieldAt = (mx, my) => (st.fieldRects || []).find(([, r]) => r && mx >= r[0] && mx <= r[0] + r[2] && my >= r[1] && my <= r[1] + r[3]);

    canvas.addEventListener('mousemove', ev => {
      const { n, mx, my } = pick(ev);
      const f = !n && fieldAt(mx, my);
      canvas.style.cursor = n || f ? 'pointer' : '';
      const id = n ? n.id : null;
      if (id !== st.hover) { st.hover = id; draw(); }
    });
    canvas.addEventListener('mouseleave', () => { st.hover = null; draw(); });
    canvas.addEventListener('click', ev => {
      const { n, mx, my } = pick(ev);
      if (n) return go(`#/map/${n.id}`);
      const f = fieldAt(mx, my);
      if (f) return go(`#/map/field/${encodeURIComponent(f[0])}`);
      go('#/map');
    });
    const go = h => { if (location.hash !== h) location.hash = h; else route(); };

    const flyTo = (x, y, k) => {
      sel.transition().duration(650).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * x - (panel.hidden ? 0 : 180), h / 2 - k * y).scale(k));
    };
    // frame a set of entries, leaving room for the side panel
    const flyToFit = ids => {
      const pts = ids.map(i => F.get(i));
      const x0 = d3.min(pts, n => n.x), x1 = d3.max(pts, n => n.x), y0 = d3.min(pts, n => n.y), y1 = d3.max(pts, n => n.y);
      const avail = w - (panel.hidden || w < 720 ? 0 : panel.offsetWidth + 24);
      const k = Math.max(k0, Math.min(k0 * 6, (avail - 120) / (x1 - x0 + 1), (h - 120) / (y1 - y0 + 1)));
      sel.transition().duration(650).call(zoom.transform,
        d3.zoomIdentity.translate(avail / 2 - k * (x0 + x1) / 2, h / 2 - k * (y0 + y1) / 2).scale(k));
    };

    const renderPanel = n => {
      const groups = connectionGroups(n.id);
      panel.hidden = false;
      legend.hidden = false;
      panelBody.innerHTML = `<div class="crumbs">${dLink(n.domain)} › ${esc(n.subdomain)}</div>
        <h2>${esc(n.name)}</h2>
        <div class="muted small">${KIND[n.kind]} · ${LEVEL[n.level]}</div>
        <div class="formula">${tex(n.latex, true)}</div>
        <p>${prose(n.intuition)}</p>
        <p><a href="#/f/${n.id}">Read the full entry →</a></p>
        ${groups.map(g => `<h3 class="rel-h">${swatch(g.def.rel)}${esc(g.def.label)}</h3>
          <ul class="plain">${g.items.map(e => `<li><a data-sel="${e.id}">${esc(F.get(e.id).name)}</a></li>`).join('')}</ul>`).join('')
        || '<p class="muted">No explained mathematical links yet.</p>'}`;
      panelBody.querySelectorAll('[data-sel]').forEach(a => a.onclick = () => go(`#/map/${a.dataset.sel}`));
    };
    panel.querySelector('.close').onclick = () => go('#/map');

    // Panel width: drag the left edge, or toggle wide with the expand button. Remembered per browser.
    const PANEL_MIN = 320, PANEL_DEFAULT = 480;
    const wideWidth = () => Math.max(PANEL_DEFAULT + 1, Math.round(w * 0.6));
    const refit = () => { if (st.sel) flyToFit([st.sel, ...nbrs.get(st.sel).map(e => e.id)]); };
    const setPanelWidth = (px, save) => {
      px = Math.round(Math.max(PANEL_MIN, Math.min(px, w - 120)));
      panel.style.width = px + 'px';
      expandBtn.setAttribute('aria-pressed', String(px > PANEL_DEFAULT));
      if (save) try { localStorage.setItem('atlas-panel-width', px); } catch { /* storage unavailable */ }
    };
    let stored = null;
    try { stored = Number(localStorage.getItem('atlas-panel-width')) || null; } catch { /* storage unavailable */ }
    setPanelWidth(stored || PANEL_DEFAULT);
    expandBtn.onclick = () => {
      setPanelWidth(panel.offsetWidth > PANEL_DEFAULT ? PANEL_DEFAULT : wideWidth(), true);
      refit();
    };
    const grip = panel.querySelector('.grip');
    grip.addEventListener('pointerdown', e => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const right = panel.getBoundingClientRect().right;
      const move = ev => setPanelWidth(right - ev.clientX);
      const up = () => {
        grip.removeEventListener('pointermove', move);
        setPanelWidth(panel.offsetWidth, true);
        refit();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up, { once: true });
    });

    mapState = {
      canvas,
      select(id, initial) {
        st.sel = id;
        st.field = null;
        if (id) {
          const n = F.get(id);
          renderPanel(n);
          flyToFit([id, ...nbrs.get(id).map(e => e.id)]);
        } else {
          panel.hidden = true;
          draw();
        }
        if (initial && !id) sel.call(zoom.transform, fitTransform(w, h, 40));
      },
      focusField(d) {
        if (!A.domains[d]) return mapState.select(null);
        st.sel = null;
        st.field = d;
        panel.hidden = true;
        const v = A.domains[d];
        flyTo(v.x, v.y, Math.min(k0 * 30, Math.min(w, h) / (v.r * 2.6)));
      },
    };
    redraw = () => { if (canvas.isConnected) resize(); };
  }

  /* ---------- search ---------- */
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const index = [
    ...A.nodes.map(n => ({ label: n.name, hay: norm(`${n.name} ${n.id.replace(/-/g, ' ')}`), extra: norm(`${n.domain} ${n.subdomain}`), kind: n.domain, href: `#/f/${n.id}`, boost: 0 })),
    ...A.patterns.map(p => ({ label: p.name, hay: norm(p.name), extra: '', kind: 'Pattern', href: `#/p/${p.id}`, boost: 6 })),
    ...A.metaphors.map(m => ({ label: m.title, hay: norm(m.title), extra: '', kind: 'Mental picture', href: `#/m/${m.id}`, boost: 0 })),
    ...Object.keys(A.domains).map(d => ({ label: d, hay: norm(d), extra: '', kind: 'Field', href: `#/field/${encodeURIComponent(d)}`, boost: 8 })),
  ];
  function search(q) {
    q = norm(q.trim());
    if (!q) return [];
    const toks = q.split(/\s+/);
    const out = [];
    for (const it of index) {
      let s = 0;
      if (it.hay === q) s = 100;
      else if (it.hay.startsWith(q)) s = 80;
      else if (it.hay.includes(' ' + q)) s = 60;
      else if (it.hay.includes(q)) s = 40;
      else if (toks.every(tk => it.hay.includes(tk) || it.extra.includes(tk))) s = 20;
      if (s) out.push([s + it.boost - it.label.length / 100, it]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 12).map(x => x[1]);
  }

  const q = document.getElementById('q');
  const results = document.getElementById('results');
  let hits = [], cur = -1;
  const renderResults = () => {
    results.hidden = !q.value.trim();
    q.parentElement.setAttribute('aria-expanded', String(!results.hidden));
    results.innerHTML = hits.length
      ? hits.map((h, i) => `<li role="option"${i === cur ? ' class="sel"' : ''}><a href="${h.href}"><span>${esc(h.label)}</span><span class="r-kind">${esc(h.kind)}</span></a></li>`).join('')
      : '<li class="empty">No matches</li>';
  };
  const closeSearch = () => { results.hidden = true; q.blur(); };
  q.addEventListener('input', () => { hits = search(q.value); cur = hits.length ? 0 : -1; renderResults(); });
  q.addEventListener('focus', () => { if (q.value.trim()) renderResults(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { cur = Math.min(cur + 1, hits.length - 1); renderResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { cur = Math.max(cur - 1, 0); renderResults(); e.preventDefault(); }
    else if (e.key === 'Enter' && hits[cur]) { location.hash = hits[cur].href; q.value = ''; closeSearch(); }
    else if (e.key === 'Escape') closeSearch();
  });
  results.addEventListener('mousedown', e => { if (e.target.closest('a')) { q.value = ''; setTimeout(closeSearch); } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) results.hidden = true; });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== q && !e.target.closest('input, textarea')) { e.preventDefault(); q.focus(); }
  });

  /* ---------- theme ---------- */
  document.getElementById('theme').addEventListener('click', () => {
    const dark = css('--bg') !== '#ffffff';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('atlas-theme', next); } catch { /* storage unavailable */ }
    if (redraw) redraw();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => redraw && redraw());
  window.addEventListener('resize', () => redraw && redraw());

  /* ---------- router ---------- */
  page.addEventListener('click', e => {
    const a = e.target.closest('[data-to]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.to)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function route() {
    hideTip();
    const [kind = '', ...rest] = location.hash.replace(/^#\/?/, '').split('/');
    const arg = decodeURIComponent(rest.join('/'));
    const isMap = kind === 'map';
    document.body.classList.toggle('is-map', isMap);
    document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + (kind === 'field' ? 'fields' : kind === 'p' ? 'patterns' : kind === 'm' ? 'metaphors' : kind)));
    if (!isMap) { mapState = null; redraw = null; }
    const title = {
      '': home, f: () => formulaPage(arg), p: () => patternPage(arg), m: () => metaphorPage(arg), field: () => fieldPage(arg),
      fields: fieldsIndex, patterns: patternsIndex, metaphors: metaphorsIndex, map: () => mapPage(rest.join('/')),
    }[kind]?.() ?? notFound();
    document.title = title ? `${title} — Mathematics Atlas` : 'Mathematics Atlas';
    if (!isMap) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  route();
})();
