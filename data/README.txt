MATHEMATICS ATLAS — DATASET AND LEARNING GUIDE
Version 2.1, 7 October 2026

CONTENTS
1484 formula / definition / theorem / method / model entries
31 recurring pattern hubs
160 metaphors with explicit concept mappings, structure and limits
9364 explained links (mathematical relationships, prerequisites, pattern memberships and teaching metaphors)
393 source references

atlas.json is the complete dataset. The explorer in site/ is generated from it
by scripts/build.py.

SCHEMA (atlas.json)
meta: title, version, created, updated, scope, counts, methodology
nodes: id, name, latex, domain, subdomain, level, kind, intuition, conditions,
  example, patterns [{id, why}], prerequisites [node ids], sources [source ids]
patterns: id, name, latex, intuition, question, trap, examples [node ids]
  (plus domain, subdomain, level, kind, conditions and example, as for nodes)
metaphors: id, title, story, structure, limits, question,
  mappings [{formula, role}], patterns [pattern ids], sources [source ids]
edges: id, source, target, type, explanation
sources: id, title, url, kind, note
Edge ids are "e-" plus the first 16 hex digits of sha256("source|target|type").
Edges of type pattern, metaphor and prerequisite duplicate node.patterns,
metaphor.mappings and node.prerequisites; keep them in sync.
Prose fields may contain inline LaTeX between $...$.
level: 0 pattern or metaphor hub, 1 foundations, 2 undergraduate, 3 advanced
undergraduate, 4 graduate. Each formula has one primary domain; cross-links
carry overlaps.

START WITH ARITHMETIC MEAN
Search arithmetic-mean. Follow its exact equivalence to mean-as-minimizer
and mean-as-projection. Follow the generalizations to weighted-mean,
expectation and integral-mean. Compare centroid and least-squares.
This reveals one family through total preservation, balance, squared-error
minimization and orthogonal projection.

HOW TO CHUNK A TOPIC
1. Read the formula and its hypotheses.
2. State the invariant or operation in plain language.
3. Inspect its pattern memberships and each specific explanation.
4. Compare one other field that uses the pattern.
5. Separate an equivalence from a generalization or analogy.
6. Open a metaphor, inspect its mappings, and identify where it stops applying.
7. Note what you can explain, derive or use comfortably.
8. Inspect missing prerequisites before choosing the next topic.

RELATION DIRECTIONS
generalization: source is simpler, target more general
derivation: source is a tool, target a consequence
application: source idea is used in target
prerequisite: source is suggested background for target
pattern: source formula expresses target pattern
metaphor: formula and mental-picture hub are linked by an explicit teaching mapping
equivalence, analogy, duality: explored symmetrically; read the explanation

MEANING OF 'IMPORTANT'
Selection favors reusable structures and bridge concepts. There is no claim
that this list exhausts mathematics or ranks formulas universally. Counts,
degrees and pattern prevalence describe this atlas, not mathematics as a whole.

SOURCES AND LIMITS
All explanations are original synthesis; no textbook passages are reproduced.
References range from exact result pages to relevant textbooks and courses.
Entries are a guide to study, not a formally verified theorem library.
Conditions are concise; consult the reference before specialized use.
Prerequisites are an editorial scaffold and may omit background or alternative
learning routes. A route in the graph is a sequence of explained relationships,
not automatically a proof of a new connection between its endpoints.
