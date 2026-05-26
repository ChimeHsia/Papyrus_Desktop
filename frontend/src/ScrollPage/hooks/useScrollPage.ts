import { useState, useEffect } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { api, type Card as CardType } from '../../api';
import { usePageScenery } from '../../hooks/useScenery';
import { generateCollections, generateScrolls } from '../utils';
import type { ScrollPageProps } from '../types';

export function useScrollPage({ initialTag, onInitialTagUsed }: ScrollPageProps) {
  const { t } = useTranslation();
  const [isStudying, setIsStudying] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [dueCount, setDueCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<CardType[]>([]);
  const [filterTag, setFilterTag] = useState<string | undefined>(undefined);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [manageModalVisible, setManageModalVisible] = useState(false);
  const [manageCollectionId, setManageCollectionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [batchCardModalVisible, setBatchCardModalVisible] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [createCardModalVisible, setCreateCardModalVisible] = useState(false);
  const [newCardQuestion, setNewCardQuestion] = useState('');
  const [newCardAnswer, setNewCardAnswer] = useState('');
  const [newCardTags, setNewCardTags] = useState('');
  const [isSubmittingCard, setIsSubmittingCard] = useState(false);

  const { config: sceneryConfig } = usePageScenery('scroll');
  const overallProgress = totalCount > 0 ? Math.round((masteredCount / totalCount) * 100) : 0;

  const refreshCards = () => {
    api.listCards()
      .then(res => {
        if (res.success) {
          setCards(res.cards);
          const mastered = res.cards.filter(c => (c.interval || 0) > 1).length;
          setMasteredCount(mastered);
        }
      })
      .catch(console.error);
  };

  const refreshStats = async () => {
    try {
      const nextDueRes = await api.nextDue();
      if (nextDueRes.success) {
        setDueCount(nextDueRes.due_count);
        setTotalCount(nextDueRes.total_count);
      }
    } catch (err) {
      console.error('获取统计失败:', err);
    }
  };

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const [nextDueRes, cardsRes] = await Promise.all([
          api.nextDue(),
          api.listCards(),
        ]);

        if (nextDueRes.success) {
          setDueCount(nextDueRes.due_count);
          setTotalCount(nextDueRes.total_count);
        }

        if (cardsRes.success) {
          setCards(cardsRes.cards);
          const mastered = cardsRes.cards.filter(c => (c.interval || 0) > 1).length;
          setMasteredCount(mastered);
        }
      } catch (err) {
        console.error('获取统计失败:', err);
        Message.error(t('scrollPage.fetchStatsFailed'));
      } finally {
        setLoading(false);
      }
    };

    if (!isStudying) {
      fetchStats();
    }
  }, [isStudying, t]);

  useEffect(() => {
    const handleCardsChanged = () => {
      if (!isStudying) {
        refreshCards();
      }
    };
    window.addEventListener('papyrus_cards_changed', handleCardsChanged);
    return () => window.removeEventListener('papyrus_cards_changed', handleCardsChanged);
  }, [isStudying]);

  useEffect(() => {
    const handleGlobalNewCard = () => {
      setCreateCardModalVisible(true);
    };
    const handleStartStudy = (e: Event) => {
      const customEvent = e as CustomEvent<{ tag?: string }>;
      const tag = customEvent.detail?.tag;
      setFilterTag(tag);
      setIsDemo(false);
      setIsStudying(true);
    };
    window.addEventListener('papyrus_new_card', handleGlobalNewCard);
    window.addEventListener('papyrus_start_study', handleStartStudy);
    return () => {
      window.removeEventListener('papyrus_new_card', handleGlobalNewCard);
      window.removeEventListener('papyrus_start_study', handleStartStudy);
    };
  }, []);

  useEffect(() => {
    if (initialTag && !isStudying) {
      startStudy(initialTag);
      onInitialTagUsed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTag]);

  const startStudy = (tag?: string) => {
    setIsExiting(false);
    setFilterTag(tag);
    setIsDemo(false);
    setIsStudying(true);
  };

  const handleExitStudy = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsStudying(false);
      setIsExiting(false);
    }, 300);
  };

  const startDemo = () => {
    setIsDemo(true);
    setIsStudying(true);
  };

  const handleCreateCollection = async () => {
    const name = newCollectionName.trim();
    setIsSubmitting(true);
    try {
      let successCount = 0;
      for (const cardId of selectedCardIds) {
        const card = cards.find(c => c.id === cardId);
        if (card) {
          const newTags = [...(card.tags || []), name];
          const res = await api.updateCard(cardId, { tags: newTags });
          if (res.success) successCount++;
        }
      }
      Message.success(t('scrollPage.collectionCreated', { count: successCount }));
      setCreateModalVisible(false);
      setNewCollectionName('');
      setSelectedCardIds([]);
      refreshCards();
    } catch (err) {
      Message.error(t('scrollPage.createCollectionFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateCard = async () => {
    const q = newCardQuestion.trim();
    const a = newCardAnswer.trim();
    if (!q) {
      Message.error(t('scrollPage.pleaseEnterQuestion'));
      return;
    }
    if (!a) {
      Message.error(t('scrollPage.pleaseEnterAnswer'));
      return;
    }
    setIsSubmittingCard(true);
    try {
      const tags = newCardTags.split(',').map(tag => tag.trim()).filter(Boolean);
      const res = await api.createCard(q, a, tags.length > 0 ? tags : undefined);
      if (res.success) {
        Message.success(t('scrollPage.cardCreated'));
        setCreateCardModalVisible(false);
        setNewCardQuestion('');
        setNewCardAnswer('');
        setNewCardTags('');
        refreshCards();
        refreshStats();
      }
    } catch (err) {
      Message.error(err instanceof Error ? err.message : t('scrollPage.createCardFailed'));
    } finally {
      setIsSubmittingCard(false);
    }
  };

  const collections = generateCollections(cards);
  const scrolls = generateScrolls(cards);

  return {
    isStudying, setIsStudying,
    isExiting, setIsExiting,
    isDemo, setIsDemo,
    dueCount, setDueCount,
    totalCount, setTotalCount,
    masteredCount, setMasteredCount,
    loading, setLoading,
    cards, setCards,
    filterTag, setFilterTag,
    createModalVisible, setCreateModalVisible,
    newCollectionName, setNewCollectionName,
    selectedCardIds, setSelectedCardIds,
    manageModalVisible, setManageModalVisible,
    manageCollectionId, setManageCollectionId,
    isSubmitting, setIsSubmitting,
    batchCardModalVisible, setBatchCardModalVisible,
    batchSelectedIds, setBatchSelectedIds,
    createCardModalVisible, setCreateCardModalVisible,
    newCardQuestion, setNewCardQuestion,
    newCardAnswer, setNewCardAnswer,
    newCardTags, setNewCardTags,
    isSubmittingCard, setIsSubmittingCard,
    overallProgress, refreshCards, refreshStats,
    startStudy, handleExitStudy, startDemo,
    handleCreateCollection, handleCreateCard,
    collections, scrolls, t, sceneryConfig,
  };
}
