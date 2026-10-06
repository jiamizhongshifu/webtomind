import type { ApiMarketplaceModel } from '@/services/api-marketplace';

const EXAMPLES: Record<string, { call: string; resultHint: string }> = {
  '/chat/completions': {
    call: 'client.chat.completions.create(model=MODEL, messages=[{"role": "user", "content": "Say hello"}], stream=False)',
    resultHint: '成功后输出 JSON；回复文字在 choices[0].message.content。'
  },
  '/responses': {
    call: 'client.responses.create(model=MODEL, input="Say hello", stream=False)',
    resultHint: '成功后输出 JSON；文字内容在 output。'
  },
  '/completions': {
    call: 'client.completions.create(model=MODEL, prompt="Say hello", max_tokens=32)',
    resultHint: '成功后输出 JSON；文字内容在 choices[0].text。'
  },
  '/images/generations': {
    call: 'client.images.generate(model=MODEL, prompt="A small blue ceramic cup on a white table", n=1)',
    resultHint:
      '成功后输出 JSON；图片在 data 中，可能是 url 或 b64_json，请及时保存。'
  },
  '/embeddings': {
    call: 'client.embeddings.create(model=MODEL, input="Hello world")',
    resultHint: '成功后输出 JSON；向量在 data[0].embedding。'
  },
  '/moderations': {
    call: 'client.moderations.create(model=MODEL, input="Hello world")',
    resultHint: '成功后输出 JSON；审核结果在 results。'
  },
  '/audio/transcriptions': {
    call: 'client.audio.transcriptions.create(model=MODEL, file=source)',
    resultHint: '准备本地 input.mp3；成功后输出 JSON，其中 text 为转录文字。'
  },
  '/audio/translations': {
    call: 'client.audio.translations.create(model=MODEL, file=source)',
    resultHint: '准备本地 input.mp3；成功后输出 JSON，其中 text 为翻译文字。'
  },
  '/images/edits': {
    call: 'client.images.edit(model=MODEL, image=source, prompt="Change the background to white", n=1)',
    resultHint: '准备本地 input.png；成功后图片在 data 中，请及时保存。'
  }
};

export function buildApiQuickstart(
  model: ApiMarketplaceModel,
  baseUrl: string
) {
  const endpoint = Object.keys(EXAMPLES).find((path) =>
    model.requestEndpoints?.includes(path)
  );
  if (!endpoint) return null;
  const example = EXAMPLES[endpoint];
  const sourceName =
    endpoint === '/images/edits'
      ? 'input.png'
      : endpoint.startsWith('/audio/')
        ? 'input.mp3'
        : null;
  const request = sourceName
    ? `    with open(${JSON.stringify(sourceName)}, "rb") as source:\n        result = ${example.call}`
    : `    result = ${example.call}`;
  return {
    endpoint,
    resultHint: example.resultHint,
    code: `import os\nfrom openai import OpenAI, APIStatusError, APIConnectionError\n\nclient = OpenAI(\n    api_key=os.environ["WEBTOMIND_API_KEY"],\n    base_url=${JSON.stringify(baseUrl)},\n    max_retries=0,\n    timeout=180.0,\n)\nMODEL = ${JSON.stringify(model.id)}\n\ntry:\n${request}\n    print(result.model_dump_json(indent=2))\nexcept APIStatusError as error:\n    print("HTTP", error.status_code, "request_id", error.request_id)\n    print(error.message)\nexcept APIConnectionError:\n    print("Network error: check usage records before retrying.")\n`
  };
}

export function formatApiQuickstartPrice(model: ApiMarketplaceModel): string {
  const pricing = model.pricing;
  const currency = model.customer.currency;
  if (!pricing) return '价格暂不可用，请先确认价格再调用。';
  if (model.pricingMode === 'request')
    return `单次请求报价：${pricing.requestPrice ?? '待确认'} ${currency} / 次`;
  return `按 Token 报价：输入 ${pricing.inputPerMillion ?? '待确认'}、输出 ${pricing.outputPerMillion ?? '待确认'} ${currency} / 百万 Token`;
}
