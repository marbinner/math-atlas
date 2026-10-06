"""Build site/data.js from data/atlas.json.

Drops edges that duplicate information stored on nodes (pattern memberships,
metaphor mappings, prerequisite lists) and precomputes the map layout: a
spring layout in which each field forms a "continent", followed by collision
and field-separation passes. The layout is cached in .cache/ and only
recomputed when entries, fields or links change.

Run with:  uv run scripts/build.py
"""

import hashlib
import json
from collections import Counter
from pathlib import Path

import networkx as nx
import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "atlas.json"
OUT = ROOT / "site" / "data.js"
CACHE = ROOT / ".cache" / "layout.json"
LAYOUT_VERSION = 5  # bump when layout code changes, to invalidate the cache

MATH_RELATIONS = ["generalization", "derivation", "application", "equivalence", "analogy", "duality"]

# Fields grouped into broad regions, used for browsing on the home page.
REGIONS = {
    "Analysis": [
        "Calculus", "Analysis", "Complex analysis", "Differential equations",
        "Dynamical systems", "Special functions", "Mathematical physics",
    ],
    "Algebra and geometry": [
        "Linear algebra", "Abstract algebra", "Number theory", "Geometry",
        "Algebraic geometry", "Representation theory", "Category theory",
    ],
    "Foundations and discrete mathematics": [
        "Foundations", "Topology & logic", "Discrete mathematics", "Computability", "Game theory",
    ],
    "Probability and statistics": ["Probability", "Statistics", "Stochastic processes"],
    "Computation and data": [
        "Numerical analysis", "Optimization", "Information & signals", "Machine learning",
    ],
}


def relax(pts: np.ndarray, groups: np.ndarray, dmin: float, iters: int = 80) -> np.ndarray:
    """Collision pass: push points closer than dmin apart, keeping each field compact."""
    p = pts.copy()
    names = np.unique(groups)
    for _ in range(iters):
        pairs = cKDTree(p).query_pairs(dmin, output_type="ndarray")
        if len(pairs) == 0:
            break
        i, j = pairs[:, 0], pairs[:, 1]
        d = p[j] - p[i]
        dist = np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
        push = d / dist * (dmin - dist) / 2
        delta = np.zeros_like(p)
        np.add.at(delta, i, -push)
        np.add.at(delta, j, push)
        step = np.linalg.norm(delta, axis=1, keepdims=True)
        p += delta * np.minimum(1, dmin * 0.5 / (step + 1e-9)) * 0.8  # clip so coincident points cannot explode
        for g in names:
            m = groups == g
            p[m] += (p[m].mean(0) - p[m]) * 0.015
    return p


def separate_fields(pts: np.ndarray, groups: np.ndarray, pad: float, iters: int = 2000) -> np.ndarray:
    """Treat each field as a disc and translate whole fields until the discs stop overlapping."""
    names = list(np.unique(groups))
    masks = [groups == g for g in names]
    centers = np.array([pts[m].mean(0) for m in masks])
    radii = np.array([np.linalg.norm(pts[m] - pts[m].mean(0), axis=1).max() for m in masks])
    c = centers.copy()
    for _ in range(iters):
        d = c[None, :, :] - c[:, None, :]
        dist = np.linalg.norm(d, axis=2) + np.eye(len(c))
        overlap = np.clip(radii[:, None] + radii[None, :] + pad - dist, 0, None)
        np.fill_diagonal(overlap, 0)
        if overlap.max() < 0.5:
            break
        c -= (d / dist[..., None] * overlap[..., None] / 2).sum(1) * 0.5
        c += (c.mean(0) - c) * 0.002  # mild gravity keeps the map compact
    out = pts.copy()
    for m, old, new in zip(masks, centers, c):
        out[m] += new - old
    return out


def scale_box(pts: np.ndarray, size: float = 1000) -> np.ndarray:
    lo, hi = pts.min(0), pts.max(0)
    return (pts - lo) / (hi - lo).max() * size


