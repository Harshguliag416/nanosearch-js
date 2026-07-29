# NanoSearch Snapshot Migration & Versioning

Because `NanoSearch` is fully in-memory and supports exporting/importing states via `toJSON()` and `fromJSON()`, maintaining backwards compatibility between index snapshots is essential.

## Snapshot Structure

A state snapshot contains the schema version and raw state mappings:

```json
{
  "version": 1,
  "schema": { ... },
  "documents": [ ... ],
  "textIndex": { ... },
  "vectorIndex": { ... }
}
```

## Migration Strategy

When updating schema fields, re-indexing from original source documents is recommended. However, if schema fields are backwards-compatible:
1. Load the original snapshot.
2. Inject default values or index missing fields dynamically.
3. Export the upgraded snapshot.

### Example: Schema Expansion

If you add a new field to your schema with a default value:

```typescript
const updatedSchema = {
  ...oldSchema,
  status: { type: 'string', default: 'active' }
};

const search = new NanoSearch(updatedSchema);
// Load old snapshot
search.fromJSON(oldSnapshotData);
// NanoSearch compiler automatically fills defaults on querying or next indexing pass.
```
