import { NanoSearch, Schema } from '../src/index.js';

// 1. Define schema
const productSchema = {
  name: { type: 'text', boost: 2.0 },
  description: { type: 'text' },
  category: { type: 'string', facet: true },
  price: { type: 'number' },
  inStock: { type: 'boolean' },
  warehouse: { type: 'geopoint' }
} as const satisfies Schema;

// 2. Instantiate NanoSearch
const searchEngine = new NanoSearch(productSchema);

// 3. Add documents
searchEngine.add({
  id: 'prod-101',
  name: 'Wireless Noise-Cancelling Headphones',
  description: 'Premium over-ear headphones with active noise cancellation.',
  category: 'Electronics',
  price: 299.99,
  inStock: true,
  warehouse: { lat: 37.7749, lon: -122.4194 } // San Francisco
});

searchEngine.add({
  id: 'prod-102',
  name: 'Ergonomic Office Chair',
  description: 'Breathable mesh chair with lumber support and 3D armrests.',
  category: 'Furniture',
  price: 189.50,
  inStock: true,
  warehouse: { lat: 37.8044, lon: -122.2712 } // Oakland
});

searchEngine.add({
  id: 'prod-103',
  name: 'Mechanical Gaming Keyboard',
  description: 'RGB backlit mechanical keyboard with blue switches.',
  category: 'Electronics',
  price: 89.99,
  inStock: false,
  warehouse: { lat: 34.0522, lon: -118.2437 } // Los Angeles
});

console.log('--- Raw Search for "headphones" ---');
const textRes = searchEngine.search({
  query: 'headphones',
  highlight: true
});
console.log(JSON.stringify(textRes.hits, null, 2));

console.log('\n--- Filtered Search (category = Electronics AND price < 150) ---');
const filterRes = searchEngine.search({
  filter: {
    and: [
      { field: 'category', operator: 'eq', value: 'Electronics' },
      { field: 'price', operator: 'lt', value: 150 }
    ]
  }
});
console.log(JSON.stringify(filterRes.hits, null, 2));

console.log('\n--- Facets Aggregation ---');
const facetRes = searchEngine.search({
  facets: ['category']
});
console.log(JSON.stringify(facetRes.facets, null, 2));

console.log('\n--- Geosearch sorted by distance to warehouse ---');
const geoRes = searchEngine.search({
  geoSort: {
    field: 'warehouse',
    lat: 37.75,
    lon: -122.40
  }
});
geoRes.hits.forEach(hit => {
  console.log(`ID: ${hit.id}, Distance: ${hit.distance?.toFixed(2)} km`);
});

console.log('\n--- Merchandising: Pinning prod-103 to the top ---');
const merchRes = searchEngine.search({
  query: 'Noise-Cancelling',
  merchandising: {
    pin: ['prod-103'] // Pin a gaming keyboard to noise-cancelling searches for promo
  }
});
console.log(merchRes.hits.map(h => h.id));
