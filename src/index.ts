import {
  Schema,
  Document,
  SearchOptions,
  SearchResults,
  SearchHit,
  Explanation,
  HighlightInfo,
  GeoPoint,
  NanoSearchPlugin,
  GeoFilter,
  InferDocType
} from './types.js';
import { SchemaCompiler } from './core/schema.js';
import { Tokenizer } from './text/tokenizer.js';
import { BM25TextIndex } from './text/bm25.js';
import { VectorIndex } from './vector/index.js';
import { FilterEvaluator, getNestedValue } from './search/filter.js';
import { GeoSearchManager } from './search/geo.js';
import { FacetManager } from './search/facet.js';
import { PluginManager } from './plugins/manager.js';
import { Transaction } from './core/transaction.js';
import { VPTree } from './vector/vptree.js';

export * from './types.js';
export { PorterStemmerPlugin } from './plugins/stemmer.js';

export class NanoSearch<S extends Schema> {
  private schemaCompiler: SchemaCompiler;
  private tokenizer: Tokenizer;
  private textIndex: BM25TextIndex;
  private vectorIndex: VectorIndex;
  private filterEvaluator = new FilterEvaluator();
  private geoManager = new GeoSearchManager();
  private facetManager = new FacetManager();
  private pluginManager = new PluginManager();
  
  private vpTree?: VPTree;
  private vectorIndexDirty = false;
  private vectorIndexType?: 'exact' | 'vptree';

  // Document store (id -> document)
  private documents = new Map<string, Document>();

  constructor(
    public readonly schema: S,
    config: {
      tokenizer?: Tokenizer;
      k1?: number;
      b?: number;
      vectorMetric?: 'cosine' | 'dot_product' | 'euclidean';
      vectorDimensions?: number;
      vectorIndexType?: 'exact' | 'vptree';
    } = {}
  ) {
    this.schemaCompiler = new SchemaCompiler(schema);
    this.tokenizer = config.tokenizer || new Tokenizer();
    this.vectorIndexType = config.vectorIndexType;

    const textFields = Object.entries(schema)
      .filter(([_, conf]) => conf.type === 'text')
      .map(([name]) => name);

    this.textIndex = new BM25TextIndex(textFields, this.tokenizer, config.k1, config.b);
    this.vectorIndex = new VectorIndex({
      metric: config.vectorMetric,
      dimensions: config.vectorDimensions
    });

    if (config.vectorIndexType === 'vptree') {
      const metric = config.vectorMetric || 'cosine';
      if (metric === 'dot_product') {
        throw new Error('VP-Tree vector index is not compatible with dot_product metric. Use exact matching instead.');
      }
      this.vpTree = new VPTree(metric, (this.vectorIndex as any).vectors);
    }
  }

  /**
   * Register a plugin.
   */
  public use(plugin: NanoSearchPlugin): this {
    this.pluginManager.register(plugin);
    
    // Add custom analyzers if provided
    const custom = plugin.customAnalyzers;
    if (custom) {
      // Re-configure tokenizer if a custom analyzer needs to overwrite defaults
      // For simplicity, plugins can extend tokenization via hooks or custom logic.
    }
    return this;
  }

  /**
   * Index a document.
   */
  public add(doc: Document): void {
    const rawDoc = this.pluginManager.runBeforeAdd(doc);
    const normalized = this.schemaCompiler.validateAndNormalize(rawDoc);
    const docId = normalized.id as string;

    // Index text fields
    this.textIndex.addDocument(docId, normalized);

    // Index vector fields
    for (const [field, config] of Object.entries(this.schema)) {
      if (config.type === 'vector' && normalized[field] !== undefined) {
        this.vectorIndex.addVector(docId, normalized[field] as number[] | Float32Array);
        this.vectorIndexDirty = true;
      }
    }

    // Save document (only stored fields if specified)
    const storedDoc: Document = { ...normalized };
    for (const [field, config] of Object.entries(this.schema)) {
      if (config.stored === false) {
        delete storedDoc[field];
      }
    }
    this.documents.set(docId, storedDoc);

    this.pluginManager.runAfterAdd(storedDoc, {});
  }

