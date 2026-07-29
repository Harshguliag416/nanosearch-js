import { cosineSimilarity, euclideanDistance } from './index.js';

export interface VPNode {
  vantageId: string;
  vantagePoint: Float32Array;
  threshold: number;
  left: VPNode | null;
  right: VPNode | null;
}

export class VPTree {
  private root: VPNode | null = null;

  constructor(
    private metric: 'cosine' | 'euclidean',
    private vectors: Map<string, Float32Array>
  ) {}

  /**
   * Distance function wrapper.
   * Returns distance metric:
   * - Cosine: 1 - cosineSimilarity (scaled to [0, 1] range)
   * - Euclidean: raw L2 distance
   */
  private distance(v1: Float32Array, v2: Float32Array): number {
    if (this.metric === 'cosine') {
      const sim = cosineSimilarity(v1, v2);
      // Cosine similarity range [-1, 1], map distance to [0, 2]
      return 1 - sim;
    }
    return euclideanDistance(v1, v2);
  }

  public rebuild(): void {
    const items = Array.from(this.vectors.entries()).map(([id, vec]) => ({ id, vec }));
    this.root = this.buildTree(items);
  }

  private buildTree(items: { id: string; vec: Float32Array }[]): VPNode | null {
    if (items.length === 0) return null;

    // Select vantage point (first item)
    const vantage = items[0];
    if (items.length === 1) {
      return {
        vantageId: vantage.id,
        vantagePoint: vantage.vec,
        threshold: 0,
        left: null,
        right: null
      };
    }

    // Calculate distances to all other items
    const distances: { item: { id: string; vec: Float32Array }; dist: number }[] = [];
    const len = items.length;
    for (let i = 1; i < len; i++) {
      const item = items[i];
      distances.push({
        item,
        dist: this.distance(vantage.vec, item.vec)
      });
    }

    // Sort by distance to find median
    distances.sort((a, b) => a.dist - b.dist);
    const medianIdx = Math.floor(distances.length / 2);
    const threshold = distances[medianIdx].dist;

    const leftItems = distances.slice(0, medianIdx + 1).map(d => d.item);
    const rightItems = distances.slice(medianIdx + 1).map(d => d.item);

    return {
      vantageId: vantage.id,
      vantagePoint: vantage.vec,
      threshold,
      left: this.buildTree(leftItems),
      right: this.buildTree(rightItems)
    };
  }

  /**
   * Search top-k nearest neighbors.
   */
  public search(
    query: Float32Array,
    limit: number,
    candidateIds?: Set<string>
  ): { docId: string; score: number }[] {
    if (!this.root) return [];

    const heap: { docId: string; dist: number }[] = [];
    let maxDist = Infinity;

    const searchNode = (node: VPNode | null) => {
      if (!node) return;

      const d = this.distance(query, node.vantagePoint);

      if (candidateIds === undefined || candidateIds.has(node.vantageId)) {
        if (d < maxDist) {
          // Insert in sorted order
          let insertIdx = 0;
          const len = heap.length;
          while (insertIdx < len && heap[insertIdx].dist <= d) {
            insertIdx++;
          }
          heap.splice(insertIdx, 0, { docId: node.vantageId, dist: d });

          if (heap.length > limit) {
            heap.pop();
          }

          if (heap.length === limit) {
            maxDist = heap[heap.length - 1].dist;
          }
        }
      }

      // Check subtrees with pruning based on triangle inequality bounds
      if (d - maxDist <= node.threshold) {
        searchNode(node.left);
      }
      if (d + maxDist > node.threshold) {
        searchNode(node.right);
      }
    };

    searchNode(this.root);

    return heap.map(h => {
      let score = 0;
      if (this.metric === 'cosine') {
        // Convert distance back to similarity score [0, 1]
        score = 1 - (h.dist / 2);
      } else {
        score = 1 / (1 + h.dist);
      }
      return { docId: h.docId, score };
    });
  }
}
