import { useState, useRef, useCallback } from 'react';

const STORAGE_KEY = 'papyrus_chat_width';
const MIN = 280;
const MAX = 600;
const DEFAULT = 320;

function loadWidth(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const w = parseInt(saved, 10);
      if (w >= MIN && w <= MAX) return w;
    }
  } catch {}
  return DEFAULT;
}

function saveWidth(w: number) {
  try { localStorage.setItem(STORAGE_KEY, String(w)); } catch {}
}

export function useChatPanel() {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(loadWidth);
  const [isDragging, setIsDragging] = useState(false);
  const dragX = useRef(0);
  const dragW = useRef(0);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragX.current = e.clientX;
    dragW.current = width;
    setIsDragging(true);

    const onMove = (ev: MouseEvent) => {
      const delta = dragX.current - ev.clientX;
      const w = Math.min(MAX, Math.max(MIN, dragW.current + delta));
      setWidth(w);
      saveWidth(w);
    };
    const cleanup = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', cleanup);
      document.documentElement.removeEventListener('mouseleave', cleanup);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', cleanup);
    document.documentElement.addEventListener('mouseleave', cleanup);
  }, [width]);

  return { open, width, isDragging, setOpen, toggle: () => setOpen(v => !v), onDragStart };
}
