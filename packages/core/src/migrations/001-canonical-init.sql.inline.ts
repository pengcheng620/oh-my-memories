// Inlined SQL for migration 001. The companion `.sql` file exists for review
// tooling — keep both in sync. CI guards parity via tests/migrations.test.ts.
//
// Spec: specs/m3-canonical-store-mini-spec.md §2.3.

export const MIGRATION_001_CANONICAL_INIT = `
CREATE TABLE schema_meta (
  schema_version INTEGER NOT NULL CHECK (schema_version >= 1),
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE memories (
  mem_pk INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,
  session_id TEXT,
  timestamp_ms INTEGER NOT NULL,
  role TEXT,
  text TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  fingerprint TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX idx_memories_source ON memories(source);
CREATE INDEX idx_memories_timestamp ON memories(timestamp_ms);
CREATE INDEX idx_memories_session ON memories(session_id);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  text,
  content='memories',
  content_rowid='mem_pk',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, text) VALUES (NEW.mem_pk, NEW.text);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', OLD.mem_pk, OLD.text);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, text) VALUES('delete', OLD.mem_pk, OLD.text);
  INSERT INTO memories_fts(rowid, text) VALUES (NEW.mem_pk, NEW.text);
END;
`;
