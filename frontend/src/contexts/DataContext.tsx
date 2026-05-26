import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { api, type Card, type Note } from '../api';

interface DataContextValue {
  cards: Card[];
  notes: Note[];
  loading: boolean;
  refreshCards: () => void;
  refreshNotes: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const cardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshCards = useCallback(async () => {
    try {
      const res = await api.listCards();
      if (res.success) setCards(res.cards);
    } catch { /* 静默失败 */ }
  }, []);

  const refreshNotes = useCallback(async () => {
    try {
      const res = await api.listNotes();
      if (res.success) setNotes(res.notes);
    } catch { /* 静默失败 */ }
  }, []);

  // 去抖版本：300ms 内多次触发只执行最后一次
  const debouncedRefreshCards = useCallback(() => {
    if (cardTimer.current) clearTimeout(cardTimer.current);
    cardTimer.current = setTimeout(refreshCards, 300);
  }, [refreshCards]);

  const debouncedRefreshNotes = useCallback(() => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(refreshNotes, 300);
  }, [refreshNotes]);

  // 首次加载
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([refreshCards(), refreshNotes()]);
      setLoading(false);
    };
    load();
  }, [refreshCards, refreshNotes]);

  // 监听变更事件（去抖）
  useEffect(() => {
    window.addEventListener('papyrus_cards_changed', debouncedRefreshCards);
    window.addEventListener('papyrus_notes_changed', debouncedRefreshNotes);
    return () => {
      window.removeEventListener('papyrus_cards_changed', debouncedRefreshCards);
      window.removeEventListener('papyrus_notes_changed', debouncedRefreshNotes);
    };
  }, [debouncedRefreshCards, debouncedRefreshNotes]);

  return (
    <DataContext.Provider value={{ cards, notes, loading, refreshCards, refreshNotes }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
