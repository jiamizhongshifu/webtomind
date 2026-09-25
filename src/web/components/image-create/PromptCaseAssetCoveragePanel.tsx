import { useEffect, useState } from 'react';
import {
  Check,
  Clipboard,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Wand2
} from 'lucide-react';
import {
  analyzeAdminPromptCaseAssetCoverage,
  createAdminPromptAssetProductionBatch,
  getAdminPromptAssetProductionBatches,
  queueAdminPromptAssetProductionBatch,
  saveAdminPromptCase,
  updateAdminPromptAssetProductionBatch,
  type PromptAssetProductionBatch,
  type PromptAssetProductionBatchDraft,
  type PromptCaseAssetCoverageCase,
  type PromptCaseAssetCoverageReport
} from '@/services/agent-api';
import { Button } from '@/shared/ui/radix/button';
import { Checkbox } from '@/shared/ui/radix/checkbox';
import { Input } from '@/shared/ui/radix/input';

type PromptCaseAssetCoveragePanelProps = {
  isZh: boolean;
  className?: string;
};

function createVisualRecipe(caseReport: PromptCaseAssetCoverageCase) {
  return {
    version: 1,
    source: 'admin_asset_coverage_assistant_20260630',
    selection: caseReport.suggestedSelection,
    updatedAt: new Date().toISOString()
  };
}

