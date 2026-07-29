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
| Vector Search (Exact) | $O(N \cdot D)$ | $N$ document count, $D$ vector dimensions. |
| Vector Search (VP-Tree) | $O(D \cdot \log N)$ | Vantage Point Tree ANN indexing. |
| Filtering | $O(N)$ | Instant filter matching. |

---

## v1.1.0 New Features

### 1. Batch Indexing & Transactions
Stage multiple document additions or removals without re-triggering BM25 statistics recalculation on every addition:

```typescript
const tx = searchEngine.transaction();
tx.add({ id: 'doc-1', title: 'Staged Doc A' });
tx.addMany([ ...moreDocs ]);
tx.remove('doc-2');

// Rebuilds indices and statistics in a single pass
tx.commit();
```

### 2. Vantage Point (VP) Tree Vector Search
Enable sub-linear $O(\log N)$ Approximate Nearest Neighbor (ANN) search for Cosine and Euclidean metrics:

```typescript
const searchEngine = new NanoSearch(schema, {
  vectorMetric: 'cosine',
  vectorDimensions: 1536,
  vectorIndexType: 'vptree' // Choose 'exact' (default) or 'vptree'
});
```

### 3. Pluggable Stemmer Analyzer
Use the optional Porter Stemmer plugin to stem document fields and search queries:

```typescript
import { PorterStemmerPlugin } from 'nanosearch-js';

searchEngine.use(PorterStemmerPlugin(['title', 'body']));
```

### 4. Fuzzy Query Options
Filter typo-tolerance results dynamically by word length:

```typescript
const results = searchEngine.search({
  query: 'comp',
  typoTolerance: {
    enabled: true,
    maxDistance: 1,
    minWordLength: 4 // Typo tolerance only triggers for query tokens >= 4 chars
  }
});
```

---

## RAG & LLM Integration (`nanosearch-js/rag`)

NanoSearch includes a provider-independent RAG orchestration layer containing sliding window chunking, hybrid retrieval context assembly, history management, and LLM generation.

### Quick Start
```typescript
import { NanoSearch, Schema } from 'nanosearch-js';
import { RAGPipeline, OpenAIProvider } from 'nanosearch-js/rag';

const schema = {
  content: { type: 'text' },
  embedding: { type: 'vector' }
} as const satisfies Schema;

const searchEngine = new NanoSearch(schema, { vectorDimensions: 1536 });
const openai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });

const pipeline = new RAGPipeline({
  searchEngine,
  embeddingProvider: openai,
  llmProvider: openai,
  textField: 'content',
  vectorField: 'embedding'
});

// Index a document
await pipeline.addDocument('doc-1', 'NanoSearch RAG is extremely fast and lightweight.');

// Run RAG query
const response = await pipeline.query('Is NanoSearch RAG lightweight?');
console.log(response.answer); // Answer citing source chunks
```