  /**
   * Bulk index multiple documents.
   */
  public addBulk(docs: Document[]): void {
    const len = docs.length;
    for (let i = 0; i < len; i++) {
      const doc = docs[i];
      const rawDoc = this.pluginManager.runBeforeAdd(doc);
      const normalized = this.schemaCompiler.validateAndNormalize(rawDoc);
      const docId = normalized.id as string;

      this.textIndex.addDocument(docId, normalized);

      for (const [field, config] of Object.entries(this.schema)) {
        if (config.type === 'vector' && normalized[field] !== undefined) {
          this.vectorIndex.addVector(docId, normalized[field] as number[] | Float32Array);
          this.vectorIndexDirty = true;
        }
      }

      const storedDoc: Document = { ...normalized };
      for (const [field, config] of Object.entries(this.schema)) {
        if (config.stored === false) {
          delete storedDoc[field];
        }
      }
      this.documents.set(docId, storedDoc);
      this.pluginManager.runAfterAdd(storedDoc, {});
    }
  }

  /**
   * Expose the Transaction staging wrapper API.
   */
  public transaction(): Transaction<S> {
    return new Transaction(this);
  }

  /**
   * Remove a document by ID.
   */
  public remove(id: string): void {
    const idStr = String(id);
    this.pluginManager.runBeforeRemove(idStr);

    this.textIndex.removeDocument(idStr);
    this.vectorIndex.removeVector(idStr);
    this.vectorIndexDirty = true;
    this.documents.delete(idStr);

    this.pluginManager.runAfterRemove(idStr);
  }

  /**
   * Retrieve a document by ID.
   */
  public get(id: string): Document | undefined {
    return this.documents.get(String(id));
  }

