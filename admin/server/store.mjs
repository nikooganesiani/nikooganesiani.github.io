import { ApiError } from './service.mjs';

// Both adapters expose synchronous SQL + a real synchronous transaction:
// node:sqlite locally, SQLite-backed Durable Object on Cloudflare.
export class CatalogStore {
  constructor(sql, transaction) {
    this.sql = sql;
    this.transaction = transaction;
    sql('CREATE TABLE IF NOT EXISTS catalog_state (id INTEGER PRIMARY KEY CHECK(id = 1), body TEXT NOT NULL)');
    sql('CREATE TABLE IF NOT EXISTS catalog_history (revision INTEGER PRIMARY KEY, saved_at TEXT NOT NULL, saved_by TEXT NOT NULL, message TEXT NOT NULL, document TEXT NOT NULL)');
  }
  getState() { const row = this.sql('SELECT body FROM catalog_state WHERE id = 1')[0]; return row ? JSON.parse(row.body) : null; }
  initialize(state) {
    this.transaction(() => {
      if (this.getState()) return;
      this.sql('INSERT INTO catalog_state (id, body) VALUES (1, ?)', JSON.stringify(state));
      this.insertRevision(state, 'Первичный импорт каталога');
    });
  }
  insertRevision(state, message) {
    this.sql('INSERT INTO catalog_history (revision, saved_at, saved_by, message, document) VALUES (?, ?, ?, ?, ?)', state.revision, state.updatedAt, state.updatedBy, message, JSON.stringify(state.document));
  }
  commit(state, message, expectedRevision) {
    this.transaction(() => {
      const previous = this.getState();
      if (previous.revision !== expectedRevision || previous.pending) throw new ApiError(409, 'Каталог уже изменён. Загрузите свежую версию.');
      this.insertRevision(state, message);
      this.update(state);
      // Keep the initial backup, current publication, and 50 latest revisions.
      this.sql('DELETE FROM catalog_history WHERE revision NOT IN (SELECT revision FROM catalog_history ORDER BY revision DESC LIMIT 50) AND revision <> 1 AND revision <> ?', state.publishedRevision);
    });
  }
  update(state) { this.sql('UPDATE catalog_state SET body = ? WHERE id = 1', JSON.stringify(state)); }
  getRevision(revision) {
    const row = this.sql('SELECT revision, document FROM catalog_history WHERE revision = ?', revision)[0];
    return row ? { revision: row.revision, document: JSON.parse(row.document) } : null;
  }
  history() { return this.sql('SELECT revision, saved_at AS savedAt, saved_by AS savedBy, message FROM catalog_history ORDER BY revision DESC LIMIT 50'); }
}
