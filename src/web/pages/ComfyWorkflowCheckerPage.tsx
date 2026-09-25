import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { trackEvent } from '../lib/analytics';
import { applySeo } from '../lib/seo';
import { MarketingPageShell, useMarketingLocale } from './MarketingPageShell';
import {
  analyzeComfyWorkflow,
  type ComfyModelReference,
  type ComfyWorkflowAnalysis
} from '@/shared/comfy-workflow-checker';

const LAST_DIAGNOSIS_KEY = 'webtomind:comfyui-checker:last-diagnosis';

function getText(isZh: boolean) {
  return {
    title: isZh
      ? 'ComfyUI Workflow 检查器'
      : 'ComfyUI Workflow Checker & JSON Validator',
    seoTitle: isZh
      ? 'ComfyUI Workflow 检查器 | 缺失模型与节点诊断'
      : 'ComfyUI Workflow Checker & JSON Validator',
    subtitle: isZh
      ? '上传或粘贴 workflow JSON，本地解析缺失模型、custom nodes、尺寸、prompt，并一键迁移到 WebToMind 生成。'
      : 'Validate a ComfyUI workflow JSON online. Find missing models and custom nodes, inspect prompts and dimensions, and flag migration risks before running it.',
    pasteLabel: isZh ? '粘贴 workflow JSON' : 'Paste workflow JSON',
    pastePlaceholder: isZh
      ? '粘贴 ComfyUI API workflow object 或 UI workflow nodes[] JSON...'
      : 'Paste a ComfyUI API workflow object or UI workflow nodes[] JSON...',
    fileLabel: isZh ? '选择 .json 文件' : 'Choose .json file',
    analyze: isZh ? '检查 Workflow' : 'Check workflow',
    privacy: isZh
      ? 'v1 只在浏览器内解析，不上传原始 workflow，不下载模型，不安装节点。'
      : 'v1 parses in your browser only. It does not upload raw workflows, download models, or install nodes.',
    copyRepair: isZh ? '复制修复清单' : 'Copy repair list',
    useWebToMind: isZh ? '用 WebToMind 生成' : 'Generate in WebToMind',
    saveContinue: isZh ? '保存/登录后继续' : 'Save / sign in to continue',
    report: isZh ? '诊断报告' : 'Diagnosis report',
    migrationRisk: isZh ? '迁移风险' : 'Migration risk',
    migrationHints: isZh ? '迁移建议' : 'Migration hints',
    actionPlan: isZh ? '行动分组' : 'Action plan',
    missingModels: isZh ? '缺失模型线索' : 'Missing model clues',
    customNodes: isZh ? '缺失节点线索' : 'Custom node clues',
    risks: isZh ? '路径 / 环境风险' : 'Path / environment risks',
    prompt: isZh ? '可迁移 Prompt' : 'Migratable prompt',
    negativePrompt: isZh ? '负向 Prompt' : 'Negative prompt',
    empty: isZh
      ? '先粘贴或上传 workflow，然后生成诊断报告。'
      : 'Paste or upload a workflow to generate a diagnosis.',
    noItems: isZh ? '未发现明确线索' : 'No clear clues detected',
    copied: isZh ? '已复制修复清单' : 'Repair list copied',
    saved: isZh ? '已保存诊断摘要' : 'Diagnosis summary saved',
    parseFailed: isZh ? '解析失败' : 'Parse failed',
    riskLevel: {
      low: isZh ? '低风险' : 'Low risk',
      medium: isZh ? '中风险' : 'Medium risk',
      high: isZh ? '高风险' : 'High risk'
    },
    actionBucket: {
      portable: isZh ? '可直接迁移' : 'Portable',
      manual_fix: isZh ? '需手动修复' : 'Manual fix',
      high_risk: isZh ? '高风险阻塞' : 'High-risk blocker'
    }
  };
}

function formatModels(models: ComfyModelReference[]) {
  return models.map((model) =>
    model.strength
      ? `${model.name} (${model.kind}, strength ${model.strength})`
      : `${model.name} (${model.kind})`
  );
}

