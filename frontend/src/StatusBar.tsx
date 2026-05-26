import { useState, useEffect } from 'react';
import './StatusBar.css';

interface NoteStats {
  chars: number;
  words: number;
  headings: number;
}

const StatusBar = () => {
  const [stats, setStats] = useState<NoteStats>({ chars: 0, words: 0, headings: 0 });

  useEffect(() => {
    const handleNoteStats = (e: CustomEvent<NoteStats>) => {
      setStats(e.detail);
    };

    window.addEventListener('papyrus_note_stats', handleNoteStats as EventListener);
    
    return () => {
      window.removeEventListener('papyrus_note_stats', handleNoteStats as EventListener);
    };
  }, []);

  const hasStats = stats.chars > 0 || stats.words > 0 || stats.headings > 0;

  return (
    <div className="statusbar">
      {/* 状态栏：笔记统计信息 */}
      {/* 笔记字符/词/标题统计 */}
      {hasStats && (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '16px' }}>
          <span>{stats.chars} 字符</span>
          <span>{stats.words} 词</span>
          <span>{stats.headings} 标题</span>
        </div>
      )}
    </div>
  );
};

export default StatusBar;