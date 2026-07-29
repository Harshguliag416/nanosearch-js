let rowPool1 = new Int32Array(64);
let rowPool2 = new Int32Array(64);

/**
 * Computes the Levenshtein distance between two strings.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  // Swap to save memory (keep s2 as the shorter string)
  if (s1.length < s2.length) {
    const tmp = s1;
    s1 = s2;
    s2 = tmp;
  }

  const l1 = s1.length;
  const l2 = s2.length;

  if (rowPool1.length <= l2) {
    const newSize = Math.max(rowPool1.length * 2, l2 + 1);
    rowPool1 = new Int32Array(newSize);
    rowPool2 = new Int32Array(newSize);
  }

  let prevRow = rowPool1;
  let currentRow = rowPool2;

  for (let i = 0; i <= l2; i++) {
    prevRow[i] = i;
  }

  for (let i = 0; i < l1; i++) {
    currentRow[0] = i + 1;
    for (let j = 0; j < l2; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      currentRow[j + 1] = Math.min(
        currentRow[j] + 1, // Insertion
        prevRow[j + 1] + 1, // Deletion
        prevRow[j] + cost // Substitution
      );
    }
    // Swap rows
    const temp = prevRow;
    prevRow = currentRow;
    currentRow = temp;
  }

  return prevRow[l2];
}

export class DeletionFuzzyIndex {
  // Map of deletion variant -> Set of original terms
  private deletes = new Map<string, Set<string>>();
  // Set of all indexed original terms
  private terms = new Set<string>();

  constructor(private maxDistance: 1 | 2 = 1) {}

  /**
   * Generates all deletion variants of a word up to maxDistance.
   */
  private generateDeletes(word: string, distance: number, existing: Set<string>): void {
    if (word.length <= 1) return;

    for (let i = 0; i < word.length; i++) {
      const del = word.slice(0, i) + word.slice(i + 1);
      if (!existing.has(del)) {
        existing.add(del);
        if (distance < this.maxDistance) {
          this.generateDeletes(del, distance + 1, existing);
        }
      }
    }
  }

  /**
   * Index a term.
   */
  public addTerm(term: string): void {
    if (this.terms.has(term)) return;
    this.terms.add(term);

    // Add full term itself to its delete list to handle matches
    this.addDelete(term, term);

    const edits = new Set<string>();
    this.generateDeletes(term, 1, edits);

    for (const del of edits) {
      this.addDelete(del, term);
    }
  }

  private addDelete(del: string, term: string): void {
    let list = this.deletes.get(del);
    if (!list) {
      list = new Set<string>();
      this.deletes.set(del, list);
    }
    list.add(term);
  }

  /**
   * Find candidate words matching the term within edit distance.
   * Returns list of { term, distance } sorted by distance.
   */
  public search(query: string, maxDist: 1 | 2 = this.maxDistance): { term: string; distance: number }[] {
    if (this.terms.has(query)) {
      return [{ term: query, distance: 0 }];
    }

    const candidates = new Set<string>();
    const edits = new Set<string>();
    edits.add(query);
    this.generateDeletes(query, 1, edits);

    for (const del of edits) {
      const matches = this.deletes.get(del);
      if (matches) {
        for (const m of matches) {
          candidates.add(m);
        }
      }
    }

    const results: { term: string; distance: number }[] = [];
    for (const cand of candidates) {
      const dist = levenshteinDistance(query, cand);
      if (dist <= maxDist) {
        results.push({ term: cand, distance: dist });
      }
    }

    return results.sort((a, b) => a.distance - b.distance);
  }

  public clear(): void {
    this.deletes.clear();
    this.terms.clear();
  }

  public toJSON(): Record<string, unknown> {
    return {
      deletes: Array.from(this.deletes.entries()).map(([k, v]) => [k, Array.from(v)]),
      terms: Array.from(this.terms)
    };
  }

  public fromJSON(data: any): void {
    this.clear();
    if (!data) return;

    if (Array.isArray(data.terms)) {
      for (const t of data.terms) {
        this.terms.add(t);
      }
    }

    if (Array.isArray(data.deletes)) {
      for (const [k, v] of data.deletes) {
        this.deletes.set(k, new Set(v));
      }
    }
  }
}
