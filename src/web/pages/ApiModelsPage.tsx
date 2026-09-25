import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Database,
  Filter,
  Image,
  RotateCcw,
  Search,
  Video
} from 'lucide-react';
import { CreateWorkspaceShell } from '../components/create-workspace/CreateWorkspaceShell';
import { Button, ButtonLink } from '@/shared/ui';
import {
  getApiMarketplaceModels,
  type ApiMarketplaceModel
} from '@/services/api-marketplace';
import { ApiStatusMonitor } from './api-marketplace/ApiStatusMonitor';
import {
  ApiMarketplaceToast,
  type ApiMarketplaceToastState
} from './api-marketplace/ApiMarketplaceToast';
import { copyText } from './api-marketplace/clipboard';
import './api-marketplace.css';

const TAGS = [
  { value: '', label: '全部' },
  { value: '文本', label: '文本' },
  { value: '多模态', label: '多模态' },
  { value: '生图', label: '生图' },
  { value: '视频', label: '视频' }
];
const CUSTOMER_PRICE_MARKUP = 1.3;

type FilterOption = { value: string; label: string; count: number };

function modelIcon(model: ApiMarketplaceModel) {
  if (model.tags.includes('视频')) return <Video size={17} />;
  if (model.tags.includes('生图')) return <Image size={17} />;
  if (model.tags.includes('多模态')) return <Database size={17} />;
  return <Code2 size={17} />;
}

function formatPrice(currency: string, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : currency;
  const decimals = value >= 10 ? 2 : value >= 1 ? 3 : 6;
  const formatted = value.toFixed(decimals).replace(/\.?0+$/, '');
  return `${symbol}${formatted}`;
}

function getModelPricing(model: ApiMarketplaceModel) {
  if (model.pricing) return model.pricing;
  if (model.pricingMode === 'request') {
    return {
      inputPerMillion: null,
      outputPerMillion: null,
      requestPrice: model.customer.modelPrice,
      unit: 'request' as const
    };
  }
  const input =
    model.customer.modelRatio === null ? null : model.customer.modelRatio * 2;
  // Older catalog responses expose a marked-up completion ratio but not the
  // normalized pricing object. Remove that markup before deriving output cost.
  const completionRatio =
    model.customer.completionRatio === null
      ? null
      : model.customer.completionRatio / CUSTOMER_PRICE_MARKUP;
  const output =
    input === null || completionRatio === null ? null : input * completionRatio;
  return {
    inputPerMillion: input,
    outputPerMillion: output,
    requestPrice: null,
    unit: 'tokens_1m' as const
  };
}

function FilterSection({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (options.length === 0) return null;
  const visibleOptions = expanded ? options : options.slice(0, 8);
  return (
    <section className="api-filter-section">
      <h3>{label}</h3>
      <div className="api-filter-options">
        {visibleOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            className={value === option.value ? 'is-active' : ''}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <small>{option.count}</small>
          </button>
        ))}
      </div>
      {options.length > 8 && (
        <button
          type="button"
          className="api-filter-more"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? '收起' : `展开更多（${options.length - 8}）`}
        </button>
      )}
    </section>
  );
}

