import { useState, useRef, useCallback, useEffect, lazy, Suspense, useMemo } from 'react';
import { BackTop, Message, Spin } from '@arco-design/web-react';
import { IconLeft } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';
import StatusBar from './StatusBar';
import StartPage from './StartPage/StartPage';
import SectionNavigation from './components/SectionNavigation';
import { DataProvider } from './contexts/DataContext';
import type { SearchResult } from './api';
import { addRecentItem } from './utils/recentFiles';
import { useChatPanel } from './hooks/useChatPanel';
import { usePageTransition } from './hooks/usePageTransition';

const ScrollPage = lazy(() => import('./ScrollPage/ScrollPage'));
const NotesPage = lazy(() => import('./NotesPage/NotesPage'));
const ChartsPage = lazy(() => import('./ChartsPage/ChartsPage'));
const ExtensionsPage = lazy(() => import('./ExtensionsPage/ExtensionsPage'));
const FilesPage = lazy(() => import('./FilesPage/FilesPage'));
const SettingsPage = lazy(() => import('./SettingsPage/SettingsPage'));

// 缓存页面内容与动画状态，管理多页面的进出场渲染
function PageRenderer({ activePage, prevPage, nextPage, isTransitioning, animationDirection, pageCache, pageContents, onExitAnimationEnd, onEnterAnimationEnd }: {
  activePage: string;
  prevPage: string | null;
  nextPage: string | null;
  isTransitioning: boolean;
  animationDirection: 'up' | 'down' | null;
  pageCache: Set<string>;
  pageContents: Record<string, React.ReactNode>;
  onExitAnimationEnd: (e: React.AnimationEvent) => void;
  onEnterAnimationEnd: (e: React.AnimationEvent) => void;
}) {
  const exitClass = animationDirection === 'up'
    ? 'motion-safe:tw-animate-page-exit-up' : 'motion-safe:tw-animate-page-exit-down';
  const enterAnimName = animationDirection === 'up' ? '_enterUp' : '_enterDown';

  return (
    <>
      {/* 注入进场 keyframes，确保不依赖 Tailwind 生成 */}
      <style>{`
        @keyframes _enterUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes _enterDown {
          from { opacity: 0; transform: translateY(-24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {Array.from(pageCache).map(name => {
        const isActive = name === activePage;
        const isPrev = isTransitioning && name === prevPage;
        const isNext = isTransitioning && name === nextPage;

        let cls = 'tw-absolute tw-inset-0 tw-flex tw-flex-col';
        let onEnd: ((e: React.AnimationEvent) => void) | undefined;
        let extra: Record<string, unknown> = {};

        if (isPrev) { cls += ` ${exitClass}`; onEnd = onExitAnimationEnd; }
        else if (isNext && animationDirection) {
          extra = { animation: `${enterAnimName} 0.25s ease-out forwards` };
          onEnd = onEnterAnimationEnd;
        }

        // 每页独立 Suspense，避免某页 lazy 加载时打断其他页的动画
        return (
          <Suspense key={name} fallback={
            <div className="tw-absolute tw-inset-0 tw-flex tw-items-center tw-justify-center">
              <Spin size={32} />
            </div>
          }>
            <div className={cls} onAnimationEnd={onEnd}
              style={{ display: !isActive && !isPrev && !isNext ? 'none' : '', ...extra }}>
              {pageContents[name]}
            </div>
          </Suspense>
        );
      })}
    </>
  );
}

const App = () => {
  const { t } = useTranslation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [todayDone, setTodayDone] = useState(false);
  const [initialNoteId, setInitialNoteId] = useState<string | undefined>();
  const [initialScrollTag, setInitialScrollTag] = useState<string | undefined>();
  const mainContentRef = useRef<HTMLDivElement>(null);

  const chat = useChatPanel();
  const page = usePageTransition();

  // 暂存"跳转到目标页后要执行的操作"
  const pendingAction = useRef<(() => void) | null>(null);

  // 页面入场动画结束后执行暂存操作
  useEffect(() => {
    if (!page.isTransitioning && page.animationDirection === null) {
      pendingAction.current?.();
      pendingAction.current = null;
    }
  }, [page.isTransitioning, page.animationDirection]);

  const handlePageChange = useCallback((newPage: string, noteId?: string) => {
    if (noteId && newPage === 'notes') setInitialNoteId(noteId);
    page.navigate(newPage);
  }, [page.navigate]);

  // 新建笔记/卡片：先在目标页打开，再通过 CustomEvent 通知对应页面组件
  const handleNewAction = useCallback((action: 'newNote' | 'newCard') => {
    const pageMap = { newNote: 'notes' as const, newCard: 'scroll' as const };
    const targetPage = pageMap[action];
    const eventName = action === 'newNote' ? 'papyrus_new_note' : 'papyrus_new_card';

    if (page.activePage === targetPage) {
      window.dispatchEvent(new CustomEvent(eventName));
    } else {
      pendingAction.current = () => window.dispatchEvent(new CustomEvent(eventName));
      page.navigate(targetPage);
    }
  }, [page.activePage, page.navigate]);

  const handleStartStudy = useCallback((tag?: string) => {
    if (page.activePage === 'scroll') {
      window.dispatchEvent(new CustomEvent('papyrus_start_study', { detail: { tag } }));
    } else {
      pendingAction.current = () => window.dispatchEvent(new CustomEvent('papyrus_start_study', { detail: { tag } }));
      page.navigate('scroll');
    }
  }, [page.activePage, page.navigate]);

  // 搜索结果点击 → 跳转到对应页面并传入初始参数
  const handleSearchResult = useCallback((result: SearchResult) => {
    if (result.type === 'note') {
      addRecentItem({ id: result.id, type: 'note', title: result.title });
      handlePageChange('notes', result.id);
      Message.success(t('app.openNote', { title: result.title }));
    } else if (result.type === 'card') {
      addRecentItem({ id: result.id, type: 'card', title: result.title });
      handlePageChange('scroll');
      setInitialScrollTag(result.tags?.[0]);
      Message.success(t('app.navigateToReview'));
    }
  }, [handlePageChange, t]);

  // 从 ChatPanel 触发设置页跳转
  useEffect(() => {
    const handler = () => handlePageChange('settings');
    window.addEventListener('papyrus_open_settings', handler);
    return () => window.removeEventListener('papyrus_open_settings', handler);
  }, [handlePageChange]);

  useEffect(() => { document.title = 'Papyrus Desktop'; }, []);

  const pageTitleMap = useMemo(() => ({
    start: t('app.pageTitles.start'),
    scroll: t('app.pageTitles.scroll'),
    notes: t('app.pageTitles.notes'),
    charts: t('app.pageTitles.charts'),
    files: t('app.pageTitles.files'),
    extensions: t('app.pageTitles.extensions'),
    settings: t('app.pageTitles.settings'),
  } as Record<string, string>), [t]);

  const pageContents: Record<string, React.ReactNode> = {
    start: <StartPage onDoneChange={setTodayDone} onNavigate={handlePageChange}
      onStartStudy={handleStartStudy} onNewCard={() => handleNewAction('newCard')} />,
    scroll: <ScrollPage initialTag={initialScrollTag}
      onInitialTagUsed={() => setInitialScrollTag(undefined)} />,
    notes: <NotesPage initialNoteId={initialNoteId}
      onInitialNoteIdUsed={() => setInitialNoteId(undefined)} />,
    charts: <ChartsPage />,
    files: <FilesPage />,
    extensions: <ExtensionsPage />,
    settings: <SettingsPage />,
  };

  return (
    <DataProvider>
    {/* 根容器：弹性竖排、满屏 */}
    <div className="tw-relative tw-flex tw-flex-col tw-mx-auto tw-w-full tw-h-screen tw-overflow-hidden tw-bg-arco-bg-1">
      {/* 无障碍：跳过链接 */}
      <a href="#main-content" className="skip-link" aria-label={t('app.skipToMainContent')}>
        {t('app.skipToMainContent')}
      </a>

      {/* 回到顶部（仅 StartPage） */}
      {page.activePage === 'start' && (
        <BackTop className="tw-absolute tw-bottom-12 tw-transition-[right] tw-duration-300 tw-ease-[ease]"
          visibleHeight={200}
          style={{ right: chat.open ? chat.width + 48 : 48 }}
          target={() => document.getElementById('start-page-scroll') ?? window as unknown as HTMLElement}
          aria-label={t('app.backToTop')}
        />
      )}

      {/* 顶栏：搜索 + 新建按钮 */}
      <TitleBar onPageChange={handlePageChange} onSearchResult={handleSearchResult}
        onNewNote={() => handleNewAction('newNote')} onNewCard={() => handleNewAction('newCard')} />

      {/* 主体区域：侧边栏 + 页面 + 聊天面板 */}
      <div className="tw-flex tw-flex-1 tw-overflow-hidden">
        {/* 左侧导航 */}
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          chatOpen={chat.open} onChatToggle={chat.toggle}
          activePage={page.activePage} onPageChange={handlePageChange} />

        {/* 页面内容 + 切换动画 */}
        <main id="main-content" ref={mainContentRef} tabIndex={-1}
          className="tw-relative tw-flex-1 tw-flex tw-overflow-hidden tw-outline-none"
          role="main"
          aria-label={`${pageTitleMap[page.activePage] || t('app.mainContent')}页面`}>
          <PageRenderer activePage={page.activePage} prevPage={page.prevPage} nextPage={page.nextPage}
              isTransitioning={page.isTransitioning} animationDirection={page.animationDirection}
              pageCache={page.pageCache} pageContents={pageContents}
              onExitAnimationEnd={page.onExitAnimationEnd} onEnterAnimationEnd={page.onEnterAnimationEnd} />
        </main>

        {/* 无障碍：节标题导航 */}
        <SectionNavigation containerSelector="#main-content" minLevel={2} maxLevel={3} />

        {/* 聊天面板 + 拖拽调整宽度 */}
        <div className="tw-relative tw-flex tw-flex-shrink-0 tw-overflow-hidden"
          style={{ width: chat.open ? chat.width + 4 : 0, transition: chat.isDragging ? 'none' : 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}
          role="complementary" aria-label="AI 助手聊天面板">
          <div className="tw-flex-shrink-0 tw-w-1 tw-cursor-ew-resize hover:tw-bg-arco-border-2 tw-transition-colors tw-duration-200"
            onMouseDown={chat.onDragStart}
            role="separator" aria-orientation="vertical" aria-label="调整聊天面板宽度" tabIndex={0} />
          <ChatPanel open={chat.open} width={chat.width} onClose={() => chat.setOpen(false)} />
        </div>

        {/* 收起/展开聊天面板按钮 */}
        <button className="tw-flex-shrink-0 tw-w-5 tw-h-16 tw-flex tw-items-center tw-justify-center tw-bg-arco-bg-1 tw-cursor-pointer tw-text-arco-text-3 hover:tw-bg-arco-fill-2 hover:tw-text-arco-text-1 tw-outline-none tw-shadow-none"
          style={{
            borderRadius: '8px 0 0 8px', position: 'fixed',
            right: chat.open ? chat.width : 0, top: '50%', transform: 'translateY(-50%)', zIndex: 10,
            transition: chat.isDragging ? 'none' : 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
            margin: 0, padding: 0, border: 'none', boxShadow: 'none', WebkitAppearance: 'none',
          }}
          onClick={chat.toggle}
          aria-label={chat.open ? '收起聊天面板' : '展开聊天面板'}>
          <IconLeft style={{ transform: chat.open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* 底部状态栏 */}
      <StatusBar />
    </div>
    </DataProvider>
  );
};

export default App;
