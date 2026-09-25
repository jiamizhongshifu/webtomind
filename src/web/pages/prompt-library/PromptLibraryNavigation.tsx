import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/shared/ui/radix/button';

export interface PromptLibraryModelNavItem {
  key: string;
  label: string;
  count: number | null;
  href: string;
  active: boolean;
}

export interface PromptLibraryTagNavItem {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

export interface PromptLibrarySortNavItem {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

interface PromptLibraryNavigationProps {
  isZh: boolean;
  modelItems?: PromptLibraryModelNavItem[];
  tagItems: PromptLibraryTagNavItem[];
  sortItems?: PromptLibrarySortNavItem[];
}

interface PromptLibrarySortTabsProps {
  isZh: boolean;
  items: PromptLibrarySortNavItem[];
  className?: string;
  ariaLabel?: string;
  onItemClick?: (
    event: MouseEvent<HTMLAnchorElement>,
    item: PromptLibrarySortNavItem
  ) => void;
}

interface PromptLibraryScrollNavProps {
  className: string;
  ariaLabel: string;
  previousLabel: string;
  nextLabel: string;
  activeKey?: string;
  children: ReactNode;
}

function PromptLibraryScrollNav({
  className,
  ariaLabel,
  previousLabel,
  nextLabel,
  activeKey,
  children
}: PromptLibraryScrollNavProps) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const node = scrollerRef.current;
    if (!node) return;
    const maxScrollLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    setCanScrollLeft(node.scrollLeft > 2);
    setCanScrollRight(node.scrollLeft < maxScrollLeft - 2);
  }, []);

  const scrollActiveItemIntoView = useCallback(() => {
    const node = scrollerRef.current;
    const activeItem = node?.querySelector<HTMLElement>(
      '[aria-current="page"]'
    );
    activeItem?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, []);

  useEffect(() => {
    updateScrollState();
    const node = scrollerRef.current;
    if (!node) {
      return undefined;
    }

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(node);
    }
    window.addEventListener('resize', updateScrollState);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateScrollState);
    };
  }, [children, updateScrollState]);

  useEffect(() => {
    if (!activeKey) return undefined;
    const animationFrame = window.requestAnimationFrame(() => {
      scrollActiveItemIntoView();
      updateScrollState();
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeKey, scrollActiveItemIntoView, updateScrollState]);

  const scrollByPage = useCallback(
    (direction: -1 | 1) => {
      const node = scrollerRef.current;
      if (!node) return;
      node.scrollBy?.({
        left: direction * Math.max(220, Math.round(node.clientWidth * 0.72)),
        behavior: 'smooth'
      });
      window.setTimeout(updateScrollState, 180);
    },
    [updateScrollState]
  );

  const handleClickCapture = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest<HTMLElement>('a,button');
    if (!item || item.closest('nav') !== scrollerRef.current) return;
    item.scrollIntoView?.({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center'
    });
  }, []);

  return (
    <div
      className={`prompt-browser-scroll-nav ${
        canScrollLeft ? 'can-scroll-left' : ''
      } ${canScrollRight ? 'can-scroll-right' : ''}`}
    >
      <nav
        ref={scrollerRef}
        className={className}
        aria-label={ariaLabel}
        onScroll={updateScrollState}
        onClickCapture={handleClickCapture}
      >
        {children}
      </nav>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="prompt-browser-scroll-button prompt-browser-scroll-button-left"
        aria-label={previousLabel}
        disabled={!canScrollLeft}
        onClick={() => scrollByPage(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="prompt-browser-scroll-button prompt-browser-scroll-button-right"
        aria-label={nextLabel}
        disabled={!canScrollRight}
        onClick={() => scrollByPage(1)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

export function PromptLibraryNavigation({
  isZh,
  modelItems = [],
  tagItems,
  sortItems = []
}: PromptLibraryNavigationProps) {
  const activeModelKey = modelItems.find((item) => item.active)?.key;
  const activeTagKey = tagItems.find((item) => item.active)?.key;

  return (
    <>
      {modelItems.length > 0 && (
        <PromptLibraryScrollNav
          className="prompt-browser-mobile-model-stats"
          ariaLabel={isZh ? 'Prompt 模型分类' : 'Prompt model categories'}
          activeKey={activeModelKey}
          previousLabel={
            isZh ? '向左查看模型分类' : 'Scroll model categories left'
          }
          nextLabel={
            isZh ? '向右查看更多模型分类' : 'Scroll model categories right'
          }
        >
          {modelItems.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={
                item.active
                  ? 'prompt-browser-model-stat active'
                  : 'prompt-browser-model-stat'
              }
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </PromptLibraryScrollNav>
      )}

      <div className="prompt-browser-tag-toolbar">
        <PromptLibraryScrollNav
          className="prompt-browser-subnav"
          ariaLabel={isZh ? 'Prompt 标签' : 'Prompt tags'}
          activeKey={activeTagKey}
          previousLabel={isZh ? '向左查看案例标签' : 'Scroll prompt tags left'}
          nextLabel={isZh ? '向右查看更多案例标签' : 'Scroll prompt tags right'}
        >
          {tagItems.map((item) => (
            <Link
              key={item.key}
              to={item.href}
              aria-current={item.active ? 'page' : undefined}
              className={
                item.active
                  ? 'prompt-browser-subnav-pill active'
                  : 'prompt-browser-subnav-pill'
              }
            >
              {item.label}
            </Link>
          ))}
        </PromptLibraryScrollNav>
        <PromptLibrarySortTabs
          isZh={isZh}
          items={sortItems}
          className="prompt-browser-sort-tabs-desktop"
          ariaLabel={isZh ? 'Prompt 排序（标签行）' : 'Prompt sort in tag row'}
        />
      </div>
    </>
  );
}

export function PromptLibrarySortTabs({
  isZh,
  items,
  className = '',
  ariaLabel,
  onItemClick
}: PromptLibrarySortTabsProps) {
  if (items.length === 0) return null;

  return (
    <nav
      className={['prompt-browser-sort-tabs', className]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel || (isZh ? 'Prompt 排序' : 'Prompt sort')}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          to={item.href}
          aria-current={item.active ? 'page' : undefined}
          className={
            item.active
              ? 'prompt-browser-sort-tab active'
              : 'prompt-browser-sort-tab'
          }
          onClick={
            onItemClick ? (event) => onItemClick(event, item) : undefined
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
