import { Tokenizer } from './tokenizer.js';
import { DeletionFuzzyIndex } from './fuzzy.js';

export interface Posting {
  docId: string;
  freq: number;
  positions: number[];
}

export class BM25TextIndex {
  // field -> token -> posting list
  private invertedIndex = new Map<string, Map<string, Posting[]>>();
  // docId -> field -> docLength
  private docLengths = new Map<string, Map<string, number>>();
  // field -> totalDocLength
  private totalDocLengths = new Map<string, number>();
  // Number of documents indexed
  private numDocs = 0;
  // field -> fuzzy index
  private fuzzyIndices = new Map<string, DeletionFuzzyIndex>();

  constructor(
    private fields: string[],
    private tokenizer: Tokenizer,
    private k1 = 1.2,
    private b = 0.75
  ) {
    for (const f of fields) {
      this.invertedIndex.set(f, new Map<string, Posting[]>());
      this.fuzzyIndices.set(f, new DeletionFuzzyIndex(1));
    }
  }

  /**
   * Index text from a document.
   */
  public addDocument(docId: string, docData: Record<string, unknown>): void {
    this.numDocs++;

    for (const field of this.fields) {
      const text = docData[field];
      if (typeof text !== 'string') continue;

      const tokens = this.tokenizer.tokenizeWithOffsets(text);
      if (tokens.length === 0) continue;

      // Track document length
      let lengths = this.docLengths.get(docId);
      if (!lengths) {
        lengths = new Map<string, number>();
        this.docLengths.set(docId, lengths);
      }
      lengths.set(field, tokens.length);
      this.totalDocLengths.set(field, (this.totalDocLengths.get(field) || 0) + tokens.length);

      // Populate postings
      const fieldIndex = this.invertedIndex.get(field)!;
      const fuzzyIndex = this.fuzzyIndices.get(field)!;
      
      const termPostings = new Map<string, number[]>();
      for (let pos = 0; pos < tokens.length; pos++) {
        const token = tokens[pos].token;
        let positions = termPostings.get(token);
        if (!positions) {
          positions = [];
          termPostings.set(token, positions);
        }
        positions.push(pos);
      }

      for (const [token, positions] of termPostings.entries()) {
        fuzzyIndex.addTerm(token);
        let postings = fieldIndex.get(token);
        if (!postings) {
          postings = [];
          fieldIndex.set(token, postings);
        }
        postings.push({
          docId,
          freq: positions.length,
          positions
        });
      }
    }
  }

  /**
   * Remove a document from the text index.
   */
  public removeDocument(docId: string): void {
    const lengths = this.docLengths.get(docId);
    if (!lengths) return;

    this.numDocs = Math.max(0, this.numDocs - 1);

    for (const [field, length] of lengths.entries()) {
      // Decrement totals
      this.totalDocLengths.set(field, Math.max(0, (this.totalDocLengths.get(field) || 0) - length));

      // Remove from inverted index
      const fieldIndex = this.invertedIndex.get(field);
      if (fieldIndex) {
        for (const [term, postings] of fieldIndex.entries()) {
          const index = postings.findIndex(p => p.docId === docId);
          if (index !== -1) {
            postings.splice(index, 1);
            if (postings.length === 0) {
              fieldIndex.delete(term);
              // Note: We don't remove from fuzzyIndex to avoid expensive re-building,
              // since it will just find no postings anyway.
            }
          }
        }
      }
    }

    this.docLengths.delete(docId);
  }

  /**
   * Computes average document length for a field.
   */
  private getAvgDocLength(field: string): number {
    if (this.numDocs === 0) return 0;
    return (this.totalDocLengths.get(field) || 0) / this.numDocs;
  }

