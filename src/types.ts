export interface GeoPoint {
  lat: number;
  lon: number;
}

export type FieldType = 'text' | 'string' | 'number' | 'boolean' | 'geopoint' | 'vector';

export interface FieldConfig {
  type: FieldType;
  index?: boolean;       // If false, it won't be indexed for search
  stored?: boolean;      // If false, it is excluded from search results to save memory
  facet?: boolean;       // Index for facets
  boost?: number;        // Index-time boost
  default?: unknown;     // Default value
  analyzer?: string;     // Analyzer mapping
}

export type Schema = Record<string, FieldConfig>;

// Compile-time type mapping from Schema to Doc
export type InferFieldType<T extends FieldType> = T extends 'text' | 'string'
  ? string
  : T extends 'number'
  ? number
  : T extends 'boolean'
  ? boolean
  : T extends 'geopoint'
  ? GeoPoint
  : T extends 'vector'
  ? number[] | Float32Array
  : never;

export type InferDocType<S extends Schema> = {
  [K in keyof S as S[K]['stored'] extends false ? never : K]: InferFieldType<S[K]['type']>;
} & { id: string };

// Raw Document that can contain unindexed fields or fields that don't match exactly
export type Document = Record<string, unknown>;

// Filter constraints
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'exists';

export interface FilterExpression {
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface GeoFilter {
  field: string;
  lat: number;
  lon: number;
  radiusKm?: number; // Distance in kilometers
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface FilterGroup {
  and?: (FilterExpression | FilterGroup | GeoFilter)[];
  or?: (FilterExpression | FilterGroup | GeoFilter)[];
  not?: FilterExpression | FilterGroup | GeoFilter;
}

export type Filter = FilterExpression | FilterGroup | GeoFilter;

// Merchandising Rules
export interface MerchandisingRules {
  pin?: string[];       // Pin document IDs to the top in the specified order
  hide?: string[];      // Hide specified document IDs
  boost?: Record<string, number>; // Boost scores of specific document IDs
  demote?: Record<string, number>; // Demote scores of specific document IDs (multiply by value < 1)
}

// Search Options
export interface SearchOptions<S extends Schema> {
  query?: string;        // Text search query
  vector?: number[] | Float32Array; // Vector search query
  fields?: (keyof S)[];  // Which text fields to query (with optional boosting e.g. title^2)
  boosts?: Record<string, number>; // Query-time boosts per field
  filter?: Filter;       // Filter query
  facets?: string[];     // Facet field names
  geoSort?: {
    field: string;
    lat: number;
    lon: number;
    order?: 'asc' | 'desc';
  };
  merchandising?: MerchandisingRules;
  hybrid?: {
    mode?: 'rrf' | 'weighted';
    rrfK?: number; // constant for RRF (default 60)
    weightText?: number; // weight for text (default 0.5)
    weightVector?: number; // weight for vector (default 0.5)
  };
  limit?: number;        // Max results (default 10)
  offset?: number;       // Skip results (default 0)
  typoTolerance?: {
    enabled?: boolean;
    maxDistance?: 1 | 2; // Levenshtein limit
    minWordLength?: number;
  };
  highlight?: boolean;   // Return matching tokens and boundary offsets
}

export interface HighlightInfo {
  field: string;
  matchedTokens: string[];
  snippet: string;
  indices: [number, number][]; // [start, end] characters
}

export interface Explanation {
  textScore?: number;
  vectorScore?: number;
  rrfRankText?: number;
  rrfRankVector?: number;
  finalScore: number;
  merchandisingApplied?: string[];
}

export interface SearchHit<T> {
  id: string;
  score: number;
  document: T;
  highlights?: HighlightInfo[];
  explanation?: Explanation;
  distance?: number; // Geosearch distance in km, if applicable
}

export interface FacetValue {
  value: string | number | boolean;
  count: number;
}

export interface SearchResults<T> {
  hits: SearchHit<T>[];
  total: number;
  facets?: Record<string, FacetValue[]>;
  took: number;
}

// Plugin system types
export interface NanoSearchPlugin {
  name: string;
  beforeAdd?: (doc: Document) => Document | void;
  afterAdd?: (doc: Document, indexStates: Record<string, unknown>) => void;
  beforeRemove?: (id: string) => void;
  afterRemove?: (id: string) => void;
  beforeSearch?: (options: SearchOptions<any>) => SearchOptions<any> | void;
  afterSearch?: (results: SearchResults<any>) => SearchResults<any> | void;
  beforeSerialize?: (state: Record<string, unknown>) => Record<string, unknown> | void;
  afterDeserialize?: (state: Record<string, unknown>) => Record<string, unknown> | void;
  customAnalyzers?: Record<string, (text: string) => string[]>;
}
