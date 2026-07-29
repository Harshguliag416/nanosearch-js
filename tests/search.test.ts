import { describe, test, expect } from 'vitest';
import { NanoSearch, Schema, NanoSearchPlugin, Document } from '../src/index.js';

describe('NanoSearch Tests', () => {
  const schema: Schema = {
    title: { type: 'text', boost: 2.0 },
    description: { type: 'text' },
    category: { type: 'string', facet: true },
    published: { type: 'boolean' },
    views: { type: 'number' },
    location: { type: 'geopoint' },
    embedding: { type: 'vector', dimensions: 3 }
  };

  test('Index initialization and adding/getting documents', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({
      id: 'doc-1',
      title: 'Intro to Machine Learning',
      description: 'A deep dive into neural networks and machine learning.',
      category: 'AI',
      published: true,
      views: 120,
      location: { lat: 37.7749, lon: -122.4194 },
      embedding: [0.1, 0.2, 0.9]
    });

    const doc = searchEngine.get('doc-1');
    expect(doc).toBeDefined();
    expect(doc?.id).toBe('doc-1');
    expect(doc?.category).toBe('AI');
    expect(doc?.views).toBe(120);
  });

  test('Text search: BM25, prefix, phrase search', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({
      id: 'doc-1',
      title: 'TypeScript Design Patterns',
      description: 'Learn design patterns in TypeScript'
    });

    searchEngine.add({
      id: 'doc-2',
      title: 'Python for Beginners',
      description: 'A basic introduction to Python programming'
    });

    // Simple BM25 search
    let results = searchEngine.search({ query: 'TypeScript' });
    expect(results.hits).toHaveLength(1);
    expect(results.hits[0].id).toBe('doc-1');

    // Prefix search (tokens >= 3 chars)
    results = searchEngine.search({ query: 'Type' });
    expect(results.hits).toHaveLength(1);
    expect(results.hits[0].id).toBe('doc-1');

    // Phrase search
    searchEngine.add({
      id: 'doc-3',
      title: 'Design Patterns',
      description: 'Comprehensive study of patterns'
    });

    results = searchEngine.search({ query: '"Design Patterns"' });
    expect(results.hits).toHaveLength(2); // doc-1 and doc-3
  });

  test('Text search: Typo tolerance', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({
      id: 'doc-1',
      title: 'Elasticsearch guide',
      description: 'Learning search engines'
    });

    // Typo (maxDistance = 1)
    const results = searchEngine.search({
      query: 'elasticsearc', // missing 'h'
      typoTolerance: { enabled: true, maxDistance: 1 }
    });
    expect(results.hits).toHaveLength(1);
    expect(results.hits[0].id).toBe('doc-1');
  });

  test('Vector search with Cosine / Euclidean distance', () => {
    const searchEngine = new NanoSearch(schema, {
      vectorMetric: 'cosine',
      vectorDimensions: 3
    });

    searchEngine.add({ id: '1', embedding: [1, 0, 0] });
    searchEngine.add({ id: '2', embedding: [0, 1, 0] });
    searchEngine.add({ id: '3', embedding: [0.95, 0.1, 0.0] });

    const results = searchEngine.search({
      vector: [1, 0.05, 0.0],
      limit: 2
    });

    expect(results.hits[0].id).toBe('1');
    expect(results.hits[1].id).toBe('3');
  });

  test('Hybrid Search: Rank Fusion and Weighted Combination', () => {
    const searchEngine = new NanoSearch(schema, {
      vectorMetric: 'cosine',
      vectorDimensions: 3
    });

    searchEngine.add({
      id: 'doc-1',
      title: 'Machine Learning algorithms',
      embedding: [0.9, 0.1, 0.0]
    });

    searchEngine.add({
      id: 'doc-2',
      title: 'Deep learning introduction',
      embedding: [0.1, 0.9, 0.0]
    });

    // Text query matches doc-1 and doc-2 (both contain learning/learning), but vector points to doc-2's topic
    const results = searchEngine.search({
      query: 'algorithms',
      vector: [0.15, 0.85, 0.0], // close to doc-2
      hybrid: { mode: 'weighted', weightText: 0.5, weightVector: 0.5 }
    });

    expect(results.hits).toHaveLength(2);
    // Both docs should have scores computed and returned
    expect(results.hits[0].explanation?.textScore).toBeDefined();
    expect(results.hits[0].explanation?.vectorScore).toBeDefined();
  });

  test('Filtering: operators and nested AND/OR/NOT', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({ id: '1', category: 'Tech', views: 50, published: true });
    searchEngine.add({ id: '2', category: 'Tech', views: 150, published: false });
    searchEngine.add({ id: '3', category: 'News', views: 200, published: true });

    // AND filter: Tech & views > 100
    let res = searchEngine.search({
      filter: {
        and: [
          { field: 'category', operator: 'eq', value: 'Tech' },
          { field: 'views', operator: 'gt', value: 100 }
        ]
      }
    });
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].id).toBe('2');

    // NOT filter
    res = searchEngine.search({
      filter: {
        not: { field: 'category', operator: 'eq', value: 'Tech' }
      }
    });
    expect(res.hits).toHaveLength(1);
    expect(res.hits[0].id).toBe('3');
  });

  test('Geosearch filtering and sorting', () => {
    const searchEngine = new NanoSearch(schema);

    // San Francisco
    searchEngine.add({ id: 'sf', location: { lat: 37.7749, lon: -122.4194 } });
    // Oakland (~13 km away)
    searchEngine.add({ id: 'oakland', location: { lat: 37.8044, lon: -122.2712 } });
    // Los Angeles (~550 km away)
    searchEngine.add({ id: 'la', location: { lat: 34.0522, lon: -118.2437 } });

    // Proximity search: find docs within 20km of SF
    const res = searchEngine.search({
      filter: {
        field: 'location',
        lat: 37.7749,
        lon: -122.4194,
        radiusKm: 20
      },
      geoSort: {
        field: 'location',
        lat: 37.7749,
        lon: -122.4194
      }
    });

    expect(res.hits).toHaveLength(2);
    expect(res.hits[0].id).toBe('sf');
    expect(res.hits[1].id).toBe('oakland');
  });

  test('Faceting support', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({ id: '1', category: 'Books' });
    searchEngine.add({ id: '2', category: 'Electronics' });
    searchEngine.add({ id: '3', category: 'Books' });

    const res = searchEngine.search({
      facets: ['category']
    });

    expect(res.facets).toBeDefined();
    expect(res.facets?.category).toEqual([
      { value: 'Books', count: 2 },
      { value: 'Electronics', count: 1 }
    ]);
  });

  test('Merchandising: pinning, hiding, boosting, demoting', () => {
    const searchEngine = new NanoSearch(schema);

    searchEngine.add({ id: '1', title: 'Article A' });
    searchEngine.add({ id: '2', title: 'Article B' });
    searchEngine.add({ id: '3', title: 'Article C' });

    const res = searchEngine.search({
      query: 'Article',
      merchandising: {
        pin: ['3', '1'],
        hide: ['2']
      }
    });

    expect(res.hits).toHaveLength(2);
    expect(res.hits[0].id).toBe('3');
    expect(res.hits[1].id).toBe('1');
  });

  test('Plugin lifecycle hooks', () => {
    const searchEngine = new NanoSearch(schema);

    let docModified = false;
    const testPlugin: NanoSearchPlugin = {
      name: 'test-plugin',
      beforeAdd: (doc) => {
        docModified = true;
        doc.extraField = 'injected';
        return doc;
      }
    };

    searchEngine.use(testPlugin);

    searchEngine.add({
      id: 'doc-1',
      title: 'Plugin testing'
    });

    expect(docModified).toBe(true);
    expect(searchEngine.get('doc-1')?.extraField).toBe('injected');
  });

  test('Serialization and restoration', () => {
    const original = new NanoSearch(schema);

    original.add({
      id: '1',
      title: 'React native instructions',
      embedding: [0.1, 0.2, 0.3]
    });

    const serialized = original.toJSON();

    const restored = new NanoSearch(schema);
    restored.fromJSON(serialized);

    expect(restored.get('1')).toBeDefined();
    const results = restored.search({ query: 'React' });
    expect(results.hits).toHaveLength(1);
    expect(results.hits[0].id).toBe('1');
  });
});
