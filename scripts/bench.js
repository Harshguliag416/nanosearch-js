import { NanoSearch } from '../dist/index.js';
import fs from 'fs';
import path from 'path';

const schema = {
  title: { type: 'text' },
  body: { type: 'text' },
  category: { type: 'string' },
  embedding: { type: 'vector' }
};

const categories = ['Tech', 'Health', 'Finance', 'Travel', 'News'];
const words = ['search', 'engine', 'hybrid', 'vector', 'fast', 'small', 'browser', 'server', 'edge', 'database', 'index', 'query', 'filter'];

function randomString(wordCount) {
  const parts = [];
  for (let i = 0; i < wordCount; i++) {
    parts.push(words[Math.floor(Math.random() * words.length)]);
  }
  return parts.join(' ');
}

function randomVector(dim) {
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.random();
  }
  return vec;
}

function runBenchmarkForScale(scale) {
  console.log(`\n======================================`);
  console.log(`BENCHMARK SCALE: ${scale.toLocaleString()} Documents`);
  console.log(`======================================`);

  const engine = new NanoSearch(schema, {
    vectorMetric: 'cosine',
    vectorDimensions: 8,
    vectorIndexType: 'vptree' // test VP-tree scaling
  });

  // Generate synthetic dataset
  const documents = [];
  for (let i = 0; i < scale; i++) {
    documents.push({
      id: `doc-${i}`,
      title: randomString(5),
      body: randomString(25),
      category: categories[Math.floor(Math.random() * categories.length)],
      embedding: randomVector(8)
    });
  }

  // Measure Ingestion Throughput using staged transactions
  const memStart = process.memoryUsage().heapUsed;
  const tAddStart = performance.now();
  
  const tx = engine.transaction();
  tx.addMany(documents);
  tx.commit();
  
  const tAddEnd = performance.now();
  const memEnd = process.memoryUsage().heapUsed;

  const addTimeMs = tAddEnd - tAddStart;
  const docsPerSec = scale / (addTimeMs / 1000);
  const memoryUsedMb = (memEnd - memStart) / 1024 / 1024;

  console.log(`Ingestion Throughput : ${docsPerSec.toFixed(0)} docs/sec`);
  console.log(`Total Ingest Time    : ${addTimeMs.toFixed(2)} ms`);
  console.log(`Heap Memory Overhead : ${memoryUsedMb.toFixed(2)} MB`);

  // Latency metrics
  const queries = [
    { name: 'Text Only', opt: { query: 'search' } },
    { name: 'Vector Only', opt: { vector: randomVector(8) } },
    { name: 'Hybrid Blended', opt: { query: 'hybrid vector', vector: randomVector(8) } }
  ];

  for (const q of queries) {
    const runs = 200;
    const tSearchStart = performance.now();
    for (let r = 0; r < runs; r++) {
      engine.search(q.opt);
    }
    const tSearchEnd = performance.now();
    const latency = (tSearchEnd - tSearchStart) / runs;
    console.log(`Latency (${q.name.padEnd(15)}) : ${latency.toFixed(4)} ms`);
  }
}

// Print bundle size
const buildPath = path.resolve('dist/index.js');
if (fs.existsSync(buildPath)) {
  const sizeKb = fs.statSync(buildPath).size / 1024;
  console.log(`Bundle Size (ESM)    : ${sizeKb.toFixed(2)} KB`);
}

// Run scales
runBenchmarkForScale(5000);
runBenchmarkForScale(50000);
// Skip 100K on smaller sandbox run to avoid memory timeout, but run 50K
// If memory allows, we can uncomment 100k
runBenchmarkForScale(100000);
