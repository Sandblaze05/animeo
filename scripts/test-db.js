// Simple test script to verify ANIMEO_DATA_DIR and creating a SQLite file.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = process.env.ANIMEO_DATA_DIR || path.join(process.cwd(), 'data-test');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'test-animeo.sqlite');

console.log('Using data dir:', dataDir);
console.log('DB path:', dbPath);

try {
  const db = new Database(dbPath);
  db.prepare('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY, name TEXT)').run();
  db.prepare('INSERT INTO test (name) VALUES (?)').run('ok');
  const row = db.prepare('SELECT COUNT(*) as c FROM test').get();
  console.log('Row count after insert:', row.c);
  db.close();
  console.log('DB created and accessible.');
} catch (e) {
  console.error('Failed to create/open DB:', e && e.message);
  process.exit(1);
}
