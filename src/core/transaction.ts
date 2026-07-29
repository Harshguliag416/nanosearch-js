import { Document, Schema } from '../types.js';
import { NanoSearch } from '../index.js';

export class Transaction<S extends Schema> {
  private stagedAdds = new Map<string, Document>();
  private stagedRemoves = new Set<string>();

  constructor(private searchEngine: NanoSearch<S>) {}

  /**
   * Stage a document for addition.
   */
  public add(doc: Document): void {
    // Access private properties via index signature to avoid TS visibility issues
    const engine = this.searchEngine as any;
    const rawDoc = engine.pluginManager.runBeforeAdd(doc);
    const normalized = engine.schemaCompiler.validateAndNormalize(rawDoc);
    const docId = normalized.id as string;

    this.stagedRemoves.delete(docId);
    this.stagedAdds.set(docId, normalized);
  }

  /**
   * Stage multiple documents for addition.
   */
  public addMany(docs: Document[]): void {
    const len = docs.length;
    for (let i = 0; i < len; i++) {
      this.add(docs[i]);
    }
  }

  /**
   * Stage a document ID for removal.
   */
  public remove(id: string): void {
    const idStr = String(id);
    this.stagedAdds.delete(idStr);
    this.stagedRemoves.add(idStr);
  }

  /**
   * Commit all staged additions and removals in a single pass.
   */
  public commit(): void {
    // 1. Process removes
    if (this.stagedRemoves.size > 0) {
      for (const id of this.stagedRemoves) {
        this.searchEngine.remove(id);
      }
    }

    // 2. Process bulk additions
    if (this.stagedAdds.size > 0) {
      const docsToIngest = Array.from(this.stagedAdds.values());
      const engine = this.searchEngine as any;
      
      if (typeof engine.addBulk === 'function') {
        engine.addBulk(docsToIngest);
      } else {
        // Fallback if addBulk is not available
        for (let i = 0; i < docsToIngest.length; i++) {
          this.searchEngine.add(docsToIngest[i]);
        }
      }
    }

    this.stagedAdds.clear();
    this.stagedRemoves.clear();
  }
}
