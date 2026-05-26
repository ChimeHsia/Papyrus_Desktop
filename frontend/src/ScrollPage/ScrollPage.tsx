import { Typography, Button, Message } from '@arco-design/web-react';
import { IconPlus, IconEye, IconEdit } from '@arco-design/web-react/icon';
import { useTranslation } from 'react-i18next';
import FlashcardStudy from './FlashcardStudy';

import { useScrollPage } from './hooks/useScrollPage';
import { PageLayout } from '../components';
import {
  CollectionCard,
  ScrollCard,
  AddCard,
  ShelfTitle,
  CreateCollectionModal,
  ManageCollectionModal,
  BatchCardModal,
  CreateCardModal,
} from './components';
import { PRIMARY_COLOR } from './constants';
import type { ScrollPageProps } from './types';

const ScrollPage = (props: ScrollPageProps) => {
  const { t } = useTranslation();
  const {
    isStudying, isExiting, isDemo,
    dueCount, totalCount, masteredCount, loading, cards,
    filterTag, createModalVisible, newCollectionName,
    selectedCardIds, manageModalVisible, manageCollectionId,
    isSubmitting, batchCardModalVisible, batchSelectedIds,
    createCardModalVisible, newCardQuestion, newCardAnswer,
    newCardTags, isSubmittingCard,
    setCreateModalVisible, setNewCollectionName,
    setSelectedCardIds, setManageModalVisible, setManageCollectionId,
    setBatchCardModalVisible, setBatchSelectedIds,
    setCreateCardModalVisible, setNewCardQuestion, setNewCardAnswer,
    setNewCardTags,
    overallProgress, startStudy, handleExitStudy, startDemo,
    handleCreateCollection, handleCreateCard,
    refreshCards, refreshStats,
    collections, scrolls, sceneryConfig,
  } = useScrollPage(props);

  const shelfContainerStyle = {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: '16px',
    overflowX: 'auto' as const,
    overflowY: 'hidden' as const,
    paddingBottom: '8px',
  };

  if (isStudying) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: isExiting
          ? 'flashcardStudyExit 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards'
          : 'flashcardStudyEnter 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards',
      }}>
        <FlashcardStudy onExit={handleExitStudy} demo={isDemo} filterTag={filterTag} />
        <style>{`
          @keyframes flashcardStudyEnter {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes flashcardStudyExit {
            from {
              opacity: 1;
              transform: translateY(0);
            }
            to {
              opacity: 0;
              transform: translateY(20px);
            }
          }
        `}</style>
      </div>
    );
  }

  const actions = (
    <>
      <Button
        shape='round'
        size='large'
        icon={<IconPlus />}
        onClick={() => setCreateCardModalVisible(true)}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.addScroll')}
      </Button>
      <Button
        shape='round'
        size='large'
        icon={<IconEdit />}
        onClick={() => {
          setBatchSelectedIds(new Set());
          setBatchCardModalVisible(true);
        }}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.manageCards')}
      </Button>
      <Button
        shape='round'
        size='large'
        icon={<IconEye />}
        onClick={startDemo}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
        }}
      >
        {t('scrollPage.previewStudy')}
      </Button>
      <Button
        shape='round'
        type='primary'
        size='large'
        icon={<IconPlus />}
        onClick={() => startStudy()}
        disabled={dueCount === 0}
        style={{
          height: '40px',
          padding: '0 20px',
          fontSize: '14px',
          backgroundColor: dueCount > 0 ? PRIMARY_COLOR : 'var(--color-text-3)',
        }}
      >
        {dueCount > 0 ? t('scrollPage.startReview', { count: dueCount }) : t('scrollPage.noDueCards')}
      </Button>
    </>
  );

  return (
    <PageLayout
      title={t('scrollPage.title')}
      actions={actions}
      pageKey='scroll'
      stats={[
        { label: t('scrollPage.dueForReview'), value: dueCount },
        { label: t('scrollPage.mastered'), value: `${totalCount && overallProgress ? Math.round(totalCount * overallProgress / 100) : 0}/${totalCount ?? 0}` },
        { label: t('scrollPage.totalProgress'), value: `${overallProgress ?? 0}%` },
      ]}
      statsLoading={loading}
    >
      <section style={{ marginBottom: '40px' }}>
        <ShelfTitle>{t('scrollPage.collections')}</ShelfTitle>
        <div style={shelfContainerStyle}>
          {collections.map(c => (
            <CollectionCard
              key={c.id}
              collection={c}
              onClick={() => startStudy(c.id)}
              onManage={(e) => {
                e.stopPropagation();
                setManageCollectionId(c.id);
                setManageModalVisible(true);
              }}
            />
          ))}
          <div onClick={() => setCreateModalVisible(true)}>
            <AddCard label={t('scrollPage.newCollection')} />
          </div>
        </div>
      </section>

      <section>
        <ShelfTitle>{t('scrollPage.recentlyUsed')}</ShelfTitle>
        <div style={shelfContainerStyle}>
          {scrolls.map(s => (
            <ScrollCard
              key={s.id}
              scroll={s}
              onStudy={s.dueCount > 0 ? startStudy : undefined}
            />
          ))}
          <div onClick={() => setCreateCardModalVisible(true)}>
            <AddCard label={t('scrollPage.newScroll')} />
          </div>
        </div>
      </section>

      <CreateCollectionModal
        visible={createModalVisible}
        cards={cards}
        selectedCardIds={selectedCardIds}
        newCollectionName={newCollectionName}
        isSubmitting={isSubmitting}
        onVisibleChange={setCreateModalVisible}
        onCardIdsChange={setSelectedCardIds}
        onNameChange={setNewCollectionName}
        onSubmit={handleCreateCollection}
      />

      <ManageCollectionModal
        visible={manageModalVisible}
        cards={cards}
        collectionId={manageCollectionId}
        onVisibleChange={setManageModalVisible}
        onCollectionIdChange={setManageCollectionId}
        onRefresh={refreshCards}
      />

      <BatchCardModal
        visible={batchCardModalVisible}
        cards={cards}
        selectedIds={batchSelectedIds}
        onVisibleChange={setBatchCardModalVisible}
        onSelectedIdsChange={setBatchSelectedIds}
        onRefresh={refreshCards}
      />

      <CreateCardModal
        visible={createCardModalVisible}
        question={newCardQuestion}
        answer={newCardAnswer}
        tags={newCardTags}
        isSubmitting={isSubmittingCard}
        onVisibleChange={setCreateCardModalVisible}
        onQuestionChange={setNewCardQuestion}
        onAnswerChange={setNewCardAnswer}
        onTagsChange={setNewCardTags}
        onSubmit={handleCreateCard}
      />
    </PageLayout>
  );
};

export default ScrollPage;