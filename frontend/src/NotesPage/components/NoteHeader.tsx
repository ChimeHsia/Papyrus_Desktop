import { Button, Breadcrumb, Dropdown } from '@arco-design/web-react';
import {
  IconLeft,
  IconDelete,
  IconPlus,
  IconH1,
  IconH2,
  IconH3,
  IconLink,
  IconMindMapping,
} from '@arco-design/web-react/icon';
import { type SmartTextAreaRef } from '../../components/SmartTextArea';

const BreadcrumbItem = Breadcrumb.Item;

interface NoteHeaderProps {
  title: string;
  folder: string;
  isEditable: boolean;
  isCreateMode: boolean;
  showRelationsPanel: boolean;
  onBack: () => void;
  onDelete?: () => void;
  onToggleRelations: () => void;
  onToggleGraph: () => void;
  textAreaRef: React.RefObject<SmartTextAreaRef | null>;
}

export const NoteHeader = ({
  title,
  folder,
  isEditable,
  isCreateMode,
  showRelationsPanel,
  onBack,
  onDelete,
  onToggleRelations,
  onToggleGraph,
  textAreaRef,
}: NoteHeaderProps) => {
  const insertHeading = (level: number) => {
    textAreaRef.current?.insertAtCursor('#'.repeat(level) + ' ');
  };

  const headingMenuItems = [
    { key: 'h1', label: '一级标题', icon: <IconH1 />, onClick: () => insertHeading(1) },
    { key: 'h2', label: '二级标题', icon: <IconH2 />, onClick: () => insertHeading(2) },
    { key: 'h3', label: '三级标题', icon: <IconH3 />, onClick: () => insertHeading(3) },
  ];

  return (
    <div
      style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--color-border-2)',
        background: 'var(--color-bg-1)',
        display: 'flex',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* 返回按钮 - 左侧 */}
      <Button type='text' icon={<IconLeft />} onClick={onBack}>
        返回
      </Button>

      {/* 面包屑 - 居中 */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        <Breadcrumb>
          <BreadcrumbItem
            key="notebook"
            style={{ cursor: 'pointer' }}
            onClick={onBack}
          >
            笔记库
          </BreadcrumbItem>
          <BreadcrumbItem key="folder">{folder || '默认'}</BreadcrumbItem>
          <BreadcrumbItem key="title">{title || '新笔记'}</BreadcrumbItem>
        </Breadcrumb>
      </div>

      {/* 右侧操作按钮 */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
        {isEditable && (
          <>
            <Dropdown
              droplist={
                <div style={{
                  background: 'var(--color-bg-1)',
                  border: '1px solid var(--color-border-2)',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                  {headingMenuItems.map(item => (
                    <div
                      key={item.key}
                      onClick={item.onClick}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: 'var(--color-text-1)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-fill-2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </div>
                  ))}
                </div>
              }
              position='bottom'
            >
              <Button type='secondary' icon={<IconPlus />} />
            </Dropdown>
            {!isCreateMode && onDelete && (
              <Button
                type='text'
                status='danger'
                icon={<IconDelete />}
                onClick={onDelete}
              />
            )}
          </>
        )}

        {!isCreateMode && (
          <>
            <Button
              type={showRelationsPanel ? 'primary' : 'secondary'}
              icon={<IconLink />}
              onClick={onToggleRelations}
            >
              关联
            </Button>
            <Button
              type='secondary'
              icon={<IconMindMapping />}
              onClick={onToggleGraph}
            >
              图谱
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
