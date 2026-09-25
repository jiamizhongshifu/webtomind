import { useRef, useState } from 'react';
import { ImagePlus, Send, Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card, Textarea } from '@/shared/ui';
import { getAuthToken } from '@/services/agent-api';
import { getApiBaseUrl } from '@/utils/env';
import {
  PORTRAIT_SKILL_ID,
  PORTRAIT_SKILL_MODES,
  getPortraitModeName
} from '../components/image-create/skill-image-chat/constants';
import {
  IMAGE_GENERATION_BASE_CREDIT_COST,
  IMAGE_GENERATION_LARGE_2K_CREDIT_COST,
  IMAGE_GENERATION_4K_CREDIT_COST
} from '@/shared/image-generation-pricing';

/**
 * Agent 图像创作 dev harness
 * 验证：平台官方 DeepSeek Agent + 官方 Skills（插件）→ SSE 流式出图，使用扣积分
 * UI：技能入口位于输入框底部（无技能市场），固定女性写真技能，仅两个模式：日常写真 / 写真探索
 * 路由：/__dev/agent-image-chat-harness
 */

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ImageResult {
  url: string;
  prompt: string;
}

type StreamEvent =
  | { event: 'text'; data: { content: string } }
  | {
      event: 'tool_call';
      data: { name: string; input: unknown; status: string };
    }
  | {
      event: 'tool_result';
      data: { name: string; result: unknown; success: boolean };
    }
  | { event: 'image'; data: { url: string; prompt?: string } }
  | { event: 'done'; data: Record<string, never> }
  | { event: 'error'; data: { message: string } };

function parseSseBuffer(buffer: string): {
  events: StreamEvent[];
  rest: string;
} {
  const events: StreamEvent[] = [];
  const currentEvent = '';
  let rest = buffer;
  const blocks = buffer.split('\n\n');
  rest = blocks.pop() || '';
  for (const block of blocks) {
    let event = currentEvent;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
    }
    if (dataLines.length) {
      try {
        events.push({
          event: (event || 'text') as StreamEvent['event'],
          data: JSON.parse(dataLines.join('\n'))
        });
      } catch {
        // 忽略无法解析的帧
      }
    }
  }
  return { events, rest };
}

