import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shortcut, SavedSummary } from '@/services/database';
import type { Reference } from '@/types';
import {
  MARKET_SKILLS,
  hydrateMarketSkillPrompt,
  loadMarketSkillPrompt,
  type MarketSkill
} from '@/workspace/data/youmind-market-skills';
import type { SkillCatalogItem } from '@/workspace/utils/skill-catalog';
import {
  ArrowLeft,
  Compass,
  ImagePlus,
  PencilLine,
  Plus,
  Sparkles,
  X,
  Link2,
  FileText,
  Upload,
  MoreHorizontal,
  Trash2,
  Lock,
  Loader2
} from 'lucide-react';
import { createSkillCoverDataUrl } from '@/web/lib/skill-cover';
import { SkillRunsPanel } from './SkillRunsPanel';
import { SKILL_RUN_FOCUS_EVENT } from '../utils/skill-run-events';
import { ReferenceSelector } from './ReferenceSelector';
import { Button, SearchField } from '@/shared/ui';

type PlazaTab = 'explore' | 'mine' | 'runs';
type MineFilter = 'all' | 'personal' | 'installed';

interface PersonalSkillDetail {
  id: string;
  name: string;
  description: string;
  prompt: string;
  source: 'personal';
  coverImages?: string[];
}

interface MarketSkillDetail extends MarketSkill {
  source: 'market' | 'installed';
}

function getSkillsViewUrl(): string {
  if (typeof window === 'undefined') return '/skills';
  const pathname = window.location.pathname;
  if (pathname.includes('/create/boards') || pathname.includes('/boards')) {
    return '/boards?view=skills';
  }
  return '/skills';
}

type SkillDetail = PersonalSkillDetail | MarketSkillDetail;
const SOURCE_LABELS: Record<'personal' | 'market' | 'installed', string> = {
  personal: 'Personal',
  market: 'Market',
  installed: 'Installed'
};
const CATEGORY_ORDER = ['学习', '写作', '图片', 'Slides', '网页'];
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  '学习': '汲取先贤智慧的精华。像伟人一样思考和行动。',
  '写作': '您的个人简报助手，通过定期任务提供报告。',
  '图片': '根据主题生成风格化品牌配图和视觉内容。',
  'Slides': '基于内容自动生成精美的演示文稿。',
  '网页': '将内容排版并发布到各类平台。'
};
const CATEGORIES = [
  '全部',
  ...Array.from(
    new Set(
      MARKET_SKILLS.map((item) => item.category).filter(
        (category) => category && category !== '全部'
      )
    )
  ).sort((a, b) => {
    const aIndex = CATEGORY_ORDER.indexOf(a);
    const bIndex = CATEGORY_ORDER.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b, 'zh-Hans');
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  })
];
const SKILL_COVERS_STORAGE_KEY = 'workspace:skill-covers:v1';
const MAX_SKILL_COVERS = 2;
const EMPTY_CATALOG_ITEMS: SkillCatalogItem[] = [];

function SkillCard({
  title,
  description,
  category,
  onClick,
  onDelete,
  onInstall,
  showMenu,
  installed
}: {
  title: string;
  description: string;
  category: string;
  tag?: string;
  useCount?: number;
  onClick: () => void;
  onDelete?: () => void;
  onInstall?: () => Promise<void> | void;
  showMenu?: boolean;
  installed?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const coverImage = createSkillCoverDataUrl(title, category || 'Skill');

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="group relative text-left rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-all">
      <button type="button" onClick={onClick} className="w-full text-left">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
            <img
              src={coverImage}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
              decoding="async"
              fetchPriority="low"
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 line-clamp-1">{title}</h3>
          </div>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed line-clamp-3">{description}</p>
      </button>

      {/* 我的 tab: 右上角 ⋯ 菜单 */}
      {showMenu && (
        <div className="absolute top-4 right-4" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="p-1.5 rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600 transition-all"
            aria-label="更多操作"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 min-w-[120px] z-20">
              {onDelete && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onDelete(); }}
                  className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 探索 tab: 悬停显示底部操作栏 */}
      {onInstall && !showMenu && (
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-8 bg-gradient-to-t from-white via-white/95 to-transparent rounded-b-2xl opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClick(); }}
              className="flex-1 py-2 rounded-full text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              查看更多
            </button>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                if (installing || installed) return;
                setInstalling(true);
                try { await onInstall(); } finally { setInstalling(false); }
              }}
              disabled={installed || installing}
              className="flex-1 py-2 rounded-full text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300 transition-colors flex items-center justify-center gap-1.5"
            >
              {installing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 加入中</>
              ) : installed ? '已加入' : '加入模板'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface SkillsPlazaProps {
  shortcuts: Shortcut[];
  summaries?: SavedSummary[];
  catalog?: SkillCatalogItem[];
  marketSkills?: MarketSkill[];
  initialTab?: PlazaTab;
  onCreateSkill: (skill: {
    name: string;
    prompt: string;
    description?: string;
    referenceIds?: string[];
  }) => Promise<{ id: string }>;
  onUpdateSkill: (
    skillId: string,
    updates: { name?: string; prompt?: string; description?: string }
  ) => Promise<void>;
  onInstallMarketSkill: (skill: {
    marketSkillId: string;
    name: string;
    prompt: string;
    description?: string;
    category?: string;
  }) => Promise<void>;
  onDeleteSkill?: (skillId: string) => Promise<void>;
}