function getModelLines(analysis: ComfyWorkflowAnalysis) {
  return [
    ...formatModels(analysis.checkpoints),
    ...formatModels(analysis.loras),
    ...formatModels(analysis.vaes),
    ...formatModels(analysis.controlNets),
    ...formatModels(analysis.upscaleModels)
  ];
}

export function ComfyWorkflowCheckerPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { locale, isZh } = useMarketingLocale();
  const copy = getText(isZh);
  const [input, setInput] = useState('');
  const [analysis, setAnalysis] = useState<ComfyWorkflowAnalysis | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const createPath = locale === 'en-US' ? '/en-US/create' : '/zh-CN/create';
  const modelLines = useMemo(
    () => (analysis ? getModelLines(analysis) : []),
    [analysis]
  );

  useEffect(() => {
    return applySeo({
      title: copy.seoTitle,
      description: copy.subtitle,
      htmlLang: locale === 'en-US' ? 'en' : 'zh-CN'
    });
  }, [copy.seoTitle, copy.subtitle, locale]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const text = await file.text();
    setInput(text);
    setNotice('');
    setError('');
  };

  const handleAnalyze = () => {
    const result = analyzeComfyWorkflow(input);
    setNotice('');
    if (!result.ok) {
      setAnalysis(null);
      setError(`${copy.parseFailed}: ${result.error}`);
      trackEvent('comfy_check_failed', { reason: result.error });
      return;
    }
    setAnalysis(result.analysis);
    setError('');
    trackEvent('comfy_check_complete', {
      workflow_type: result.analysis.workflowType,
      node_count: result.analysis.nodeCount,
      risk_score: result.analysis.riskScore,
      risk_level: result.analysis.riskLevel,
      custom_node_count: result.analysis.customNodes.length,
      model_count:
        result.analysis.checkpoints.length +
        result.analysis.loras.length +
        result.analysis.vaes.length +
        result.analysis.controlNets.length +
        result.analysis.upscaleModels.length
    });
  };

  const buildCreateState = () => ({
    workflowPrompt: analysis?.webToMindPrompt || '',
    workflowNegativePrompt: analysis?.webToMindNegativePrompt || '',
    source: 'comfyui_checker'
  });

  const handleCopyRepair = async () => {
    if (!analysis) return;
    const text = [
      ...analysis.summaryLines,
      '',
      'Repair steps:',
      ...analysis.repairSteps.map((step) => `- ${step}`),
      '',
      'Migration hints:',
      ...analysis.migrationHints.map((hint) => `- ${hint}`),
      '',
      'Action plan:',
      ...analysis.actionBuckets.map(
        (action) => `- [${action.bucket}] ${action.label}: ${action.detail}`
      )
    ].join('\n');
    await navigator.clipboard?.writeText(text);
    trackEvent('comfy_copy_repair', {
      risk_score: analysis.riskScore,
      risk_level: analysis.riskLevel
    });
    setNotice(copy.copied);
  };

  const handleUseWebToMind = () => {
    if (!analysis) return;
    trackEvent('comfy_to_create', {
      source: 'generate_cta',
      risk_score: analysis.riskScore,
      risk_level: analysis.riskLevel
    });
    navigate(createPath, { state: buildCreateState() });
  };

  const handleSaveContinue = () => {
    if (analysis) {
      localStorage.setItem(
        LAST_DIAGNOSIS_KEY,
        JSON.stringify({
          analyzedAt: new Date().toISOString(),
          workflowType: analysis.workflowType,
          nodeCount: analysis.nodeCount,
          summaryLines: analysis.summaryLines,
          repairSteps: analysis.repairSteps,
          workflowPrompt: analysis.webToMindPrompt,
          workflowNegativePrompt: analysis.webToMindNegativePrompt
        })
      );
      setNotice(copy.saved);
    }
    if (analysis) {
      trackEvent('comfy_to_create', {
        source: isAuthenticated ? 'save_continue_auth' : 'save_continue_login',
        risk_score: analysis.riskScore,
        risk_level: analysis.riskLevel
      });
    }
    if (isAuthenticated) {
      navigate(createPath, { state: buildCreateState() });
      return;
    }
    navigate(`/login?redirect=${encodeURIComponent(createPath)}`);
  };

  return (
    <MarketingPageShell
      title={copy.title}
      subtitle={copy.subtitle}
      rootClassName="comfy-checker-page"
    >
      <section className="comfy-checker-grid">
        <div className="comfy-checker-card comfy-checker-input">
          <div className="comfy-checker-toolbar">
            <label>
              <span>{copy.fileLabel}</span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => void handleFileChange(event)}
              />
            </label>
            <p>{copy.privacy}</p>
          </div>
          <label className="comfy-checker-textarea-label">
            <span>{copy.pasteLabel}</span>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={copy.pastePlaceholder}
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            className="comfy-checker-primary"
            onClick={handleAnalyze}
          >
            {copy.analyze}
          </button>
          {error && <p className="comfy-checker-error">{error}</p>}
          {notice && <p className="comfy-checker-notice">{notice}</p>}
        </div>

        <div className="comfy-checker-card comfy-checker-report">
          <div className="comfy-checker-report-head">
            <h2>{copy.report}</h2>
            {analysis && (
              <span>
                {analysis.workflowType} · {analysis.nodeCount} nodes
              </span>
            )}
          </div>

          {!analysis ? (
            <p className="comfy-checker-empty">{copy.empty}</p>
          ) : (
            <>
              <section className={`comfy-checker-risk ${analysis.riskLevel}`}>
                <div>
                  <h3>{copy.migrationRisk}</h3>
                  <strong>
                    {copy.riskLevel[analysis.riskLevel]} · {analysis.riskScore}
                    /100
                  </strong>
                </div>
                <meter
                  min={0}
                  max={100}
                  value={analysis.riskScore}
                  aria-label={copy.migrationRisk}
                />
              </section>
              <section>
                <h3>{copy.actionPlan}</h3>
                <div className="comfy-checker-action-grid">
                  {analysis.actionBuckets.map((action) => (
                    <article
                      key={`${action.bucket}-${action.label}`}
                      className={`comfy-checker-action ${action.bucket}`}
                    >
                      <span>{copy.actionBucket[action.bucket]}</span>
                      <strong>{action.label}</strong>
                      <p>{action.detail}</p>
                    </article>
                  ))}
                </div>
              </section>
              <section>
                <h3>{copy.migrationHints}</h3>
                <ul>
                  {analysis.migrationHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>{copy.missingModels}</h3>
                <ul>
                  {(modelLines.length > 0 ? modelLines : [copy.noItems]).map(
                    (line) => (
                      <li key={line}>{line}</li>
                    )
                  )}
                </ul>
              </section>
              <section>
                <h3>{copy.customNodes}</h3>
                <ul>
                  {(analysis.customNodes.length > 0
                    ? analysis.customNodes
                    : [copy.noItems]
                  ).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3>{copy.risks}</h3>
                <ul>
                  {(analysis.risks.length > 0
                    ? analysis.risks.map((risk) => risk.message)
                    : [copy.noItems]
                  ).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
              <section className="comfy-checker-prompt-block">
                <h3>{copy.prompt}</h3>
                <pre>{analysis.webToMindPrompt || copy.noItems}</pre>
                <h3>{copy.negativePrompt}</h3>
                <pre>{analysis.webToMindNegativePrompt || copy.noItems}</pre>
              </section>
              <div className="comfy-checker-actions">
                <button type="button" onClick={() => void handleCopyRepair()}>
                  {copy.copyRepair}
                </button>
                <button type="button" onClick={handleUseWebToMind}>
                  {copy.useWebToMind}
                </button>
                <button type="button" onClick={handleSaveContinue}>
                  {copy.saveContinue}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </MarketingPageShell>
  );
}
