import { toErrorMessage } from '../utils/helpers.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { paths } from '../utils/paths.js';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db === null) {
    const dbPath = paths.dbFile;
    try {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      db = new DatabaseSync(dbPath);
      db.exec('PRAGMA journal_mode = WAL;');
      db.exec('PRAGMA foreign_keys = ON;');
      db.exec('PRAGMA busy_timeout = 5000;');
      initSchema(db);
    } catch (err) {
      const message = `Failed to open database at "${dbPath}": ${toErrorMessage(err)}`;
      console.error(message);
      throw new Error(message);
    }
  }
  return db;
}

export function closeDb(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}

export function resetDb(): void {
  closeDb();
}

function isValidSnapshotPath(snapshotPath: string): boolean {
  if (!snapshotPath || typeof snapshotPath !== 'string') return false;
  if (!path.isAbsolute(snapshotPath)) return false;
  if (snapshotPath.includes('..') || snapshotPath.includes("'") || snapshotPath.includes('\x00')) return false;
  const basename = path.basename(snapshotPath);
  if (!/^[a-zA-Z0-9_\-.一-鿿()]+$/.test(basename)) return false;
  return true;
}

export function createDbSnapshot(snapshotPath: string): void {
  if (!isValidSnapshotPath(snapshotPath)) {
    throw new Error('Invalid snapshot path: must be absolute, and cannot contain \\x00, quotes, or .. sequences');
  }
  const database = getDb();
  database.exec(`VACUUM INTO '${snapshotPath}'`);
}

export function restoreDbSnapshot(snapshotPath: string): void {
  const dbPath = paths.dbFile;
  closeDb();
  fs.copyFileSync(snapshotPath, dbPath);
  try { fs.unlinkSync(dbPath + '-wal'); } catch { /* 忽略 */ }
  try { fs.unlinkSync(dbPath + '-shm'); } catch { /* 忽略 */ }
  getDb();
}

export function tagsToJson(tags: string[] | undefined): string {
  return JSON.stringify(tags ?? []);
}

export function tagsFromJson(tagsJson: string | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // 忽略
  }
  return [];
}

export function jsonFromStr(jsonStr: string | undefined): unknown[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // 忽略
  }
  return [];
}

