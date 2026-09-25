import { useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Check,
  Copy,
  RefreshCw,
  Search
} from 'lucide-react';
import { Button } from '@/shared/ui';
import type { ApiMarketplaceModel } from '@/services/api-marketplace';
import { copyText } from './clipboard';

const STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'healthy', label: '正常' },
  { value: 'attention', label: '需要关注' },
  { value: 'lowTraffic', label: '低流量' },
  { value: 'uncovered', label: '暂无数据' }
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];
type StatusTone = 'healthy' | 'degraded' | 'outage' | 'lowTraffic' | 'unknown';
type SlotTone = StatusTone | 'warning';

/**
 * The upstream monitor requires min_requests samples inside its window before
 * it emits metrics. A rule that ran successfully with zero samples still
 * proves the model endpoint was reachable, so those models get their own
 * "low traffic" tone instead of lumping into "no data".
 */
function hasStatusRule(model: ApiMarketplaceModel): boolean {
  return Boolean(model.status?.checkedAt);
}

function statusTone(model: ApiMarketplaceModel): StatusTone {
  const status = model.status;
  if (!hasStatusRule(model)) {
    return 'unknown';
  }
  if (!status || !status.totalCount || status.totalCount <= 0) {
    return 'lowTraffic';
  }
  const label = status.label.toLowerCase();
  if (
    label.includes('故障') ||
    label.includes('不可用') ||
    (status.errorRate !== null && status.errorRate >= 50)
  ) {
    return 'outage';
  }
  if (
    label.includes('异常') ||
    label.includes('波动') ||
    label.includes('偏多') ||
    label.includes('延迟') ||
    (status.errorRate !== null && status.errorRate > 0)
  ) {
    return 'degraded';
  }
  return 'healthy';
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function successRate(model: ApiMarketplaceModel): number | null {
  const status = model.status;
  if (
    !status?.totalCount ||
    status.totalCount <= 0 ||
    status.errorRate === null ||
    !Number.isFinite(status.errorRate)
  ) {
    return null;
  }
  return clampPercent(100 - status.errorRate);
}

function formatPercent(model: ApiMarketplaceModel): string {
  const value = successRate(model);
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function formatLatency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ms`;
}

function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString('zh-CN');
}

function formatInterval(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '—';
  }
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} 分钟`;
  return `${seconds} 秒`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '暂无检查时间';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
}

function modelInitial(model: ApiMarketplaceModel): string {
  return model.name.trim().slice(0, 1).toUpperCase() || '·';
}

function slotTones(model: ApiMarketplaceModel): SlotTone[] {
  const tone = statusTone(model);
  if (tone === 'unknown') return Array.from({ length: 30 }, () => 'unknown');
  if (tone === 'lowTraffic') {
    return Array.from({ length: 30 }, () => 'lowTraffic');
  }
  const errorRate = clampPercent(model.status?.errorRate || 0);
  const errorSlots = Math.round((errorRate / 100) * 30);
  const flaggedSlots = tone === 'healthy' ? 0 : Math.max(1, errorSlots);
  const slots: SlotTone[] = Array.from({ length: 30 }, () => 'healthy');
  if (flaggedSlots === 0) return slots;

  // Spread non-green slots across the strip to preserve the monitoring-page
  // rhythm while still making the aggregate success rate visible at a glance.
  const selected = new Set<number>();
  for (let cursor = 0; selected.size < flaggedSlots; cursor += 7) {
    selected.add((cursor + 3) % 30);
  }
  for (const index of selected) {
    slots[index] = tone === 'outage' ? 'outage' : 'warning';
  }
  return slots;
}

function StatusTimeline({ model }: { model: ApiMarketplaceModel }) {
  const slots = slotTones(model);
  const tone = statusTone(model);
  const label = model.status?.checkedAt
    ? tone === 'lowTraffic'
      ? `${model.status.label}，窗口内样本不足，未计算成功率`
      : `${model.status.label}，成功率 ${formatPercent(model)}`
    : '暂无状态数据';
  return (
    <div
      className="api-status-timeline"
      aria-label={`质量分布：${label}。每格代表聚合质量比例，不代表逐小时历史`}
    >
      {slots.map((slot, index) => (
        <span
          className={`api-status-slot is-${slot}`}
          key={index}
          title={
            model.status?.checkedAt
              ? `${model.status.label} · ${formatDate(model.status.checkedAt)}`
              : '暂无检查数据'
          }
        />
      ))}
      <span className="sr-only">当前状态：{tone}</span>
    </div>
  );
}

function StatusRow({
  model,
  onCopyFeedback
}: {
  model: ApiMarketplaceModel;
  onCopyFeedback: (didCopy: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const tone = statusTone(model);
  const status = model.status;
  const statusLabel =
    tone === 'unknown'
      ? '暂无状态数据'
      : tone === 'lowTraffic'
        ? '低流量 · 检查正常'
        : status?.label || '正常';

  const handleCopy = async () => {
    const didCopy = await copyText(model.name);
    onCopyFeedback(didCopy);
    if (!didCopy) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <article className={`api-status-row is-${tone}`}>
      <div className="api-status-model-cell">
        <button
          type="button"
          className="api-status-expand"
          aria-label={`${expanded ? '收起' : '展开'} ${model.name} 状态详情`}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <span className="api-status-model-icon" aria-hidden="true">
          {modelInitial(model)}
        </span>
        <div className="api-status-model-copy">
          <div className="api-status-model-title">
            <h3 title={model.name}>{model.name}</h3>
            <button
              type="button"
              className="api-status-copy"
              aria-label={`${copied ? '已复制' : '复制'}模型名称 ${model.name}`}
              title={copied ? '已复制模型名称' : '复制模型名称'}
              onClick={handleCopy}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div className="api-status-badges">
            <span>{model.provider || model.tags[0] || '通用'}</span>
            <span className={`is-${tone}`}>{statusLabel}</span>
          </div>
          <p>
            {status?.checkedAt
              ? `更新于 ${formatDate(status.checkedAt)}`
              : '尚未接入健康检查'}
          </p>
        </div>
      </div>

      <StatusTimeline model={model} />

      <dl className="api-status-metrics">
        <div>
          <dt>成功率</dt>
          <dd>
            {tone === 'lowTraffic' ? '样本不足' : formatPercent(model)}
          </dd>
        </div>
        <div>
          <dt>响应</dt>
          <dd>{formatLatency(status?.avgResponseTimeMs)}</dd>
        </div>
        <div>
          <dt>样本</dt>
          <dd>{formatCount(status?.totalCount)}</dd>
        </div>
      </dl>

      {expanded && (
        <div className="api-status-row-detail">
          <p>{model.description || '暂无模型说明。'}</p>
          <span>
            绿色表示正常，浅绿表示低流量（检查正常但窗口内请求不足 5 次），黄色表示波动或有错误样本，红色表示故障，灰色表示暂无有效样本。
            时间条按当前聚合成功率生成；数据源暂未提供完整的 24 小时分时记录。
          </span>
        </div>
      )}
    </article>
  );
}

export function ApiStatusMonitor({
  models,
  statusMeta,
  search,
  filter,
  onSearchChange,
  onFilterChange,
  onRefresh,
  onCopyFeedback
}: {
  models: ApiMarketplaceModel[];
  statusMeta: { checkIntervalSeconds: number | null } | null;
  search: string;
  filter: StatusFilter;
  onSearchChange: (value: string) => void;
  onFilterChange: (value: StatusFilter) => void;
  onRefresh: () => void;
  onCopyFeedback: (didCopy: boolean) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(20);
  const statusModels = useMemo(() => {
    const filtered = models.filter((model) => {
      const tone = statusTone(model);
      if (filter === 'healthy') return tone === 'healthy';
      if (filter === 'attention') {
        return tone === 'degraded' || tone === 'outage';
      }
      if (filter === 'lowTraffic') return tone === 'lowTraffic';
      if (filter === 'uncovered') return tone === 'unknown';
      return true;
    });
    return [...filtered].sort((a, b) => {
      const toneOrder = {
        outage: 0,
        degraded: 1,
        healthy: 2,
        lowTraffic: 3,
        unknown: 4
      };
      const toneDifference =
        toneOrder[statusTone(a)] - toneOrder[statusTone(b)];
      return toneDifference || a.name.localeCompare(b.name);
    });
  }, [filter, models]);
  const monitoredCount = models.filter(
    (model) => statusTone(model) !== 'unknown'
  ).length;
  const attentionCount = models.filter((model) => {
    const tone = statusTone(model);
    return tone === 'degraded' || tone === 'outage';
  }).length;
  const healthyCount = models.filter(
    (model) => statusTone(model) === 'healthy'
  ).length;
  const lowTrafficCount = models.filter(
    (model) => statusTone(model) === 'lowTraffic'
  ).length;
  const visibleModels = statusModels.slice(0, visibleCount);

  return (
    <section className="api-status-monitor" aria-label="模型状态监控">
      <header className="api-status-monitor-header">
        <div>
          <p className="api-marketplace-kicker">Service health</p>
          <h2>模型状态监控</h2>
          <p>
            按模型查看最近健康检查、质量分布、成功率、响应耗时与样本覆盖。状态数据来自上游对部分核心模型的主动监控，未覆盖的模型显示为「暂无数据」。
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          leadingIcon={<RefreshCw size={15} />}
        >
          刷新状态
        </Button>
      </header>

      <div className="api-status-summary" aria-label="状态摘要">
        <div>
          <strong>{models.length}</strong>
          <span>可用模型</span>
        </div>
        <div>
          <strong>{healthyCount}</strong>
          <span>正常模型</span>
        </div>
        <div>
          <strong>{attentionCount}</strong>
          <span>需要关注</span>
        </div>
        <div>
          <strong>{formatInterval(statusMeta?.checkIntervalSeconds)}</strong>
          <span>检查间隔 · 已覆盖 {monitoredCount}</span>
        </div>
        <div>
          <strong>{lowTrafficCount}</strong>
          <span>低流量</span>
        </div>
      </div>

      <div className="api-status-toolbar">
        <label className="api-marketplace-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">搜索状态模型</span>
          <input
            value={search}
            onChange={(event) => {
              setVisibleCount(20);
              onSearchChange(event.target.value);
            }}
            placeholder="在当前模型中筛选"
          />
        </label>
        <div
          className="api-status-filters"
          role="tablist"
          aria-label="状态筛选"
        >
          {STATUS_FILTERS.map((item) => {
            const count =
              item.value === 'healthy'
                ? healthyCount
                : item.value === 'attention'
                  ? attentionCount
                  : item.value === 'lowTraffic'
                    ? lowTrafficCount
                  : item.value === 'uncovered'
                    ? models.length - monitoredCount
                    : models.length;
            return (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                className={filter === item.value ? 'is-active' : ''}
                onClick={() => {
                  setVisibleCount(20);
                  onFilterChange(item.value);
                }}
              >
                {item.label} <small>{Math.max(0, count)}</small>
              </button>
            );
          })}
        </div>
      </div>

      <div className="api-status-note" role="note">
        <div className="api-status-legend" aria-label="状态图例">
          <span>
            <i className="is-healthy" />
            正常
          </span>
          <span>
            <i className="is-lowTraffic" />
            低流量
          </span>
          <span>
            <i className="is-warning" />
            波动
          </span>
          <span>
            <i className="is-outage" />
            故障
          </span>
          <span>
            <i className="is-unknown" />
            暂无样本
          </span>
        </div>
        <span>质量分布条中的绿色越多，代表聚合成功率越高。</span>
      </div>

      <div
        className="api-status-table"
        role="table"
        aria-label="模型健康状态列表"
      >
        <div className="api-status-table-heading" role="row">
          <span role="columnheader">模型</span>
          <span role="columnheader">质量分布 · 30 格</span>
          <span role="columnheader">成功率</span>
          <span role="columnheader">响应</span>
          <span role="columnheader">样本</span>
        </div>
        {visibleModels.length > 0 ? (
          visibleModels.map((model) => (
            <StatusRow
              key={model.id}
              model={model}
              onCopyFeedback={onCopyFeedback}
            />
          ))
        ) : (
          <div className="api-status-empty">没有匹配的状态记录。</div>
        )}
      </div>

      {statusModels.length > visibleModels.length && (
        <div className="api-marketplace-load-more">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setVisibleCount((value) => value + 20)}
          >
            加载更多
          </Button>
          <p className="api-marketplace-footnote">
            已显示 {visibleModels.length} / {statusModels.length} 个结果
          </p>
        </div>
      )}
    </section>
  );
}
