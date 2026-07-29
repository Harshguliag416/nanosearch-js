# NanoSearch Architecture

`NanoSearch` is designed around a modular, zero-dependency, and in-memory architecture. This document details the core components and algorithms.

## Module Structures

```
src/
├── core/
│   └── schema.ts         # Schema compiler & runtime validator
├── text/
│   ├── tokenizer.ts      # Tokenizer, Stopwords & Normalization
│   ├── fuzzy.ts          # SymSpell-style deletion-based typo matching
│   └── bm25.ts           # BM25 Inverted & Positional index
├── vector/
│   └── index.ts          # Dense vector scans & metrics (Cosine/L2/DotProd)
├── search/
│   ├── filter.ts         # Boolean combinations & nested path lookups
│   ├── geo.ts            # Haversine distance, radius, & bounding boxes
│   └── facet.ts          # Dynamic facet aggregations
├── plugins/
│   └── manager.ts        # Plugin hook pipeline manager
├── types.ts              # Global type interfaces
└── index.ts              # Orchestrator & hybrid fusion API
```

---

## Technical Highlights

### 1. SymSpell-Style Typo Tolerance
Instead of comparing search query terms against every word in the dictionary (which is $O(N)$ where $N$ is vocabulary size), `NanoSearch` pre-computes **deletion variants** up to a maximum edit distance ($d=1$ or $2$) at indexing time.
- For a term "search", deletion variants like "earch", "sarch", "seach" are mapped to "search" in a lookup table.
- When searching, the query word is decomposed into its deletions. The matching candidate terms are looked up in $O(1)$ time, then verified via Levenshtein distance.

### 2. BM25 Scoring
The text index computes matching document scores using the industry-standard Best Matching 25 (BM25) model:

$$\text{Score}(D, Q) = \sum_{i=1}^{n} \text{IDF}(q_i) \cdot \frac{f(q_i, D) \cdot (k_1 + 1)}{f(q_i, D) + k_1 \cdot \left(1 - b + b \cdot \frac{|D|}{\text{avgdl}}\right)}$$

- **Stopwords**: Standard common English words are ignored to avoid inflating document frequencies.
- **Diacritics stripping**: Unicode normalization handles characters like `é` or `ü` by decomposing them to base characters (`e`, `u`).

### 3. Dense Vector Search
Vector search computes distances against in-memory Float32Arrays. It supports:
- **Cosine Similarity**: Normalizes vectors to measure angle difference.
- **Euclidean (L2) Distance**: Measures physical distance between points.
- **Dot Product**: High-speed multiplication for pre-normalized embeddings.

### 4. Hybrid Blending
Fusing vector and text outputs can be done using:
- **Reciprocal Rank Fusion (RRF)**: Ranks documents based on their reciprocal positions in the individual searches.
- **Weighted Combination**: Linearly combines normalized scores from both pipelines based on a user-provided weight ratio.
