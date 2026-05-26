import { getDb, tagsToJson, tagsFromJson, jsonFromStr } from './core.js';
import type { Note } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

export function loadAllNotes(logger?: PapyrusLogger): Note[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM notes').all() as unknown as Note[];
  logger?.info(`查询笔记: ${rows.length} 条`);
  return rows.map(r => ({
    ...r,
    tags: tagsFromJson(r.tags as unknown as string),
    headings: jsonFromStr(r.headings as unknown as string) as Note['headings'],
    outgoing_links: jsonFromStr(r.outgoing_links as unknown as string) as Note['outgoing_links'],
  }));
}

export function saveAllNotes(notes: Note[], logger?: PapyrusLogger): void {
  const database = getDb();
  const deleteStmt = database.prepare('DELETE FROM notes');
  const insertStmt = database.prepare(`
    INSERT INTO notes (id, title, folder, content, preview, tags, created_at, updated_at, word_count, hash, headings, outgoing_links, incoming_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  deleteStmt.run();
  for (const note of notes) {
    insertStmt.run(note.id, note.title, note.folder, note.content, note.preview, tagsToJson(note.tags), note.created_at, note.updated_at, note.word_count, note.hash, JSON.stringify(note.headings ?? []), JSON.stringify(note.outgoing_links ?? []), note.incoming_count ?? 0);
  }
  logger?.info(`保存笔记: ${notes.length} 条`);
}

export function insertNote(note: Note, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(`
    INSERT INTO notes (id, title, folder, content, preview, tags, created_at, updated_at, word_count, hash, headings, outgoing_links, incoming_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(note.id, note.title, note.folder, note.content, note.preview, tagsToJson(note.tags), note.created_at ?? 0, note.updated_at ?? 0, note.word_count ?? 0, note.hash ?? '', JSON.stringify(note.headings ?? []), JSON.stringify(note.outgoing_links ?? []), note.incoming_count ?? 0);
  logger?.info(`插入笔记: ${note.id}`);
}

export function deleteNoteById(noteId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM notes WHERE id = ?');
  const result = stmt.run(noteId);
  logger?.info(`删除笔记: ${noteId}`);
  return result.changes > 0;
}

export function deleteNotesByIds(noteIds: string[], logger?: PapyrusLogger): number {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM notes WHERE id = ?');
  let count = 0;
  for (const id of noteIds) {
    const result = stmt.run(id);
    count += Number(result.changes);
  }
  logger?.info(`批量删除笔记: ${count} 条`);
  return count;
}

export function getNoteById(noteId: string): Note | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM notes WHERE id = ?').get(noteId) as Note | undefined;
  if (!row) return null;
  return {
    ...row,
    tags: tagsFromJson(row.tags as unknown as string),
    headings: jsonFromStr(row.headings as unknown as string) as Note['headings'],
    outgoing_links: jsonFromStr(row.outgoing_links as unknown as string) as Note['outgoing_links'],
  };
}

export function updateNote(note: Note, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM notes WHERE id = ?').get(note.id) as { id: string } | undefined;
  if (!existing) {
    logger?.warning(`笔记不存在: ${note.id}`);
    return false;
  }
  const stmt = database.prepare(`
    UPDATE notes SET title = ?, folder = ?, content = ?, preview = ?, tags = ?, created_at = ?, updated_at = ?, word_count = ?, hash = ?, headings = ?, outgoing_links = ?, incoming_count = ? WHERE id = ?
  `);
  stmt.run(note.title, note.folder, note.content, note.preview, tagsToJson(note.tags), note.created_at ?? 0, note.updated_at ?? 0, note.word_count ?? 0, note.hash ?? '', JSON.stringify(note.headings ?? []), JSON.stringify(note.outgoing_links ?? []), note.incoming_count ?? 0, note.id);
  logger?.info(`更新笔记: ${note.id}`);
  return true;
}

export function getNotesByFolder(folder: string): Note[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM notes WHERE folder = ?').all(folder) as unknown as Note[];
  return rows.map(r => ({ ...r, tags: tagsFromJson(r.tags as unknown as string) }));
}

export function getNoteCount(): number {
  const database = getDb();
  const result = database.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number };
  return result.c;
}

export function getAllFolders(): string[] {
  const database = getDb();
  const rows = database.prepare('SELECT DISTINCT folder FROM notes ORDER BY folder').all() as Array<{ folder: string }>;
  return rows.map(r => r.folder);
}
