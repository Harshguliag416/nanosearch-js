import { NanoSearch, Schema, SearchHit, Document } from '../src/index.js';

// 1. Mock embedder function (e.g. simulating OpenAI or local model)
function mockEmbedding(text: string): number[] {
  // Return dummy 3D normalized vector depending on semantic content
  const t = text.toLowerCase();
  if (t.includes('weather') || t.includes('rain') || t.includes('climate')) {
    return [0.9, 0.1, 0.0];
  } else if (t.includes('finance') || t.includes('market') || t.includes('stock')) {
    return [0.1, 0.9, 0.0];
  } else {
    return [0.33, 0.33, 0.33];
  }
}

// 2. Define schema
const documentSchema = {
  title: { type: 'text' },
  content: { type: 'text' },
  category: { type: 'string' },
  embedding: { type: 'vector', dimensions: 3 }
} as const satisfies Schema;

const engine = new NanoSearch(documentSchema, {
  vectorMetric: 'cosine',
  vectorDimensions: 3
});

// 3. Add documents with pre-computed embeddings
const docs = [
  {
    id: 'doc-1',
    title: 'Understanding Stock Markets',
    content: 'The stock market refers to public markets that exist for issuing, buying, and selling stocks.',
    category: 'finance'
  },
  {
    id: 'doc-2',
    title: 'Predicting Rainfall Patterns',
    content: 'Meteorological data helps forecast heavy precipitation, climate shifts, and seasonal rain.',
    category: 'weather'
  },
  {
    id: 'doc-3',
    title: 'Personal Finance Tips',
    content: 'Budgeting and investing in diversified funds helps secure your financial future.',
    category: 'finance'
  }
];

docs.forEach(doc => {
  engine.add({
    ...doc,
    embedding: mockEmbedding(doc.title + ' ' + doc.content)
  });
});

// 4. Query with text + embedding
const query = 'How is the stock market doing?';
const queryVector = mockEmbedding(query);

console.log(`Querying: "${query}"\n`);

// Hybrid Search
const hybridResults = engine.search({
  query,
  vector: queryVector,
  hybrid: {
    mode: 'weighted',
    weightText: 0.4,
    weightVector: 0.6
  },
  limit: 2
});

console.log('--- Hybrid Search Results ---');
hybridResults.hits.forEach(hit => {
  console.log(`ID: ${hit.id}, Score: ${hit.score.toFixed(4)}`);
  console.log(`Title: ${hit.document.title}`);
  console.log(`Text Score Contribution: ${hit.explanation?.textScore?.toFixed(4)}`);
  console.log(`Vector Score Contribution: ${hit.explanation?.vectorScore?.toFixed(4)}`);
  console.log('---');
});

// 5. Basic RAG retrieval helper helper function
function generateRagPrompt(query: string, hits: SearchHit<Document>[]): string {
  const context = hits.map((h, i) => `[${i + 1}] Title: ${h.document.title}\nContent: ${h.document.content}`).join('\n\n');
  return `Context:\n${context}\n\nQuestion: ${query}\n\nAnswer based on the context above:`;
}

console.log('\n--- Generated RAG Prompt ---');
console.log(generateRagPrompt(query, hybridResults.hits));
