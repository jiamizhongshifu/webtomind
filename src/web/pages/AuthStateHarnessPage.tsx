import { useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  LockKeyhole,
  LogIn,
  RefreshCw,
  ShieldAlert
} from 'lucide-react';
import { Button, Card, Textarea } from '@/shared/ui';

type AuthScenario =
  | 'authenticated'
  | 'refreshing'
  | 'expired'
  | 'refresh-failed'
  | 'signed-out';

const SCENARIOS: Array<{ id: AuthScenario; label: string }> = [
  { id: 'authenticated', label: '已登录' },
  { id: 'refreshing', label: '刷新中' },
  { id: 'expired', label: '会话过期' },
  { id: 'refresh-failed', label: '刷新失败' },
  { id: 'signed-out', label: '已退出' }
];

const STATUS_COPY: Record<
  AuthScenario,
  { title: string; description: string }
> = {
  authenticated: {
    title: '登录状态正常',
    description: 'E2E User · 800 积分 · 会话将在 58 分钟后刷新。'
  },
  refreshing: {
    title: '正在恢复登录状态',
    description: '当前输入和参考图保留在本地，恢复期间不会发起生成。'
  },
  expired: {
    title: '登录状态已过期',
    description: '重新登录后可继续当前创作，提示词和参数不会被清空。'
  },
  'refresh-failed': {
    title: '无法恢复登录状态',
    description: '网络或授权服务暂时不可用。你可以重试，或重新登录。'
  },
  'signed-out': {
    title: '当前未登录',
    description: '登录后可恢复保存、生成和个人素材库能力。'
  }
};

function StatusIcon({ scenario }: { scenario: AuthScenario }) {
  if (scenario === 'authenticated')
    return <CheckCircle2 aria-hidden size={20} />;
  if (scenario === 'refreshing') {
    return (
      <RefreshCw aria-hidden className="motion-safe:animate-spin" size={20} />
    );
  }
  if (scenario === 'expired') return <LockKeyhole aria-hidden size={20} />;
  if (scenario === 'refresh-failed')
    return <ShieldAlert aria-hidden size={20} />;
  return <LogIn aria-hidden size={20} />;
}

export function AuthStateHarnessPage() {
  const [scenario, setScenario] = useState<AuthScenario>('authenticated');
  const [prompt, setPrompt] = useState(
    '为独立香氛品牌制作一张克制、自然光、带纸张肌理的产品海报。'
  );
  const [referenceCount, setReferenceCount] = useState(1);
  const [lastAction, setLastAction] = useState('ready');
  const copy = STATUS_COPY[scenario];
  const requiresAuth =
    scenario === 'expired' ||
    scenario === 'refresh-failed' ||
    scenario === 'signed-out';

  const restoreSession = () => {
    setScenario('authenticated');
    setLastAction('session-restored-with-draft');
  };

  return (
    <main
      className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6"
      data-harness="auth-state"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Isolated Preview Harness
          </p>
          <h1 className="text-2xl font-semibold">登录状态恢复</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            独立检查会话刷新、失败、重新登录，以及创作草稿是否保持。
          </p>
        </header>

        <nav
          aria-label="登录状态场景"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {SCENARIOS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={scenario === item.id ? 'primary' : 'outline'}
              size="sm"
              className="shrink-0 whitespace-nowrap"
              aria-pressed={scenario === item.id}
              onClick={() => {
                setScenario(item.id);
                setLastAction(`scenario:${item.id}`);
              }}
            >
              {item.label}
            </Button>
          ))}
        </nav>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <Card className="space-y-4 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">
                  当前创作草稿
                </p>
                <h2 className="mt-1 text-lg font-semibold">香氛产品海报</h2>
              </div>
              <span className="whitespace-nowrap rounded-full bg-muted px-3 py-1 text-xs font-semibold">
                自动保存
              </span>
            </div>

            <Textarea
              aria-label="创作提示词"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              className="min-h-40 resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="md"
                className="whitespace-nowrap"
                leadingIcon={<ImagePlus size={17} />}
                onClick={() => setReferenceCount((count) => count + 1)}
              >
                参考图 {referenceCount}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="whitespace-nowrap"
                disabled={scenario === 'refreshing'}
                onClick={() =>
                  requiresAuth
                    ? setLastAction('reauth-required')
                    : setLastAction('generate-ready')
                }
              >
                {requiresAuth ? '登录后生成' : '生成图片 · 10积分'}
              </Button>
            </div>
          </Card>

          <Card
            className="flex flex-col gap-4 p-5 sm:p-6"
            role={
              scenario === 'refreshing'
                ? 'status'
                : requiresAuth
                  ? 'alert'
                  : 'status'
            }
            aria-live={requiresAuth ? 'assertive' : 'polite'}
            data-auth-scenario={scenario}
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <StatusIcon scenario={scenario} />
            </span>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold">{copy.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.description}
              </p>
            </div>

            {scenario === 'refreshing' && (
              <div
                aria-label="恢复进度"
                className="h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <div className="h-full w-full origin-left scale-x-2/3 rounded-full bg-foreground motion-safe:transition-transform" />
              </div>
            )}

            {requiresAuth && (
              <div className="mt-auto flex flex-wrap gap-2">
                {scenario === 'refresh-failed' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap"
                    onClick={() => {
                      setScenario('refreshing');
                      setLastAction('refresh-retried');
                    }}
                  >
                    重试恢复
                  </Button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="whitespace-nowrap"
                  onClick={restoreSession}
                >
                  重新登录
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              DOM 状态：
              <span data-testid="auth-harness-action">{lastAction}</span>
            </p>
          </Card>
        </section>
      </div>
    </main>
  );
}

export default AuthStateHarnessPage;
