import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cleanupSkillRuns,
  getSkillRun,
  type RuntimeStepPayload,
  type SkillRunListItem,
  type SkillRunDetailsResponse
} from '@/services/agent-api';
import { RefreshCw, Clock3, CheckCircle2, AlertCircle } from 'lucide-react';
import { SKILL_RUN_FOCUS_EVENT } from '../utils/skill-run-events';
import { getRuntimePayloadSections } from '../utils/runtime-payload';

function formatTime(value?: number): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-green-700 bg-green-50';
    case 'failed':
      return 'text-red-700 bg-red-50';
    case 'waiting_async':
      return 'text-amber-700 bg-amber-50';
    default:
      return 'text-blue-700 bg-blue-50';
  }
}

export function SkillRunsPanel() {
  const [runs, setRuns] = useState<SkillRunListItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<SkillRunDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'waiting_async' | 'completed' | 'failed'>('all');
  const [timeRange, setTimeRange] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [cleanupRange, setCleanupRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [stats, setStats] = useState<Record<string, number>>({});

  const loadRuns = useCallback(async () => {
    setLoading(true);
    try {
      const now = Date.now();
      const from =
        timeRange === '24h'
          ? now - 24 * 60 * 60 * 1000
          : timeRange === '7d'
            ? now - 7 * 24 * 60 * 60 * 1000
            : timeRange === '30d'
              ? now - 30 * 24 * 60 * 60 * 1000
              : undefined;
      const response = await fetch(
        `/api/agent/skill-runs?${new URLSearchParams({
          limit: '20',
          ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
          ...(from ? { from: String(from) } : {}),
          includeStats: 'true'
        }).toString()}`
      );
      const data = (await response.json()) as {
        runs?: SkillRunListItem[];
        stats?: Record<string, number>;
      };
      const nextRuns = data.runs || [];
      setRuns(nextRuns);
      setStats(data.stats || {});
      if (nextRuns.length > 0) {
        setSelectedRun((current) => {
          if (current) return current;
          void getSkillRun(nextRuns[0].id)
            .then((details) =>
              setSelectedRun((latest) => latest || details)
            )
            .catch(() => undefined);
          return current;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, timeRange]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    const hasActiveRuns = runs.some(
      (run) => run.status === 'running' || run.status === 'waiting_async'
    );
    if (!hasActiveRuns) return;

    const timer = window.setInterval(() => {
      void loadRuns();
      if (selectedRun?.run?.id) {
        void getSkillRun(selectedRun.run.id).then(setSelectedRun).catch(() => undefined);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [loadRuns, runs, selectedRun?.run?.id]);

  useEffect(() => {
    const handleFocusRun = (event: Event) => {
      const customEvent = event as CustomEvent<{ runId?: string }>;
      const runId = customEvent.detail?.runId;
      if (!runId) return;
      void handleSelectRun(runId);
    };

    window.addEventListener(SKILL_RUN_FOCUS_EVENT, handleFocusRun as EventListener);
    return () => {
      window.removeEventListener(SKILL_RUN_FOCUS_EVENT, handleFocusRun as EventListener);
    };
  }, []);

  const filteredRuns = useMemo(() => {
    if (statusFilter === 'all') return runs;
    return runs.filter((run) => run.status === statusFilter);
  }, [runs, statusFilter]);

  const handleSelectRun = async (runId: string) => {
    const details = await getSkillRun(runId);
    setSelectedRun(details);
  };

  const handleCleanup = async () => {
    const maxAgeMs =
      cleanupRange === '24h'
        ? 24 * 60 * 60 * 1000
        : cleanupRange === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
    await cleanupSkillRuns(maxAgeMs);
    await loadRuns();
    if (selectedRun?.run?.id) {
      const stillExists = runs.some((run) => run.id === selectedRun.run.id);
      if (!stillExists) {
        setSelectedRun(null);
      }
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-4 h-full">
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="font-semibold text-slate-900">Runtime Runs</div>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              aria-label="按时间范围过滤"
              title="按时间范围过滤"
              onChange={(e) =>
                setTimeRange(e.target.value as 'all' | '24h' | '7d' | '30d')
              }
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600"
            >
              <option value="all">全部时间</option>
              <option value="24h">最近24小时</option>
              <option value="7d">最近7天</option>
              <option value="30d">最近30天</option>
            </select>
            <select
              value={cleanupRange}
              aria-label="选择清理范围"
              title="选择清理范围"
              onChange={(e) =>
                setCleanupRange(e.target.value as '24h' | '7d' | '30d')
              }
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600"
            >
              <option value="24h">清理24h前</option>
              <option value="7d">清理7天前</option>
              <option value="30d">清理30天前</option>
            </select>
            <button
              type="button"
              onClick={() => void handleCleanup()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:text-slate-900"
            >
              清理
            </button>
            <select
              value={statusFilter}
              aria-label="按运行状态过滤"
              title="按运行状态过滤"
              onChange={(e) =>
                setStatusFilter(
                  e.target.value as
                    | 'all'
                    | 'running'
                    | 'waiting_async'
                    | 'completed'
                    | 'failed'
                )
              }
              className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600"
            >
              <option value="all">全部</option>
              <option value="running">running</option>
              <option value="waiting_async">waiting_async</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
            </select>
            <button
              type="button"
              onClick={() => void loadRuns()}
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
          </div>
        </div>
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-2 text-xs text-slate-600">
          <span>{`total: ${Object.values(stats).reduce((sum, value) => sum + value, 0)}`}</span>
          <span>{`running: ${stats.running || 0}`}</span>
          <span>{`waiting_async: ${stats.waiting_async || 0}`}</span>
          <span>{`completed: ${stats.completed || 0}`}</span>
          <span>{`failed: ${stats.failed || 0}`}</span>
        </div>
        <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
          {filteredRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => void handleSelectRun(run.id)}
              className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="font-medium text-slate-800">{run.id.slice(-8)}</div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${getStatusColor(run.status)}`}>
                  {run.status}
                </span>
              </div>
              <div className="text-xs text-slate-500 space-y-1">
                <div>{run.skillId || 'no-skill-id'}</div>
                <div>{formatTime(run.startedAt)}</div>
              </div>
            </button>
          ))}
          {runs.length === 0 && !loading ? (
            <div className="px-4 py-8 text-sm text-slate-500 text-center">暂无运行记录</div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="font-semibold text-slate-900">Run Details</div>
        </div>
        {selectedRun ? (
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Run ID:</span> {selectedRun.run.id}</div>
              <div><span className="text-slate-500">Skill ID:</span> {selectedRun.run.skillId || '-'}</div>
              <div><span className="text-slate-500">Status:</span> {selectedRun.run.status}</div>
              <div><span className="text-slate-500">Mode:</span> {selectedRun.run.mode}</div>
              <div><span className="text-slate-500">Started:</span> {formatTime(selectedRun.run.startedAt)}</div>
              <div><span className="text-slate-500">Ended:</span> {formatTime(selectedRun.run.endedAt)}</div>
            </div>

            <div>
              <div className="font-medium text-slate-800 mb-2">Steps</div>
              <div className="space-y-2">
                {selectedRun.steps.map((step) => (
                  <div key={step.id} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {step.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : step.status === 'failed' ? (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      ) : (
                        <Clock3 className="w-4 h-4 text-blue-600" />
                      )}
                      <div className="font-medium text-slate-800">{step.title}</div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${getStatusColor(step.status)}`}>{step.status}</span>
                    </div>
                    <div className="text-xs text-slate-500">{step.kind}{step.toolName ? ` · ${step.toolName}` : ''}</div>
                    {step.payload ? (
                      <div className="mt-2 space-y-2 text-[11px] text-slate-600">
                        {getRuntimePayloadSections(step.payload as RuntimeStepPayload).map((section) => (
                          <div key={section.title} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
                            <div className="uppercase text-[10px] text-slate-400 mb-1">
                              {section.title}
                            </div>
                            <div className="space-y-1">
                              {section.rows.map((row) => (
                                <div key={`${section.title}-${row.label}`} className="flex items-start gap-2">
                                  <span className="min-w-[110px] text-slate-500">{row.label}</span>
                                  <span className="break-all">{row.value}</span>
                                </div>
                              ))}
                              {section.raw ? (
                                <pre className="mt-1 whitespace-pre-wrap break-all text-[10px] text-slate-500">{JSON.stringify(section.raw, null, 2)}</pre>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {step.errorMessage ? (
                      <div className="mt-1 text-xs text-red-600">{step.errorMessage}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="font-medium text-slate-800 mb-2">Artifacts</div>
              <div className="space-y-2">
                {selectedRun.artifacts.map((artifact) => (
                  <div key={artifact.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="font-medium text-slate-800">{artifact.title || artifact.type}</div>
                    {artifact.preview ? <div className="text-slate-500 mt-1">{artifact.preview}</div> : null}
                  </div>
                ))}
                {selectedRun.artifacts.length === 0 ? (
                  <div className="text-sm text-slate-500">暂无产物</div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-sm text-slate-500 text-center">选择一条运行记录查看详情</div>
        )}
      </div>
    </div>
  );
}
