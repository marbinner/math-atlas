# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static, Wikipedia-style explorer for a curated "Mathematics Atlas" dataset: about 1,500 formulas/theorems linked by explained relationships, recurring pattern hubs and teaching metaphors (mental pictures). The user wants the site kept **clean and minimal**, and iterates on both the data and the site.

## Commands

```sh
uv run scripts/build.py   # data/atlas.json -> site/data.js (always use uv for Python)
```

```sh
npm install && npm run check   # references resolve, links are unique, and all maths parses in KaTeX (strict)
```

- No server needed: open `site/index.html` directly (`data.js` sets `window.ATLAS`, so it works over `file://`). KaTeX and d3 load from cdnjs.
- The map layout is cached in `.cache/layout.json`, keyed on entries, fields, links and `LAYOUT_VERSION`. A fresh layout takes ~1 minute; a cached build takes under 1s. **Bump `LAYOUT_VERSION` in `scripts/build.py` whenever layout code or parameters change**, or the stale cache is silently reused.
- Deploy: pushing to `main` runs `.github/workflows/pages.yml`, which publishes `site/` as-is to GitHub Pages (https://marbinner.github.io/math-atlas/). CI runs `npm run check`, appends content-hash `?v=` query strings to the asset URLs in `index.html` (Pages serves `max-age=600`, so stale `data.js` was a real problem), then uploads `site/`. It does not run the Python build, so commit a regenerated `site/data.js` after data changes. If the `deploy-pages` step fails with "No artifacts named github-pages", it is transient: re-run (or push an empty commit).
- There are no tests or linters. To verify visually, take headless screenshots (put temp files in `claude_files/`):
  `google-chrome --headless=new --window-size=1400,1000 --virtual-time-budget=4000 --screenshot=claude_files/x.png "file://$PWD/site/index.html#/f/derivative"`
  To check for JS errors, add `--enable-logging=stderr --dump-dom` and grep stderr for `CONSOLE`/`Uncaught`. Run this via `bash -c`: the default shell is zsh, where `2>&1 >/dev/null` does not isolate stderr.

## Data model (`data/`)

- `atlas.json` is the only data file (the old CSV/xlsx/sqlite/graphml exports were removed; regenerate from `atlas.json` if one is ever needed). `data/README.txt` documents the schema and relation semantics.
- Top-level keys are `nodes` (formulas), `patterns`, `metaphors`, `edges` and `sources`.
- `edges` holds only the mathematical links: `{source, target, type, explanation}`, with `type` one of `generalization`, `derivation`, `application`, `equivalence`, `analogy`, `duality`. Pattern memberships, picture mappings and prerequisites live only on their objects (`node.patterns`, `metaphor.mappings`, `node.prerequisites`), so nothing needs syncing; `npm run check` catches broken references and duplicate links.
- Direction matters:
  - generalization: simpler → more general
  - derivation: tool → consequence
  - application: idea → use
  - prerequisite: background → target
  - equivalence, analogy and duality are symmetric.
- Prerequisites and metaphors are deliberately *not* mathematical connections; the UI says so.

## Inline maths in prose

Prose fields (intuition, conditions, example, pattern `why`, edge explanations, metaphor text) may contain inline LaTeX delimited by `$...$`; `prose()` in `app.js` renders it with KaTeX and escapes the rest. Conventions for marking up data:
- Wrap every mathematical expression in `$...$`, including lone variables (`$f$`, `$x$`) and short relations (`$x>0$`).
- Inside `$...$` use LaTeX, not Unicode: `\neq`, `\le`, `\in`, `\alpha`, `x^2`, `x_0`, `f'`, `\mathbb{R}^n`, `\cdots`; function names as `\sin`, `\log`, `\exp`, `\det`, `\operatorname{diag}`.
- Keep words and sentence punctuation outside the maths; leave bare numbers in running text as text; don't reword the prose.
- All prose fields are marked up; new or edited prose must follow these conventions.
- When editing `atlas.json` programmatically, write it back with `json.dumps(..., ensure_ascii=False, indent=2)` to keep diffs minimal.

## Site architecture (`site/app.js`, one IIFE, no framework)

- **Formulas.** `tex(latex, true)` splits a display formula at top-level `\quad` gaps and renders each part with `\displaystyle` in KaTeX *inline* mode, so long formulas wrap instead of being clipped (display mode cannot wrap).
- **Routing.** A hash router in `route()`: `#/` home, `#/f/<id>` formula, `#/p/<id>` pattern, `#/m/<id>` metaphor, `#/field/<name>`, `#/fields`, `#/patterns`, `#/metaphors`, `#/map[/<id> | /field/<name>]`.
  - Page functions render HTML strings into `#page` and return the document title.
  - `''` means the default title; `undefined` or `null` falls through to `notFound()`.
- **Indexes.** Built once at startup: `F`/`P`/`M` maps, plus `nbrs`, `nextOf`, `picturesOf` and `membersOf`.
- **`GROUPS`** maps each (relation, direction) to a reader-facing label and side, e.g. `derivation:in` → "Derived from" on the left. Both the article connection lists and the ego graph use it.
- **Entry pages** put mental pictures and analogies together under "Ways to see it" (right after the example); the exact relations stay under Connections.
- **Hover previews.** `entryTip(n)` (name, formula, intuition) is shown in the shared `#tip` tooltip when hovering map dots and, after 250 ms, any `#/f/` or `data-sel` link (only on devices with hover). `hideTip()` also cancels a pending preview. Headless Chrome reports no hover device; test with `--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4`.
- **Ego graph** (`egoGraph`/`mountEgo`). An SVG with incoming relations in the left column and outgoing ones on the right. Symmetric groups go on whichever column is shorter.
- **Map** (`drawAtlas`/`mountMap`). A canvas plus d3-zoom, using the precomputed `x`/`y` from the build.
  - Selecting an entry opens a side panel (default 480px; drag its left edge or use the expand button; width saved in `localStorage` as `atlas-panel-width`) and frames the entry plus its neighbours.
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