function ApiModelCard({
  model,
  currency,
  localePrefix,
  onCopyFeedback
}: {
  model: ApiMarketplaceModel;
  currency: string;
  localePrefix: string;
  onCopyFeedback: (didCopy: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);
  const pricing = getModelPricing(model);
  const handleCopy = async () => {
    const didCopy = await copyText(model.name);
    onCopyFeedback(didCopy);
    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className="api-model-card">
      <div className="api-model-card-heading">
        <span className="api-model-icon" aria-hidden="true">
          {modelIcon(model)}
        </span>
        <div>
          <div className="api-model-name-line">
            <h2 title={model.name}>{model.name}</h2>
            <button
              type="button"
              className="api-model-copy"
              aria-label={`${copied ? '已复制' : '复制'}模型名称 ${model.name}`}
              title={copied ? '已复制模型名称' : '复制模型名称'}
              onClick={handleCopy}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p>
            {model.provider || model.tags.slice(0, 3).join(' · ') || '通用模型'}
          </p>
        </div>
      </div>
      <div className="api-model-card-meta">
        <span>
          {model.pricingMode === 'request' ? '按次计费' : '按 Token 计费'}
        </span>
        {pricing.unit === 'request' ? (
          <strong>{formatPrice(currency, pricing.requestPrice)} / 次</strong>
        ) : (
          <div className="api-model-price-lines">
            <strong>
              输入 {formatPrice(currency, pricing.inputPerMillion)} / 1M Tokens
            </strong>
            <strong>
              输出 {formatPrice(currency, pricing.outputPerMillion)} / 1M Tokens
            </strong>
          </div>
        )}
      </div>
      <div className="api-model-card-footer">
        <span>
          {model.endpoints.slice(0, 2).join(' · ') || 'OpenAI compatible'}
        </span>
        <Link
          to={`${localePrefix}/api-console?model=${encodeURIComponent(model.id)}`}
          aria-label={`使用 ${model.name}`}
        >
          使用 <ArrowRight size={14} />
        </Link>
      </div>
    </article>
  );
}

function buildViewHref(
  pathname: string,
  search: string,
  view: 'models' | 'status'
): string {
  const params = new URLSearchParams(search);
  if (view === 'status') params.set('tab', 'status');
  else params.delete('tab');
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}

function countOptions(
  models: ApiMarketplaceModel[],
  values: string[],
  allLabel: string
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [
    { value: '', label: allLabel, count: models.length },
    ...Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, label: value, count }))
  ];
}

