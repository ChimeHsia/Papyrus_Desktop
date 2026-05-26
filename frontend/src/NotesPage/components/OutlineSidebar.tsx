import { Typography } from '@arco-design/web-react';

export function generateOutline(content: string): Array<{ level: number; title: string; lineIndex: number }> {
  const lines = content.split('\n');
  const outline: Array<{ level: number; title: string; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,3})\s+(.+)/);
    if (match) {
      outline.push({ level: match[1]!.length, title: match[2]!.trim(), lineIndex: i });
    }
  }
  return outline;
}

export function scrollToHeading(lineIndex: number, contentRef: React.RefObject<HTMLDivElement | null>): void {
  const lineHeight = 27;
  const paddingTop = 32;
  const metaHeight = 80;
  const target = paddingTop + metaHeight + lineIndex * lineHeight;
  contentRef.current?.scrollTo({ top: target, behavior: 'smooth' });
}

interface OutlineSidebarProps {
  outline: Array<{ level: number; title: string; lineIndex: number }>;
  onHeadingClick: (lineIndex: number) => void;
}

export const OutlineSidebar = ({ outline, onHeadingClick }: OutlineSidebarProps) => {
  return (
    <div
      style={{
        width: '200px',
        borderRight: '1px solid var(--color-border-2)',
        background: 'var(--color-bg-1)',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <Typography.Text
        style={{
          fontSize: '12px',
          fontWeight: 500,
          color: 'var(--color-text-2)',
          display: 'block',
          marginBottom: '16px',
        }}
      >
        大纲
      </Typography.Text>
      {outline.length > 0 ? (
        outline.map((item, index) => (
          <div
            key={index}
            onClick={() => onHeadingClick(item.lineIndex)}
            style={{
              padding: '4px 8px',
              paddingLeft: `${(item.level - 1) * 12}px`,
              fontSize: '13px',
              color: 'var(--color-text-2)',
              cursor: 'pointer',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-fill-2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.title}
          </div>
        ))
      ) : (
        <Typography.Text type='secondary' style={{ fontSize: '12px' }}>
          使用 # ## ### 创建标题
        </Typography.Text>
      )}
    </div>
  );
};
