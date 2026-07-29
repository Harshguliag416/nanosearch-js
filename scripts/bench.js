import { NanoSearch } from '../dist/index.js';

const schema = {
  title: { type: 'text' },
  body: { type: 'text' },
  category: { type: 'string' }
};

const engine = new NanoSearch(schema);

// Generate dummy data
const categories = ['Tech', 'Health', 'Finance', 'Travel', 'News'];
const words = ['search', 'engine', 'hybrid', 'vector', 'fast', 'small', 'browser', 'server', 'edge', 'database', 'index', 'query', 'filter'];

function randomString(wordCount) {
  const parts = [];
  for (let i = 0; i < wordCount; i++) {
    parts.push(words[Math.floor(Math.random() * words.length)]);
  }
  return parts.join(' ');
}

console.log('Generating 5,000 synthetic documents...');
const documents = [];
for (let i = 0; i < 5000; i++) {
  documents.push({
    id: `doc-${i}`,
    title: randomString(5),
    body: randomString(30),
    category: categories[Math.floor(Math.random() * categories.length)]
  });
}

console.log('Starting ingestion benchmark...');
const tAddStart = performance.now();
for (const doc of documents) {
  engine.add(doc);
}
const tAddEnd = performance.now();
const addTimeMs = tAddEnd - tAddStart;
console.log(`Ingested 5,000 documents in ${addTimeMs.toFixed(2)}ms (${(5000 / (addTimeMs / 1000)).toFixed(0)} docs/sec)`);

console.log('\nStarting search latency benchmark...');
const queries = ['search', 'hybrid vector', 'fast browser edge', 'notfoundterm'];
for (const q of queries) {
  const runs = 1000;
  const tSearchStart = performance.now();
  for (let r = 0; r < runs; r++) {
    engine.search({ query: q, limit: 10 });
  }
  const tSearchEnd = performance.now();
  const latency = (tSearchEnd - tSearchStart) / runs;
  console.log(`Query "${q}" average latency: ${latency.toFixed(4)} ms`);
}