function initSchema(database: DatabaseSync): void {
  const tableCheck = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cards'");
  const isNewDb = tableCheck.get() === undefined;

  try {
    const columns = database.prepare("SELECT name FROM pragma_table_info('extensions')").all() as Array<{ name: string }>;
    const existingColumns = new Set(columns.map(c => c.name));

    const missingColumns = [
      { name: 'description', type: "TEXT DEFAULT ''" },
      { name: 'version', type: "TEXT DEFAULT '1.0.0'" },
      { name: 'author', type: "TEXT DEFAULT 'Unknown'" },
      { name: 'rating', type: 'REAL DEFAULT 0.0' },
      { name: 'downloads', type: 'INTEGER DEFAULT 0' },
      { name: 'is_enabled', type: 'INTEGER DEFAULT 0' },
      { name: 'is_builtin', type: 'INTEGER DEFAULT 0' },
      { name: 'update_available', type: 'INTEGER DEFAULT 0' },
      { name: 'latest_version', type: 'TEXT' },
      { name: 'tags', type: "TEXT DEFAULT '[]'" },
      { name: 'config', type: "TEXT DEFAULT '{}'" },
      { name: 'installed_at', type: 'REAL DEFAULT 0.0' },
      { name: 'updated_at', type: 'REAL DEFAULT 0.0' },
    ];

    for (const col of missingColumns) {
      if (!existingColumns.has(col.name)) {
        database.exec(`ALTER TABLE extensions ADD COLUMN ${col.name} ${col.type};`);
      }
    }
  } catch {
  }

  try {
    const relationsDef = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='relations'").get() as { sql: string } | undefined;
    if (relationsDef && relationsDef.sql.includes('UNIQUE(source_id, target_id)') && !relationsDef.sql.includes('relation_type')) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS relations_new (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          target_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
          relation_type TEXT NOT NULL DEFAULT 'reference',
          description TEXT DEFAULT '',
          created_at REAL DEFAULT 0.0,
          updated_at REAL DEFAULT 0.0,
          UNIQUE(source_id, target_id, relation_type)
        );
        INSERT OR IGNORE INTO relations_new SELECT * FROM relations;
        DROP TABLE relations;
        ALTER TABLE relations_new RENAME TO relations;
        CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);
      `);
    }
  } catch (err) {
    console.error('迁移 relations 表约束失败:', toErrorMessage(err));
  }

  try {
    const filesDef = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='files'").get() as { sql: string } | undefined;
    if (filesDef && !filesDef.sql.includes('REFERENCES files(id)')) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS files_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'unknown',
          size INTEGER DEFAULT 0,
          mime_type TEXT DEFAULT '',
          parent_id TEXT REFERENCES files(id) ON DELETE CASCADE,
          file_storage_path TEXT,
          is_folder INTEGER DEFAULT 0,
          created_at REAL DEFAULT 0.0,
          updated_at REAL DEFAULT 0.0
        );
        INSERT OR IGNORE INTO files_new SELECT * FROM files;
        DROP TABLE files;
        ALTER TABLE files_new RENAME TO files;
        CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
        CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
      `);
    }
  } catch (err) {
    console.error('迁移 files 表外键约束失败:', toErrorMessage(err));
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      q TEXT NOT NULL,
      a TEXT NOT NULL,
      next_review REAL DEFAULT 0.0,
      interval REAL DEFAULT 0.0,
      ef REAL DEFAULT 2.5,
      repetitions INTEGER DEFAULT 0,
      tags TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '默认',
      content TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0,
      word_count INTEGER DEFAULT 0,
      hash TEXT DEFAULT '',
      headings TEXT DEFAULT '[]',
      outgoing_links TEXT DEFAULT '[]',
      incoming_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      enabled INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'default',
      encrypted_key TEXT NOT NULL DEFAULT '',
      created_at REAL DEFAULT 0.0,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_models (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      name TEXT NOT NULL,
      model_id TEXT NOT NULL,
      port TEXT NOT NULL,
      capabilities TEXT DEFAULT '[]',
      api_key_id TEXT,
      enabled INTEGER DEFAULT 1,
      FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS note_versions (
      id TEXT PRIMARY KEY,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      folder TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      tags TEXT DEFAULT '[]',
      word_count INTEGER DEFAULT 0,
      hash TEXT DEFAULT '',
      headings TEXT DEFAULT '[]',
      outgoing_links TEXT DEFAULT '[]',
      incoming_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS card_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      q TEXT NOT NULL,
      a TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      content_hash TEXT DEFAULT '',
      created_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_cards_next_review ON cards(next_review);
    CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder);
    CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_hash ON notes(hash);
    CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
    CREATE INDEX IF NOT EXISTS idx_models_provider ON provider_models(provider_id);

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'unknown',
      size INTEGER DEFAULT 0,
      mime_type TEXT DEFAULT '',
      parent_id TEXT,
      file_storage_path TEXT,
      is_folder INTEGER DEFAULT 0,
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_files_parent ON files(parent_id);
    CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, version DESC);
    CREATE INDEX IF NOT EXISTS idx_card_versions_card ON card_versions(card_id, version DESC);

    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      target_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL DEFAULT 'reference',
      description TEXT DEFAULT '',
      created_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0,
      UNIQUE(source_id, target_id, relation_type)
    );

    CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_id);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '新对话',
      model TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at REAL NOT NULL DEFAULT 0.0,
      updated_at REAL NOT NULL DEFAULT 0.0
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')),
      content TEXT NOT NULL DEFAULT '',
      blocks TEXT NOT NULL DEFAULT '[]',
      attachments TEXT NOT NULL DEFAULT '[]',
      model TEXT NOT NULL DEFAULT '',
      provider TEXT NOT NULL DEFAULT '',
      token_usage TEXT NOT NULL DEFAULT '{}',
      parent_message_id TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_at REAL NOT NULL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_chat_msgs_session ON chat_messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_msgs_parent ON chat_messages(parent_message_id);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(is_active);
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS extensions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      author TEXT NOT NULL DEFAULT 'Unknown',
      rating REAL DEFAULT 0.0,
      downloads INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 0,
      is_builtin INTEGER DEFAULT 0,
      update_available INTEGER DEFAULT 0,
      latest_version TEXT,
      tags TEXT DEFAULT '[]',
      config TEXT DEFAULT '{}',
      installed_at REAL DEFAULT 0.0,
      updated_at REAL DEFAULT 0.0
    );

    CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(is_enabled);

    CREATE TABLE IF NOT EXISTS daily_progress (
      date TEXT PRIMARY KEY,
      cards_created INTEGER DEFAULT 0,
      cards_reviewed INTEGER DEFAULT 0,
      notes_created INTEGER DEFAULT 0,
      study_minutes INTEGER DEFAULT 0
    );
  `);

  seedDefaults(database);
  deduplicateData(database);

  try {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_unique ON providers(type, name, base_url);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_models_unique ON provider_models(provider_id, model_id);
    `);
  } catch (err) {
    console.error('创建唯一索引失败:', toErrorMessage(err));
  }
}

