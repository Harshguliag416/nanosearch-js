import { NanoSearch, Schema } from '../src/index.js';

const productSchema = {
  title: { type: 'text' },
  category: { type: 'string' }
} as const satisfies Schema;

// Global in-memory search engine (instantiated once per worker isolate)
const engine = new NanoSearch(productSchema);

// Seed documents
engine.add({ id: '1', title: 'Edge computing platforms', category: 'Tech' });
engine.add({ id: '2', title: 'Durable Objects in Workers', category: 'Tech' });
engine.add({ id: '3', title: 'Coffee making guide', category: 'Food' });

/**
 * Mock Cloudflare Worker fetch handler.
 */
export async function handleRequest(request: { url: string }): Promise<{ status: number; body: string }> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q') || '';

  console.log(`[Edge Worker] Processing search for query: "${query}"`);

  const results = engine.search({
    query,
    limit: 5
  });

  return {
    status: 200,
    body: JSON.stringify({
      success: true,
      query,
      results: results.hits.map(h => ({
        id: h.id,
        score: h.score,
        title: h.document.title,
        category: h.document.category
      }))
    }, null, 2)
  };
}

// Simulate a worker invocation
async function runSimulation() {
  const mockReq = { url: 'https://search.nano.edge/search?q=Workers' };
  const response = await handleRequest(mockReq);
  console.log('\n--- Worker Response ---');
  console.log(`Status: ${response.status}`);
  console.log(response.body);
}

runSimulation();
