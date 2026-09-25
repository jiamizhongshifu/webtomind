import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { applySeo } from '../lib/seo';
import {
  completeRewardTaskOnce,
  REWARD_TASK_IDENTIFIERS
} from '@/services/reward-task-events';
import { PageLoadSkeleton } from '../components/PageLoadSkeleton';

export function CreateBoardsPage() {
  const location = useLocation();
  const { isLoading: isAuthLoading } = useAuth();
  const standalonePath =
    location.pathname.replace(
      /^\/(?:zh-CN|en-US)?\/?create\/boards/,
      '/boards'
    ) || '/boards';
  const standaloneUrl = `${standalonePath}${location.search}${location.hash}`;

  useEffect(() => {
    return applySeo({
      title: 'WebToMind 创意工作台 Boards',
      description: '在创作工作台内管理 Boards、图库素材和内容卡片。',
      canonical: 'https://webtomind.com/create/boards',
      robots: 'noindex,nofollow',
      ogImage: 'https://webtomind.com/icons/logo-icon.svg',
      twitterSite: '@webtomind'
    });
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    void completeRewardTaskOnce(REWARD_TASK_IDENTIFIERS.createOrOpenBoard);
  }, [isAuthLoading]);

  if (isAuthLoading) {
    return <PageLoadSkeleton variant="workspace" />;
  }

  return <Navigate to={standaloneUrl} replace />;
}

export default CreateBoardsPage;
