import { Schema, Document, FieldType, GeoPoint } from '../types.js';

export class SchemaCompiler {
  constructor(public readonly schema: Schema) {
    this.validateSchemaDefinition();
  }

  private validateSchemaDefinition(): void {
    if (!this.schema || typeof this.schema !== 'object') {
      throw new Error('Schema must be a valid object definition.');
    }
    for (const [field, config] of Object.entries(this.schema)) {
      if (!config || typeof config.type !== 'string') {
        throw new Error(`Field '${field}' must specify a valid 'type'.`);
      }
      const validTypes: FieldType[] = ['text', 'string', 'number', 'boolean', 'geopoint', 'vector'];
      if (!validTypes.includes(config.type)) {
        throw new Error(`Field '${field}' has invalid type '${config.type}'. Valid types are ${validTypes.join(', ')}.`);
      }
    }
  }

  /**
   * Validates and normalizes an incoming document based on the schema.
   * Fills in default values and raises errors for invalid types.
   */
  public validateAndNormalize(doc: Document): Document {
    const normalized: Document = { ...doc };

    // Validate ID presence
    if (!doc.id || (typeof doc.id !== 'string' && typeof doc.id !== 'number')) {
      throw new Error("Document must have a valid 'id' property of type string or number.");
    }
    normalized.id = String(doc.id);

    for (const [field, config] of Object.entries(this.schema)) {
      let val = doc[field];

      if (val === undefined || val === null) {
        if (config.default !== undefined) {
          val = typeof config.default === 'function' ? config.default() : config.default;
        } else {
          // If not required or has no default, delete to ensure clean undefined behavior
          delete normalized[field];
          continue;
        }
      }

      normalized[field] = this.validateFieldValue(field, val, config.type);
    }

    return normalized;
  }

  private validateFieldValue(field: string, val: unknown, type: FieldType): unknown {
    switch (type) {
      case 'text':
      case 'string':
        if (typeof val !== 'string') {
          return String(val);
        }
        return val;

      case 'number':
        if (typeof val !== 'number') {
          const num = Number(val);
          if (isNaN(num)) {
            throw new Error(`Field '${field}' expects a number, got '${val}'.`);
          }
          return num;
        }
        return val;

      case 'boolean':
        return Boolean(val);

      case 'geopoint': {
        const point = val as GeoPoint;
        if (!point || typeof point.lat !== 'number' || typeof point.lon !== 'number') {
          throw new Error(`Field '${field}' expects a GeoPoint { lat: number, lon: number }, got ${JSON.stringify(val)}.`);
        }
        return { lat: point.lat, lon: point.lon };
      }

      case 'vector': {
        if (!Array.isArray(val) && !(val instanceof Float32Array)) {
          throw new Error(`Field '${field}' expects a vector of type number[] or Float32Array, got ${JSON.stringify(val)}.`);
        }
        return val instanceof Float32Array ? val : new Float32Array(val);
      }

      default:
        return val;
    }
  }
}