export function AgentImageChatHarnessPage() {
  const [mode, setMode] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const pushLog = (line: string) =>
    setLog((prev) => [...prev.slice(-80), line]);

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || running) return;

    setMessages((prev) => [...prev, { role: 'user', content: prompt }]);
    setInput('');
    setRunning(true);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agent/skill-image-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken() || ''}`
        },
        signal: abort.signal,
        body: JSON.stringify({
          prompt,
          skillId: PORTRAIT_SKILL_ID,
          mode: mode || undefined
        })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        pushLog(`HTTP ${res.status}: ${body?.error || '请求失败'}`);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        pushLog('错误：无响应流');
        return;
      }

      let buffer = '';
      let assistantText = '';
      const pendingPrompt = prompt;

      while (true) { // eslint-disable-line no-constant-condition
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSseBuffer(buffer);
        buffer = rest;

        for (const evt of events) {
          switch (evt.event) {
            case 'text':
              assistantText += evt.data.content;
              break;
            case 'tool_call':
              pushLog(`工具调用：${evt.data.name}（${evt.data.status}）`);
              break;
            case 'tool_result':
              pushLog(`工具结果：${evt.data.success ? '成功' : '失败'}`);
              break;
            case 'image':
              setImages((prev) => [
                { url: evt.data.url, prompt: pendingPrompt },
                ...prev
              ]);
              break;
            case 'error':
              pushLog(`错误：${evt.data.message}`);
              break;
            case 'done':
              pushLog('完成');
              break;
            default:
              break;
          }
        }
      }

      if (assistantText.trim()) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: assistantText.trim() }
        ]);
      } else if (!images.length) {
        pushLog('警告：无文本输出且无图片生成');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (abort.signal.aborted) pushLog('已取消');
      else pushLog(`请求失败：${message}`);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <ImagePlus aria-hidden size={28} />
        <div>
          <h1 className="text-xl font-semibold">
            Agent 图像创作（dev harness）
          </h1>
          <p className="text-sm text-muted-foreground">
            平台官方 Agent（DeepSeek）+ 官方 Skills（插件）·
            @codeany/open-agent-sdk 引擎 · 使用扣积分
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex min-h-[560px] flex-col p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles aria-hidden size={16} /> 对话
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              技能对话 1 积分/次 · 出图按平台实时定价（1k=
              {IMAGE_GENERATION_BASE_CREDIT_COST} / 2k=
              {IMAGE_GENERATION_LARGE_2K_CREDIT_COST} / 4k=
              {IMAGE_GENERATION_4K_CREDIT_COST}，多张按张计费）
            </span>
          </div>

          {/* 消息区 */}
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto text-sm">
            {messages.length === 0 && (
              <p className="text-muted-foreground">
                例（女性写真）：给我做一张慵懒周末的窗边写真，清透素颜。
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg p-3 ${
                  m.role === 'user' ? 'ml-12 bg-primary/10' : 'mr-12 bg-muted'
                }`}
              >
                <div className="mb-1 text-xs opacity-60">
                  {m.role === 'user' ? '你' : 'Agent'}
                </div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
            {running && (
              <div className="mr-12 flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <Loader2 aria-hidden className="animate-spin" size={14} />
                Agent 思考中…
              </div>
            )}
          </div>

          {/* 输入区：技能入口在输入框底部 */}
          <div className="mt-3 rounded-xl border bg-background p-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="描述你想创作的图像…"
              rows={3}
              className="border-0 shadow-none focus-visible:ring-0"
            />

            {/* 输入框底部工具栏：技能入口（两个官方模式）+ 发送 */}
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-stretch gap-2">
                <span className="flex min-h-[44px] items-center gap-1.5 text-xs text-muted-foreground">
                  <Wand2 aria-hidden size={13} />
                  技能
                </span>
                {PORTRAIT_SKILL_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={mode === m.id}
                    onClick={() => setMode((cur) => (cur === m.id ? '' : m.id))}
                    className={`flex min-h-[44px] flex-col items-start justify-center gap-0.5 rounded-lg border px-3 py-1.5 text-left text-xs transition-colors ${
                      mode === m.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-muted text-muted-foreground hover:bg-background'
                    }`}
                  >
                    <span className="text-[13px] font-medium">{m.name}</span>
                    <span className="text-[11px] opacity-70">
                      {m.description}
                    </span>
                  </button>
                ))}
                {mode && (
                  <button
                    type="button"
                    onClick={() => setMode('')}
                    className="min-h-[44px] px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    退出技能
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {running && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => abortRef.current?.abort()}
                  >
                    停止
                  </Button>
                )}
                <Button
                  onClick={handleSend}
                  disabled={running || !input.trim()}
                  size="sm"
                  className="ml-auto"
                >
                  <Send aria-hidden size={14} />
                  {getPortraitModeName(mode)
                    ? `用${getPortraitModeName(mode)}生成`
                    : '生成'}
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex min-h-[320px] flex-1 flex-col p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ImagePlus aria-hidden size={16} /> 生成结果
            </div>
            <div className="mt-3 grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto">
              {images.length === 0 && (
                <p className="col-span-2 text-sm text-muted-foreground">
                  生成的图片会显示在这里。
                </p>
              )}
              {images.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noreferrer">
                  <img
                    src={img.url}
                    alt={`生成结果 ${i + 1}`}
                    className="w-full rounded-lg border object-contain"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </Card>

          <Card className="flex min-h-[140px] flex-col p-4">
            <div className="text-sm font-medium">运行日志</div>
            <pre className="mt-2 flex-1 overflow-y-auto text-xs text-muted-foreground">
              {log.length === 0 ? '（空）' : log.join('\n')}
            </pre>
          </Card>
        </div>
      </div>
    </div>
  );
}
