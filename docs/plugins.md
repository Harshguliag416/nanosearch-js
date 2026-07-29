# NanoSearch Plugin System Guide

`NanoSearch` exposes a flexible lifecycle hook system allowing you to modify documents before index, perform audit logs, customize search options, or extend serialization.

## Lifecycle Hook Pipeline

```
Indexing:
[Document Ingest] -> beforeAdd() -> validateAndNormalize() -> [Index Actions] -> afterAdd()

Searching:
[Search Query] -> beforeSearch() -> [Search Execution] -> afterSearch() -> [Results Output]

Serialization:
[Get State JSON] -> beforeSerialize() -> [Output State]
[Load State JSON] -> [Load state] -> afterDeserialize() -> [Completed Setup]
```

## Creating a Plugin

A plugin is simply an object satisfying the `NanoSearchPlugin` interface:

```typescript
import { NanoSearchPlugin } from 'nanosearch-js';

export const myPlugin: NanoSearchPlugin = {
  name: 'my-custom-plugin',
  
  beforeAdd(doc) {
    // Optionally modify or inject fields
    doc.slug = doc.title.toLowerCase().replace(/ /g, '-');
    return doc;
  },

  afterAdd(doc, indexStates) {
    // Perform side-effects (e.g. log metrics)
    console.log(`Document ${doc.id} successfully indexed.`);
  }
};
```

To use it:

```typescript
import { NanoSearch } from 'nanosearch-js';

const search = new NanoSearch(schema);
search.use(myPlugin);
```