  /**
   * Run a search query.
   */
  public search(options: SearchOptions<S>): SearchResults<InferDocType<S>> {
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const opts = this.pluginManager.runBeforeSearch(options);

    const limit = Math.max(1, opts.limit ?? 10);
    const offset = Math.max(0, opts.offset ?? 0);

    // 1. Evaluate Filters & Geo constraint on all documents to build candidate set
    const candidateIds = new Set<string>();
    const geoDistances = new Map<string, number>();

    for (const [docId, doc] of this.documents.entries()) {
      let matches = true;

      if (opts.filter) {
        matches = this.filterEvaluator.evaluate(doc, opts.filter);
        
        // Evaluate geo filter if present in the filter tree
        if (matches) {
          const geoFilter = this.findGeoFilter(opts.filter);
          if (geoFilter) {
            const point = getNestedValue(doc, geoFilter.field) as GeoPoint;
            if (!point) {
              matches = false;
            } else {
              const dist = this.geoManager.verifyAndCalculateDistance(
                point,
                geoFilter.lat,
                geoFilter.lon,
                geoFilter.radiusKm,
                geoFilter.boundingBox
              );
              if (dist === null) {
                matches = false;
              } else {
                geoDistances.set(docId, dist);
              }
            }
          }
        }
      }

      if (matches) {
        candidateIds.add(docId);
      }
    }

    // Lazy rebuild VP-Tree if dirty
    if (this.vectorIndexType === 'vptree' && this.vectorIndexDirty && this.vpTree) {
      this.vpTree.rebuild();
      this.vectorIndexDirty = false;
    }

    // 2. Perform Text & Vector Search
    let textResults: { docId: string; score: number; termsMatched: string[] }[] = [];
    let vectorResults: { docId: string; score: number }[] = [];

    // Search fields selection
    const searchFields = (opts.fields as string[]) || Object.entries(this.schema)
      .filter(([_, config]) => config.type === 'text')
      .map(([name]) => name);

    if (opts.query) {
      const isPhrase = opts.query.startsWith('"') && opts.query.endsWith('"');
      if (isPhrase) {
        const phrase = opts.query.slice(1, -1);
        const rawPhraseRes = this.textIndex.phraseSearch(phrase, searchFields);
        textResults = rawPhraseRes.map(r => ({ docId: r.docId, score: r.score, termsMatched: [phrase] }));
      } else {
        textResults = this.textIndex.search(
          opts.query,
          searchFields,
          opts.boosts,
          {
            enabled: opts.typoTolerance?.enabled ?? true,
            maxDistance: opts.typoTolerance?.maxDistance ?? 1,
            minWordLength: opts.typoTolerance?.minWordLength
          }
        );
      }
    }

    if (opts.vector) {
      if (this.vectorIndexType === 'vptree' && this.vpTree) {
        const searchLimit = Math.min(this.documents.size, Math.max(100, (opts.limit || 10) * 5));
        vectorResults = this.vpTree.search(opts.vector as Float32Array, searchLimit, candidateIds);
      } else {
        vectorResults = this.vectorIndex.search(opts.vector, this.documents.size, candidateIds);
      }
    }

    // Filter text results to match candidateIds
    textResults = textResults.filter(r => candidateIds.has(r.docId));

    // 3. Hybrid Rank Fusion & Blending
    let hits: SearchHit<Document>[] = [];

    const hybridMode = opts.hybrid?.mode || 'weighted';
    const rrfK = opts.hybrid?.rrfK ?? 60;
    const weightText = opts.hybrid?.weightText ?? 0.5;
    const weightVector = opts.hybrid?.weightVector ?? 0.5;

    const mergedScores = new Map<string, Explanation>();
    const termsMatchedMap = new Map<string, string[]>();

    // Collect terms matched
    for (const r of textResults) {
      termsMatchedMap.set(r.docId, r.termsMatched);
    }

    if (opts.query && opts.vector) {
      if (hybridMode === 'rrf') {
        // Reciprocal Rank Fusion
        const textRank = new Map<string, number>();
        textResults.forEach((r, idx) => textRank.set(r.docId, idx + 1));

        const vectorRank = new Map<string, number>();
        vectorResults.forEach((r, idx) => vectorRank.set(r.docId, idx + 1));

        for (const docId of candidateIds) {
          const tRank = textRank.get(docId);
          const vRank = vectorRank.get(docId);

          if (tRank !== undefined || vRank !== undefined) {
            const scoreT = tRank !== undefined ? 1 / (rrfK + tRank) : 0;
            const scoreV = vRank !== undefined ? 1 / (rrfK + vRank) : 0;
            const finalScore = scoreT + scoreV;

            mergedScores.set(docId, {
              textScore: scoreT,
              vectorScore: scoreV,
              rrfRankText: tRank,
              rrfRankVector: vRank,
              finalScore
            });
          }
        }
      } else {
        // Weighted linear combination with Min-Max normalization
        let minText = Infinity;
        let maxText = -Infinity;
        const textLen = textResults.length;
        for (let i = 0; i < textLen; i++) {
          const s = textResults[i].score;
          if (s < minText) minText = s;
          if (s > maxText) maxText = s;
        }
        if (minText === Infinity) { minText = 0; maxText = 1; }
        else if (maxText === minText) { minText = 0; maxText = Math.max(0.0001, maxText); }

        let minVec = Infinity;
        let maxVec = -Infinity;
        const vecLen = vectorResults.length;
        for (let i = 0; i < vecLen; i++) {
          const s = vectorResults[i].score;
          if (s < minVec) minVec = s;
          if (s > maxVec) maxVec = s;
        }
        if (minVec === Infinity) { minVec = 0; maxVec = 1; }
        else if (maxVec === minVec) { minVec = 0; maxVec = Math.max(0.0001, maxVec); }

        const textScores = new Map<string, number>();
        textResults.forEach(r => textScores.set(r.docId, r.score));

        const vectorScores = new Map<string, number>();
        vectorResults.forEach(r => vectorScores.set(r.docId, r.score));

        const denomText = maxText - minText || 1;
        const denomVec = maxVec - minVec || 1;

        for (const docId of candidateIds) {
          const rawText = textScores.get(docId) || 0;
          const rawVec = vectorScores.get(docId) || 0;

          const normText = (rawText - minText) / denomText;
          const normVec = (rawVec - minVec) / denomVec;

          const finalScore = weightText * normText + weightVector * normVec;

          if (finalScore > 0) {
            mergedScores.set(docId, {
              textScore: rawText,
              vectorScore: rawVec,
              finalScore
            });
          }
        }
      }
    } else if (opts.query) {
      // Text only
      for (const r of textResults) {
        mergedScores.set(r.docId, {
          textScore: r.score,
          finalScore: r.score
        });
      }
    } else if (opts.vector) {
      // Vector only
      for (const r of vectorResults) {
        mergedScores.set(r.docId, {
          vectorScore: r.score,
          finalScore: r.score
        });
      }
    } else {
      // Plain scan (no text or vector query)
      for (const docId of candidateIds) {
        mergedScores.set(docId, {
          finalScore: 1.0
        });
      }
    }

    // 4. Construct Search Hits
    for (const [docId, explanation] of mergedScores.entries()) {
      const doc = this.documents.get(docId)!;
      hits.push({
        id: docId,
        score: explanation.finalScore,
        document: doc,
        explanation
      });
    }

    // 5. Geosearch sorting if requested
    if (opts.geoSort) {
      const gSort = opts.geoSort;
      hits.forEach(hit => {
        const point = getNestedValue(hit.document, gSort.field) as GeoPoint;
        if (point) {
          const dist = this.geoManager.verifyAndCalculateDistance(point, gSort.lat, gSort.lon);
          hit.distance = dist !== null ? dist : undefined;
        }
      });

      hits.sort((a, b) => {
        const distA = a.distance ?? Infinity;
        const distB = b.distance ?? Infinity;
        return gSort.order === 'desc' ? distB - distA : distA - distB;
      });
    } else {
      // Default sort by score descending
      hits.sort((a, b) => b.score - a.score);
    }

    // 6. Apply Merchandising rules
    if (opts.merchandising) {
      hits = this.applyMerchandising(hits, opts.merchandising);
    }

    // 7. Highlighting matched terms
    if (opts.highlight && opts.query) {
      const queryTokens = this.tokenizer.tokenize(opts.query);
      for (const hit of hits) {
        const highlights: HighlightInfo[] = [];

        for (const field of searchFields) {
          const text = hit.document[field];
          if (typeof text !== 'string') continue;

          const offsets = this.tokenizer.tokenizeWithOffsets(text);
          const matchedIndices: [number, number][] = [];
          const matchedTokens: string[] = [];

          for (const off of offsets) {
            // Check if offset token is a match for query tokens (fuzzy or exact)
            const isMatch = queryTokens.some(qt => {
              if (off.token === qt) return true;
              if (off.token.startsWith(qt)) return true;
              return false; // could also plug fuzzy check here
            });

            if (isMatch) {
              matchedIndices.push([off.start, off.end]);
              matchedTokens.push(off.token);
            }
          }

          if (matchedIndices.length > 0) {
            highlights.push({
              field,
              matchedTokens,
              snippet: text, // simplest snippet: full text
              indices: matchedIndices
            });
          }
        }
        hit.highlights = highlights;
      }
    }

    // 8. Dynamic Facet generation
    let facets: Record<string, any> | undefined;
    if (opts.facets && opts.facets.length > 0) {
      // Facets are calculated over matching documents BEFORE paging limit
      const matchedDocs = hits.map(h => h.document);
      facets = this.facetManager.calculateFacets(matchedDocs, opts.facets);
    }

    const total = hits.length;
    const paginatedHits = hits.slice(offset, offset + limit);

    const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result: SearchResults<InferDocType<S>> = {
      hits: paginatedHits as SearchHit<InferDocType<S>>[],
      total,
      facets,
      took: parseFloat((end - start).toFixed(3))
    };

    return this.pluginManager.runAfterSearch(result) as SearchResults<InferDocType<S>>;
  }

