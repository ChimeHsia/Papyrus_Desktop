import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Typography, Input, Message, Modal } from '@arco-design/web-react';
import SmartTextArea, { type SmartTextAreaRef } from '../../components/SmartTextArea';
import { RelationsPanel, RelationGraph } from '../components/Relations';
import type { Note, CreateNoteParams, UpdateNoteParams } from '../types';
import { renderMarkdown } from '../../utils/markdown';
import { OutlineSidebar, generateOutline, scrollToHeading } from '../components/OutlineSidebar';
import { MetadataEditor } from '../components/MetadataEditor';
import { NoteHeader } from '../components/NoteHeader';

interface NoteDetailViewProps {
  note: Note | null;
  isCreateMode: boolean;
  allFolders: string[];
  onBack: () => void;
  onSave: (params: UpdateNoteParams | CreateNoteParams, isCreate: boolean, shouldReturnToList?: boolean) => Promise<{ id: string } | undefined>;
  onDelete?: (id: string) => void;
}

export const NoteDetailView = ({
  note,
  isCreateMode: initialIsCreateMode,
  allFolders,
  onBack,
  onSave,
  onDelete,
}: NoteDetailViewProps) => {
  // 表单状态
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folder, setFolder] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');

  // 关联功能状态
  const [showRelationsPanel, setShowRelationsPanel] = useState(false);
  const [showGraphDrawer, setShowGraphDrawer] = useState(false);

  // SmartTextArea 引用
  const textAreaRef = useRef<SmartTextAreaRef>(null);

  // 脏状态跟踪与防抖自动保存
  const isDirty = useRef(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 创建模式状态和已创建笔记的 ID（用于创建后的自动保存）
  const [isCreateMode, setIsCreateMode] = useState(initialIsCreateMode);
  const [createdNoteId, setCreatedNoteId] = useState<string | null>(null);

  // 锁定状态 - 监听全局编辑锁定
  const [isGloballyLocked, setIsGloballyLocked] = useState(false);

  useEffect(() => {
    const handleLockChange = (e: CustomEvent<{ locked: boolean }>) => {
      const newLockedState = e.detail.locked;
      setIsGloballyLocked(newLockedState);
      // 如果全局锁定且当前可编辑（非创建模式），自动保存
      if (newLockedState && !isCreateMode) {
        void handleSave(false);
      }
    };

    window.addEventListener('papyrus_edit_lock_changed', handleLockChange as EventListener);
    return () => window.removeEventListener('papyrus_edit_lock_changed', handleLockChange as EventListener);
  }, [isCreateMode]);

  // 初始化表单 - 编辑模式（使用 note.id 而非整个对象，避免 refreshNotes 后引用变化导致覆盖用户编辑）
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content || note.preview);
      setFolder(note.folder);
      setTags(note.tags);
    }
  }, [note?.id]);

  // 创建模式初始化 - 只在进入创建模式时执行
  useEffect(() => {
    if (isCreateMode && !note) {
      setContent('');
      setFolder(allFolders[0] || '默认文件夹');
      setTags([]);
    }
  }, [isCreateMode, allFolders, note]);

  // 输入变化时标记脏状态
  useEffect(() => {
    isDirty.current = true;
  }, [title, content, folder, tags]);

  const handleSave = async (showMessage = true, shouldReturnToList = true) => {
    if (!title.trim()) {
      Message.warning('请输入标题');
      return false;
    }

    try {
      if (isCreateMode) {
        // 创建新笔记
        const createdNote = await onSave({
          title: title.trim(),
          folder: folder.trim() || '默认文件夹',
          content: content.trim(),
          tags,
        }, true, shouldReturnToList);
        // 创建成功后，切换到编辑模式并记录笔记 ID
        if (createdNote?.id) {
          setCreatedNoteId(createdNote.id);
          setIsCreateMode(false);
        }
      } else {
        // 更新已存在的笔记（可能是创建后继续编辑，或直接编辑现有笔记）
        const targetNoteId = createdNoteId || note?.id;
        if (targetNoteId) {
          await onSave({
            id: targetNoteId,
            title: title.trim(),
            folder: folder.trim(),
            content: content.trim(),
            tags,
          }, false, shouldReturnToList);
        }
      }
      if (showMessage) {
        Message.success('保存成功');
      }
      isDirty.current = false;
      return true;
    } catch (err) {
      Message.error(err instanceof Error ? err.message : '保存失败');
      return false;
    }
  };

  // 编辑状态由全局锁定和创建模式推导：创建模式始终可编辑，否则由全局锁定控制
  const isEditable = isCreateMode || !isGloballyLocked;

  // 防抖自动保存（2秒无输入后触发）
  useEffect(() => {
    if (!isEditable || !title.trim()) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (isDirty.current) {
        void handleSave(false, false);
        isDirty.current = false;
      }
    }, 2000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [title, content, folder, tags, isEditable]);

  // 组件卸载时如有未保存内容则自动保存
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (isDirty.current && title.trim()) {
        void handleSave(false, false);
      }
    };
  }, []);

  // 返回时自动保存
  const handleBackWithSave = async () => {
    if (isEditable && title.trim()) {
      const success = await handleSave(false, true);
      if (!success) return;
    }
    onBack();
  };

  const handleDelete = () => {
    if (note && onDelete) {
      Modal.confirm({
        title: '确认删除',
        content: `确定要删除笔记 "${note.title}" 吗？`,
        onOk: async () => {
          try {
            await onDelete(note.id);
            Message.success('删除成功');
          } catch {
            Message.error('删除失败');
          }
        },
      });
    }
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      setNewTag('');
    }
  };

  // 内容区域 ref
  const contentRef = useRef<HTMLDivElement>(null);

  // 生成大纲
  const outline = generateOutline(content);

  // 点击大纲跳转到对应位置
  const handleHeadingClick = useCallback((lineIndex: number) => {
    scrollToHeading(lineIndex, contentRef);
  }, []);

  // 触发字数统计事件
  useEffect(() => {
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const headings = outline.length;

    window.dispatchEvent(new CustomEvent('papyrus_note_stats', {
      detail: { chars, words, headings }
    }));
  }, [content, outline]);

  // 组件卸载时清空统计
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('papyrus_note_stats', {
        detail: { chars: 0, words: 0, headings: 0 }
      }));
    };
  }, []);

  // 渲染 Markdown 内容为 HTML
  const renderedContent = useMemo(() => {
    return renderMarkdown(content);
  }, [content]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 顶部栏：面包屑居中 */}
      <NoteHeader
        title={title || note?.title || '新笔记'}
        folder={folder || note?.folder || '默认'}
        isEditable={isEditable}
        isCreateMode={isCreateMode}
        showRelationsPanel={showRelationsPanel}
        onBack={handleBackWithSave}
        onDelete={onDelete ? handleDelete : undefined}
        onToggleRelations={() => setShowRelationsPanel(!showRelationsPanel)}
        onToggleGraph={() => setShowGraphDrawer(true)}
        textAreaRef={textAreaRef}
      />

      {/* 内容区 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 左侧：大纲导航 */}
        <OutlineSidebar
          outline={outline}
          onHeadingClick={handleHeadingClick}
        />

        {/* 右侧：编辑/预览区 */}
        <div
          ref={contentRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '32px 48px',
            background: 'var(--color-bg-1)',
          }}
        >
          {/* 元信息区 */}
          <MetadataEditor
            isEditable={isEditable}
            folder={folder}
            tags={tags}
            newTag={newTag}
            note={note}
            onFolderChange={setFolder}
            onTagsChange={setTags}
            onNewTagChange={setNewTag}
            onAddTag={handleAddTag}
          />

          {/* 标题 */}
          {isEditable ? (
            <Input
              className='no-border-input'
              value={title}
              onChange={setTitle}
              placeholder='输入标题...'
              style={{
                fontSize: '32px',
                fontWeight: 500,
                border: 'none',
                background: 'transparent',
                padding: 0,
                marginBottom: '24px',
              }}
            />
          ) : (
            <Typography.Title
              heading={2}
              style={{ marginBottom: '24px', fontSize: '28px', fontWeight: 400 }}
            >
              {note?.title}
            </Typography.Title>
          )}

          {/* 内容 - 编辑模式：显示 SmartTextArea，预览模式：显示渲染后的 Markdown */}
          {isEditable ? (
            <SmartTextArea
              className='no-border-textarea'
              ref={textAreaRef}
              value={content}
              onChange={setContent}
              placeholder='# 开始写作...'
              enableCompletion={true}
              autoSize={{ minRows: 20, maxRows: 100 }}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                fontSize: '15px',
                lineHeight: '1.8',
                resize: 'none',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <div
              className="markdown-preview chat-markdown"
              style={{
                fontSize: '15px',
                lineHeight: '1.8',
                color: 'var(--color-text-1)',
              }}
              dangerouslySetInnerHTML={{ __html: renderedContent }}
            />
          )}
        </div>

        {/* 关联面板 */}
        {showRelationsPanel && note && (
          <div
            style={{
              width: '320px',
              borderLeft: '1px solid var(--color-border-2)',
              background: 'var(--color-bg-1)',
            }}
          >
            <RelationsPanel
              noteId={note.id}
              onNavigateToNote={async (targetId) => {
                // 保存当前笔记后跳转
                if (isEditable && title.trim()) {
                  const success = await handleSave(false);
                  if (!success) return;
                }
                onBack();
                // 这里可以添加跳转到目标笔记的逻辑
              }}
            />
          </div>
        )}
      </div>

      {/* 关联图谱弹窗 */}
      <Modal
        title="关联图谱"
        visible={showGraphDrawer}
        onCancel={() => setShowGraphDrawer(false)}
        footer={null}
        style={{ width: 800 }}
      >
        {note && (
          <div style={{ height: '500px' }}>
            <RelationGraph
              noteId={note.id}
              depth={1}
              onNodeClick={(nodeId) => {
                setShowGraphDrawer(false);
                // 可以添加跳转到对应笔记的逻辑
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