export function SkillsPlaza({
  shortcuts,
  summaries = [],
  catalog,
  marketSkills,
  initialTab = 'explore',
  onCreateSkill,
  onUpdateSkill,
  onInstallMarketSkill,
  onDeleteSkill
}: SkillsPlazaProps) {
  const [plazaTab, setPlazaTab] = useState<PlazaTab>(initialTab);

  useEffect(() => {
    const handleFocusRun = () => {
      setPlazaTab('runs');
    };
    window.addEventListener(SKILL_RUN_FOCUS_EVENT, handleFocusRun);
    return () => window.removeEventListener(SKILL_RUN_FOCUS_EVENT, handleFocusRun);
  }, []);
  const [mineFilter, setMineFilter] = useState<MineFilter>('all');
  const [category, setCategory] = useState('全部');
  const [search, setSearch] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<SkillDetail | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [loadingPromptId, setLoadingPromptId] = useState<string | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  const [createMode, setCreateMode] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPrompt, setCreatePrompt] = useState('');
  const [createCovers, setCreateCovers] = useState<string[]>([]);
  const [createRefs, setCreateRefs] = useState<Array<{ id: string; summaryId: string; summaryTitle: string; thumbnailUrl?: string }>>([]);
  const [showCreateRefSelector, setShowCreateRefSelector] = useState(false);
  const [createFiles, setCreateFiles] = useState<Array<{ id: string; name: string; data: string }>>([]);
  const templateDeepLinkHandledRef = useRef<string | null>(null);
  const [skillCovers, setSkillCovers] = useState<Record<string, string[]>>(
    () => {
      try {
        const raw = localStorage.getItem(SKILL_COVERS_STORAGE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return {};
        }
        return parsed as Record<string, string[]>;
      } catch {
        return {};
      }
    }
  );

  useEffect(() => {
    // Prop-driven tab changes are part of the host page routing contract.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlazaTab(initialTab);
  }, [initialTab]);

  const marketSkillList = marketSkills && marketSkills.length > 0 ? marketSkills : MARKET_SKILLS;
  const catalogItems = catalog ?? EMPTY_CATALOG_ITEMS;


  const filteredMarketSkills = useMemo(() => {
    return marketSkillList.filter((skill) => {
      if (category !== '全部' && skill.category !== category) return false;
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.author.toLowerCase().includes(q)
      );
    });
  }, [marketSkillList, category, search]);

  const installedMarketSkillIds = useMemo(
    () =>
      new Set(
        catalogItems
          .filter((item) => item.originType === 'market-installed')
          .map((item) => item.marketSkillId || item.id)
      ),
    [catalogItems]
  );

  const installedMarketSkills = useMemo(
    () =>
      marketSkillList.filter((skill) => installedMarketSkillIds.has(skill.id)),
    [marketSkillList, installedMarketSkillIds]
  );

  const mineSkills = useMemo(() => {
    const personalCatalog = catalogItems
      .filter((item) => item.originType === 'user' || item.originType === 'system')
      .map((item) => ({
        id: item.id,
        name: item.displayName || item.name,
        description:
          item.description || item.skill?.coreInstructions?.slice(0, 90) || '自定义技能',
        prompt: item.skill?.coreInstructions || '',
        coverImages: item.skill ? skillCovers[item.id] || [] : [],
        source: 'personal' as const
      }));
    const personal = personalCatalog.length > 0
      ? personalCatalog
      : shortcuts.map((item) => ({
          id: item.id,
          name: item.name || '未命名技能',
          description:
            item.description || item.prompt?.slice(0, 90) || '自定义技能',
          prompt: item.prompt || '',
          coverImages: skillCovers[item.id] || [],
          source: 'personal' as const
        }));
    const installed = catalogItems
      .filter((item) => item.originType === 'market-installed' && item.skill)
      .map((item) => ({
        id: item.id,
        marketSkillId: item.marketSkillId,
        name: item.displayName || item.name,
        description:
          item.description || item.skill?.coreInstructions?.slice(0, 90) || '已加入模板',
        category: item.category || '作品模板',
        author: '我',
        badgeColor: 'from-slate-600 to-slate-800',
        prompt: item.skill?.coreInstructions || '',
        source: 'installed' as const
      }));

    if (mineFilter === 'personal') return personal;
    if (mineFilter === 'installed') return installed;
    const deduped: Array<
      (typeof personal)[number] | (typeof installed)[number]
    > = [...personal];
    const existingNames = new Set(
      personal.map((skill) => skill.name.trim().toLowerCase())
    );
    installed.forEach((skill) => {
      const key = skill.name.trim().toLowerCase();
      if (!existingNames.has(key)) {
        deduped.push(skill);
      }
    });
    return deduped;
  }, [catalogItems, shortcuts, mineFilter, skillCovers]);

  const persistSkillCovers = (next: Record<string, string[]>) => {
    setSkillCovers(next);
    try {
      localStorage.setItem(SKILL_COVERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const openMarketSkill = useCallback(
    (skill: MarketSkill, source: 'market' | 'installed' = 'market') => {
      setSelectedSkill({ ...skill, source });
      if (skill.prompt) return;

      setLoadingPromptId(skill.id);
      loadMarketSkillPrompt(skill.id)
        .then((prompt) => {
          setSelectedSkill((prev) =>
            prev && prev.source !== 'personal' && prev.id === skill.id
              ? { ...prev, prompt }
              : prev
          );
        })
        .catch((error) => {
          console.error('[SkillsPlaza] Load market skill prompt failed:', error);
        })
        .finally(() => {
          setLoadingPromptId((current) =>
            current === skill.id ? null : current
          );
        });
    },
    []
  );

  const handleInstall = useCallback(async (skill: MarketSkill) => {
    if (
      installedMarketSkills.some((item) => item.id === skill.id) ||
      installingId
    ) {
      return;
    }
    try {
      setInstallingId(skill.id);
      const hydratedSkill = await hydrateMarketSkillPrompt(skill);
      await onInstallMarketSkill({
        marketSkillId: hydratedSkill.id,
        name: hydratedSkill.name,
        prompt: hydratedSkill.prompt,
        description: hydratedSkill.description,
        category: hydratedSkill.category
      });
      setSelectedSkill({ ...hydratedSkill, source: 'installed' });
    } catch (error) {
      console.error('[SkillsPlaza] Install skill failed:', error);
    } finally {
      setInstallingId(null);
    }
  }, [installedMarketSkills, installingId, onInstallMarketSkill]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const templateId = params.get('template');
    if (!templateId || templateDeepLinkHandledRef.current === templateId) {
      return;
    }

    const skill = marketSkillList.find((item) => item.id === templateId);
    if (!skill) return;

    templateDeepLinkHandledRef.current = templateId;
    // Template deep links intentionally reposition the in-app skills view once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlazaTab('mine');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMineFilter('installed');

    const alreadyInstalled = installedMarketSkillIds.has(skill.id);
    openMarketSkill(skill, alreadyInstalled ? 'installed' : 'market');

    if (params.get('add') === 'true' && !alreadyInstalled) {
      void handleInstall(skill).finally(() => {
        window.history.replaceState(
          { view: 'skills' },
          '',
          getSkillsViewUrl()
        );
      });
    } else {
      window.history.replaceState({ view: 'skills' }, '', getSkillsViewUrl());
    }
  }, [handleInstall, installedMarketSkillIds, marketSkillList, openMarketSkill]);

  const handleCreateSkill = async () => {
    const name = createName.trim();
    const prompt = createPrompt.trim();
    if (!name || !prompt || savingSkill) return;
    try {
      setSavingSkill(true);
      const refIds = createRefs.map((r) => r.summaryId);
      const created = await onCreateSkill({
        name,
        prompt,
        description: createDescription.trim() || undefined,
        referenceIds: refIds.length > 0 ? refIds : undefined
      });
      if (createCovers.length > 0) {
        persistSkillCovers({
          ...skillCovers,
          [created.id]: createCovers.slice(0, MAX_SKILL_COVERS)
        });
      }
      setCreateMode(false);
      setCreateName('');
      setCreateDescription('');
      setCreatePrompt('');
      setCreateCovers([]);
      setCreateRefs([]);
      setCreateFiles([]);
      setPlazaTab('mine');
      setMineFilter('personal');
    } finally {
      setSavingSkill(false);
    }
  };

  const handleUpdatePersonalSkill = async () => {
    if (!selectedSkill || selectedSkill.source !== 'personal' || savingSkill)
      return;
    const name = selectedSkill.name.trim();
    const prompt = selectedSkill.prompt.trim();
    if (!name || !prompt) return;
    try {
      setSavingSkill(true);
      await onUpdateSkill(selectedSkill.id, {
        name,
        prompt,
        description: selectedSkill.description || undefined
      });
      if (selectedSkill.coverImages && selectedSkill.coverImages.length > 0) {
        persistSkillCovers({
          ...skillCovers,
          [selectedSkill.id]: selectedSkill.coverImages.slice(
            0,
            MAX_SKILL_COVERS
          )
        });
      }
    } finally {
      setSavingSkill(false);
    }
  };


  const handleCreateCoverSelect = (index: number, file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') return;
      setCreateCovers((prev) => {
        const next = [...prev];
        next[index] = result;
        return next.slice(0, MAX_SKILL_COVERS);
      });
    };
    reader.readAsDataURL(file);
  };

  const handleAddCreateRefs = (refs: Reference[]) => {
    const newRefs = refs.map((ref) => {
      const summary = summaries.find((s) => s.id === ref.summaryId);
      const content = summary?.markdown || '';
      const imgMatch = content.match(/<img[^>]+src=["'](data:image\/[^;]+;base64,[^"']+)["'][^>]*>/i)
        || content.match(/!\[.*\]\((data:image\/[^;]+;base64,[^)]+)\)/i);
      return {
        id: ref.id,
        summaryId: ref.summaryId!,
        summaryTitle: ref.summaryTitle || '未命名',
        thumbnailUrl: imgMatch?.[1]
      };
    });
    setCreateRefs((prev) => [...prev, ...newRefs]);
    setShowCreateRefSelector(false);
  };

  const handleCreateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        if (!data) return;
        setCreateFiles((prev) => [...prev, { id: crypto.randomUUID(), name: file.name, data }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  if (createMode) {
    const createCoverImage = createSkillCoverDataUrl(createName || '新技能', 'custom');
    const existingRefIds = createRefs.map((r) => r.summaryId);
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
        <div className="max-w-3xl mx-auto px-8 py-6">
          <header className="flex items-center justify-between mb-8">
            <button
              type="button"
              onClick={() => setCreateMode(false)}
              className="inline-flex items-center gap-2 text-slate-900 font-semibold"
            >
              <ArrowLeft className="w-4 h-4" />
              新技能
            </button>
            <button
              type="button"
              onClick={() => setCreateMode(false)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              title="关闭"
              aria-label="关闭"
            >
              <X className="w-6 h-6" />
            </button>
          </header>

          <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-8">
            {/* 技能名称 + 头像 + 创建按钮 */}
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
                <img
                  src={createCoverImage}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-400 mb-1">技能名称</div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="新技能"
                    className="flex-1 text-lg font-semibold text-slate-900 border-0 border-b border-transparent pb-0.5 focus:outline-none focus:border-slate-300 bg-transparent placeholder:text-slate-300"
                  />
                  <PencilLine className="w-4 h-4 text-slate-300" />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleCreateSkill()}
                disabled={!createName.trim() || !createPrompt.trim() || savingSkill}
                className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium disabled:bg-slate-300 hover:bg-slate-800 transition-colors flex-shrink-0"
              >
                {savingSkill ? '创建中...' : '创建'}
              </button>
            </div>

            {/* 描述 */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-700">描述</label>
                <span className="text-xs text-slate-400">{createDescription.length}/300</span>
              </div>
              <textarea
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value.slice(0, 300))}
                placeholder="描述这个技能的功能..."
                rows={3}
                className="w-full rounded-xl border border-slate-200 p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-200 placeholder:text-slate-400"
              />
            </section>

            {/* 指令 */}
            <section>
              <label className="block text-sm font-medium text-slate-700 mb-2">指令</label>
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                {/* 已添加的引用/文件标签 */}
                {(createRefs.length > 0 || createFiles.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 p-3 border-b border-slate-100 bg-slate-50">
                    {createRefs.map((ref) => (
                      <span
                        key={ref.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs"
                      >
                        {ref.thumbnailUrl ? (
                          <img
                            src={ref.thumbnailUrl}
                            alt=""
                            className="w-4 h-4 rounded object-cover flex-shrink-0"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        )}
                        <span className="max-w-[120px] truncate">{ref.summaryTitle}</span>
                        <button
                          type="button"
                          onClick={() => setCreateRefs((prev) => prev.filter((r) => r.id !== ref.id))}
                          className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    {createFiles.map((file) => (
                      <span
                        key={file.id}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs"
                      >
                        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setCreateFiles((prev) => prev.filter((f) => f.id !== file.id))}
                          className="p-0.5 hover:bg-amber-100 rounded transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 指令提示 + 输入区 */}
                <textarea
                  value={createPrompt}
                  onChange={(e) => setCreatePrompt(e.target.value)}
                  placeholder={'为了有效描述技能的工作方式，你可以使用以下结构：\n\n1. 你的目标是什么？\n2. 哪种风格适合？\n3. 这个技能的背景是什么？\n4. 使用哪些关键词？\n5. 输出应该多长？'}
                  rows={12}
                  className="w-full p-4 text-sm text-slate-900 placeholder:text-slate-400 resize-y focus:outline-none bg-white"
                />

                {/* 底部工具栏 */}
                <div className="flex items-center gap-1 px-3 py-2 border-t border-slate-100 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowCreateRefSelector(true)}
                    className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    title="从素材库添加引用"
                  >
                    <Link2 className="w-4.5 h-4.5" />
                  </button>
                  <label
                    className="p-2 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer"
                    title="上传文件"
                  >
                    <Upload className="w-4.5 h-4.5" />
                    <input
                      type="file"
                      accept=".pdf,.txt,.md,.csv,.json,image/*"
                      multiple
                      className="hidden"
                      onChange={handleCreateFileUpload}
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* 封面图片 */}
            <section>
              <label className="block text-sm font-medium text-slate-700 mb-3">
                封面图片
                <span className="ml-2 text-xs text-slate-400 font-normal">（最多 2 张，960×600）</span>
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map((index) => (
                  <label
                    key={`create-cover-${index}`}
                    className="w-full aspect-[16/10] rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-slate-100 transition-colors overflow-hidden"
                  >
                    {createCovers[index] ? (
                      <img
                        src={createCovers[index]}
                        alt={`cover-${index + 1}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <>
                        <ImagePlus className="w-6 h-6 text-slate-400" />
                        <span className="text-xs text-slate-400">上传或拖放图片到此处</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleCreateCoverSelect(index, e.target.files?.[0])}
                    />
                  </label>
                ))}
              </div>
            </section>

          </div>
        </div>

        {/* 引用选择器弹窗 */}
        {showCreateRefSelector && (
          <ReferenceSelector
            summaries={summaries}
            existingReferenceIds={existingRefIds}
            onConfirm={handleAddCreateRefs}
            onCancel={() => setShowCreateRefSelector(false)}
          />
        )}
      </div>
    );
  }

  if (selectedSkill) {
    const isMarketLike =
      selectedSkill.source === 'market' || selectedSkill.source === 'installed';
    const isInstalled =
      isMarketLike &&
      (selectedSkill.source === 'installed' ||
        installedMarketSkills.some((item) => item.id === selectedSkill.id));
    const selectedCover = createSkillCoverDataUrl(
      selectedSkill.name,
      isMarketLike
        ? (selectedSkill as MarketSkillDetail).category || 'Skill'
        : '个人技能'
    );
    const marketDetail = isMarketLike ? (selectedSkill as MarketSkillDetail) : null;
    const hasCoverImages = marketDetail?.coverImages && marketDetail.coverImages.length > 0;
    const promptLoading = isMarketLike && loadingPromptId === selectedSkill.id;
    const promptHidden = isMarketLike && !selectedSkill.prompt && !promptLoading;

    return (
      <div className="flex-1 overflow-y-auto bg-white custom-scrollbar">
        <div className="max-w-6xl mx-auto px-8 py-6">
          {/* 返回 */}
          <button
            type="button"
            onClick={() => setSelectedSkill(null)}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            作品模板
          </button>

          {/* 头像 + 操作按钮 */}
          <div className="flex items-start justify-between mb-8">
            <div className="w-16 h-16 rounded-full overflow-hidden">
              <img
                src={selectedCover}
                alt=""
                className="w-full h-full object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            </div>
            <div className="flex items-center gap-2">
              {isMarketLike ? (
                <button
                  type="button"
                  disabled={!!isInstalled || installingId === selectedSkill.id}
                  onClick={() => void handleInstall(selectedSkill as MarketSkill)}
                  className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium disabled:bg-slate-300 hover:bg-slate-800 transition-colors inline-flex items-center gap-2"
                >
                  {installingId === selectedSkill.id && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {isInstalled
                    ? '已加入模板'
                    : installingId === selectedSkill.id
                      ? '加入中'
                      : '加入作品模板'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUpdatePersonalSkill()}
                  disabled={
                    savingSkill ||
                    !(selectedSkill as PersonalSkillDetail).name.trim() ||
                    !(selectedSkill as PersonalSkillDetail).prompt.trim()
                  }
                  className="px-6 py-2.5 rounded-full bg-slate-900 text-white text-sm font-medium disabled:bg-slate-300 hover:bg-slate-800 transition-colors"
                >
                  {savingSkill ? '保存中...' : '保存'}
                </button>
              )}
            </div>
          </div>

          {/* 标题 */}
          {selectedSkill.source === 'personal' ? (
            <input
              value={selectedSkill.name}
              onChange={(e) =>
                setSelectedSkill((prev) =>
                  prev && prev.source === 'personal'
                    ? { ...prev, name: e.target.value }
                    : prev
                )
              }
              placeholder="技能名称"
              className="w-full text-2xl font-bold text-slate-900 border-0 border-b border-slate-200 pb-2 mb-4 focus:outline-none bg-transparent"
            />
          ) : (
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              {selectedSkill.name}
            </h2>
          )}

          {/* 描述 */}
          <p className="text-base text-slate-600 leading-relaxed mb-6">
            {selectedSkill.description}
          </p>

          {/* 模板使用 · 已获取积分 */}
          {isMarketLike && (
            <div className="flex items-center gap-4 text-sm text-slate-500 mb-8">
              <span>模板使用</span>
              <span className="font-medium text-slate-700">👤 {(selectedSkill as MarketSkillDetail).author ? '—' : '—'}</span>
            </div>
          )}

          {/* 封面图片 */}
          {hasCoverImages && (
            <div className="mb-10">
              {marketDetail!.coverImages!.map((url, i) => (
                <div key={i} className="overflow-hidden rounded-2xl bg-slate-100 mb-4">
                  <img
                    src={url}
                    alt=""
                    className="w-full h-auto object-cover"
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ))}
            </div>
          )}

          {/* 作者 + 类别 + 指令 — 两列布局 */}
          <div className="flex flex-col md:flex-row gap-8">
            {/* 左列：作者 + 类别 */}
            <div className="flex flex-row md:flex-col gap-6 md:w-[160px] flex-shrink-0">
              <div>
                <div className="text-sm text-slate-400 mb-1.5">作者</div>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
                    <img
                      src={selectedCover}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-900">
                    {isMarketLike ? marketDetail!.author : '我'}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-400 mb-1.5">类别</div>
                <div className="text-sm font-medium text-slate-900">
                  {isMarketLike ? marketDetail!.category : '个人技能'}
                </div>
              </div>
            </div>

            {/* 右列：指令 */}
            <div className="flex-1 min-w-0">
              <div className="text-sm text-slate-400 mb-2">指令</div>
              {promptLoading ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 flex flex-col items-center justify-center gap-3 text-center min-h-[200px]">
                  <Loader2 className="w-8 h-8 text-slate-300 animate-spin" />
                  <p className="text-sm text-slate-500">正在加载完整指令...</p>
                </div>
              ) : promptHidden ? (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-8 flex flex-col items-center justify-center gap-3 text-center min-h-[200px]">
                  <Lock className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-500">该模板的完整指令已隐藏，你仍可以加入作品模板并直接使用。</p>
                </div>
              ) : selectedSkill.source === 'personal' ? (
                <textarea
                  value={selectedSkill.prompt}
                  onChange={(e) =>
                    setSelectedSkill((prev) =>
                      prev && prev.source === 'personal'
                        ? { ...prev, prompt: e.target.value }
                        : prev
                    )
                  }
                  placeholder="请输入技能指令"
                  rows={14}
                  className="w-full whitespace-pre-wrap text-sm leading-7 p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 resize-y"
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm leading-7 p-5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 max-h-[500px] overflow-y-auto">
                  {selectedSkill.prompt}
                </pre>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 分类聚合页
  if (selectedCategory) {
    const categorySkills = marketSkillList.filter((s) => s.category === selectedCategory);
    return (
      <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            选择一个技能开始
          </button>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">{selectedCategory}</h2>
          <p className="text-sm text-slate-500 mb-8">
            {CATEGORY_DESCRIPTIONS[selectedCategory] || `${selectedCategory}类技能合集`}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {categorySkills.map((skill) => (
              <SkillCard
                key={skill.id}
                title={skill.name}
                description={skill.description}
                category={skill.category}
                onClick={() => {
                  setSelectedCategory(null);
                  openMarketSkill(skill, 'market');
                }}
                onInstall={() => void handleInstall(skill)}
                installed={installedMarketSkillIds.has(skill.id)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
      <div className="max-w-6xl mx-auto px-8 pt-6 pb-8">
        <header className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            技能
          </h1>
          <Button
            type="button"
            variant="primary"
            size="md"
            leadingIcon={<Plus className="w-4 h-4" />}
            onClick={() => setCreateMode(true)}
          >
            新技能
          </Button>
        </header>

        <div className="inline-flex items-center bg-slate-100 rounded-full p-1 mb-8">
          <button
            type="button"
            onClick={() => setPlazaTab('explore')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm ${
              plazaTab === 'explore'
                ? 'bg-white shadow text-slate-900'
                : 'text-slate-500'
            }`}
          >
            <Compass className="w-4 h-4" />
            探索
          </button>
          <button
            type="button"
            onClick={() => setPlazaTab('mine')}
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm ${
              plazaTab === 'mine'
                ? 'bg-white shadow text-slate-900'
                : 'text-slate-500'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            我的
          </button>
        </div>

        {plazaTab === 'explore' ? (
          <>
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">
                推荐
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {CATEGORY_ORDER.map((cat) => {
                  const count = marketSkillList.filter((s) => s.category === cat).length;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className="relative text-left rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-all overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full bg-gradient-to-bl from-violet-100/60 to-transparent" />
                      <h3 className="text-lg font-semibold text-slate-900 mb-2 relative">{cat}</h3>
                      <p className="text-sm text-slate-500 leading-relaxed line-clamp-2 relative">
                        {CATEGORY_DESCRIPTIONS[cat] || `${cat}类技能合集`}
                      </p>
                      <div className="mt-3 text-xs text-slate-400 relative">{count} 个技能</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                <div className="flex items-center flex-wrap gap-2">
                  {CATEGORIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setCategory(item)}
                      className={`px-4 py-1.5 rounded-full text-sm ${
                        category === item
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <SearchField
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onClear={() => setSearch('')}
                  clearLabel="清空搜索"
                  placeholder="搜索"
                  wrapperClassName="w-full md:w-64"
                  className="bg-slate-100 border-slate-200 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {filteredMarketSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    title={skill.name}
                    description={skill.description}
                    category={skill.category}
                    onClick={() => openMarketSkill(skill, 'market')}
                    onInstall={() => void handleInstall(skill)}
                    installed={installedMarketSkillIds.has(skill.id)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : plazaTab === 'mine' ? (
          <section>
            <div className="flex items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-2">
                {(
                  [
                    ['all', '全部'],
                    ['personal', '个人'],
                    ['installed', '已加入']
                  ] as Array<[MineFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setMineFilter(key)}
                    className={`px-4 py-1.5 rounded-full text-sm ${
                      mineFilter === key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {mineSkills.length === 0 ? (
                <div className="col-span-full py-20 text-center flex flex-col items-center justify-center">
                  <div className="relative w-32 h-32 mb-6">
                    <style>{`
                      @keyframes floatBook {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-8px); }
                      }
                      @keyframes waveWand {
                        0%, 100% { transform: rotate(15deg); }
                        50% { transform: rotate(-5deg); }
                      }
                      @keyframes magicSparkle {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.4; transform: scale(0.6); }
                      }
                      .anim-book { animation: floatBook 4s ease-in-out infinite; }
                      .anim-wand { animation: waveWand 3s ease-in-out infinite; transform-origin: bottom left; }
                      .anim-sparkle { animation: magicSparkle 2s ease-in-out infinite; }
                    `}</style>
                    <svg
                      className="w-full h-full"
                      viewBox="0 0 100 100"
                      fill="none"
                    >
                      {/* Floating book */}
                      <g className="anim-book">
                        <path
                          d="M50 70 L 25 60 L 50 50 L 75 60 Z"
                          fill="#e2e8f0"
                          stroke="#cbd5e1"
                          strokeWidth="3"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M25 60 L 25 40 L 50 30 L 75 40 L 75 60"
                          fill="none"
                          stroke="#cbd5e1"
                          strokeWidth="3"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M50 70 L 50 50 M50 50 L 50 30"
                          stroke="#cbd5e1"
                          strokeWidth="3"
                        />
                        <path
                          d="M35 45 L 45 40 M55 40 L 65 45"
                          stroke="#94a3b8"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </g>

                      {/* Magic wand */}
                      <g className="anim-wand" transform="translate(60, 40)">
                        <line
                          x1="0"
                          y1="20"
                          x2="15"
                          y2="5"
                          stroke="#f59e0b"
                          strokeWidth="4"
                          strokeLinecap="round"
                        />
                        <circle
                          className="anim-sparkle"
                          cx="18"
                          cy="2"
                          r="4"
                          fill="#fbbf24"
                        />
                        <path
                          className="anim-sparkle"
                          d="M10 -5 L12 0 L17 2 L12 4 L10 9 L8 4 L3 2 L8 0 Z"
                          fill="#fef3c7"
                          transform="scale(0.8) translate(5, -10)"
                        />
                      </g>
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-slate-800 mb-2">
                    暂无技能
                  </h3>
                  <p className="text-sm text-slate-500 max-w-sm">
                    去“探索”发现市场上的实用技能，或者点击“新技能”创建一个属于你的专属助手
                  </p>
                </div>
              ) : (
                mineSkills.map((skill) => (
                  <SkillCard
                    key={`${skill.source}-${skill.id}`}
                    onClick={() => {
                      if (skill.source === 'personal') {
                        setSelectedSkill({
                          id: skill.id,
                          name: skill.name,
                          description: skill.description,
                          prompt: skill.prompt,
                          source: 'personal',
                          coverImages: skill.coverImages || []
                        });
                      } else {
                        const marketSkillId =
                          'marketSkillId' in skill ? skill.marketSkillId : undefined;
                        const market = MARKET_SKILLS.find(
                          (item) => item.id === (marketSkillId || skill.id)
                        );
                        if (market) {
                          openMarketSkill(market, 'installed');
                        } else {
                          setSelectedSkill({
                            id: skill.id,
                            name: skill.name,
                            description: skill.description,
                            category: skill.category,
                            author: skill.author,
                            badgeColor: skill.badgeColor,
                            prompt: skill.prompt,
                            source: 'installed'
                          });
                        }
                      }
                    }}
                    title={skill.name}
                    description={skill.description}
                    category={SOURCE_LABELS[skill.source]}
                    showMenu
                    onDelete={onDeleteSkill ? () => void onDeleteSkill(skill.id) : undefined}
                  />
                ))
              )}
            </div>
          </section>
        ) : (
          <section>
            <SkillRunsPanel />
          </section>
        )}
      </div>
    </div>
  );
}
