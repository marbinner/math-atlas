// Check data/atlas.json: every reference resolves, links are well formed and not duplicated,
// every $...$ span in prose and every display formula parses in KaTeX (strict). Run with:  npm run check
import { readFileSync } from 'node:fs';
import katex from 'katex';

const atlas = JSON.parse(readFileSync(new URL('../data/atlas.json', import.meta.url)));
const problems = [];
const fail = msg => problems.push(msg);

/* ---------- structure ---------- */
const RELATIONS = new Set(['generalization', 'derivation', 'application', 'equivalence', 'analogy', 'duality']);
const SYMMETRIC = new Set(['equivalence', 'analogy', 'duality']);
const ids = new Map();
for (const [kind, list] of [['node', atlas.nodes], ['pattern', atlas.patterns], ['metaphor', atlas.metaphors], ['source', atlas.sources]])
  for (const x of list) ids.has(x.id) ? fail(`duplicate id ${x.id}`) : ids.set(x.id, kind);
const is = (id, kind) => ids.get(id) === kind;
const used = new Set();
const refs = (where, list, kind) => {
  if (new Set(list).size !== list.length) fail(`${where}: repeated ${kind}`);
  for (const r of list) { if (!is(r, kind)) fail(`${where}: unknown ${kind} ${r}`); used.add(r); }
};

for (const n of atlas.nodes) {
  refs(`${n.id}.patterns`, n.patterns.map(p => p.id), 'pattern');
  if (n.patterns.length < 2 || n.patterns.length > 3) fail(`${n.id}: has ${n.patterns.length} patterns (expected 2-3)`);
  refs(`${n.id}.prerequisites`, n.prerequisites, 'node');
  refs(`${n.id}.sources`, n.sources, 'source');
}
for (const p of atlas.patterns) {
  refs(`${p.id}.examples`, p.examples, 'node');
  for (const e of p.examples) if (is(e, 'node') && !atlas.nodes.find(n => n.id === e).patterns.some(x => x.id === p.id))
    fail(`${p.id}.examples: ${e} is not a member of the pattern`);
}
for (const m of atlas.metaphors) {
  refs(`${m.id}.mappings`, m.mappings.map(x => x.formula), 'node');
  refs(`${m.id}.patterns`, m.patterns, 'pattern');
  refs(`${m.id}.sources`, m.sources, 'source');
}
const seen = new Set();
for (const e of atlas.edges) {
  const w = `link ${e.source} -${e.type}-> ${e.target}`;
  if (!RELATIONS.has(e.type)) fail(`${w}: unknown relation`);
  if (!is(e.source, 'node') || !is(e.target, 'node')) fail(`${w}: unknown entry`);
  if (e.source === e.target) fail(`${w}: links an entry to itself`);
  const k = SYMMETRIC.has(e.type) ? [e.type, ...[e.source, e.target].sort()].join('|') : [e.type, e.source, e.target].join('|');
  seen.has(k) ? fail(`${w}: duplicate`) : seen.add(k);
}
for (const s of atlas.sources) if (!used.has(s.id)) fail(`source ${s.id} is never referenced`);

/* ---------- maths ---------- */
function* proseFields() {
  for (const n of atlas.nodes) {
    for (const k of ['intuition', 'conditions', 'example']) yield [`${n.id}.${k}`, n[k]];
    for (const p of n.patterns) yield [`${n.id}.patterns.${p.id}`, p.why];
  }
  for (const p of atlas.patterns) for (const k of ['intuition', 'question', 'trap']) yield [`${p.id}.${k}`, p[k]];
  for (const m of atlas.metaphors) {
    for (const k of ['story', 'structure', 'limits', 'question']) yield [`${m.id}.${k}`, m[k]];
    for (const x of m.mappings) yield [`${m.id}.mappings.${x.formula}`, x.role];
  }
  for (const e of atlas.edges) yield [`link ${e.source} -${e.type}-> ${e.target}`, e.explanation];
}
const parse = (where, tex, displayMode) => {
  try { katex.renderToString(tex, { throwOnError: true, strict: 'error', displayMode }); }
  catch (err) { fail(`${where}: ${err.message.replace(/^KaTeX parse error: /, '')}\n    ${tex}`); }
};
let spans = 0;
for (const [where, text] of proseFields()) {
  const parts = text.split('$');
  if (parts.length % 2 === 0) { fail(`${where}: unmatched $\n    ${text}`); continue; }
  for (let i = 1; i < parts.length; i += 2) { spans++; parse(where, parts[i], false); }
}
for (const n of [...atlas.nodes, ...atlas.patterns]) parse(`${n.id}.latex`, n.latex, true);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${atlas.nodes.length} entries, ${atlas.edges.length} links, ${atlas.patterns.length} patterns, `
  + `${atlas.metaphors.length} pictures; ${spans} inline maths spans and ${atlas.nodes.length + atlas.patterns.length} formulas parse`);