  /**
   * Search and score documents matching search options.
   */
  public search(
    queryText: string,
    searchFields: string[],
    fieldBoosts: Record<string, number> = {},
    typoToleranceOpts: { enabled?: boolean; maxDistance?: 1 | 2; minWordLength?: number } = {}
  ): { docId: string; score: number; termsMatched: string[] }[] {
    const queryTokens = this.tokenizer.tokenize(queryText);
    if (queryTokens.length === 0) return [];

    const docScores = new Map<string, { score: number; matched: Set<string> }>();

    for (const field of searchFields) {
      const fieldIndex = this.invertedIndex.get(field);
      const fuzzyIndex = this.fuzzyIndices.get(field);
      if (!fieldIndex) continue;

      const avgDl = this.getAvgDocLength(field);
      const fieldBoost = fieldBoosts[field] ?? 1;

      for (const queryToken of queryTokens) {
        // Collect candidate terms: exact match, prefix match, or fuzzy match
        const termMatches: { term: string; penalty: number }[] = [];

        // Exact match
        if (fieldIndex.has(queryToken)) {
          termMatches.push({ term: queryToken, penalty: 1.0 });
        }

        // Fuzzy match if enabled
        const minWordLen = typoToleranceOpts.minWordLength ?? 0;
        if (typoToleranceOpts.enabled && fuzzyIndex && queryToken.length >= minWordLen) {
          const fuzzyResults = fuzzyIndex.search(queryToken, typoToleranceOpts.maxDistance || 1);
          for (const res of fuzzyResults) {
            if (res.term !== queryToken) {
              // 0.8 penalty for distance 1, 0.6 penalty for distance 2
              const penalty = res.distance === 1 ? 0.8 : 0.6;
              termMatches.push({ term: res.term, penalty });
            }
          }
        }

        // Prefix match for tokens >= 3 chars if no exact match or as addition
        if (queryToken.length >= 3) {
          for (const indexedTerm of fieldIndex.keys()) {
            if (indexedTerm.startsWith(queryToken) && indexedTerm !== queryToken) {
              termMatches.push({ term: indexedTerm, penalty: 0.9 });
            }
          }
        }

        // De-duplicate matching terms
        const uniqueTerms = new Map<string, number>();
        for (const tm of termMatches) {
          const existing = uniqueTerms.get(tm.term);
          if (existing === undefined || tm.penalty > existing) {
            uniqueTerms.set(tm.term, tm.penalty);
          }
        }

        for (const [term, penalty] of uniqueTerms.entries()) {
          const postings = fieldIndex.get(term);
          if (!postings || postings.length === 0) continue;

          // IDF calculation
          const df = postings.length;
          const idf = Math.max(0.0001, Math.log(1 + (this.numDocs - df + 0.5) / (df + 0.5)));

          for (const posting of postings) {
            const docId = posting.docId;
            const tf = posting.freq;
            const docLen = this.docLengths.get(docId)?.get(field) || 0;

            // BM25 formula
            const scoreNum = tf * (this.k1 + 1);
            const scoreDen = tf + this.k1 * (1 - this.b + this.b * (docLen / (avgDl || 1)));
            const score = idf * (scoreNum / scoreDen) * fieldBoost * penalty;

            let scoreObj = docScores.get(docId);
            if (!scoreObj) {
              scoreObj = { score: 0, matched: new Set() };
              docScores.set(docId, scoreObj);
            }
            scoreObj.score += score;
            scoreObj.matched.add(queryToken);
          }
        }
      }
    }

    const results: { docId: string; score: number; termsMatched: string[] }[] = [];
    for (const [docId, obj] of docScores.entries()) {
      results.push({
        docId,
        score: obj.score,
        termsMatched: Array.from(obj.matched)
      });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Performs a exact phrase search matching.
   */
  public phraseSearch(
    phrase: string,
    searchFields: string[]
  ): { docId: string; score: number }[] {
    const phraseTokens = this.tokenizer.tokenize(phrase);
    if (phraseTokens.length <= 1) {
      // Fallback to regular search for single token
      return this.search(phrase, searchFields);
    }

    const docScores = new Map<string, number>();

    for (const field of searchFields) {
      const fieldIndex = this.invertedIndex.get(field);
      if (!fieldIndex) continue;

      // Find documents containing all tokens
      const candidateDocs = new Map<string, number[][]>(); // docId -> Array of positions per token
      let firstToken = true;

      for (const token of phraseTokens) {
        const postings = fieldIndex.get(token) || [];
        const currentDocs = new Set(postings.map(p => p.docId));

        if (firstToken) {
          for (const p of postings) {
            candidateDocs.set(p.docId, [p.positions]);
          }
          firstToken = false;
        } else {
          for (const docId of candidateDocs.keys()) {
            if (!currentDocs.has(docId)) {
              candidateDocs.delete(docId);
            } else {
              const posting = postings.find(p => p.docId === docId)!;
              candidateDocs.get(docId)!.push(posting.positions);
            }
          }
        }
      }

      // Verify adjacency of positions
      for (const [docId, posLists] of candidateDocs.entries()) {
        if (this.checkWordAdjacency(posLists)) {
          // Add a basic boost or BM25-like scoring for exact phrases
          const existing = docScores.get(docId) || 0;
          docScores.set(docId, existing + 2.0 * phraseTokens.length);
        }
      }
    }

    return Array.from(docScores.entries()).map(([docId, score]) => ({
      docId,
      score
    })).sort((a, b) => b.score - a.score);
  }

  private checkWordAdjacency(posLists: number[][]): boolean {
    const [first, ...rest] = posLists;
    for (const startPos of first) {
      let current = startPos;
      let matches = true;

      for (let i = 0; i < rest.length; i++) {
        const nextList = rest[i];
        if (!nextList.includes(current + 1)) {
          matches = false;
          break;
        }
        current++;
      }

      if (matches) return true;
    }
    return false;
  }

  public toJSON(): Record<string, unknown> {
    const serializedInverted = new Map<string, any>();
    for (const [field, tokenMap] of this.invertedIndex.entries()) {
      serializedInverted.set(field, Array.from(tokenMap.entries()));
    }

    const serializedFuzzy = new Map<string, any>();
    for (const [field, fIndex] of this.fuzzyIndices.entries()) {
      serializedFuzzy.set(field, fIndex.toJSON());
    }

    return {
      invertedIndex: Array.from(serializedInverted.entries()),
      docLengths: Array.from(this.docLengths.entries()).map(([k, v]) => [k, Array.from(v.entries())]),
      totalDocLengths: Array.from(this.totalDocLengths.entries()),
      numDocs: this.numDocs,
      fuzzyIndices: Array.from(serializedFuzzy.entries())
    };
  }

  public fromJSON(data: any): void {
    this.numDocs = data.numDocs || 0;
    
    this.totalDocLengths.clear();
    if (Array.isArray(data.totalDocLengths)) {
      for (const [k, v] of data.totalDocLengths) {
        this.totalDocLengths.set(k, v);
      }
    }

    this.docLengths.clear();
    if (Array.isArray(data.docLengths)) {
      for (const [k, v] of data.docLengths) {
        this.docLengths.set(k, new Map(v));
      }
    }

    this.invertedIndex.clear();
    if (Array.isArray(data.invertedIndex)) {
      for (const [field, tokenEntries] of data.invertedIndex) {
        this.invertedIndex.set(field, new Map(tokenEntries));
      }
    }

    this.fuzzyIndices.clear();
    if (Array.isArray(data.fuzzyIndices)) {
      for (const [field, fuzzyData] of data.fuzzyIndices) {
        const fIndex = new DeletionFuzzyIndex();
        fIndex.fromJSON(fuzzyData);
        this.fuzzyIndices.set(field, fIndex);
      }
    }
  }
}
