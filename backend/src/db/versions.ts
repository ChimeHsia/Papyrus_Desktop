import { getDb } from './core.js';
import type { Note, CardRecord } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

export function saveNoteVersion(note: Note, logger?: PapyrusLogger): string {
  const database = getDb();
  const versionStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as max_version FROM note_versions WHERE note_id = ?');
  const versionRow = versionStmt.get(note.id) as { max_version: number } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;
  const versionId = `${note.id}_v${version}`;

  database.prepare(
    `INSERT INTO note_versions (id, note_id, version, title, folder, content, preview, tags, word_count, hash, headings, outgoing_links, incoming_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(versionId, note.id, version, note.title, note.folder, note.content, note.preview,
    JSON.stringify(note.tags ?? []), note.word_count ?? 0, note.hash ?? '',
    JSON.stringify(note.headings ?? []), JSON.stringify(note.outgoing_links ?? []), note.incoming_count ?? 0, Date.now() / 1000);
  logger?.info(`保存笔记版本: ${note.id} v${version}`);
  return versionId;
}

export function getNoteVersions(noteId: string): Array<Note & { version: number; version_id: string; version_created_at: number }> {
  const database = getDb();
  const rows = database.prepare(
    'SELECT * FROM note_versions WHERE note_id = ? ORDER BY version DESC'
  ).all(noteId) as Array<{
    id: string; note_id: string; version: number; title: string; folder: string;
    content: string; preview: string; tags: string; word_count: number; hash: string;
    headings: string; outgoing_links: string; incoming_count: number; created_at: number;
  }>;
  return rows.map(row => ({
    id: row.note_id,
    title: row.title,
    folder: row.folder,
    content: row.content,
    preview: row.preview,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    created_at: row.created_at,
    updated_at: 0,
    word_count: row.word_count,
    hash: row.hash,
    headings: typeof row.headings === 'string' ? JSON.parse(row.headings) : row.headings,
    outgoing_links: typeof row.outgoing_links === 'string' ? JSON.parse(row.outgoing_links) : row.outgoing_links,
    incoming_count: row.incoming_count,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  }));
}

export function getNoteVersionById(versionId: string): (Note & { version: number; version_id: string; version_created_at: number }) | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM note_versions WHERE id = ?').get(versionId) as {
    id: string; note_id: string; version: number; title: string; folder: string;
    content: string; preview: string; tags: string; word_count: number; hash: string;
    headings: string; outgoing_links: string; incoming_count: number; created_at: number;
  } | undefined;
  if (!row) return null;
  return {
    id: row.note_id,
    title: row.title,
    folder: row.folder,
    content: row.content,
    preview: row.preview,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    created_at: row.created_at,
    updated_at: 0,
    word_count: row.word_count,
    hash: row.hash,
    headings: typeof row.headings === 'string' ? JSON.parse(row.headings) : row.headings,
    outgoing_links: typeof row.outgoing_links === 'string' ? JSON.parse(row.outgoing_links) : row.outgoing_links,
    incoming_count: row.incoming_count,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  };
}

export function getLatestNoteVersionHash(noteId: string): string | null {
  const database = getDb();
  const row = database.prepare('SELECT hash FROM note_versions WHERE note_id = ? ORDER BY version DESC LIMIT 1').get(noteId) as { hash: string } | undefined;
  return row?.hash ?? null;
}

export function saveCardVersion(card: CardRecord, contentHash: string, logger?: PapyrusLogger): string {
  const database = getDb();
  const versionStmt = database.prepare('SELECT COALESCE(MAX(version), 0) as max_version FROM card_versions WHERE card_id = ?');
  const versionRow = versionStmt.get(card.id) as { max_version: number } | undefined;
  const version = (versionRow?.max_version ?? 0) + 1;
  const versionId = `${card.id}_v${version}`;

  database.prepare(
    'INSERT INTO card_versions (id, card_id, version, q, a, tags, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(versionId, card.id, version, card.q, card.a, JSON.stringify(card.tags ?? []), contentHash, Date.now() / 1000);
  logger?.info(`保存卡片版本: ${card.id} v${version}`);
  return versionId;
}

export function getCardVersions(cardId: string): Array<CardRecord & { version: number; version_id: string; version_created_at: number }> {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM card_versions WHERE card_id = ? ORDER BY version DESC').all(cardId) as Array<{
    id: string; card_id: string; version: number; q: string; a: string;
    tags: string; content_hash: string; created_at: number;
  }>;
  return rows.map(row => ({
    id: row.card_id,
    q: row.q,
    a: row.a,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    next_review: 0,
    interval: 0,
    ef: 2.5,
    repetitions: 0,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  }));
}

export function getCardVersionById(versionId: string): (CardRecord & { version: number; version_id: string; version_created_at: number }) | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM card_versions WHERE id = ?').get(versionId) as {
    id: string; card_id: string; version: number; q: string; a: string;
    tags: string; content_hash: string; created_at: number;
  } | undefined;
  if (!row) return null;
  return {
    id: row.card_id,
    q: row.q,
    a: row.a,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    next_review: 0,
    interval: 0,
    ef: 2.5,
    repetitions: 0,
    version: row.version,
    version_id: row.id,
    version_created_at: row.created_at,
  };
}

export function getLatestCardVersionHash(cardId: string): string | null {
  const database = getDb();
  const row = database.prepare('SELECT content_hash FROM card_versions WHERE card_id = ? ORDER BY version DESC LIMIT 1').get(cardId) as { content_hash: string } | undefined;
  return row?.content_hash ?? null;
}
