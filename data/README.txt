MATHEMATICS ATLAS — DATABASE AND LEARNING GUIDE
Version 2.0, 6 October 2026

CONTENTS
1484 formula / definition / theorem / method / model entries
31 recurring pattern hubs
160 metaphors with explicit concept mappings, structure and limits
9364 explained links (mathematical relationships, prerequisites, pattern memberships and teaching metaphors)
393 source references

FORMATS
atlas.json — complete structured dataset, including methodology
mathematics-atlas.xlsx — filterable workbook with nine sheets
mathematics-atlas.sqlite — relational database, with indexes and foreign keys
mathematics-atlas.graphml — network export for graph software
formulas.csv, patterns.csv, connections.csv, pattern-membership.csv,
prerequisites.csv, sources.csv, metaphors.csv, metaphor-mappings.csv — UTF-8 tabular exports
validation.json — structural, notation and learning-logic check results

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
7. Mark what you can explain, derive or use comfortably in the explorer.
8. Inspect missing prerequisites before choosing the next topic.

RELATION DIRECTIONS
generalization: source is simpler, target more general
derivation: source is a tool, target a consequence
application: source idea is used in target
prerequisite: source is suggested background for target
pattern: source formula expresses target pattern
metaphor: formula and mental-picture hub are linked by an explicit teaching mapping
equivalence, analogy, duality: explored symmetrically; read the explanation

SQL EXAMPLES
Find formulas connected to averaging:
SELECT i.name, i.domain, p.explanation
FROM pattern_membership p JOIN ideas i ON i.id=p.formula_id
WHERE p.pattern_id='averaging' ORDER BY i.domain,i.name;

Find explicit cross-field mathematical connections:
SELECT a.name, c.relation, b.name, c.explanation
FROM connections c
JOIN ideas a ON a.id=c.source_id JOIN ideas b ON b.id=c.target_id
WHERE a.domain<>b.domain AND c.relation NOT IN ('pattern','prerequisite','metaphor')
AND a.kind NOT IN ('pattern','metaphor') AND b.kind NOT IN ('pattern','metaphor');

Find mental pictures involving the arithmetic mean:
SELECT i.name, m.story, x.role, m.limits
FROM metaphor_mappings x JOIN metaphors m ON m.id=x.metaphor_id
JOIN ideas i ON i.id=m.id WHERE x.formula_id='arithmetic-mean';

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

PERSONAL PROGRESS
No personal learning data is included in these exports. The online explorer
saves progress for the signed-in user. A 'comfortable' mark is self-reported,
not an assessment or certification.

DATA DICTIONARY
ideas: id, name, latex, domain, subdomain, level, kind, intuition, conditions, example
patterns: id (references ideas), question, distinction
connections: id, source_id, target_id, relation, explanation
pattern_membership: formula_id, pattern_id, explanation
prerequisites: prerequisite_id, target_id
sources: id, title, url, kind, note
formula_sources: formula_id, source_id
metaphors: id (references ideas), story, structure, limits, question
metaphor_mappings: metaphor_id, formula_id, role
metaphor_patterns: metaphor_id, pattern_id
metaphor_sources: metaphor_id, source_id
metadata: key, value (JSON)
formulas is a view of ideas excluding pattern and metaphor hubs.
level: 0 pattern or metaphor hub, 1 foundations, 2 undergraduate, 3 advanced undergraduate,
4 graduate. Each formula has one primary domain; cross-links carry overlaps.
