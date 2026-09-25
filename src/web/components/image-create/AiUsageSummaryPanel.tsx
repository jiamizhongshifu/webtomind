import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  getAdminAiUsageSummary,
  type AiUsageSummaryRecord,
  type AiUsageSummaryResult
} from '@/services/agent-api';
import { Button, Input } from '@/shared/ui';
import { Alert, AlertDescription } from '@/shared/ui/radix/alert';
import { Field, FieldLabel } from '@/shared/ui/radix/field';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/shared/ui/radix/table';

interface AiUsageSummaryPanelProps {
  isZh: boolean;
  headingId?: string;
  className?: string;
  loadSummary?: typeof getAdminAiUsageSummary;
}

type AiUsageSummaryForm = {
  from: string;
  to: string;
  provider: string;
  model: string;
  source: string;
};

function formatDateInput(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDefaultFilters(): AiUsageSummaryForm {
  const to = new Date();
  const from = new Date(to);
  from.setDate(to.getDate() - 29);
  return {
    from: formatDateInput(from),
    to: formatDateInput(to),
    provider: '',
    model: '',
    source: ''
  };
}

function compactFilters(filters: AiUsageSummaryForm) {
  return {
    from: filters.from,
    to: filters.to,
    provider: filters.provider.trim() || undefined,
    model: filters.model.trim() || undefined,
    source: filters.source.trim() || undefined,
    limit: 200
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

function formatLatency(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

function getLatencyTotals(items: AiUsageSummaryRecord[]) {
  let weightedLatency = 0;
  let latencyEvents = 0;
  let maxP95: number | null = null;

  for (const item of items) {
    if (item.avgLatencyMs !== null && item.eventCount > 0) {
      weightedLatency += item.avgLatencyMs * item.eventCount;
      latencyEvents += item.eventCount;
    }
    if (item.p95LatencyMs !== null) {
      maxP95 =
        maxP95 === null
          ? item.p95LatencyMs
          : Math.max(maxP95, item.p95LatencyMs);
    }
  }

  return {
    avgLatencyMs:
      latencyEvents > 0 ? Math.round(weightedLatency / latencyEvents) : null,
    p95LatencyMs: maxP95
  };
}

export function AiUsageSummaryPanel({
  isZh,
  headingId,
  className,
  loadSummary = getAdminAiUsageSummary
}: AiUsageSummaryPanelProps) {
  const [filters, setFilters] = useState<AiUsageSummaryForm>(() =>
    getDefaultFilters()
  );
  const [appliedFilters, setAppliedFilters] = useState<AiUsageSummaryForm>(() =>
    getDefaultFilters()
  );
  const [summary, setSummary] = useState<AiUsageSummaryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');

    loadSummary(compactFilters(appliedFilters))
      .then((result) => {
        if (cancelled) return;
        setSummary(result);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : isZh
              ? 'AI 用量汇总加载失败。'
              : 'Failed to load AI usage summary.'
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appliedFilters, isZh, loadSummary]);

  const latencyTotals = useMemo(
    () => getLatencyTotals(summary?.items || []),
    [summary?.items]
  );

  const totals = summary?.totals || {
    eventCount: 0,
    succeededCount: 0,
    failedCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    imageCount: 0
  };
  const activeFilters = summary?.filters || compactFilters(appliedFilters);
  const setupMessage =
    summary?.error ||
    (isZh
      ? '请先完成 Supabase AI 用量汇总视图初始化。'
      : 'Initialize the Supabase AI usage summary view first.');

  function updateFilter(key: keyof AiUsageSummaryForm, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedFilters(filters);
  }

  function handleReset() {
    const nextFilters = getDefaultFilters();
    setFilters(nextFilters);
    setAppliedFilters(nextFilters);
  }

  return (
    <section
      className={['prompt-case-admin-usage', className]
        .filter(Boolean)
        .join(' ')}
      aria-busy={isLoading}
    >
      <div className="prompt-case-admin-usage-head">
        <div>
          <p>{isZh ? 'AI USAGE' : 'AI USAGE'}</p>
          <h2 id={headingId}>{isZh ? 'AI 用量汇总' : 'AI usage summary'}</h2>
          <span>
            {activeFilters.from} - {activeFilters.to}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAppliedFilters({ ...filters })}
          disabled={isLoading}
          leadingIcon={
            isLoading ? (
              <Loader2 className="spin" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )
          }
        >
          {isZh ? '刷新' : 'Refresh'}
        </Button>
      </div>

      <form className="prompt-case-admin-usage-filters" onSubmit={handleSubmit}>
        <Field className="prompt-case-admin-usage-field">
          <FieldLabel>{isZh ? '开始日期' : 'From'}</FieldLabel>
          <Input
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
          />
        </Field>
        <Field className="prompt-case-admin-usage-field">
          <FieldLabel>{isZh ? '结束日期' : 'To'}</FieldLabel>
          <Input
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
          />
        </Field>
        <Field className="prompt-case-admin-usage-field">
          <FieldLabel>Provider</FieldLabel>
          <Input
            value={filters.provider}
            placeholder="openai"
            onChange={(event) => updateFilter('provider', event.target.value)}
          />
        </Field>
        <Field className="prompt-case-admin-usage-field">
          <FieldLabel>Model</FieldLabel>
          <Input
            value={filters.model}
            placeholder="gpt-image-2"
            onChange={(event) => updateFilter('model', event.target.value)}
          />
        </Field>
        <Field className="prompt-case-admin-usage-field">
          <FieldLabel>Source</FieldLabel>
          <Input
            value={filters.source}
            placeholder="image_create_page"
            onChange={(event) => updateFilter('source', event.target.value)}
          />
        </Field>
        <div className="prompt-case-admin-usage-actions">
          <Button type="submit" disabled={isLoading}>
            {isZh ? '应用' : 'Apply'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isLoading}
          >
            {isZh ? '重置' : 'Reset'}
          </Button>
        </div>
      </form>

      {summary?.needsSetup && (
        <Alert className="prompt-case-admin-usage-alert">
          <AlertDescription>{setupMessage}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert className="prompt-case-admin-usage-alert" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="prompt-case-admin-usage-metrics">
        <div>
          <span>Events</span>
          <strong>{formatNumber(totals.eventCount)}</strong>
        </div>
        <div>
          <span>{isZh ? 'Success' : 'Success'}</span>
          <strong>{formatNumber(totals.succeededCount)}</strong>
        </div>
        <div>
          <span>{isZh ? 'Fail' : 'Fail'}</span>
          <strong>{formatNumber(totals.failedCount)}</strong>
        </div>
        <div>
          <span>Tokens</span>
          <strong>{formatNumber(totals.totalTokens)}</strong>
          <small>
            {formatNumber(totals.inputTokens)} in /{' '}
            {formatNumber(totals.outputTokens)} out
          </small>
        </div>
        <div>
          <span>Images</span>
          <strong>{formatNumber(totals.imageCount)}</strong>
        </div>
        <div>
          <span>Latency</span>
          <strong>{formatLatency(latencyTotals.avgLatencyMs)}</strong>
          <small>p95 {formatLatency(latencyTotals.p95LatencyMs)}</small>
        </div>
      </div>

      <div
        className="prompt-case-admin-usage-table"
        role="region"
        tabIndex={0}
        aria-label={isZh ? 'AI 用量明细表格' : 'AI usage details table'}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{isZh ? '日期' : 'Date'}</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Events</TableHead>
              <TableHead>Success</TableHead>
              <TableHead>Fail</TableHead>
              <TableHead>Tokens</TableHead>
              <TableHead>Images</TableHead>
              <TableHead>Latency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(summary?.items || []).map((item) => (
              <TableRow
                key={`${item.usageDate}-${item.provider}-${item.model}-${item.source}`}
              >
                <TableCell>{item.usageDate}</TableCell>
                <TableCell>{item.provider}</TableCell>
                <TableCell>{item.model}</TableCell>
                <TableCell>{item.source}</TableCell>
                <TableCell>{formatNumber(item.eventCount)}</TableCell>
                <TableCell>{formatNumber(item.succeededCount)}</TableCell>
                <TableCell>{formatNumber(item.failedCount)}</TableCell>
                <TableCell>{formatNumber(item.totalTokens)}</TableCell>
                <TableCell>{formatNumber(item.imageCount)}</TableCell>
                <TableCell>
                  {formatLatency(item.avgLatencyMs)} / p95{' '}
                  {formatLatency(item.p95LatencyMs)}
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && !summary?.items.length && (
              <TableRow>
                <TableCell colSpan={10}>
                  {summary?.needsSetup
                    ? isZh
                      ? '等待初始化后显示数据。'
                      : 'Data will appear after setup.'
                    : isZh
                      ? '当前筛选范围没有用量记录。'
                      : 'No usage records for these filters.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