function deduplicateData(database: DatabaseSync): void {
  try {
    database.exec('BEGIN TRANSACTION;');
    const providerDups = database.prepare(`
      SELECT type, name, base_url,
        COALESCE(
          MIN(CASE WHEN is_default = 1 THEN id END),
          MIN(CASE WHEN created_at > 0 THEN id END),
          MIN(id)
        ) as keeper_id,
        COUNT(*) as cnt
      FROM providers
      GROUP BY type, name, base_url
      HAVING cnt > 1
    `).all() as Array<{ type: string; name: string; base_url: string; keeper_id: string }>;

    for (const dup of providerDups) {
      const dupIds = database.prepare(
        'SELECT id FROM providers WHERE type = ? AND name = ? AND base_url = ? AND id != ?'
      ).all(dup.type, dup.name, dup.base_url, dup.keeper_id) as Array<{ id: string }>;
      for (const { id } of dupIds) {
        database.prepare('UPDATE api_keys SET provider_id = ? WHERE provider_id = ?').run(dup.keeper_id, id);
        database.prepare('UPDATE provider_models SET provider_id = ? WHERE provider_id = ?').run(dup.keeper_id, id);
        database.prepare('DELETE FROM providers WHERE id = ?').run(id);
      }
    }
    if (providerDups.length > 0) {
      console.info(`数据去重: 清理 ${providerDups.length} 组重复供应商`);
    }
    const modelDups = database.prepare(`
      SELECT provider_id, model_id,
        COALESCE(MIN(CASE WHEN enabled = 1 THEN id END), MIN(id)) as keeper_id,
        COUNT(*) as cnt
      FROM provider_models
      GROUP BY provider_id, model_id
      HAVING cnt > 1
    `).all() as Array<{ provider_id: string; model_id: string; keeper_id: string }>;

    for (const dup of modelDups) {
      database.prepare(
        'DELETE FROM provider_models WHERE provider_id = ? AND model_id = ? AND id != ?'
      ).run(dup.provider_id, dup.model_id, dup.keeper_id);
    }
    if (modelDups.length > 0) {
      console.info(`数据去重: 清理 ${modelDups.length} 组重复模型`);
    }
    database.exec('COMMIT;');
  } catch (err) {
    database.exec('ROLLBACK;');
    console.error('数据去重失败:', toErrorMessage(err));
  }
}

