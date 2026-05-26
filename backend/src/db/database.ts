// core
export {
  getDb,
  closeDb,
  resetDb,
  createDbSnapshot,
  restoreDbSnapshot,
  checkpointDb,
  runInTransaction,
  clearAllData,
  migrateFromJson,
} from './core.js';

// cards
export {
  loadAllCards,
  saveAllCards,
  insertCard,
  deleteCardById,
  deleteCardsByIds,
  getCardById,
  updateCard,
  getCardsDueBefore,
  getCardCount,
} from './cards.js';

// notes
export {
  loadAllNotes,
  saveAllNotes,
  insertNote,
  deleteNoteById,
  deleteNotesByIds,
  getNoteById,
  updateNote,
  getNotesByFolder,
  getNoteCount,
  getAllFolders,
} from './notes.js';

// providers
export {
  loadAllProviders,
  saveProvider,
  deleteProvider,
  setDefaultProvider,
  updateProviderEnabled,
  saveApiKey,
  deleteApiKey,
  saveModel,
  deleteModel,
  getProviderConfigFromDB,
  getProviderApiKeyFromDB,
} from './providers.js';

// versions
export {
  saveNoteVersion,
  getNoteVersions,
  getNoteVersionById,
  getLatestNoteVersionHash,
  saveCardVersion,
  getCardVersions,
  getCardVersionById,
  getLatestCardVersionHash,
} from './versions.js';

// files
export {
  loadAllFiles,
  getFileById,
  getFilesByParentId,
  insertFile,
  deleteFileById,
  deleteFilesByIds,
  updateFile,
} from './files.js';

// relations
export {
  loadRelationsForNote,
  insertRelation,
  updateRelation,
  deleteRelationById,
  searchNotesForRelation,
  getGraphData,
} from './relations.js';

// chat
export {
  createChatSession,
  listChatSessions,
  getChatSession,
  updateChatSession,
  setActiveChatSession,
  getActiveChatSession,
  deleteChatSession,
  clearAllChatSessions,
  touchChatSession,
  appendChatMessage,
  listChatMessages,
  getChatMessage,
  updateChatMessage,
  softDeleteChatMessage,
  deleteMessagesAfter,
  getChatMessageCount,
} from './chat.js';

// chat types
export type {
  ChatSessionRow,
  ChatMessageRow,
  ChatSessionPatch,
  ChatMessagePatch,
  AppendChatMessageInput,
} from './chat.js';

// extensions
export {
  loadAllExtensions,
  getExtensionById,
  installExtension,
  uninstallExtension,
  setExtensionEnabled,
  checkExtensionUpdates,
  updateExtensionConfig,
  getExtensionStats,
} from './extensions.js';
export type { ExtensionRecord, CreateExtensionInput } from './extensions.js';
