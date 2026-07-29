export type SimilarityMetric = 'cosine' | 'dot_product' | 'euclidean';

export function dotProduct(v1: Float32Array, v2: Float32Array): number {
  let sum = 0;
  const len = v1.length;
  for (let i = 0; i < len; i++) {
    sum += v1[i] * v2[i];
  }
  return sum;
}

export function magnitude(v: Float32Array): number {
  let sum = 0;
  const len = v.length;
  for (let i = 0; i < len; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

export function cosineSimilarity(v1: Float32Array, v2: Float32Array): number {
  const dot = dotProduct(v1, v2);
  const m1 = magnitude(v1);
  const m2 = magnitude(v2);
  if (m1 === 0 || m2 === 0) return 0;
  return dot / (m1 * m2);
}

export function euclideanDistance(v1: Float32Array, v2: Float32Array): number {
  let sum = 0;
  const len = v1.length;
  for (let i = 0; i < len; i++) {
    const diff = v1[i] - v2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface VectorIndexConfig {
  metric?: SimilarityMetric;
  dimensions?: number;
}

export class VectorIndex {
  private metric: SimilarityMetric;
  private dimensions?: number;
  // docId -> vector map
  private vectors = new Map<string, Float32Array>();

  constructor(config: VectorIndexConfig = {}) {
    this.metric = config.metric || 'cosine';
    this.dimensions = config.dimensions;
  }

  public addVector(docId: string, vector: number[] | Float32Array): void {
    const floatVec = vector instanceof Float32Array ? vector : new Float32Array(vector);
    
    if (this.dimensions && floatVec.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch. Expected ${this.dimensions}, got ${floatVec.length}.`);
    }

    if (!this.dimensions) {
      this.dimensions = floatVec.length;
    }

    this.vectors.set(docId, floatVec);
  }

  public removeVector(docId: string): void {
    this.vectors.delete(docId);
  }

  public batchAdd(entries: { id: string; vector: number[] | Float32Array }[]): void {
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      this.addVector(entry.id, entry.vector);
    }
  }

  /**
   * Search for nearest neighbors.
   */
  public search(
    queryVector: number[] | Float32Array,
    limit = 10,
    candidateIds?: Set<string>
  ): { docId: string; score: number }[] {
    const qVec = queryVector instanceof Float32Array ? queryVector : new Float32Array(queryVector);

    if (this.dimensions && qVec.length !== this.dimensions) {
      throw new Error(`Query vector dimension mismatch. Expected ${this.dimensions}, got ${qVec.length}.`);
    }

    const results: { docId: string; score: number }[] = [];

    for (const [docId, v] of this.vectors.entries()) {
      if (candidateIds && !candidateIds.has(docId)) {
        continue;
      }

      let rawScore = 0;
      let score = 0;

      switch (this.metric) {
        case 'cosine':
          rawScore = cosineSimilarity(qVec, v);
          // Scale from [-1, 1] to [0, 1]
          score = (rawScore + 1) / 2;
          break;

        case 'dot_product':
          rawScore = dotProduct(qVec, v);
          score = rawScore; // dot product score ranges vary, up to user
          break;

        case 'euclidean':
          rawScore = euclideanDistance(qVec, v);
          // Convert distance to similarity score: 1 / (1 + dist)
          score = 1 / (1 + rawScore);
          break;
      }

      results.push({ docId, score });
    }

    // Sort descending by score
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  public toJSON(): Record<string, unknown> {
    return {
      metric: this.metric,
      dimensions: this.dimensions,
      vectors: Array.from(this.vectors.entries()).map(([k, v]) => [k, Array.from(v)])
    };
  }

  public fromJSON(data: any): void {
    this.metric = data.metric || 'cosine';
    this.dimensions = data.dimensions;
    this.vectors.clear();

    if (Array.isArray(data.vectors)) {
      for (const [k, v] of data.vectors) {
        this.vectors.set(k, new Float32Array(v));
      }
    }
  }
}