function seedDefaults(database: DatabaseSync): void {
  const now = Date.now();
  const pid = 'p-liyuan-deepseek';
  const existing = database.prepare('SELECT id FROM providers WHERE type = ?').get('liyuan-deepseek') as { id: string } | undefined;
  if (!existing) {
    database.prepare(
      `INSERT INTO providers (id, type, name, base_url, enabled, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(pid, 'liyuan-deepseek', 'LiYuan For DeepSeek', 'https://papyrus.liyuanstudio.com/v1', 1, 1, now, now);
  }
  const modelIds = ['deepseek-v4-flash', 'deepseek-v4-pro'];
  const modelNames = ['DeepSeek V4 Flash', 'DeepSeek V4 Pro'];
  for (let i = 0; i < modelIds.length; i++) {
    const modelId = modelIds[i];
    const modelName = modelNames[i];
    if (!modelId || !modelName) continue;
    const modelExists = database.prepare('SELECT id FROM provider_models WHERE provider_id = ? AND model_id = ?').get(pid, modelId) as { id: string } | undefined;
    if (!modelExists) {
      database.prepare(
        `INSERT INTO provider_models (id, provider_id, name, model_id, port, enabled)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(`${pid}-${modelId}`, pid, modelName, modelId, 'openai-compat', 1);
    }
  }
  const extensionCount = (database.prepare('SELECT COUNT(*) as c FROM extensions WHERE is_builtin = 1').get() as { c: number }).c;
  if (extensionCount === 0) {
    const builtinExtensions = [
      { id: 'core.markdown', name: 'Markdown 增强', description: '提供 Markdown 编辑、预览与导出能力', version: '1.0.0', author: 'Papyrus Team', rating: 4.9, downloads: 12000, tags: ['编辑器', '内置'] },
      { id: 'core.obsidian-import', name: 'Obsidian 导入', description: '将 Obsidian Vault 中的笔记一键导入 Papyrus Desktop', version: '1.0.0', author: 'Papyrus Team', rating: 4.8, downloads: 8800, tags: ['导入', '内置'] },
      { id: 'community.theme-pack', name: '主题包', description: '一组社区贡献的视觉主题，支持深色与高对比度', version: '0.4.2', author: 'Community', rating: 4.5, downloads: 3200, tags: ['主题', '社区'] },
      { id: 'lab.ai-cards', name: 'AI 自动制卡', description: '基于笔记内容自动生成学习卡片', version: '0.2.1', author: 'Papyrus Lab', rating: 4.2, downloads: 2100, tags: ['AI', '实验'] },
    ];
    for (const ext of builtinExtensions) {
      database.prepare(
        `INSERT INTO extensions (id, name, description, version, author, rating, downloads, is_enabled, is_builtin, update_available, latest_version, tags, config, installed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        ext.id, ext.name, ext.description, ext.version, ext.author, ext.rating, ext.downloads,
        1, 1, 0, ext.version, JSON.stringify(ext.tags), '{}', now / 1000, now / 1000
      );
    }
  }
}

export function checkpointDb(): void {
  const database = getDb();
  database.exec('PRAGMA wal_checkpoint(FULL);');
}

export function runInTransaction<T>(fn: () => T): T {
  const database = getDb();
  database.exec('BEGIN TRANSACTION;');
  try {
    const result = fn();
    database.exec('COMMIT;');
    return result;
  } catch (e) {
    database.exec('ROLLBACK;');
    throw e;
  }
}

export function clearAllData(): void {
  runInTransaction(() => {
    const database = getDb();
    database.exec('DELETE FROM cards;');
    database.exec('DELETE FROM card_versions;');
    database.exec('DELETE FROM notes;');
    database.exec('DELETE FROM note_versions;');
    database.exec('DELETE FROM relations;');
    database.exec('DELETE FROM files;');
    database.exec('DELETE FROM chat_messages;');
    database.exec('DELETE FROM chat_sessions;');
    database.exec('DELETE FROM provider_models;');
    database.exec('DELETE FROM api_keys;');
    database.exec('DELETE FROM providers;');
  });
  const database = getDb();
  seedDefaults(database);
}

export function migrateFromJson(cardsFile?: string, notesFile?: string, logger?: { info: (msg: string) => void }): void {
  const database = getDb();
  const defaultCardsFile = path.join(paths.dataDir, 'cards.json');
  const defaultNotesFile = path.join(paths.dataDir, 'notes.json');
  const resolvedCardsFile = cardsFile || defaultCardsFile;
  const resolvedNotesFile = notesFile || defaultNotesFile;

  if (fs.existsSync(resolvedCardsFile)) {
    const cardCount = (database.prepare('SELECT COUNT(*) as c FROM cards').get() as { c: number }).c;
    if (cardCount === 0) {
      try {
        const rawCards = JSON.parse(fs.readFileSync(resolvedCardsFile, 'utf8'));
        if (Array.isArray(rawCards)) {
          const stmt = database.prepare(
            'INSERT OR IGNORE INTO cards (id, q, a, next_review, interval, ef, repetitions, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          );
          for (const card of rawCards) {
            if (card && card.q) {
              stmt.run(
                card.id,
                card.q,
                card.a ?? '',
                card.next_review ?? 0,
                card.interval ?? 0,
                card.ef ?? 2.5,
                card.repetitions ?? 0,
                JSON.stringify(card.tags ?? [])
              );
            }
          }
          logger?.info(`从 ${resolvedCardsFile} 导入了卡片数据`);
        }
      } catch (err) {
        logger?.info(`读取 ${resolvedCardsFile} 失败: ${toErrorMessage(err)}`);
      }
    }
  }
  if (fs.existsSync(resolvedNotesFile)) {
    const noteCount = (database.prepare('SELECT COUNT(*) as c FROM notes').get() as { c: number }).c;
    if (noteCount === 0) {
      try {
        const rawNotes = JSON.parse(fs.readFileSync(resolvedNotesFile, 'utf8'));
        if (Array.isArray(rawNotes)) {
          const stmt = database.prepare(
            `INSERT OR IGNORE INTO notes (id, title, folder, content, preview, tags, created_at, updated_at, word_count, hash, headings, outgoing_links, incoming_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const note of rawNotes) {
            if (note && note.id) {
              stmt.run(
                note.id, note.title ?? '', note.folder ?? '默认', note.content ?? '', note.preview ?? '',
                JSON.stringify(note.tags ?? []), note.created_at ?? 0, note.updated_at ?? 0,
                note.word_count ?? 0, note.hash ?? '', JSON.stringify(note.headings ?? []),
                JSON.stringify(note.outgoing_links ?? []), note.incoming_count ?? 0
              );
            }
          }
          logger?.info(`从 ${resolvedNotesFile} 导入了笔记数据`);
        }
      } catch (err) {
        logger?.info(`读取 ${resolvedNotesFile} 失败: ${toErrorMessage(err)}`);
      }
    }
  }
}
