# Mathematics Atlas

A Wikipedia-style explorer for a curated atlas of mathematical formulas, their explained relationships, recurring patterns and teaching metaphors.

## Layout

- `data/` — the source dataset (`atlas.json` is the canonical file; the other formats are exports of it).
- `scripts/build.py` — turns `data/atlas.json` into `site/data.js` and precomputes the map layout.
- `site/` — the static site: `index.html`, `style.css`, `app.js` and the generated `data.js`.

## Build and view

```sh
uv run scripts/build.py      # regenerate site/data.js (layout is cached in .cache/)
xdg-open site/index.html     # or open it in any browser; no server needed
```

The first build computes the map layout (about a minute); later builds reuse it until entries, fields or links change. Bump `LAYOUT_VERSION` in `scripts/build.py` after changing the layout code.

## Pages

- `#/f/<id>` — an entry: formula, intuition, conditions, example, a connection graph, learning path, patterns, mental pictures and references.
- `#/p/<id>`, `#/m/<id>`, `#/field/<name>` — patterns, mental pictures and fields.
- `#/map` — the whole atlas, with each field drawn as a continent; `#/map/<id>` selects an entry.
