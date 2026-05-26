import { useRef, useCallback } from 'react';

// useActionQueue：封装"先跳转到目标页，到达后自动执行操作"的模式
//
// 典型场景：用户点了"新建笔记"，但当前不在 Notes 页。
// navigateThen 会判断当前页，已在目标页则立即执行，否则暂存并跳转。
// autoFlush 由外部的 useEffect 在动画结束后调用，执行暂存的操作。
export function useActionQueue(activePage: string, navigate: (page: string) => void) {
  const queueRef = useRef<(() => void) | null>(null);

  const navigateThen = useCallback((targetPage: string, action: () => void) => {
    if (activePage === targetPage) {
      action();
    } else {
      queueRef.current = action;
      navigate(targetPage);
    }
  }, [activePage, navigate]);

  const autoFlush = useCallback(() => {
    queueRef.current?.();
    queueRef.current = null;
  }, []);

  return { navigateThen, autoFlush };
}