export function PromptCaseAssetCoveragePanel({
  isZh,
  className = ''
}: PromptCaseAssetCoveragePanelProps) {
  const [caseQuery, setCaseQuery] = useState('');
  const [includeUnpublished, setIncludeUnpublished] = useState(true);
  const [report, setReport] = useState<PromptCaseAssetCoverageReport | null>(
    null
  );
  const [batches, setBatches] = useState<PromptAssetProductionBatch[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [runCommand, setRunCommand] = useState('');

  const replaceBatch = (batch: PromptAssetProductionBatch) => {
    setBatches((current) => {
      const exists = current.some((item) => item.id === batch.id);
      if (!exists) return [batch, ...current].slice(0, 20);
      return current.map((item) => (item.id === batch.id ? batch : item));
    });
  };

  const loadBatches = async () => {
    setIsLoadingBatches(true);
    try {
      const nextBatches = await getAdminPromptAssetProductionBatches({
        limit: 20
      });
      setBatches(nextBatches);
    } catch (batchLoadError) {
      setError(
        batchLoadError instanceof Error
          ? batchLoadError.message
          : isZh
            ? '生产批次加载失败。'
            : 'Failed to load production batches.'
      );
    } finally {
      setIsLoadingBatches(false);
    }
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadBatches();
    }, 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    setError('');
    setStatusText('');
    setRunCommand('');
    try {
      const query = caseQuery.trim();
      const nextReport = await analyzeAdminPromptCaseAssetCoverage({
        caseQuery: query || undefined,
        limit: query ? 5 : 30,
        includeRecipes: Boolean(query),
        includeUnpublished
      });
      setReport(nextReport);
      setStatusText(
        isZh
          ? `已分析 ${nextReport.analyzedCaseCount} 个案例，素材库 ${nextReport.assetCount} 个素材`
          : `Analyzed ${nextReport.analyzedCaseCount} cases against ${nextReport.assetCount} assets`
      );
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : isZh
            ? '素材覆盖分析失败。'
            : 'Coverage analysis failed.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyRecipe = async (caseReport: PromptCaseAssetCoverageCase) => {
    setBusyKey(`recipe:${caseReport.id}`);
    setError('');
    try {
      await saveAdminPromptCase({
        id: caseReport.id,
        visualRecipe: createVisualRecipe(caseReport)
      });
      setStatusText(
        isZh
          ? `已写入配方：${caseReport.title || caseReport.id}`
          : `Recipe applied: ${caseReport.title || caseReport.id}`
      );
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : isZh
            ? '配方写入失败。'
            : 'Failed to apply recipe.'
      );
    } finally {
      setBusyKey('');
    }
  };

  const handleCreateAndQueueBatch = async (
    batch: PromptAssetProductionBatchDraft,
    shouldQueue: boolean
  ) => {
    setBusyKey(`${shouldQueue ? 'queue' : 'draft'}:${batch.id}`);
    setError('');
    setRunCommand('');
    try {
      const created = await createAdminPromptAssetProductionBatch({
        ...batch,
        status: shouldQueue ? 'approved' : 'draft',
        caseIds: report?.cases.map((item) => item.id) || [],
        analysisResult: {
          source: 'prompt-case-asset-coverage-admin',
          generatedAt: report?.generatedAt,
          topMissingBySlot: report?.topMissingBySlot || {}
        }
      });
      replaceBatch(created);
      if (shouldQueue) {
        const queued = await queueAdminPromptAssetProductionBatch(created.id);
        replaceBatch(queued.batch);
        setRunCommand(queued.runCommand || created.runCommand || '');
      }
      setStatusText(
        isZh
          ? shouldQueue
            ? `已创建并排队：${created.id}`
            : `已创建草稿：${created.id}`
          : shouldQueue
            ? `Created and queued: ${created.id}`
            : `Draft created: ${created.id}`
      );
    } catch (batchError) {
      setError(
        batchError instanceof Error
          ? batchError.message
          : isZh
            ? '生产批次创建失败。'
            : 'Failed to create production batch.'
      );
    } finally {
      setBusyKey('');
    }
  };

  const handleApproveBatch = async (batch: PromptAssetProductionBatch) => {
    setBusyKey(`approve:${batch.id}`);
    setError('');
    try {
      const updated = await updateAdminPromptAssetProductionBatch(batch.id, {
        status: 'approved'
      });
      replaceBatch(updated);
      setStatusText(isZh ? `已批准：${batch.id}` : `Approved: ${batch.id}`);
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : isZh
            ? '批次批准失败。'
            : 'Failed to approve batch.'
      );
    } finally {
      setBusyKey('');
    }
  };

  const handleQueueBatch = async (batch: PromptAssetProductionBatch) => {
    setBusyKey(`queue-existing:${batch.id}`);
    setError('');
    setRunCommand('');
    try {
      const queued = await queueAdminPromptAssetProductionBatch(batch.id);
      replaceBatch(queued.batch);
      setRunCommand(queued.runCommand || queued.batch.runCommand || '');
      setStatusText(isZh ? `已排队：${batch.id}` : `Queued: ${batch.id}`);
    } catch (queueError) {
      setError(
        queueError instanceof Error
          ? queueError.message
          : isZh
            ? '批次排队失败。'
            : 'Failed to queue batch.'
      );
    } finally {
      setBusyKey('');
    }
  };

  const handleCopyCommand = async (command: string) => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setStatusText(isZh ? '命令已复制' : 'Command copied');
    } catch {
      setRunCommand(command);
    }
  };

  const cases = report?.cases || [];
  const drafts = report?.batchDrafts || [];
  const activeBatches = batches.slice(0, 8);

  return (
    <section className={`prompt-case-asset-coverage-panel ${className}`.trim()}>
      <div className="prompt-case-asset-coverage-head">
        <div>
          <p>{isZh ? 'ASSET COVERAGE' : 'ASSET COVERAGE'}</p>
          <h2>{isZh ? '案例素材覆盖助手' : 'Case Asset Coverage'}</h2>
          <span>
            {isZh
              ? '把案例提示词匹配到素材库，发现缺口，并创建可执行的素材生产批次。'
              : 'Match cases to prompt assets, find gaps, and create executable production batches.'}
          </span>
        </div>
        <div className="prompt-case-asset-coverage-actions">
          <Input
            value={caseQuery}
            onChange={(event) => setCaseQuery(event.target.value)}
            placeholder={
              isZh
                ? 'caseId / slug / 标题关键词，可留空'
                : 'caseId / slug / title keyword, optional'
            }
          />
          <label>
            <Checkbox
              checked={includeUnpublished}
              onCheckedChange={(checked) =>
                setIncludeUnpublished(checked === true)
              }
            />
            {isZh ? '含未发布' : 'Unpublished'}
          </label>
          <Button type="button" onClick={handleAnalyze} disabled={isAnalyzing}>
            {isAnalyzing ? (
              <Loader2 data-icon="inline-start" className="creator-spin-icon" />
            ) : (
              <Search data-icon="inline-start" />
            )}
            {isZh ? '分析' : 'Analyze'}
          </Button>
        </div>
      </div>

      {(statusText || error || runCommand) && (
        <div className="prompt-case-asset-coverage-status">
          {statusText && <span>{statusText}</span>}
          {error && <strong>{error}</strong>}
          {runCommand && <code>{runCommand}</code>}
        </div>
      )}

      {cases.length > 0 && (
        <div className="prompt-case-asset-coverage-grid">
          <div className="prompt-case-asset-coverage-list">
            <h3>{isZh ? '案例匹配' : 'Case Matches'}</h3>
            {cases.slice(0, 8).map((caseReport) => (
              <article key={caseReport.id}>
                <div>
                  <strong>{caseReport.title || caseReport.id}</strong>
                  <span>
                    {isZh ? '匹配' : 'Matches'}{' '}
                    {caseReport.matchedAssets.length} · {isZh ? '缺口' : 'Gaps'}{' '}
                    {caseReport.missingAssetSuggestions.length}
                  </span>
                </div>
                <div className="prompt-case-asset-coverage-chips">
                  {caseReport.matchedAssets.slice(0, 6).map((asset) => (
                    <span key={`${caseReport.id}-${asset.assetId}`}>
                      {asset.title}
                    </span>
                  ))}
                  {caseReport.missingAssetSuggestions.map((asset) => (
                    <mark key={`${caseReport.id}-${asset.id}`}>
                      {asset.title}
                    </mark>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleApplyRecipe(caseReport)}
                  disabled={
                    busyKey === `recipe:${caseReport.id}` ||
                    Object.keys(caseReport.suggestedSelection || {}).length ===
                      0
                  }
                >
                  {busyKey === `recipe:${caseReport.id}` ? (
                    <Loader2
                      data-icon="inline-start"
                      className="creator-spin-icon"
                    />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  {isZh ? '写入配方' : 'Apply Recipe'}
                </Button>
              </article>
            ))}
          </div>

          <div className="prompt-case-asset-coverage-list">
            <h3>{isZh ? '待生产批次' : 'Production Batches'}</h3>
            {drafts.length === 0 ? (
              <p>
                {isZh
                  ? '当前分析没有发现新的素材缺口。'
                  : 'No new asset gaps in this report.'}
              </p>
            ) : (
              drafts.map((batch) => (
                <article key={batch.id}>
                  <div>
                    <strong>{batch.id}</strong>
                    <span>
                      {batch.slot} · {batch.assets.length}{' '}
                      {isZh ? '个素材' : 'assets'}
                    </span>
                  </div>
                  <div className="prompt-case-asset-coverage-chips">
                    {batch.assets.map((asset) => (
                      <mark key={asset.id}>{asset.title}</mark>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCreateAndQueueBatch(batch, false)}
                    disabled={busyKey === `draft:${batch.id}`}
                  >
                    {busyKey === `draft:${batch.id}` ? (
                      <Loader2
                        data-icon="inline-start"
                        className="creator-spin-icon"
                      />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    {isZh ? '创建草稿' : 'Create Draft'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleCreateAndQueueBatch(batch, true)}
                    disabled={busyKey === `queue:${batch.id}`}
                  >
                    {busyKey === `queue:${batch.id}` ? (
                      <Loader2
                        data-icon="inline-start"
                        className="creator-spin-icon"
                      />
                    ) : (
                      <Play data-icon="inline-start" />
                    )}
                    {isZh ? '创建并排队' : 'Create + Queue'}
                  </Button>
                </article>
              ))
            )}
          </div>
        </div>
      )}

      <div className="prompt-case-asset-coverage-list prompt-case-asset-coverage-batches">
        <div className="prompt-case-asset-coverage-subhead">
          <h3>{isZh ? '生产批次队列' : 'Production Queue'}</h3>
          <Button
            type="button"
            variant="outline"
            onClick={loadBatches}
            disabled={isLoadingBatches}
          >
            {isLoadingBatches ? (
              <Loader2 data-icon="inline-start" className="creator-spin-icon" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {isZh ? '刷新' : 'Refresh'}
          </Button>
        </div>
        {activeBatches.length === 0 ? (
          <p>
            {isZh
              ? '暂无素材生产批次。'
              : 'No prompt asset production batches yet.'}
          </p>
        ) : (
          activeBatches.map((batch) => (
            <article key={batch.id}>
              <div>
                <strong>{batch.id}</strong>
                <span>
                  {batch.status} · {batch.slot} · {batch.assets.length}{' '}
                  {isZh ? '个素材' : 'assets'}
                </span>
              </div>
              <div className="prompt-case-asset-coverage-chips">
                {batch.assets.slice(0, 6).map((asset) => (
                  <span key={`${batch.id}-${asset.id}`}>{asset.title}</span>
                ))}
              </div>
              {batch.runCommand && <code>{batch.runCommand}</code>}
              <div className="prompt-case-asset-coverage-row-actions">
                {batch.status === 'draft' && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleApproveBatch(batch)}
                    disabled={busyKey === `approve:${batch.id}`}
                  >
                    {busyKey === `approve:${batch.id}` ? (
                      <Loader2
                        data-icon="inline-start"
                        className="creator-spin-icon"
                      />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    {isZh ? '批准' : 'Approve'}
                  </Button>
                )}
                {[
                  'draft',
                  'approved',
                  'failed',
                  'generated',
                  'cropped'
                ].includes(batch.status) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleQueueBatch(batch)}
                    disabled={busyKey === `queue-existing:${batch.id}`}
                  >
                    {busyKey === `queue-existing:${batch.id}` ? (
                      <Loader2
                        data-icon="inline-start"
                        className="creator-spin-icon"
                      />
                    ) : (
                      <Play data-icon="inline-start" />
                    )}
                    {isZh ? '排队' : 'Queue'}
                  </Button>
                )}
                {batch.runCommand && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      void handleCopyCommand(batch.runCommand || '')
                    }
                  >
                    <Clipboard data-icon="inline-start" />
                    {isZh ? '复制命令' : 'Copy'}
                  </Button>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {!report && (
        <div className="prompt-case-asset-coverage-empty">
          <Wand2 size={18} />
          {isZh
            ? '先分析热门案例，或填入一个 caseId 只分析单个新增案例。'
            : 'Analyze hot cases, or enter a caseId to inspect one new case.'}
        </div>
      )}
    </section>
  );
}
