import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { State } from '../shared/types.js';
import { seed } from './seed.js';
export class Store {
  private db: DatabaseSync;
  constructor(directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'control-plane.sqlite'));
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), document TEXT NOT NULL)',
    );
    if (!this.db.prepare('SELECT id FROM state WHERE id=1').get())
      this.db.prepare('INSERT INTO state(id,document) VALUES(1,?)').run(JSON.stringify(seed()));
    const s = this.read();
    if (s.schemaVersion !== 1) throw new Error('Unsupported AtSys database schema');
  }
  read(): State {
    const row = this.db.prepare('SELECT document FROM state WHERE id=1').get() as {
      document: string;
    };
    return JSON.parse(row.document);
  }
  update<T>(fn: (state: State) => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const s = this.read();
      const result = fn(s);
      s.revision++;
      this.db.prepare('UPDATE state SET document=? WHERE id=1').run(JSON.stringify(s));
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
