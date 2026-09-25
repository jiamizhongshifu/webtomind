/**
 * 闪卡组件 - 交互式闪卡展示
 * 支持翻转查看答案、左右切换卡片
 */

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, RotateCcw, BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  tags?: string[];
}

interface FlashcardsBlockProps {
  cards: Flashcard[];
  title?: string;
}

export function FlashcardsBlock({ cards, title }: FlashcardsBlockProps) {
  const { t } = useTranslation('workspace');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [studiedCards, setStudiedCards] = useState<Set<number>>(new Set());

  const currentCard = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;

  const handlePrev = useCallback(() => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : cards.length - 1));
  }, [cards.length]);

  const handleNext = useCallback(() => {
    // 标记当前卡片为已学习
    setStudiedCards((prev) => new Set(prev).add(currentIndex));
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev < cards.length - 1 ? prev + 1 : 0));
  }, [cards.length, currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => !prev);
  }, []);

  const handleReset = useCallback(() => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setStudiedCards(new Set());
  }, []);

  if (cards.length === 0) {
    return (
      <div className="p-4 bg-slate-50 rounded-xl text-slate-500 text-center">
        {t('flashcards.empty', '暂无闪卡')}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-4 space-y-4">
      {/* 头部信息 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-slate-700">
            {title || t('flashcards.title', '闪卡学习')}
          </span>
          <span className="text-sm text-slate-500">
            ({cards.length} {t('flashcards.cards', '张')})
          </span>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="p-1.5 text-muted-foreground hover:text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
          title={t('flashcards.reset', '重新开始')}
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 进度条 */}
      <div className="relative h-1.5 bg-white/50 rounded-full overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-blue-500 transition-all duration-slow"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 卡片区域 */}
      <div
        className="relative min-h-[200px] cursor-pointer perspective-1000"
        onClick={handleFlip}
      >
        <div
          className={`relative w-full min-h-[200px] transition-transform duration-500 transform-style-3d ${
            isFlipped ? 'rotate-y-180' : ''
          }`}
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
          }}
        >
          {/* 正面 - 问题 */}
          <div
            className="absolute inset-0 bg-white rounded-xl shadow-sm p-6 flex flex-col backface-hidden"
            style={{ backfaceVisibility: 'hidden' }}
          >
            <div className="text-xs text-blue-500 font-medium mb-2">
              {t('flashcards.question', '问题')} {currentIndex + 1}/
              {cards.length}
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-lg text-slate-800 text-center leading-relaxed">
                {currentCard.question}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-center mt-4">
              {t('flashcards.clickToFlip', '点击翻转查看答案')}
            </div>
          </div>

          {/* 背面 - 答案 */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm p-6 flex flex-col"
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)'
            }}
          >
            <div className="text-xs text-green-600 font-medium mb-2">
              {t('flashcards.answer', '答案')}
            </div>
            <div className="flex-1 flex items-center justify-center">
              <p className="text-lg text-slate-800 text-center leading-relaxed">
                {currentCard.answer}
              </p>
            </div>
            <div className="text-xs text-muted-foreground text-center mt-4">
              {t('flashcards.clickToFlipBack', '点击翻转回问题')}
            </div>
          </div>
        </div>
      </div>

      {/* 导航按钮 */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handlePrev}
          className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('flashcards.prev', '上一张')}
        </button>

        <div className="flex items-center gap-1">
          {cards.slice(0, Math.min(10, cards.length)).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setIsFlipped(false);
                setCurrentIndex(idx);
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                idx === currentIndex
                  ? 'bg-blue-500'
                  : studiedCards.has(idx)
                    ? 'bg-green-400'
                    : 'bg-slate-300'
              }`}
            />
          ))}
          {cards.length > 10 && (
            <span className="text-xs text-muted-foreground ml-1">
              +{cards.length - 10}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:bg-white/50 rounded-lg transition-colors"
        >
          {t('flashcards.next', '下一张')}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 学习进度 */}
      <div className="text-center text-xs text-slate-500">
        {t('flashcards.studied', '已学习')}: {studiedCards.size}/{cards.length}
      </div>
    </div>
  );
}
