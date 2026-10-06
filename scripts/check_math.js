// Check inline maths in every prose field of data/atlas.json, plus the display formulas.
// Fails on an unmatched "$" or on any span KaTeX cannot parse. Run with:  npm run check-math
import { readFileSync } from 'node:fs';
import katex from 'katex';

const atlas = JSON.parse(readFileSync(new URL('../data/atlas.json', import.meta.url)));
const problems = [];

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
  for (const e of atlas.edges) yield [`edge ${e.id} (${e.source} -> ${e.target})`, e.explanation];
}

const parse = (where, tex, displayMode) => {
  try { katex.renderToString(tex, { throwOnError: true, strict: 'error', displayMode }); }
  catch (err) { problems.push(`${where}: ${err.message.replace(/^KaTeX parse error: /, '')}\n    ${tex}`); }
};

let spans = 0;
for (const [where, text] of proseFields()) {
  const parts = text.split('$');
  if (parts.length % 2 === 0) { problems.push(`${where}: unmatched $\n    ${text}`); continue; }
  for (let i = 1; i < parts.length; i += 2) { spans++; parse(where, parts[i], false); }
}
for (const n of [...atlas.nodes, ...atlas.patterns]) parse(`${n.id}.latex`, n.latex, true);

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${spans} inline spans and ${atlas.nodes.length + atlas.patterns.length} display formulas parse`);
