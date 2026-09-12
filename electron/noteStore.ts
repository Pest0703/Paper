import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import crypto from "node:crypto";

export type NoteRow = {
  id: string;
  paperId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastScrollTop: number;
  lastCursor: number;
  schemaVersion: number;
  content: unknown;
};

const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };

export class NoteStore {
  private db: DatabaseSync;
  private cache = new Map<string, NoteRow>();
  constructor(userData: string) {
    this.db = new DatabaseSync(path.join(userData, "papertutor-notes.db"));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=NORMAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_scroll_top REAL NOT NULL DEFAULT 0,
        last_cursor INTEGER NOT NULL DEFAULT 0,
        schema_version INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE TABLE IF NOT EXISTS note_documents (
        note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
        content_json TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS note_assets (
        id TEXT PRIMARY KEY,
        note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        mime TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(note_id, hash)
      ) STRICT;
    `);
  }
  list() {
    return this.db
      .prepare(
        `SELECT id, paper_id AS paperId, title, created_at AS createdAt,
        updated_at AS updatedAt, schema_version AS schemaVersion,
        length(content_json) AS contentBytes
        FROM notes JOIN note_documents ON note_documents.note_id=notes.id
        ORDER BY updated_at DESC`,
      )
      .all();
  }
  getOrCreate(paperId: string, title: string): NoteRow {
    const existing = this.loadByPaper(paperId);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          `INSERT INTO notes(id,paper_id,title,created_at,updated_at)
          VALUES(?,?,?,?,?)`,
        )
        .run(id, paperId, title, now, now);
      this.db
        .prepare("INSERT INTO note_documents(note_id,content_json) VALUES(?,?)")
        .run(id, JSON.stringify(emptyDocument));
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.loadByPaper(paperId)!;
  }
  loadByPaper(paperId: string): NoteRow | null {
    const cached = [...this.cache.values()].find(
      (note) => note.paperId === paperId,
    );
    if (cached) {
      this.remember(cached);
      return structuredClone(cached);
    }
    const row = this.db
      .prepare(
        `SELECT id, paper_id AS paperId, title, created_at AS createdAt,
        updated_at AS updatedAt, last_scroll_top AS lastScrollTop,
        last_cursor AS lastCursor, schema_version AS schemaVersion, content_json AS content
        FROM notes JOIN note_documents ON note_documents.note_id=notes.id
        WHERE paper_id=?`,
      )
      .get(paperId) as any;
    if (!row) return null;
    const note = { ...row, content: JSON.parse(row.content) } as NoteRow;
    this.remember(note);
    return structuredClone(note);
  }
  load(id: string): NoteRow | null {
    const row = this.db
      .prepare(
        `SELECT id, paper_id AS paperId, title, created_at AS createdAt,
        updated_at AS updatedAt, last_scroll_top AS lastScrollTop,
        last_cursor AS lastCursor, schema_version AS schemaVersion, content_json AS content
        FROM notes JOIN note_documents ON note_documents.note_id=notes.id WHERE id=?`,
      )
      .get(id) as any;
    if (!row) return null;
    const note = { ...row, content: JSON.parse(row.content) } as NoteRow;
    this.remember(note);
    return structuredClone(note);
  }
  save(note: Pick<NoteRow, "id" | "content" | "lastCursor" | "lastScrollTop">) {
    const now = new Date().toISOString();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare("UPDATE note_documents SET content_json=? WHERE note_id=?")
        .run(JSON.stringify(note.content), note.id);
      this.db
        .prepare(
          `UPDATE notes SET updated_at=?,last_scroll_top=?,last_cursor=? WHERE id=?`,
        )
        .run(now, note.lastScrollTop, note.lastCursor, note.id);
      this.db.exec("COMMIT");
      const cached = this.cache.get(note.id);
      if (cached)
        this.remember({
          ...cached,
          content: note.content,
          lastCursor: note.lastCursor,
          lastScrollTop: note.lastScrollTop,
          updatedAt: now,
        });
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private remember(note: NoteRow) {
    this.cache.delete(note.id);
    this.cache.set(note.id, note);
    while (this.cache.size > 3)
      this.cache.delete(this.cache.keys().next().value!);
  }
  cacheSize() {
    return this.cache.size;
  }
  registerAsset(
    noteId: string,
    asset: { id: string; relativePath: string; mime: string; hash: string },
  ) {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO note_assets(id,note_id,relative_path,mime,hash,created_at)
        VALUES(?,?,?,?,?,?)`,
      )
      .run(
        asset.id,
        noteId,
        asset.relativePath,
        asset.mime,
        asset.hash,
        new Date().toISOString(),
      );
  }
  close() {
    this.db.close();
  }
}