  private findGeoFilter(filter: any): GeoFilter | null {
    if (!filter) return null;
    if ('lat' in filter && 'lon' in filter) {
      return filter as GeoFilter;
    }
    if ('and' in filter && filter.and) {
      for (const item of filter.and) {
        const found = this.findGeoFilter(item);
        if (found) return found;
      }
    }
    if ('or' in filter && filter.or) {
      for (const item of filter.or) {
        const found = this.findGeoFilter(item);
        if (found) return found;
      }
    }
    return null;
  }

  private applyMerchandising(
    hits: SearchHit<Document>[],
    rules: NonNullable<SearchOptions<S>['merchandising']>
  ): SearchHit<Document>[] {
    const list = [...hits];

    // 1. Exclude demoted or hidden docs
    const hiddenSet = new Set(rules.hide || []);
    let filtered = list.filter(h => !hiddenSet.has(h.id));

    // 2. Apply Boosting & Demoting factors
    if (rules.boost || rules.demote) {
      for (const hit of filtered) {
        let modifier = 1.0;
        if (rules.boost && rules.boost[hit.id]) {
          modifier *= rules.boost[hit.id];
          hit.explanation?.merchandisingApplied?.push(`boost:${rules.boost[hit.id]}`);
        }
        if (rules.demote && rules.demote[hit.id]) {
          modifier *= rules.demote[hit.id];
          hit.explanation?.merchandisingApplied?.push(`demote:${rules.demote[hit.id]}`);
        }
        hit.score *= modifier;
      }
      // Re-sort after score changes
      filtered.sort((a, b) => b.score - a.score);
    }

    // 3. Pinning logic
    if (rules.pin && rules.pin.length > 0) {
      const pinnedHits: SearchHit<Document>[] = [];
      const remainingHits: SearchHit<Document>[] = [];

      // Extract or retrieve pinned hits
      for (const pinId of rules.pin) {
        const foundIdx = filtered.findIndex(h => h.id === pinId);
        if (foundIdx !== -1) {
          const hit = filtered[foundIdx];
          if (!hit.explanation) hit.explanation = { finalScore: hit.score };
          if (!hit.explanation.merchandisingApplied) hit.explanation.merchandisingApplied = [];
          hit.explanation.merchandisingApplied.push('pinned');
          pinnedHits.push(hit);
        } else {
          // If the pinned document is not in the matching hits, fetch it from the store
          const doc = this.documents.get(pinId);
          if (doc) {
            pinnedHits.push({
              id: pinId,
              score: 10.0, // Assign a high score so it stays at the top
              document: doc,
              explanation: {
                finalScore: 10.0,
                merchandisingApplied: ['pinned-injected']
              }
            });
          }
        }
      }

      // Rest of the hits
      for (const h of filtered) {
        if (!rules.pin.includes(h.id)) {
          remainingHits.push(h);
        }
      }

      return [...pinnedHits, ...remainingHits];
    }

    return filtered;
  }

  /**
   * Serialize full index state to a plain JSON object.
   */
  public toJSON(): Record<string, unknown> {
    const rawState = {
      version: 1,
      schema: this.schema,
      documents: Array.from(this.documents.entries()),
      textIndex: this.textIndex.toJSON(),
      vectorIndex: this.vectorIndex.toJSON()
    };
    return this.pluginManager.runBeforeSerialize(rawState);
  }

  /**
   * Deserialize state from a plain JSON object.
   */
  public fromJSON(data: any): void {
    const rawData = this.pluginManager.runAfterDeserialize(data);
    if (!rawData) return;

    this.documents.clear();
    if (Array.isArray(rawData.documents)) {
      for (const [k, v] of rawData.documents) {
        this.documents.set(k, v);
      }
    }

    if (rawData.textIndex) {
      this.textIndex.fromJSON(rawData.textIndex);
    }

    if (rawData.vectorIndex) {
      this.vectorIndex.fromJSON(rawData.vectorIndex);
    }
  }
}
