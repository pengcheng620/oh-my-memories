// Inlined SQL for migration 002. Adds the embeddings table for semantic search.
// The companion `.sql` file exists for review tooling — keep both in sync.
//
// Spec: specs/m7-design.md §2.3.

export const MIGRATION_002_EMBEDDINGS = `
CREATE TABLE IF NOT EXISTS embeddings (
  record_id TEXT NOT NULL REFERENCES memories(record_id) ON DELETE CASCADE,
  model     TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
  vector    BLOB NOT NULL,
  PRIMARY KEY (record_id, model)
);

CREATE INDEX idx_embeddings_model ON embeddings(model);
`;
