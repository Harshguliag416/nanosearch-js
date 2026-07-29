import { Filter, FilterGroup, FilterExpression, GeoFilter, Document } from '../types.js';

/**
 * Accesses deep nested paths in an object. E.g. "author.profile.name"
 */
export function getNestedValue(obj: Record<string, any>, path: string): unknown {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export class FilterEvaluator {
  /**
   * Returns true if document satisfies the given Filter.
   */
  public evaluate(doc: Document, filter: Filter): boolean {
    if ('and' in filter || 'or' in filter || 'not' in filter) {
      return this.evaluateGroup(doc, filter as FilterGroup);
    }
    
    if ('lat' in filter && 'lon' in filter) {
      // Geo filter is evaluated separately via Geosearch module
      return true;
    }

    return this.evaluateExpression(doc, filter as FilterExpression);
  }

  private evaluateGroup(doc: Document, group: FilterGroup): boolean {
    if (group.and) {
      for (const item of group.and) {
        if (!this.evaluate(doc, item)) {
          return false;
        }
      }
      return true;
    }

    if (group.or) {
      for (const item of group.or) {
        if (this.evaluate(doc, item)) {
          return true;
        }
      }
      return false;
    }

    if (group.not) {
      return !this.evaluate(doc, group.not);
    }

    return true;
  }

  private evaluateExpression(doc: Document, expr: FilterExpression): boolean {
    const val = getNestedValue(doc, expr.field);
    const expected = expr.value;

    switch (expr.operator) {
      case 'eq':
        if (Array.isArray(val)) {
          return val.includes(expected);
        }
        return val === expected;

      case 'neq':
        if (Array.isArray(val)) {
          return !val.includes(expected);
        }
        return val !== expected;

      case 'gt':
        return typeof val === 'number' && typeof expected === 'number' && val > expected;

      case 'gte':
        return typeof val === 'number' && typeof expected === 'number' && val >= expected;

      case 'lt':
        return typeof val === 'number' && typeof expected === 'number' && val < expected;

      case 'lte':
        return typeof val === 'number' && typeof expected === 'number' && val <= expected;

      case 'in':
        if (!Array.isArray(expected)) return false;
        if (Array.isArray(val)) {
          return val.some(v => expected.includes(v));
        }
        return expected.includes(val);

      case 'nin':
        if (!Array.isArray(expected)) return true;
        if (Array.isArray(val)) {
          return !val.some(v => expected.includes(v));
        }
        return !expected.includes(val);

      case 'exists':
        return val !== undefined && val !== null;

      default:
        return false;
    }
  }
}
