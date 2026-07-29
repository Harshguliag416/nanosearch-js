import { FacetValue } from '../types.js';

export class FacetManager {
  /**
   * Aggregates facet counts over matching documents.
   */
  public calculateFacets(
    docs: Record<string, unknown>[],
    facetFields: string[]
  ): Record<string, FacetValue[]> {
    const results: Record<string, FacetValue[]> = {};

    for (const field of facetFields) {
      const counts = new Map<string | number | boolean, number>();

      for (const doc of docs) {
        const val = doc[field];
        if (val === undefined || val === null) continue;

        if (Array.isArray(val)) {
          for (const item of val) {
            if (item !== null && item !== undefined) {
              counts.set(item, (counts.get(item) || 0) + 1);
            }
          }
        } else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          counts.set(val, (counts.get(val) || 0) + 1);
        }
      }

      const facetValues: FacetValue[] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count }))
        // Sort descending by count, then ascending by value
        .sort((a, b) => {
          if (b.count !== a.count) {
            return b.count - a.count;
          }
          return String(a.value).localeCompare(String(b.value));
        });

      results[field] = facetValues;
    }

    return results;
  }
}
