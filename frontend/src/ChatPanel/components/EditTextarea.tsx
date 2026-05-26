import { Button } from '@arco-design/web-react';

interface EditTextareaProps {
  value: string;
  rows?: number;
  textareaClass?: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}

export function EditTextarea({ value, rows = 3, textareaClass = '', onChange, onCancel, onSave }: EditTextareaProps) {
  return (
    <div className="chat-message-bubble chat-edit-bubble">
      <textarea
        className={`chat-textarea ${textareaClass}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoFocus
        rows={rows}
        aria-label="编辑消息"
      />
      <div className="chat-edit-actions">
        <Button size="mini" onClick={onCancel}>
          取消
        </Button>
        <Button size="mini" type="primary" onClick={onSave}>
          保存
        </Button>
      </div>
    </div>
  );
}
