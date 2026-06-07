# Graph Report - fuel-station  (2026-06-07)

## Corpus Check
- 60 files · ~225,137 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 145 nodes · 137 edges · 10 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f6a78bdf`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]

## God Nodes (most connected - your core abstractions)
1. `DELETE()` - 9 edges
2. `reload()` - 9 edges
3. `PATCH()` - 6 edges
4. `load()` - 6 edges
5. `load()` - 4 edges
6. `makeTunnel()` - 3 edges
7. `GET()` - 3 edges
8. `loadHistory()` - 3 edges
9. `startTunnel()` - 2 edges
10. `startDistill()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `GET()` --calls--> `csvRow()`  [EXTRACTED]
  app/api/sales/route.ts → app/api/export/sales/route.ts

## Communities (38 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.27
Nodes (11): deleteCheck(), deleteDebt(), deletePayment(), deletePurchase(), fmt(), markDebtPaid(), markPaid(), payPartial() (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.28
Nodes (3): makeTunnel(), startDistill(), startTunnel()

### Community 4 - "Community 4"
Cohesion: 0.33
Nodes (6): closePeriod(), deletePeriod(), fmt(), fmtDec(), handleSubmit(), load()

### Community 5 - "Community 5"
Cohesion: 0.32
Nodes (3): deleteRecord(), loadHistory(), saveCount()

### Community 6 - "Community 6"
Cohesion: 0.43
Nodes (6): addProduct(), deleteProduct(), load(), saveDetail(), toggleActive(), uploadImage()

## Knowledge Gaps
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Not enough signal to generate questions. This usually means the corpus has no AMBIGUOUS edges, no bridge nodes, no INFERRED relationships, and all communities are tightly cohesive. Add more files or run with --mode deep to extract richer edges._