import { Input, Tag } from '@arco-design/web-react';
import { IconFolder, IconHistory, IconTags } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import { formatTimestamp } from '../../utils/formatters';
import type { Note } from '../types';

interface MetadataEditorProps {
  isEditable: boolean;
  folder: string;
  tags: string[];
  newTag: string;
  note: Note | null;
  onFolderChange: (folder: string) => void;
  onTagsChange: (tags: string[]) => void;
  onNewTagChange: (tag: string) => void;
  onAddTag: () => void;
}

export const MetadataEditor = ({
  isEditable,
  folder,
  tags,
  newTag,
  note,
  onFolderChange,
  onTagsChange,
  onNewTagChange,
  onAddTag,
}: MetadataEditorProps) => {
  const { t } = useTranslation();

  return (
    <div
      style={{
        padding: '16px',
        background: 'var(--color-fill-2)',
        borderRadius: '8px',
        border: '1px solid var(--color-border-2)',
        marginBottom: '24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center',
      }}
    >
      {isEditable ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <IconFolder style={{ fontSize: '14px', color: 'var(--color-text-2)' }} />
            <Input
              value={folder}
              onChange={onFolderChange}
              style={{ width: '120px' }}
              size='small'
              className='notes-meta-input'
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '4px' }}>
            <IconTags style={{ fontSize: '14px', color: 'var(--color-text-2)' }} />
            {tags.map(tag => (
              <Tag
                key={tag}
                size='small'
                color='arcoblue'
                closable
                onClose={() => onTagsChange(tags.filter(t => t !== tag))}
              >
                {tag}
              </Tag>
            ))}
            <Input
              value={newTag}
              onChange={onNewTagChange}
              onPressEnter={onAddTag}
              onBlur={onAddTag}
              placeholder='+ 标签'
              style={{ width: '80px' }}
              size='small'
              className='notes-meta-input'
            />
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <IconFolder style={{ fontSize: '14px' }} />
            {note?.folder}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
            <IconHistory style={{ fontSize: '14px' }} />
            {note ? formatTimestamp(note.updatedAtTimestamp, t) : ''}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {note?.tags.map(tag => (
              <Tag key={tag} size='small' color='arcoblue'>
                {tag}
              </Tag>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
