# NanoSearch 🚀

`NanoSearch` is a tiny, zero-dependency, and extremely fast hybrid search engine designed to run identically in the **Browser**, on the **Server**, and at the **Edge** (e.g. Cloudflare Workers, Vercel Edge).

It fits fully in **under 10KB gzipped**, is modular for full tree-shaking support, and handles complex features like typo-tolerant text matching, dense vector searches, hybrid fusing, geo-coordinate sorting, faceted counts, and merchandising pinning out of the box.

---

## Key Features

1. **Text Search**: Scaled BM25 text score calculation, query/field boosting, exact phrase match, prefix scanning, and $O(1)$ SymSpell-style deletion-based typo tolerance.
2. **Vector Search**: Real-time dense vector retrieval matching cosine similarity, dot product, or Euclidean (L2) distance.
3. **Hybrid Mode**: Blends text and vector outputs via Reciprocal Rank Fusion (RRF) or linear normalized combinations.
4. **Filtering**: Complete boolean structures (`AND`/`OR`/`NOT`) paired with comparison operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `exists`) addressing deep nested paths.
5. **Geosearch**: Proximity queries using the Haversine distance, bounding box checks, and distance sorting.
6. **Facets**: Dynamic grouping and count calculation for specified fields.
7. **Merchandising**: Business rules for product promotion (result pinning, demoting, boosting, hiding).
8. **Lifecycle Hooks**: Complete pipeline hook system (`beforeAdd`, `afterAdd`, `beforeSearch`, `afterSearch`, etc.).

---

## Installation

```bash
npm install nanosearch-js
```

---

## Quick Start Example

```typescript
import { NanoSearch, Schema } from 'nanosearch-js';

// 1. Define your typed schema
const movieSchema = {
  title: { type: 'text', boost: 2.0 },
  overview: { type: 'text' },
  genre: { type: 'string', facet: true },
  rating: { type: 'number' },
  released: { type: 'boolean' }
} as const satisfies Schema;

// 2. Instantiate search engine
const searchEngine = new NanoSearch(movieSchema);

// 3. Add documents
searchEngine.add({
  id: 'movie-1',
  title: 'Inception',
  overview: 'A thief who steals corporate secrets through the use of dream-sharing technology.',
  genre: 'Sci-Fi',
  rating: 8.8,
  released: true
});

// 4. Query
const results = searchEngine.search({
  query: 'dream-sharing',
  facets: ['genre'],
  filter: {
    field: 'released',
    operator: 'eq',
    value: true
  }
});

console.log(results.hits[0].document.title); // Inception
console.log(results.facets?.genre); // [{ value: 'Sci-Fi', count: 1 }]
```

---

## Serialization & Snapshotting

Since `NanoSearch` is fully in-memory, you can snapshot its state to persist it to disk or index documents on a server and load the snapshot on the browser/edge client:

```typescript
// On the server: Export state to string
const snapshot = JSON.stringify(searchEngine.toJSON());

// On the client / edge: Load state
const clientEngine = new NanoSearch(movieSchema);
clientEngine.fromJSON(JSON.parse(snapshot));
```

---

## Writing a Lifecycle Plugin

Plugins allow developers to hook into the indexing and search process:

```typescript
import { NanoSearchPlugin } from 'nanosearch-js';

const autoTimestampPlugin: NanoSearchPlugin = {
  name: 'auto-timestamp',
  beforeAdd: (doc) => {
    doc.indexedAt = new Date().toISOString();
    return doc;
  }
};

searchEngine.use(autoTimestampPlugin);
```

---

## Performance Complexity Reference

| Operation | Complexity | Description |
|---|---|---|
| Ingestion (Text) | $O(W \cdot L)$ | $W$ words, average length $L$. |
| Typo-Fuzzy Lookup | $O(d)$ | $d$ deletion variants, bypassing expensive $O(N)$ scanning. |
| Vector Search | $O(N \cdot D)$ | $N$ document count, $D$ vector dimensions. |
| Filtering | $O(N)$ | Instant filter matching. |