def layout(nodes, edges):
    """Global spring layout; an invisible hub per field pulls its members into a continent."""
    ids = [n["id"] for n in nodes]
    dom_of = {n["id"]: n["domain"] for n in nodes}
    key = hashlib.sha256(json.dumps([LAYOUT_VERSION] + [[n["id"], n["domain"]] for n in nodes]
                                    + sorted([e["source"], e["target"], e["type"]] for e in edges)).encode()).hexdigest()
    if CACHE.exists():
        cached = json.loads(CACHE.read_text())
        if cached.get("key") == key:
            return {k: np.array(v) for k, v in cached["pos"].items()}, cached["fields"]

    g = nx.Graph()
    g.add_nodes_from(ids)
    for e in edges:
        w = 1.0 if e["type"] in MATH_RELATIONS else 0.35
        a, b = e["source"], e["target"]
        if dom_of[a] != dom_of[b]:
            w *= 0.25  # cross-field links should not drag continents into each other
        g.add_edge(a, b, weight=g.get_edge_data(a, b, {"weight": 0})["weight"] + w)
    for n in nodes:
        g.add_edge("hub:" + n["domain"], n["id"], weight=1.6)
    pos = nx.spring_layout(g, weight="weight", seed=3, iterations=400, k=0.05)

    groups = np.array([dom_of[i] for i in ids])
    pts = scale_box(np.array([pos[i] for i in ids]))
    idx = {i: k for k, i in enumerate(ids)}
    dmin = 10
    for d in np.unique(groups):
        # Re-lay each field on its own (seeded by the global layout so orientation is kept),
        # with a hub so weakly linked entries stay inside, then size it by its entry count.
        members = [i for i in ids if dom_of[i] == d]
        sub = g.subgraph(members).copy()
        for i in members:
            sub.add_edge("hub", i, weight=0.4)
        c = pts[[idx[i] for i in members]].mean(0)
        init = {i: pts[idx[i]] - c for i in members} | {"hub": np.zeros(2)}
        local = nx.spring_layout(sub, pos=init, weight="weight", seed=5, iterations=300, k=1.2 / np.sqrt(len(members)))
        q = np.array([local[i] for i in members])
        q -= q.mean(0)
        q *= np.sqrt(len(members)) * dmin * 0.62 / (np.percentile(np.linalg.norm(q, axis=1), 90) + 1e-9)
        q = relax(q, np.zeros(len(q)), dmin=dmin)
        pts[[idx[i] for i in members]] = q + c
    pts = separate_fields(pts, groups, pad=26)
    pts = scale_box(pts)

    out = {i: pts[k] for k, i in enumerate(ids)}
    fields = {}
    for d in np.unique(groups):
        m = pts[groups == d]
        c = m.mean(0)
        r = float(np.percentile(np.linalg.norm(m - c, axis=1), 90))
        fields[str(d)] = {"x": round(float(c[0]), 1), "y": round(float(c[1]), 1), "r": round(r, 1)}
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps({"key": key, "pos": {k: v.tolist() for k, v in out.items()}, "fields": fields}))
    return out, fields


def main():
    atlas = json.loads(SRC.read_text())
    nodes, edges = atlas["nodes"], atlas["edges"]
    formula_edges = [e for e in edges if e["type"] in MATH_RELATIONS + ["prerequisite"]]
    pos, dom_layout = layout(nodes, formula_edges)

    out_nodes = []
    for n in nodes:
        x, y = pos[n["id"]]
        out_nodes.append({
            "id": n["id"], "name": n["name"], "latex": n["latex"],
            "domain": n["domain"], "subdomain": n["subdomain"], "level": n["level"], "kind": n["kind"],
            "intuition": n["intuition"], "conditions": n["conditions"], "example": n["example"],
            "patterns": [[p["id"], p["why"]] for p in n["patterns"]],
            "prerequisites": n["prerequisites"], "sources": n["sources"],
            "x": round(float(x), 1), "y": round(float(y), 1),
        })

    patterns = [{
        "id": p["id"], "name": p["name"], "latex": p["latex"], "intuition": p["intuition"],
        "question": p["question"], "trap": p["trap"], "examples": p["examples"],
    } for p in atlas["patterns"]]

    metaphors = [{
        "id": m["id"], "title": m["title"], "story": m["story"], "structure": m["structure"],
        "limits": m["limits"], "question": m["question"],
        "mappings": [[x["formula"], x["role"]] for x in m["mappings"]],
        "patterns": m["patterns"], "sources": m["sources"],
    } for m in atlas["metaphors"]]

    links = [[e["source"], e["target"], e["type"], e["explanation"]]
             for e in edges if e["type"] in MATH_RELATIONS]

    domain_counts = Counter(n["domain"] for n in nodes)
    missing = set(domain_counts) - {d for ds in REGIONS.values() for d in ds}
    assert not missing, f"fields without a region: {missing}"
    regions = [{"name": r, "domains": [d for d in ds if d in domain_counts]} for r, ds in REGIONS.items()]
    domains = {d: {"count": c, **dom_layout[d]} for d, c in domain_counts.items()}

    data = {
        "meta": atlas["meta"], "regions": regions, "domains": domains,
        "nodes": out_nodes, "patterns": patterns, "metaphors": metaphors,
        "links": links, "sources": {s["id"]: s for s in atlas["sources"]},
    }
    OUT.write_text("window.ATLAS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1e6:.1f} MB): "
          f"{len(out_nodes)} formulas, {len(links)} links, {len(patterns)} patterns, {len(metaphors)} metaphors")


if __name__ == "__main__":
    main()
