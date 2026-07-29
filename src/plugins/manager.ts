import { NanoSearchPlugin, Document, SearchOptions, SearchResults } from '../types.js';

export class PluginManager {
  private plugins: NanoSearchPlugin[] = [];

  public register(plugin: NanoSearchPlugin): void {
    if (this.plugins.some(p => p.name === plugin.name)) {
      throw new Error(`Plugin with name '${plugin.name}' is already registered.`);
    }
    this.plugins.push(plugin);
  }

  public getCustomAnalyzers(): Record<string, (text: string) => string[]> {
    const analyzers: Record<string, (text: string) => string[]> = {};
    for (const plugin of this.plugins) {
      if (plugin.customAnalyzers) {
        Object.assign(analyzers, plugin.customAnalyzers);
      }
    }
    return analyzers;
  }

  public runBeforeAdd(doc: Document): Document {
    let currentDoc = { ...doc };
    for (const plugin of this.plugins) {
      if (plugin.beforeAdd) {
        const res = plugin.beforeAdd(currentDoc);
        if (res) {
          currentDoc = res;
        }
      }
    }
    return currentDoc;
  }

  public runAfterAdd(doc: Document, indexStates: Record<string, unknown>): void {
    for (const plugin of this.plugins) {
      if (plugin.afterAdd) {
        plugin.afterAdd(doc, indexStates);
      }
    }
  }

  public runBeforeRemove(id: string): void {
    for (const plugin of this.plugins) {
      if (plugin.beforeRemove) {
        plugin.beforeRemove(id);
      }
    }
  }

  public runAfterRemove(id: string): void {
    for (const plugin of this.plugins) {
      if (plugin.afterRemove) {
        plugin.afterRemove(id);
      }
    }
  }

  public runBeforeSearch(options: SearchOptions<any>): SearchOptions<any> {
    let currentOptions = { ...options };
    for (const plugin of this.plugins) {
      if (plugin.beforeSearch) {
        const res = plugin.beforeSearch(currentOptions);
        if (res) {
          currentOptions = res;
        }
      }
    }
    return currentOptions;
  }

  public runAfterSearch(results: SearchResults<any>): SearchResults<any> {
    let currentResults = { ...results };
    for (const plugin of this.plugins) {
      if (plugin.afterSearch) {
        const res = plugin.afterSearch(currentResults);
        if (res) {
          currentResults = res;
        }
      }
    }
    return currentResults;
  }

  public runBeforeSerialize(state: Record<string, unknown>): Record<string, unknown> {
    let currentState = { ...state };
    for (const plugin of this.plugins) {
      if (plugin.beforeSerialize) {
        const res = plugin.beforeSerialize(currentState);
        if (res) {
          currentState = res;
        }
      }
    }
    return currentState;
  }

  public runAfterDeserialize(state: Record<string, unknown>): Record<string, unknown> {
    let currentState = { ...state };
    for (const plugin of this.plugins) {
      if (plugin.afterDeserialize) {
        const res = plugin.afterDeserialize(currentState);
        if (res) {
          currentState = res;
        }
      }
    }
    return currentState;
  }
}
