# NanoSearch RAG + LLM Pipeline

This document explains the architecture, provider APIs, retrieval flow, security considerations, and usage instructions for the optional `nanosearch-js/rag` pipeline module.

---

## 1. Pipeline Architecture

The `RAGPipeline` provides a provider-independent orchestration layer linking document chunking, semantic or keyword index lookup, context assembly, and LLM text generation:

```
[User Question]
     │
     ▼
[Embedding Provider] (Query Vector)
     │
     ▼
[NanoSearch Engine] (Hybrid Retrieval)
     │
     ▼
[Context Assembly & Prompt Builder]
     │
     ▼
[LLM Provider] (API Fetch)
     │
     ▼
[Structured Response & Citations]
```

---

## 2. Standard Provider Adapters

Standard adapters use standard browser/Node/Edge `fetch` calls, avoiding large client libraries:

- **OpenAIProvider**: Adapts `embeddings` and `chat/completions` endpoints.
- **GeminiProvider**: Maps contents structure to Gemini's `generateContent` / `streamGenerateContent` endpoints.
- **AnthropicProvider**: Adapts Claude's `messages` and system prompt configurations.
- **OllamaProvider**: Integrates local developer models running on port `11434`.
- **CustomProvider**: Exposes custom transform hooks to support private enterprise servers.

---

## 3. Workflow Implementations

### A. Embedding Workflow
1. Documents are fed to `addDocument(id, text, metadata, chunkOptions)`.
2. The document is split using a character-limit sliding window with overlap.
3. Chunks are embedded in bulk via `EmbeddingProvider.embedDocuments()`.
4. Embedded chunks are added under a single database commit transaction.

### B. Retrieval Flow
1. Query strings are embedded using `embedQuery()`.
2. A search query is dispatched to `NanoSearch` (either text, vector, or hybrid weighted combining).
3. Post-filters are automatically checked against document metadata.
4. Chunks are sorted by hybrid normalized scores.

---

## 4. Security & API-Keys
- **No hardcoded secrets**: All API keys must be loaded at runtime from environment variables (e.g. `process.env.OPENAI_API_KEY`) or runtime configuration parameters.
- **Browser/Edge safety**: If deploying in the browser, ensure API endpoints are proxied through a backend edge function to prevent API key exposure to clients.

---

## 5. Quick-Start Tutorial

### Setup and Indexing
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

// Index document
await pipeline.addDocument(
  'guide-1',
  'NanoSearch has an optional RAG pipeline that requires no third-party package dependencies.',
  { category: 'docs' }
);
```

### Retrieving & Answering
```typescript
const result = await pipeline.query('Does NanoSearch RAG have extra dependencies?');

console.log('Answer:', result.answer);
console.log('Sources:', result.sources);
```
