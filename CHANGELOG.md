# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-07-29

### Added
- **Transactions & Staged Ingestion**: Added a staging queue with `transaction()`, supporting bulk `.commit()` to execute inverted index compiles in a single pass.
- **VP-Tree Vector ANN Indexing**: Vantage Point Tree space partitioning for Cosine/Euclidean metrics with $O(L)$ insertion sort.
- **Relevance Tuning**: Min-Max score normalization for hybrid fusion, phrase-proximity calculations, and query-time fuzzy `minWordLength` checks.
- **Pluggable Stemmer Plugin**: Porter Stemmer plugin dynamically stemming specified fields before ingestion and querying.
- **RAG + LLM Module**: Modular provider-independent RAG orchestration package (`nanosearch-js/rag`) with lightweight adapters for OpenAI, Google Gemini, Anthropic Claude, and Ollama.

## [1.0.0] - 2026-07-29

### Added
- Initial release of `NanoSearch` core library.
- Typed Schema parsing with compile-time type validation.
- Inverted text index utilizing BM25 scoring.
- SymSpell deletion-based typo tolerance.
- Real-time vector index supporting cosine similarity, dot product, and Euclidean distances.
- Nested field filters (AND/OR/NOT).
- Haversine geosearch and bounding boxes.
- Dynamic facet aggregation.
- Merchandising (pinning, hiding, demoting).
- Custom plugins and lifecycle hooks.
