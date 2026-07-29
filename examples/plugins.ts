import { NanoSearch, Schema, NanoSearchPlugin } from '../src/index.js';

// 1. Define custom plugin
const auditLogPlugin: NanoSearchPlugin = {
  name: 'audit-logger',
  beforeAdd: (doc) => {
    console.log(`[Plugin beforeAdd] Ingesting document ID: ${doc.id}`);
    doc.createdAt = new Date().toISOString();
    return doc;
  },
  afterAdd: (doc) => {
    console.log(`[Plugin afterAdd] Successfully indexed document ID: ${doc.id}`);
  },
  beforeSearch: (opts) => {
    console.log(`[Plugin beforeSearch] Received search request for: "${opts.query}"`);
    return opts;
  },
  afterSearch: (results) => {
    console.log(`[Plugin afterSearch] Found ${results.total} matching documents, took ${results.took}ms`);
    return results;
  }
};

// 2. Define schema
const schema = {
  title: { type: 'text' },
  category: { type: 'string' }
} as const satisfies Schema;

const engine = new NanoSearch(schema);

// Register the plugin
engine.use(auditLogPlugin);

console.log('--- Ingesting Document ---');
engine.add({
  id: 'doc-99',
  title: 'Advanced Plugin Frameworks',
  category: 'Software'
});

console.log('\n--- Running Search ---');
engine.search({
  query: 'Plugin'
});

console.log('\nIngested Document details:');
console.log(JSON.stringify(engine.get('doc-99'), null, 2));
