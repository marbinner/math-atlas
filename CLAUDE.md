# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, Wikipedia-style explorer for a curated "Mathematics Atlas" dataset: ~1,500 formulas/theorems linked by explained relationships, 26 recurring pattern hubs and 160 teaching metaphors. The user wants the site kept **clean and minimal**, and iterates on both the data and the site.

## Commands

```sh
uv run scripts/build.py   # data/atlas.json -> site/data.js (always use uv for Python)
```

- No server needed: open `site/index.html` directly (`data.js` sets `window.ATLAS`, so it works over `file://`). KaTeX and d3 load from cdnjs.
- The map layout is cached in `.cache/layout.json`, keyed on entries, fields, links and `LAYOUT_VERSION`. A fresh layout takes ~1 minute; a cached build takes under 1s. **Bump `LAYOUT_VERSION` in `scripts/build.py` whenever layout code or parameters change**, or the stale cache is silently reused.
- There are no tests or linters. To verify visually, take headless screenshots (put temp files in `claude_files/`):
  `google-chrome --headless=new --window-size=1400,1000 --virtual-time-budget=4000 --screenshot=claude_files/x.png "file://$PWD/site/index.html#/f/derivative"`
  To check for JS errors, add `--enable-logging=stderr --dump-dom` and grep stderr for `CONSOLE`/`Uncaught`. Run this via `bash -c`: the default shell is zsh, where `2>&1 >/dev/null` does not isolate stderr.

## Data model (`data/`)

- `atlas.json` is canonical. The CSV/xlsx/sqlite/graphml files are parallel exports of the same data, so keep them in sync if the data is edited. `data/README.txt` documents the schema and relation semantics.
- Top-level keys are `nodes` (formulas), `patterns`, `metaphors`, `edges` and `sources`.
- Edge `type` is one of the six mathematical relations (`generalization`, `derivation`, `application`, `equivalence`, `analogy`, `duality`) or `pattern`, `metaphor` or `prerequisite`.
  - The `pattern`, `metaphor` and `prerequisite` edges duplicate `node.patterns`, `metaphor.mappings` and `node.prerequisites` exactly. The build drops them and exports only the math relations as `links`.
- Direction matters:
  - generalization: simpler → more general
  - derivation: tool → consequence
  - application: idea → use
  - prerequisite: background → target
  - equivalence, analogy and duality are symmetric.
- Prerequisites and metaphors are deliberately *not* mathematical connections; the UI says so.

## Site architecture (`site/app.js`, one IIFE, no framework)

- **Routing.** A hash router in `route()`: `#/` home, `#/f/<id>` formula, `#/p/<id>` pattern, `#/m/<id>` metaphor, `#/field/<name>`, `#/fields`, `#/patterns`, `#/metaphors`, `#/map[/<id> | /field/<name>]`.
  - Page functions render HTML strings into `#page` and return the document title.
  - `''` means the default title; `undefined` or `null` falls through to `notFound()`.
- **Indexes.** Built once at startup: `F`/`P`/`M` maps, plus `nbrs`, `nextOf`, `picturesOf` and `membersOf`.
- **`GROUPS`** maps each (relation, direction) to a reader-facing label and side, e.g. `derivation:in` → "Derived from" on the left. Both the article connection lists and the ego graph use it.
- **Ego graph** (`egoGraph`/`mountEgo`). An SVG with incoming relations in the left column and outgoing ones on the right. Symmetric groups go on whichever column is shorter.
- **Map** (`drawAtlas`/`mountMap`). A canvas plus d3-zoom, using the precomputed `x`/`y` from the build.
  - Each field is drawn as a padded-hull blob ("continent").
  - The same `drawAtlas` renders the home-page preview.
  - Every map or preview page assigns the module-level `redraw` callback, which runs on theme change and on resize.
- **Map layout** (`scripts/build.py`):
  1. A global spring layout, with an invisible hub node per field.
  2. A per-field re-layout, seeded from the global positions and sized by entry count.
  3. A KD-tree collision pass.
  4. Whole-field disc separation.

## Visual conventions

- Colour tokens are CSS variables in `site/style.css`. Light values sit on `:root`; dark values are defined twice, under `prefers-color-scheme` and under `[data-theme="dark"]`. Canvas code reads them through `css('--name')`.
- Relation colours use only the three validated categorical slots: `--rel-gen`, `--rel-der`, `--rel-app`. Equivalence uses ink, analogy is dashed, duality dotted, and prerequisite is a grey hairline. Every group also has a text label, so colour is never the only signal.
- **Do not colour-code the 26 fields.** That many hues fail colour-vision checks; fields are identified by position and labels instead.
- Typography: serif headings and sans body, with a Wikipedia-like infobox and table of contents.
- On narrow screens (≤720px) the ego graph is hidden and the header wraps to two rows (`--top` changes).
