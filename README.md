# Mathematics Atlas

A Wikipedia-style explorer for a curated atlas of mathematical formulas, their explained relationships, recurring patterns and teaching metaphors.

## Layout

- `data/` — the source dataset (`atlas.json` is the canonical file; the other formats are exports of it).
- `scripts/build.py` — turns `data/atlas.json` into `site/data.js` and precomputes the map layout.
- `scripts/check_math.js` — checks that every formula and every `$...$` inline-maths span parses in KaTeX.
- `site/` — the static site: `index.html`, `style.css`, `app.js` and the generated `data.js`.

## Build and view

```sh
uv run scripts/build.py      # regenerate site/data.js (layout is cached in .cache/)
npm install                  # once; installs KaTeX for the maths check
npm run check-math           # validate all formulas and inline maths
xdg-open site/index.html     # or open it in any browser; no server needed
```

The first build computes the map layout (about a minute); later builds reuse it until entries, fields or links change. Bump `LAYOUT_VERSION` in `scripts/build.py` after changing the layout code.

## Deployment

The site is live at https://marbinner.github.io/math-atlas/. Every push to `main` runs `.github/workflows/pages.yml`: it runs the maths check, stamps asset URLs with content hashes (so browsers pick up changes despite Pages' 10-minute cache) and publishes `site/`. The workflow does not run the Python build, so commit the regenerated `site/data.js` together with data changes.

## Inline maths

Prose fields can contain inline LaTeX between `$...$`, which the site renders with KaTeX. See `CLAUDE.md` for the markup conventions. So far only the Calculus entries (plus `scalar-condition-number`) are converted; the remaining ~3,800 prose fields with maths still use plain text.

## Pages

- `#/f/<id>` — an entry: formula, intuition, conditions, example, a connection graph, learning path, patterns, mental pictures and references.
- `#/p/<id>`, `#/m/<id>`, `#/field/<name>` — patterns, mental pictures and fields.
- `#/map` — the whole atlas, with each field drawn as a continent; `#/map/<id>` selects an entry.
