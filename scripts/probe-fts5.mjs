import { Database } from 'bun:sqlite';

const db = new Database(':memory:');
const compiled = db.query("SELECT sqlite_compileoption_used('ENABLE_FTS5') AS x").get();
console.log('fts5_compiled:', compiled);

try {
  db.exec('CREATE VIRTUAL TABLE t USING fts5(body)');
  db.exec("INSERT INTO t(body) VALUES ('hello world')");
  const rows = db.query("SELECT body FROM t WHERE t MATCH 'hello'").all();
  console.log('fts5_query:', rows);
  console.log('OK: bun:sqlite ships with FTS5');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
}

db.close();
