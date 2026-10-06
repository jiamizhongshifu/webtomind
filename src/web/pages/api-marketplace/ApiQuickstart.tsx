import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import {
  getApiMarketplaceModels,
  type ApiMarketplaceModel
} from '@/services/api-marketplace';
import { buildApiQuickstart, formatApiQuickstartPrice } from './quickstart';

export function ApiQuickstart({
  baseUrl,
  copy
}: {
  baseUrl: string;
  copy: (text: string, notice: string) => Promise<void>;
}) {
  const location = useLocation();
  const requestedModel =
    new URLSearchParams(location.search).get('model') || '';
  const [models, setModels] = useState<ApiMarketplaceModel[]>([]);
  const [selectedId, setSelectedId] = useState(requestedModel);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setSelectedId(requestedModel);
  }, [requestedModel]);
  useEffect(() => {
    let active = true;
    setState('loading');
    getApiMarketplaceModels()
      .then((result) => {
        if (!active) return;
        setModels(result.models);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const model = models.find((item) => item.id === selectedId);
  const example = model ? buildApiQuickstart(model, baseUrl) : null;
  return (
    <section className="api-console-section api-console-connection">
      <div>
        <p className="api-marketplace-kicker">03 / Connect</p>
        <h2>完成第一次调用</h2>
        <p>
          先创建 Key 并充值 API 额度，再选择模型。运行示例会按实际用量扣费。
        </p>
        <label className="api-quickstart-model">
          <span>调用模型</span>
          <select
            value={selectedId}
            disabled={state !== 'ready'}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            <option value="">请选择模型</option>
            {selectedId && !model ? (
              <option value={selectedId}>{selectedId}</option>
            ) : null}
            {models.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        {state === 'loading' ? <p role="status">正在读取模型与价格…</p> : null}
        {state === 'error' ? (
          <p role="alert">
            模型暂时无法加载。
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重新加载
            </button>
          </p>
        ) : null}
        {state === 'ready' && selectedId && !model ? (
          <p role="alert">所选模型已下架或不可用，请重新选择。</p>
        ) : null}
        {model ? (
          <p className="api-quickstart-price">
            {formatApiQuickstartPrice(model)}
            <br />
            按实际用量结算；输入长度、输出数量会影响费用，调用时可能先预留额度。
          </p>
        ) : null}
        {model && !example ? (
          <p role="status">
            此模型缺少可确认的接入示例，请选择其他模型或联系支持确认请求参数。
          </p>
        ) : null}
        {example ? (
          <>
            <p>
              准备：<code>pip install openai</code>。在本机设置{' '}
              <code>WEBTOMIND_API_KEY</code>{' '}
              环境变量，保存以下代码后运行；不要把 Key 写入源码或分享给他人。
            </p>
            <p>{example.resultHint}</p>
            <p>
              401：检查 Key 是否有效；402：检查 API
              余额；429：等待后重试。其他错误请保留错误码与 request
              ID，核对使用记录后再决定是否重试。
            </p>
          </>
        ) : null}
      </div>
      <div className="api-code-block">
        <div>
          <span>Base URL</span>
          <button
            type="button"
            aria-label="复制 Base URL"
            onClick={() => void copy(baseUrl, 'Base URL 已复制。')}
          >
            <Copy size={14} aria-hidden="true" />
          </button>
        </div>
        <code>{baseUrl}</code>
        {example ? (
          <>
            <div>
              <span>Python · {example.endpoint}</span>
              <button
                type="button"
                aria-label="复制 Python 示例"
                onClick={() => void copy(example.code, 'Python 示例已复制。')}
              >
                <Copy size={14} aria-hidden="true" />
              </button>
            </div>
            <pre tabIndex={0} aria-label="Python 调用示例">
              {example.code}
            </pre>
          </>
        ) : (
          <p>选择模型后显示完整调用示例。</p>
        )}
      </div>
    </section>
  );
}