export function ApiModelsPage() {
  const location = useLocation();
  const [models, setModels] = useState<ApiMarketplaceModel[]>([]);
  const [statusMeta, setStatusMeta] = useState<{
    checkIntervalSeconds: number | null;
  } | null>(null);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const [provider, setProvider] = useState('');
  const [group, setGroup] = useState('');
  const [label, setLabel] = useState('');
  const [billing, setBilling] = useState<'all' | 'token' | 'request'>('all');
  const [endpoint, setEndpoint] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth > 720
  );
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [visibleCount, setVisibleCount] = useState(60);
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'healthy' | 'attention' | 'lowTraffic' | 'uncovered'
  >('all');
  const [toast, setToast] = useState<ApiMarketplaceToastState | null>(null);
  const viewMode =
    new URLSearchParams(location.search).get('tab') === 'status'
      ? 'status'
      : 'models';
  const localePrefix = location.pathname.startsWith('/en-US')
    ? '/en-US'
    : location.pathname.startsWith('/zh-CN')
      ? '/zh-CN'
      : '';

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showCopyFeedback = useCallback((didCopy: boolean) => {
    setToast(
      didCopy
        ? { message: '模型名称已复制', tone: 'success' }
        : { message: '复制失败，请检查浏览器权限后重试。', tone: 'error' }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      getApiMarketplaceModels({
        search,
        tag,
        includeStatus: viewMode === 'status'
      })
        .then((result) => {
          if (cancelled) return;
          setModels(result.models || []);
          setCurrency(result.currency || 'USD');
          setStatusMeta(result.statusMeta || null);
        })
        .catch(() => {
          if (!cancelled) setError('模型价格暂时不可用，请稍后重试。');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [reloadToken, search, tag, viewMode]);

  const filterOptions = useMemo(() => {
    const providerValues = models.flatMap((model) =>
      model.provider ? [model.provider] : []
    );
    const groupValues = models.flatMap((model) => model.groups || []);
    const labelValues = models.flatMap((model) => model.tags);
    const endpointValues = models.flatMap((model) => model.endpoints);
    return {
      providers: countOptions(models, providerValues, '全部供应商'),
      groups: countOptions(models, groupValues, '全部分组'),
      labels: countOptions(models, labelValues, '全部标签'),
      endpoints: countOptions(models, endpointValues, '全部端点')
    };
  }, [models]);

  const filteredModels = useMemo(
    () =>
      models.filter((model) => {
        if (provider && model.provider !== provider) return false;
        if (group && !(model.groups || []).includes(group)) return false;
        if (label && !model.tags.includes(label)) return false;
        if (endpoint && !model.endpoints.includes(endpoint)) return false;
        if (billing !== 'all' && model.pricingMode !== billing) return false;
        return true;
      }),
    [billing, endpoint, group, label, models, provider]
  );

  const displayModels = useMemo(
    () => filteredModels.slice(0, visibleCount),
    [filteredModels, visibleCount]
  );

  const resetFilters = () => {
    setProvider('');
    setGroup('');
    setLabel('');
    setBilling('all');
    setEndpoint('');
    setVisibleCount(60);
  };

  return (
    <CreateWorkspaceShell className="api-marketplace-page-shell">
      {toast ? <ApiMarketplaceToast {...toast} /> : null}
      <main className="api-marketplace-page">
        <nav
          className="api-marketplace-view-tabs"
          role="tablist"
          aria-label="模型广场视图"
        >
          <Link
            to={buildViewHref(location.pathname, location.search, 'models')}
            role="tab"
            aria-selected={viewMode === 'models'}
            className={viewMode === 'models' ? 'is-active' : ''}
          >
            模型目录
          </Link>
          <Link
            to={buildViewHref(location.pathname, location.search, 'status')}
            role="tab"
            aria-selected={viewMode === 'status'}
            className={viewMode === 'status' ? 'is-active' : ''}
          >
            状态监控
          </Link>
        </nav>
        <header className="api-marketplace-hero">
          <div>
            <p className="api-marketplace-kicker">
              WebToMind Developer Platform
            </p>
            <h1>模型广场</h1>
            <p className="api-marketplace-lede">
              {viewMode === 'status'
                ? '持续查看模型健康检查与服务质量，帮助你在接入前选择合适的模型。'
                : 'WebToMind 提供统一、稳定的模型 API 服务。一个 Key，一个 OpenAI 兼容 Base URL，直接接入你的产品、脚本和工作流。'}
            </p>
          </div>
          <div className="api-marketplace-hero-actions">
            <ButtonLink
              to={`${localePrefix}/api-console`}
              variant="primary"
              size="lg"
              trailingIcon={<ArrowRight size={17} />}
            >
              进入令牌管理
            </ButtonLink>
          </div>
        </header>

        {viewMode === 'status' ? (
          loading ? (
            <div className="api-marketplace-empty" role="status">
              正在同步模型状态…
            </div>
          ) : error ? (
            <div className="api-marketplace-empty is-error" role="alert">
              <div className="api-marketplace-error-content">
                <p>{error}</p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setReloadToken((value) => value + 1)}
                >
                  重试
                </Button>
              </div>
            </div>
          ) : (
            <ApiStatusMonitor
              models={models}
              statusMeta={statusMeta}
              search={search}
              filter={statusFilter}
              onSearchChange={(value) => {
                setSearch(value);
                setLoading(true);
              }}
              onFilterChange={setStatusFilter}
              onRefresh={() => setReloadToken((value) => value + 1)}
              onCopyFeedback={showCopyFeedback}
            />
          )
        ) : (
          <>
            <section
              className="api-marketplace-trust-strip"
              aria-label="API 服务说明"
            >
              <span>
                <strong>{filteredModels.length || '—'}</strong> 个可用模型
              </span>
              <span>统一 API 接入</span>
              <span>OpenAI 兼容接口</span>
              <span>按实际调用扣费</span>
              <span>独立 Key 管理</span>
            </section>

            <section className="api-marketplace-toolbar" aria-label="模型筛选">
              <label className="api-marketplace-search">
                <Search size={17} aria-hidden="true" />
                <span className="sr-only">搜索模型</span>
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisibleCount(60);
                    setLoading(true);
                  }}
                  placeholder="搜索模型名称或能力"
                />
              </label>
              <div
                className="api-marketplace-tabs"
                role="tablist"
                aria-label="模型类型"
              >
                {TAGS.map((item) => {
                  const count = item.value
                    ? models.filter((model) => model.tags.includes(item.value))
                        .length
                    : models.length;
                  return (
                    <button
                      key={item.value || 'all'}
                      type="button"
                      role="tab"
                      aria-selected={tag === item.value}
                      className={tag === item.value ? 'is-active' : ''}
                      onClick={() => {
                        setTag(item.value);
                        setVisibleCount(60);
                        setLoading(true);
                      }}
                    >
                      {item.label} <small>{count}</small>
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="api-filter-toggle"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((value) => !value)}
              >
                <Filter size={15} />
                {filtersOpen ? '收起筛选' : '更多筛选'}
              </button>
            </section>

            <div className="api-catalog-layout">
              {filtersOpen && (
                <aside
                  className="api-catalog-filters"
                  aria-label="模型筛选条件"
                >
                  <div className="api-catalog-filters-heading">
                    <div>
                      <span>筛选</span>
                      <small>{filteredModels.length} 个结果</small>
                    </div>
                    <button
                      type="button"
                      aria-label="重置筛选"
                      title="重置筛选"
                      onClick={resetFilters}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                  <FilterSection
                    label="供应商"
                    options={filterOptions.providers}
                    value={provider}
                    onChange={(value) => {
                      setProvider(value);
                      setVisibleCount(60);
                    }}
                  />
                  <FilterSection
                    label="可用令牌分组"
                    options={filterOptions.groups}
                    value={group}
                    onChange={(value) => {
                      setGroup(value);
                      setVisibleCount(60);
                    }}
                  />
                  <FilterSection
                    label="标签"
                    options={filterOptions.labels}
                    value={label}
                    onChange={(value) => {
                      setLabel(value);
                      setVisibleCount(60);
                    }}
                  />
                  <FilterSection
                    label="端点类型"
                    options={filterOptions.endpoints}
                    value={endpoint}
                    onChange={(value) => {
                      setEndpoint(value);
                      setVisibleCount(60);
                    }}
                  />
                  <FilterSection
                    label="计费类型"
                    options={[
                      { value: 'all', label: '全部类型', count: models.length },
                      {
                        value: 'token',
                        label: '按量计费',
                        count: models.filter(
                          (model) => model.pricingMode === 'token'
                        ).length
                      },
                      {
                        value: 'request',
                        label: '按次计费',
                        count: models.filter(
                          (model) => model.pricingMode === 'request'
                        ).length
                      }
                    ]}
                    value={billing === 'all' ? 'all' : billing}
                    onChange={(value) => {
                      setBilling(
                        value === 'token' || value === 'request' ? value : 'all'
                      );
                      setVisibleCount(60);
                    }}
                  />
                </aside>
              )}

              <div className="api-catalog-results">
                {loading ? (
                  <div className="api-marketplace-empty" role="status">
                    正在同步模型价格…
                  </div>
                ) : error ? (
                  <div className="api-marketplace-empty is-error" role="alert">
                    <div className="api-marketplace-error-content">
                      <p>{error}</p>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setReloadToken((value) => value + 1)}
                      >
                        重试
                      </Button>
                    </div>
                  </div>
                ) : displayModels.length === 0 ? (
                  <div className="api-marketplace-empty">
                    <div className="api-marketplace-empty-content">
                      <p>没有匹配的模型。</p>
                      <button type="button" onClick={resetFilters}>
                        清除筛选
                      </button>
                    </div>
                  </div>
                ) : (
                  <section className="api-model-grid" aria-label="模型列表">
                    {displayModels.map((model) => (
                      <ApiModelCard
                        key={model.id}
                        model={model}
                        currency={currency}
                        localePrefix={localePrefix}
                        onCopyFeedback={showCopyFeedback}
                      />
                    ))}
                  </section>
                )}
                {!loading &&
                  !error &&
                  filteredModels.length > displayModels.length && (
                    <div className="api-marketplace-load-more">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setVisibleCount((value) => value + 60)}
                      >
                        加载更多
                      </Button>
                      <p className="api-marketplace-footnote">
                        已显示 {displayModels.length} / {filteredModels.length}{' '}
                        个结果
                      </p>
                    </div>
                  )}
              </div>
            </div>
          </>
        )}
      </main>
    </CreateWorkspaceShell>
  );
}

export default ApiModelsPage;
