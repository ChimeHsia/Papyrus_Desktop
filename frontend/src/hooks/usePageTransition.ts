import { useState, useRef, useCallback, useEffect } from 'react';

const PAGE_ORDER = ['start', 'scroll', 'notes', 'charts', 'files', 'extensions', 'settings'];

const ANIM_DURATION = 260; // ms，每段动画时长

export function usePageTransition() {
  const [activePage, setActivePage] = useState('start');
  const [prevPage, setPrevPage] = useState<string | null>(null);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [animationDirection, setAnimationDirection] = useState<'up' | 'down' | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [pageCache, setPageCache] = useState<Set<string>>(new Set(['start']));
  const prevIndexRef = useRef(0);

  // 用 ref 管理 timers，组件卸载时清理
  const t1Ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  const t2Ref = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (t1Ref.current) clearTimeout(t1Ref.current);
      if (t2Ref.current) clearTimeout(t2Ref.current);
    };
  }, []);

  const navigate = useCallback((newPage: string) => {
    if (isTransitioning) return;

    const newIndex = PAGE_ORDER.indexOf(newPage);
    if (newIndex === -1) {
      setActivePage(newPage);
      return;
    }

    const prevIndex = prevIndexRef.current;
    if (newIndex === prevIndex) {
      setActivePage(newPage);
      return;
    }
    prevIndexRef.current = newIndex;

    const dir = newIndex > prevIndex ? 'up' : 'down';
    setAnimationDirection(dir);
    setPrevPage(activePage);
    setIsTransitioning(true);

    // Phase 1：退场动画（old page 滑出）
    t1Ref.current = setTimeout(() => {
      // 切换 active 后旧页自动隐藏，新页开始渲染
      setNextPage(newPage);
      setActivePage(newPage);
      // 预缓存目标页，lazy 组件提前加载
      setPageCache(prev => prev.has(newPage) ? prev : new Set([...prev, newPage]));

      // Phase 2：进场动画（new page 滑入）
      t2Ref.current = setTimeout(() => {
        // 清理所有过渡状态
        setPrevPage(null);
        setNextPage(null);
        setAnimationDirection(null);
        setIsTransitioning(false);
      }, ANIM_DURATION);
    }, ANIM_DURATION);
  }, [activePage, isTransitioning]);

  // 页面激活时更新缓存
  useEffect(() => {
    setPageCache(prev => prev.has(activePage) ? prev : new Set([...prev, activePage]));
  }, [activePage]);

  // 空回调：不再依赖 animationend 事件，保留接口兼容性
  const onExitAnimationEnd = useCallback(() => {}, []);
  const onEnterAnimationEnd = useCallback(() => {}, []);

  return {
    activePage, prevPage, nextPage,
    animationDirection, isTransitioning, pageCache,
    navigate, onExitAnimationEnd, onEnterAnimationEnd,
  };
}
