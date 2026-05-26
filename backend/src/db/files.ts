import { getDb } from './core.js';
import type { FileRecord } from '../core/types.js';
import type { PapyrusLogger } from '../utils/logger.js';

export function loadAllFiles(logger?: PapyrusLogger): FileRecord[] {
  const database = getDb();
  const rows = database.prepare('SELECT * FROM files ORDER BY is_folder DESC, name').all() as unknown as FileRecord[];
  logger?.info(`查询文件: ${rows.length} 条`);
  return rows;
}

export function getFileById(fileId: string): FileRecord | null {
  const database = getDb();
  const row = database.prepare('SELECT * FROM files WHERE id = ?').get(fileId) as FileRecord | undefined;
  return row ?? null;
}

export function getFilesByParentId(parentId: string | null): FileRecord[] {
  const database = getDb();
  const rows = database.prepare(
    'SELECT f.*, (SELECT COUNT(*) FROM files AS child WHERE child.parent_id = f.id) AS item_count FROM files f WHERE f.parent_id IS ? ORDER BY f.is_folder DESC, f.name'
  ).all(parentId) as unknown as FileRecord[];
  return rows.map(r => ({
    ...r,
    item_count: r.is_folder ? (r as FileRecord & { item_count: number }).item_count : undefined,
  }));
}

export function insertFile(file: FileRecord, logger?: PapyrusLogger): void {
  const database = getDb();
  const stmt = database.prepare(
    'INSERT INTO files (id, name, type, size, mime_type, parent_id, file_storage_path, is_folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  stmt.run(file.id, file.name, file.type, file.size ?? 0, file.mime_type ?? '', file.parent_id ?? null, file.file_storage_path ?? null, file.is_folder ? 1 : 0, file.created_at ?? Date.now(), file.updated_at ?? Date.now());
  logger?.info(`插入文件: ${file.id}`);
}

export function deleteFileById(fileId: string, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM files WHERE id = ?');
  const result = stmt.run(fileId);
  logger?.info(`删除文件: ${fileId}`);
  return result.changes > 0;
}

export function deleteFilesByIds(fileIds: string[], logger?: PapyrusLogger): number {
  const database = getDb();
  const stmt = database.prepare('DELETE FROM files WHERE id = ?');
  let count = 0;
  for (const id of fileIds) {
    const result = stmt.run(id);
    count += Number(result.changes);
  }
  logger?.info(`批量删除文件: ${count} 条`);
  return count;
}

export function updateFile(file: Partial<FileRecord> & { id: string }, logger?: PapyrusLogger): boolean {
  const database = getDb();
  const existing = database.prepare('SELECT id FROM files WHERE id = ?').get(file.id) as { id: string } | undefined;
  if (!existing) {
    logger?.warning(`文件不存在: ${file.id}`);
    return false;
  }
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(file)) {
    if (key === 'id') continue;
    updates.push(`${key} = ?`);
    if (key === 'is_folder') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value ?? null);
    }
  }
  if (updates.length === 0) return true;
  updates.push('updated_at = ?');
  values.push(Date.now());
  values.push(file.id);
  database.prepare(`UPDATE files SET ${updates.join(', ')} WHERE id = ?`).run(...values as import('node:sqlite').SQLInputValue[]);
  logger?.info(`更新文件: ${file.id}`);
  return true;
}
