import type { SupabaseClient } from '@supabase/supabase-js';
import { getCorsHeadersForRequest } from '../../utils/auth';
import { createMediaStorageAdapter } from '../../utils/media-storage/index.js';
import {
  assertPromptCaseAdmin,
  getMissingPromptDraftsResponse,
  getSupabaseAdmin,
  isMissingPromptCaseDraftsTable,
  jsonResponse,
  mapPromptCaseDraftWithFreshImages,
  normalizeImageUrls,
  normalizeTags,
  PROMPT_CASE_ADMIN_EMAIL
} from './_shared';
import { buildPromptThemeTitle, isWeakPromptCaseTitle } from './_title';
import { getXArticleMediaItems, getXArticleText } from './_x-article';

export const config = { runtime: 'nodejs', maxDuration: 120 };

type ImportDraftPayload = {
  title: string;
  category: string;
  tags: string[];
  prompt: string;
  negativePrompt?: string;
  commercialIntent?: string;
  generationSettings: Record<string, unknown>;
  imageUrls: string[];
  selectedImageUrl?: string;
  memberOnly: boolean;
  reviewNotes?: string;
};

type TweetExtractionResult = {
  payload: Record<string, unknown>;
  provider: string;
};

type TweetExtractionCandidate = TweetExtractionResult & {
  imageCount: number;
  promptLength: number;
  score: number;
  textLength: number;
  truncated: boolean;
  videoCount: number;
};

const ALLOWED_CATEGORIES = new Set([
  'portrait',
  'cover',
  'ecommerce',
  'fashion',
  'character',
  'background',
  'poster',
  'xiaohongshu',
  'wechat-cover',
  'video',
  'featured'
]);
const DEFAULT_IMPORTED_PROMPT_CASE_CATEGORY = 'portrait';

const IMPORTED_VIDEO_MAX_BYTES = 80 * 1024 * 1024;
const IMPORTED_VIDEO_MIRROR_DEADLINE_MS = 15000;
const IMPORTED_VIDEO_SIGNED_URL_EXPIRES_IN = 60 * 60 * 24 * 7;
const X_API_SEARCH_RECENT_URL = 'https://api.x.com/2/tweets/search/recent';
const TUZI_X_DEEPSEARCH_DEFAULT_MODEL = 'grok-3-deepsearch';
const TUZI_X_DEEPSEARCH_DEFAULT_TIMEOUT_MS = 20000;
const TUZI_X_DEEPSEARCH_MAX_TIMEOUT_MS = 30000;
const TUZI_X_DEEPSEARCH_DEFAULT_ATTEMPTS = 3;
const TUZI_X_DEEPSEARCH_MAX_ATTEMPTS = 4;
const TUZI_X_DEEPSEARCH_DEFAULT_RETRY_DELAY_MS = 1200;
const TUZI_X_DEEPSEARCH_MAX_RETRY_DELAY_MS = 3000;
const X_IMPORT_PROVIDER_TIMEOUT_MS = 8000;
const X_IMPORT_DEFAULT_DEADLINE_MS = 30000;
const X_IMPORT_MAX_DEADLINE_MS = 45000;
const X_REPLY_PROMPT_SEARCH_DEFAULT_DEADLINE_MS = 15000;
const X_REPLY_PROMPT_SEARCH_MAX_DEADLINE_MS = 25000;
const AISA_REPLY_SEARCH_DEFAULT_MAX_PAGES = 3;
const AISA_REPLY_SEARCH_MAX_PAGES = 5;

const PORTRAIT_CATEGORY_PATTERN =
  /人像|写真|自拍|模特|美女|女性|女孩|男人|男性|男孩|裤子|裙子|portrait|selfie|woman|girl|female|man|male|boy|model|shorts|pants|skirt/i;
const BACKGROUND_CATEGORY_PATTERN =
  /背景|background|scene|environment|interior/i;
const BACKGROUND_ONLY_PATTERN =
  /纯背景|仅背景|背景素材|空场景|无人物|无人场景|不含人物|不要人物|(?:background|environment)\s+only|(?:no|without)\s+(?:any\s+)?(?:people|persons?|humans?|models?|characters?)/i;

const CATEGORY_RULES: Array<[string, RegExp]> = [
  [
    'ecommerce',
    /电商|商品|产品|packshot|product|ecommerce|skincare|bottle|shoe|bag/i
  ],
  [
    'character',
    /角色|动漫|anime|character(?:\s+(?:design|identity|board|sheet))?|identity board|reference sheet|model sheet|game character|chibi/i
  ],
  ['fashion', /时装|穿搭|服装|fashion|lookbook|runway|outfit/i],
  ['poster', /海报|poster|campaign|key visual|advertising|advertisement/i],
  ['cover', /封面|cover|thumbnail|banner|hero image/i],
  ['portrait', PORTRAIT_CATEGORY_PATTERN],
  // Full portrait prompts commonly describe a background, scene, environment,
  // or interior. The primary person subject must win over its setting.
  ['background', BACKGROUND_CATEGORY_PATTERN],
  ['xiaohongshu', /小红书|xiaohongshu|rednote/i],
  ['wechat-cover', /公众号|wechat|wechat cover/i],
  [
    'video',
    /视频|短视频|视频案例|vlog|短剧|video\s+(?:prompt|workflow|sequence|clip|footage|generation|gen|model|case)|seedance|\bsora\b|\bveo\b|\bkling\b|\bpika\b|可灵|即梦|通义万相/i
  ]
];

function cleanText(value: unknown): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function multilineText(value: unknown): string {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripUrls(text: string): string {
  return multilineText(
    text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\b(?:pic\.twitter\.com|t\.co)\/\S+/gi, '')
  );
}

function stripTrailingHashtagBlock(text: string): string {
  return multilineText(text).replace(
    /(?:\n|\s)+(?:#[\p{L}\p{N}_-]+(?:\s+|$))+$/gu,
    ''
  );
}

function looksLikePromptCommand(text: string): boolean {
  return /^(?:create|generate|make|design|produce|render|place|preserve|use)\b|^(?:生成|创建|建立|设计|制作|拍摄|使用|保持|围绕|以|請|请|添付画像|画像を|プロンプト)/iu.test(
    cleanText(text)
  );
}

function looksLikeVisualPromptOpening(text: string): boolean {
  const normalized = cleanText(text);
  if (looksLikePromptCommand(normalized)) return true;

  return (
    /^(?:\d+\s*[:：x×]\s*\d+\s*)?(?:竖版|横版|方形)?\s*(?:一位|一名|一个|一组|一张)\s*(?:成年|年轻|年长)?\s*(?:女性|男性|女人|男人|女孩|男孩|人物|角色|模特|产品|商品|物体|建筑|场景)/u.test(
      normalized
    ) ||
    /^(?:an?\s+)?(?:(?:close-up|full-body|cinematic|photorealistic|realistic|editorial)\s+)*(?:portrait|photo|photograph|image|shot|scene)\s+(?:of|featuring)\b/iu.test(
      normalized
    ) ||
    /^(?:\d+\s*[:：x×]\s*\d+\s*)?(?:超写实|写实|真实|电影感|纪实|编辑感|photorealistic|realistic|cinematic|editorial)[^\n]{0,80}(?:摄影|写真|自拍|人像|影像|\b(?:photo|portrait|image|shot)\b)/iu.test(
      normalized
    )
  );
}

function hasExplicitPromptMarker(text: string): boolean {
  return /(?:^|\n)\s*(?:PROMPT|提示词|提示詞|プロンプト)\s*(?:(?:[:：])|(?:below\s*[:：]?)|(?:如下\s*[:：]?)|(?:(?:[👇⬇↓⇩⤵🔽]\uFE0F?\s*)+)|(?:[-–—]{2,}))\s*/iu.test(
    multilineText(text)
  );
}

function extractExplicitPromptBody(text: string): string {
  let current = multilineText(text);
  for (let depth = 0; depth < 3; depth += 1) {
    const match = current.match(
      depth === 0
        ? /(?:^|[\n\s]|[-–—]+)(?<!negative\s)(?:PROMPT|提示词|提示詞|プロンプト)\s*(?:(?:[:：])|(?:below\s*[:：]?)|(?:如下\s*[:：]?)|(?:(?:[👇⬇↓⇩⤵🔽]\uFE0F?\s*)+)|(?:[-–—]{2,}))\s*([\s\S]+)$/iu
        : /^(?:PROMPT|提示词|提示詞|プロンプト)\s*(?:(?:[:：])|(?:below\s*[:：]?)|(?:如下\s*[:：]?)|(?:(?:[👇⬇↓⇩⤵🔽]\uFE0F?\s*)+)|(?:[-–—]{2,}))\s*([\s\S]+)$/iu
    );
    const body = multilineText(match?.[1]);
    if (!body || body === current) break;
    current = body;
  }
  return current === multilineText(text) ? '' : current;
}

function stripLeadingCaptionParagraphs(text: string): string {
  const structuredSections = Array.from(
    multilineText(text).matchAll(
      /(?:^|\n)\s*(?:#{1,6}\s*)?(主体描述|场景|人物|发型|穿搭|动作|表情|构图|摄影风格|光线|画质|负面提示词|反向提示词|negative prompt)\s*(?:[（(][^)\n）]+[)）])?\s*[:：]?\s*(?=\n|$)/giu
    )
  ).map((match) => cleanText(match[1]).toLowerCase());
  if (cleanText(text).length >= 200 && new Set(structuredSections).size >= 3) {
    return multilineText(text);
  }

  const paragraphs = multilineText(text)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length < 2) return multilineText(text);

  let startIndex = 0;
  while (startIndex < paragraphs.length - 1) {
    const paragraph = cleanText(paragraphs[startIndex]);
    const remaining = paragraphs.slice(startIndex + 1).join('\n\n');
    if (looksLikeVisualPromptOpening(paragraph)) break;
    if (paragraph.length > 120 || cleanText(remaining).length < 120) break;
    startIndex += 1;
  }

  return paragraphs.slice(startIndex).join('\n\n');
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    )
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…');
}

function extractTweetId(value: unknown): string {
  const text = cleanText(value);
  const match =
    text.match(/(?:x\.com|twitter\.com)\/[^/]+\/status\/(\d+)/i) ||
    text.match(/(?:status|web)\/(\d+)/i) ||
    text.match(/\b(\d{12,24})\b/);
  return match?.[1] || '';
}

function normalizeTweetUrl(value: unknown): string {
  const text = cleanText(value);
  const id = extractTweetId(text);
  if (!id) return '';
  const userMatch = text.match(
    /(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/\d+/i
  );
  const username = userMatch?.[1] && userMatch[1] !== 'i' ? userMatch[1] : 'i';
  return username === 'i'
    ? `https://x.com/i/web/status/${id}`
    : `https://x.com/${username}/status/${id}`;
}

function derivePromptPreview(prompt: string): string {
  const normalized = cleanText(prompt);
  return normalized.length > 240
    ? `${normalized.slice(0, 240)}...`
    : normalized;
}

function hasPromptInReplyCue(text: string): boolean {
  const normalized = cleanText(text);
  return (
    /(?:prompt|提示词|提示詞|プロンプト)[^。.!?\n]{0,40}(?:reply|replies|comment|comments|below|リプ|返信|コメント|👇|⬇)/iu.test(
      normalized
    ) ||
    /(?:reply|replies|comment|comments|below|リプ|返信|コメント)[^。.!?\n]{0,40}(?:prompt|提示词|提示詞|プロンプト)/iu.test(
      normalized
    ) ||
    /(?:prompt|提示词|提示詞|プロンプト)\s*(?:is\s+)?(?:in\s+)?(?:part\s+)?(?:\(?\d+\s*\/\s*\d+\)?|\d+\s+of\s+\d+)/iu.test(
      normalized
    )
  );
}

function hasPromptInImageAltCue(text: string): boolean {
  const normalized = cleanText(text);
  const promptMarker = String.raw`(?:prompt|提示词|提示詞|プロンプト)`;
  const imageReference = String.raw`(?:\balt(?:\s*text)?\b|图片|圖片|照片|画像|\b(?:image|photo|picture)\b|[图圖](?:[一二三四五六七八九十\d]+|中|里|內|内|上|下|的))`;
  return (
    new RegExp(
      String.raw`${promptMarker}[^。.!?\n]{0,24}(?:在|位于|見|见|写在|寫在|藏在|放在|(?:is\s+)?(?:in|inside|on)|see|check)[^。.!?\n]{0,8}${imageReference}`,
      'iu'
    ).test(normalized) ||
    new RegExp(
      String.raw`${promptMarker}[^。.!?\n]{0,12}${imageReference}[^。.!?\n]{0,8}(?:中|里|內|内|上|下|に)`,
      'iu'
    ).test(normalized) ||
    new RegExp(
      String.raw`${imageReference}[^。.!?\n]{0,24}(?:中有|里有|內有|内有|上有|下有|内に|中に|包含|含有|写有|寫有|写着|寫著|提供|附有|contains?|includes?|has|shows?)[^。.!?\n]{0,8}${promptMarker}`,
      'iu'
    ).test(normalized)
  );
}

function isPromptCaseShowcaseCaption(text: string): boolean {
  const normalized = cleanText(stripUrls(text));
  if (!normalized || looksLikePromptCommand(normalized)) return false;

  const hasShowcaseCue =
    /(?:made|created|generated)\s+(?:a\s+)?set\s+of\b/iu.test(normalized) ||
    /\b(?:works?\s+so\s+well|turns?\s+.+\s+into|the\s+tricky\s+part\s+was)\b/iu.test(
      normalized
    ) ||
    /\b\d+\s+scenes?\s*:/iu.test(normalized) ||
    /\bprompt\s+below\b/iu.test(normalized);
  const hasModelOrVisualCue =
    /(?:chatgpt[-\s]*image|gpt[-\s]*image|seedream|seedance|midjourney|grok)/iu.test(
      normalized
    ) ||
    /(?:portrait|shot|pov|scene|camera|lighting|eye contact|gesture|shelves|store|library)/iu.test(
      normalized
    );

  return hasShowcaseCue && hasModelOrVisualCue;
}

function isInstructionalPromptUsageText(text: string): boolean {
  const normalized = cleanText(text);
  if (!normalized) return false;
  if (looksLikePromptCommand(normalized)) return false;

  const hasUsageCue =
    /(?:使い方|手順|方法|これだけ|how to use|steps?|workflow|instructions?)/iu.test(
      normalized
    );
  const referencesExternalPrompt =
    /(?:上の|上記|above|previous|この|その|同じ)\s*(?:prompt|プロンプト|提示词|提示詞)/iu.test(
      normalized
    ) ||
    /(?:prompt|プロンプト|提示词|提示詞)[^。.!?\n]{0,40}(?:貼る|貼り付け|paste|copy|コピペ)/iu.test(
      normalized
    );
  const hasGeneratedOutputStep =
    /(?:生成された|generated|next time|次回以降|リファレンス|reference|キャラシート|character sheet)/iu.test(
      normalized
    );
  const hasCharacterSheetCue =
    /(?:キャラクターシート|キャラシート|character sheet)/iu.test(normalized);
  const hasCharacterAdviceCue =
    /(?:解決策|おすすめ|保存して|固定|毎回[^。.!?\n]{0,20}変わる|顔が変わる|solve|keep.+consistent|consistent character)/iu.test(
      normalized
    );
  const hasViewListCue =
    /(?:正面|横|後ろ|表情差分|別角度|front view|side view|back view|expression variations?)/iu.test(
      normalized
    );

  return (
    (hasUsageCue && (referencesExternalPrompt || hasGeneratedOutputStep)) ||
    (referencesExternalPrompt && hasGeneratedOutputStep) ||
    (hasCharacterSheetCue && hasCharacterAdviceCue && hasViewListCue)
  );
}

function isConversationalReplyText(text: string): boolean {
  const normalized = cleanText(stripUrls(text));
  if (!normalized) return false;
  if (looksLikePromptCommand(normalized)) return false;
  if (!/^@[A-Za-z0-9_]{1,15}\b/u.test(normalized)) return false;

  return (
    normalized.length < 240 &&
    /\b(?:ha(?:ha)+|thanks?|thank you|give it a try|awesome|cool|nice|glad|welcome|appreciate|try it)\b/iu.test(
      normalized
    )
  );
}

function extractPromptText(text: string): string {
  const clean = stripTrailingHashtagBlock(stripUrls(text));
  const explicitPromptBody = extractExplicitPromptBody(clean);
  if (explicitPromptBody) {
    return explicitPromptBody
      .replace(/^(?:👇|[-–—:：])\s*/u, '')
      .replace(/\s+(?:via|source|credit)\s+@?\w+$/i, '')
      .trim();
  }
  if (hasPromptInReplyCue(clean)) return '';
  if (isPromptCaseShowcaseCaption(clean)) return '';
  if (isConversationalReplyText(clean)) return '';
  if (isInstructionalPromptUsageText(clean)) return '';
  const withoutCaption = stripLeadingCaptionParagraphs(clean);
  if (isConversationalReplyText(withoutCaption)) return '';
  if (isInstructionalPromptUsageText(withoutCaption)) return '';
  if (isPromptCaseShowcaseCaption(withoutCaption)) return '';
  return cleanText(withoutCaption).length >= 80 ? withoutCaption : '';
}

function splitPromptAndNegativePrompt(promptText: string): {
  prompt: string;
  negativePrompt?: string;
} {
  const prompt = multilineText(promptText);
  const negativeMatch = prompt.match(
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:negative\s+prompt|negative|负面提示词|反向提示词)(?:\s*[（(]\s*(?:negative\s+prompt|negative)\s*[)）])?\s*[:：]?\s*/iu
  );
  const negativeIndex = negativeMatch?.index ?? -1;
  if (!negativeMatch || negativeIndex <= 0) {
    return { prompt };
  }

  const positive = multilineText(prompt.slice(0, negativeIndex));
  const negative = multilineText(
    prompt.slice(negativeIndex + negativeMatch[0].length)
  );
  return {
    prompt: positive || prompt,
    negativePrompt: negative || undefined
  };
}

function endsWithEllipsis(text: string): boolean {
  return /(?:…|\.\.\.)$/u.test(cleanText(text));
}

function endsWithDanglingPhrase(text: string): boolean {
  return /(?:[,，、:：;；\-–—]|\b(?:and|or|with|of|for|the|a|an|to|in|on|by|as|using|including|featuring|while|where|that)\b)$/iu.test(
    cleanText(text)
  );
}

function isLikelyTruncatedTweetText(text: string, prompt: string): boolean {
  const normalizedText = cleanText(text);
  const normalizedPrompt = cleanText(prompt);
  if (!normalizedText || !normalizedPrompt) return false;
  return (
    normalizedText.length <= 900 &&
    (endsWithEllipsis(normalizedText) ||
      endsWithEllipsis(normalizedPrompt) ||
      endsWithDanglingPhrase(normalizedPrompt))
  );
}

function inferCategory(text: string): string {
  const isBackgroundOnly =
    BACKGROUND_CATEGORY_PATTERN.test(text) &&
    BACKGROUND_ONLY_PATTERN.test(text);
  for (const [category, pattern] of CATEGORY_RULES) {
    if (!pattern.test(text)) continue;
    if (
      isBackgroundOnly &&
      (category === 'character' ||
        category === 'fashion' ||
        category === 'portrait')
    ) {
      continue;
    }
    return category;
  }
  return DEFAULT_IMPORTED_PROMPT_CASE_CATEGORY;
}

function inferTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  const add = (tag: string, pattern: RegExp) => {
    if (pattern.test(text) || pattern.test(lower)) tags.push(tag);
  };

  add('Grok', /\bgrok\b|\bxai\b|\bx\.ai\b/i);
  add('GPT Image 2', /\bgpt[-\s]*image\s*2\b|\bchatgpt image/i);
  add('Nano Banana', /\bnano banana\b/i);
  add('Seedance', /\bseedance\b|\bseedance\s*(?:1|pro|lite)?\b/i);
  add('Seedream', /\bseedream\b/i);
  add('Midjourney', /\bmidjourney\b|\b--ar\b|\b--stylize\b/i);
  add('人像摄影', /人像|portrait|woman|man|model|girl|boy|selfie|photo of a/i);
  add('手机随拍', /手机|phone photo|iphone|candid|snapshot/i);
  add('写实摄影', /写实|真实|realistic|photorealistic|natural skin|camera/i);
  add('居家场景', /卧室|床|居家|bed|bedroom|pillow|cozy|home/i);
  add('产品摄影', /产品|商品|product|packshot|bottle|cosmetic|ecommerce/i);
  add('海报设计', /海报|poster|campaign|key visual|advertising/i);
  add('角色设计', /角色|character design|anime|game character|chibi/i);
  add(
    '角色一致性',
    /同一人物|同一キャラクター|キャラ(?:を)?固定|顔が変わる|model\s*fixed|character consistency|consistent character|same character|identity/i
  );
  add(
    '角色设定表',
    /キャラクターシート|キャラシート|character sheet|reference sheet|model sheet/i
  );
  add(
    '参考图',
    /添付画像|参考图|參考圖|参考画像|リファレンス|reference image|uploaded image|source image/i
  );
  add(
    '多视角',
    /正面|横|側面|後ろ|背面|別角度|front view|side view|back view|multiple angles?|turnaround/i
  );
  add(
    '表情差分',
    /表情差分|表情|笑顔|通常|困り顔|expression variations?|facial expressions?/i
  );
  add(
    '五官细节',
    /目[、・,，]|鼻|口|耳|眉|顔の詳細|facial features?|eyes?|nose|mouth|ears?|eyebrows?/i
  );
  add('发型细节', /髪|髪型|发型|頭髪|hair(?:style)?|hair details?/i);
  add('资料布局', /レイアウト|余白|ラベル|整理|layout|labels?|spacing|sheet/i);
  add('动漫风格', /アニメ|漫画|マンガ|anime|manga|cel[-\s]?shaded|toon/i);
  add('插画风格', /イラスト|illustration|illustrated|绘本|插画/i);
  add('3D风格', /\b3d\b|3D|デフォルメ|chibi|stylized 3d/i);
  add('电影感', /cinematic|film|movie|dramatic|35mm|anamorphic/i);
  add('自然光', /自然光|natural light|soft light|warm light|daylight/i);
  add(
    '负面约束',
    /negative prompt|ネガティブ指定|禁止|avoid|do not|without|不要|避け/i
  );
  add('高分辨率', /高解像度|高分辨率|high resolution|hi[-\s]?res|4k|8k/i);

  return Array.from(new Set(tags)).slice(0, 14);
}

function inferModel(text: string): string {
  const lower = text.toLowerCase();
  if (/\bgrok\b|\bxai\b|\bx\.ai\b/i.test(lower)) return 'grok';
  if (/\bseedance\b/i.test(lower)) return 'seedance-2-0';
  if (/\bseedream\b/i.test(lower)) return 'seedream';
  if (/\bnano banana\b/i.test(lower)) return 'nano-banana';
  if (/\bgpt[-\s]*image\s*2\b|\bchatgpt image/i.test(lower)) {
    return 'gpt-image-2';
  }
  if (/\bmidjourney\b|\b--ar\b|\b--stylize\b/i.test(text)) {
    return 'midjourney';
  }
  if (/\bflux\b/i.test(lower)) return 'flux';
  return 'unknown';
}

function buildImportedTweetTags(text: string, isVideo: boolean): string[] {
  return Array.from(
    new Set([
      ...(isVideo ? ['视频案例'] : ['图片案例']),
      ...inferTags(text).filter((tag) => tag !== '精选案例'),
      'X 导入'
    ])
  ).slice(0, 16);
}

function titleCaseEnglish(value: string): string {
  const lowerWords = new Set([
    'a',
    'an',
    'and',
    'as',
    'at',
    'by',
    'for',
    'from',
    'in',
    'of',
    'on',
    'or',
    'the',
    'to',
    'with'
  ]);
  return value
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && lowerWords.has(lower)) return lower;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function isAsciiTitlePhrase(value: string): boolean {
  return Array.from(value).every(
    (char) => char.charCodeAt(0) <= 127 || /\s|['’.-]/u.test(char)
  );
}

function flattenJsonStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') {
    const text = cleanText(value);
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => flattenJsonStrings(item, output));
    return output;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (/^(url|image|images|negative|avoid|seed)$/i.test(key)) return;
      flattenJsonStrings(item, output);
    });
  }
  return output;
}

function extractJsonTitleText(text: string): string {
  const trimmed = multilineText(text);
  if (!/^[{[]/.test(trimmed)) return '';
  try {
    const values = flattenJsonStrings(JSON.parse(trimmed));
    return values
      .filter((value) => value.length >= 3 && !/^image_prompt$/i.test(value))
      .slice(0, 12)
      .join(', ');
  } catch {
    return '';
  }
}

function pickPromptTitleSentence(text: string): string {
  const normalized = multilineText(
    text
      .replace(/https?:\/\/\S+/g, '')
      .replace(/(?:^|\s)(?:PROMPT|Prompt|prompt|提示词)\s*[:：-]?\s*/u, ' ')
  );
  const jsonText = extractJsonTitleText(normalized);
  const source = jsonText || normalized;
  const sentences = source
    .split(/[。.!?\n]+/)
    .map((item) => cleanText(item))
    .filter(Boolean);
  const usefulSentences = sentences.filter(
    (sentence) =>
      sentence.length >= 12 &&
      !/^(?:use the uploaded|preserve|negative prompt|no |avoid )/i.test(
        sentence
      )
  );
  return (
    usefulSentences.find((sentence) =>
      /^(?:create|generate|make|design|produce|render)\b/i.test(sentence)
    ) ||
    usefulSentences[0] ||
    sentences[0] ||
    source
  );
}

function compactPromptTitlePhrase(text: string): string {
  let phrase = pickPromptTitleSentence(text)
    .replace(
      /^(?:please\s+)?(?:create|generate|make|design|produce|render)\s+(?:an?\s+|the\s+)?/i,
      ''
    )
    .replace(/^(?:an?\s+|the\s+)/i, '')
    .replace(/\b(?:prompt|image prompt|example)\b\s*[:：-]?\s*/gi, '')
    .replace(
      /\b(?:in her|in his|in their)\s+(?:early\s+|mid\s+|late\s+)?(?:\d{2}s?|twenties|thirties|forties)\b/gi,
      ''
    )
    .replace(/\s+(?:featuring|showing|with)\s*[:：]?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  phrase = phrase.split(/[,，;；]/)[0] || phrase;
  if (phrase.split(/\s+/).length > 8) {
    phrase =
      phrase.split(
        /\s+(?:in front of|inside|beside|against|on a clean|on the|at a|at the|with a modern|with soft|in a clean)\b/i
      )[0] || phrase;
  }
  const words = phrase.split(/\s+/).filter(Boolean);
  if (isAsciiTitlePhrase(phrase) && words.length > 10) {
    phrase = words.slice(0, 10).join(' ');
  }
  if (isAsciiTitlePhrase(phrase)) {
    phrase = titleCaseEnglish(phrase);
  }
  return cleanText(phrase)
    .replace(/^[{[("']+|[}\])"']+$/g, '')
    .slice(0, 72)
    .trim();
}

function extractNamedCaseTitle(text: string): string {
  const normalized = cleanText(text);
  const match =
    normalized.match(
      /(?:set|series|collection)\s+of\s+[“"']([^”"']{4,72})[”"']/iu
    ) ||
    normalized.match(/(?:called|titled|named)\s+[“"']([^”"']{4,72})[”"']/iu);
  const title = cleanText(match?.[1]);
  if (!title || /^(?:prompt|negative prompt)$/i.test(title)) return '';
  return isAsciiTitlePhrase(title) ? titleCaseEnglish(title) : title;
}

function buildCaseIntentTitle(text: string): string {
  const normalized = cleanText(text);
  if (!normalized) return '';

  const hasCharacterSheet =
    /(?:キャラクターシート|キャラシート|character sheet|reference sheet|角色设定表|角色設定表|设定表|設定表)/iu.test(
      normalized
    );
  const hasCharacterConsistency =
    /(?:同一人物|同一キャラクター|キャラ固定|角色固定|角色一致|人物一致|consistent character|character consistency|model fixed|モデル固定)/iu.test(
      normalized
    );
  const hasReferenceCue =
    /(?:リファレンス|reference|参考图|參考圖|視覚資料|视觉资料|visual reference)/iu.test(
      normalized
    );
  const hasViewSheetCue =
    /(?:正面|横顔|横|後ろ|別角度|表情差分|顔パーツ|髪の詳細|front view|side view|back view|expression variations?|multi[-\s]?view|多视角)/iu.test(
      normalized
    );

  if (
    hasCharacterSheet &&
    (hasCharacterConsistency || hasReferenceCue || hasViewSheetCue)
  ) {
    return '角色一致性设定表';
  }

  const hasProductCue =
    /(?:商品|产品|product|packshot|ecommerce|commercial product|bottle|skincare|cosmetic)/iu.test(
      normalized
    );
  const hasCampaignCue =
    /(?:campaign|广告|廣告|commercial|key visual|kv|海报|poster)/iu.test(
      normalized
    );
  if (hasProductCue && hasCampaignCue) return '商品广告视觉案例';
  if (hasProductCue) return '商品图生成案例';

  return '';
}

function buildTitle(text: string): string {
  return (
    extractNamedCaseTitle(text) ||
    buildCaseIntentTitle(text) ||
    buildPromptThemeTitle(text) ||
    compactPromptTitlePhrase(text) ||
    'X 图片生成案例'
  );
}

function isPromptLikeTitle(title: string, prompt: string): boolean {
  return isWeakPromptCaseTitle(title, prompt);
}

function normalizeDraftTitle(title: unknown, prompt: string): string {
  const current = cleanText(title).slice(0, 90);
  if (!isPromptLikeTitle(current, prompt)) return current;
  return buildTitle(prompt);
}

function buildImportedTweetTitle(text: string, prompt: string): string {
  const promptText = prompt || text;
  const namedTitle = extractNamedCaseTitle(text);
  const promptThemeTitle = buildPromptThemeTitle(promptText);

  if (namedTitle && !isWeakPromptCaseTitle(namedTitle, promptText)) {
    return namedTitle;
  }

  return promptThemeTitle || namedTitle || buildTitle(promptText);
}

function normalizeImageUrl(value: unknown): string {
  const text = cleanText(value);
  if (!/^https?:\/\//i.test(text)) return '';
  try {
    const url = new URL(text);
    if (
      url.hostname.endsWith('twimg.com') &&
      url.pathname.includes('/media/')
    ) {
      url.searchParams.set('name', 'large');
    }
    return url.toString();
  } catch {
    return text;
  }
}

function normalizeMediaUrl(value: unknown): string {
  const text = cleanText(value);
  if (!/^https?:\/\//i.test(text)) return '';
  try {
    return new URL(text).toString();
  } catch {
    return text;
  }
}

function isLikelyVideoUrl(value: unknown): boolean {
  const url = normalizeMediaUrl(value);
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === 'video.twimg.com' ||
      /\.(?:mp4|m3u8|mov|webm)(?:$|[?#])/i.test(parsed.pathname) ||
      /\/(?:ext_tw_video|tweet_video|amplify_video)\//i.test(parsed.pathname)
    );
  } catch {
    return /\.(?:mp4|m3u8|mov|webm)(?:$|[?#])/i.test(url);
  }
}

function getEnvValue(keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function getEnvNumber(
  keys: string[],
  fallback: number,
  maxValue = Number.POSITIVE_INFINITY
): number {
  const raw = getEnvValue(keys);
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, maxValue);
}

function isEnvFlagDisabled(value: string): boolean {
  return /^(?:0|false|off|no)$/i.test(value.trim());
}

function getTuziXDeepSearchApiKey(): string {
  return getEnvValue([
    'TUZI_X_DEEPSEARCH_API_KEY',
    'TUZI_OPENAI_API_KEY',
    'TUZI_API_KEY',
    'TUZI_VIDEO_API_KEY'
  ]);
}

function getTuziXDeepSearchBaseUrl(): string {
  return getEnvValue([
    'TUZI_X_DEEPSEARCH_API_BASE_URL',
    'TUZI_OPENAI_API_BASE_URL',
    'TUZI_API_BASE_URL',
    'TUZI_VIDEO_API_BASE_URL'
  ]);
}

function isAisaXSearchConfigured(): boolean {
  return Boolean(getEnvValue(['AISA_API_KEY', 'TWITTER_RADAR_AISA_API_KEY']));
}

function isTuziXDeepSearchEnabled(): boolean {
  const flag = getEnvValue(['TUZI_X_DEEPSEARCH_ENABLED']);
  if (flag && isEnvFlagDisabled(flag)) return false;
  return Boolean(getTuziXDeepSearchApiKey() && getTuziXDeepSearchBaseUrl());
}

function joinApiUrl(baseUrl: string, pathname: string): URL {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(pathname.replace(/^\//, ''), base);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(
  url: URL,
  init: RequestInit,
  errorPrefix: string,
  timeoutMs = X_IMPORT_PROVIDER_TIMEOUT_MS
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${errorPrefix}: HTTP ${response.status}`);
    }
    return JSON.parse(text) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${errorPrefix}: 请求超时`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapTweetList(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  for (const key of [
    'tweets',
    'data',
    'result',
    'results',
    'replies',
    'items'
  ]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object'
      );
    }
  }
  return [];
}

function getXBearerToken(): string {
  return getEnvValue([
    'X_API_BEARER_TOKEN',
    'TWITTER_BEARER_TOKEN',
    'X_BEARER_TOKEN'
  ]);
}

function hydrateXApiTweets(
  payload: Record<string, unknown>
): Record<string, unknown>[] {
  const includes =
    payload.includes && typeof payload.includes === 'object'
      ? (payload.includes as Record<string, unknown>)
      : {};
  const users = Array.isArray(includes.users) ? includes.users : [];
  const media = Array.isArray(includes.media) ? includes.media : [];
  const usersById = new Map(
    users
      .filter(
        (user): user is Record<string, unknown> =>
          user !== null && typeof user === 'object'
      )
      .map((user) => [String(user.id), user])
  );
  const mediaByKey = new Map(
    media
      .filter(
        (item): item is Record<string, unknown> =>
          item !== null && typeof item === 'object'
      )
      .map((item) => [String(item.media_key), item])
  );
  const rawTweets = Array.isArray(payload.data)
    ? payload.data
    : payload.data && typeof payload.data === 'object'
      ? [payload.data]
      : [];
  return rawTweets
    .filter(
      (tweet): tweet is Record<string, unknown> =>
        tweet !== null && typeof tweet === 'object'
    )
    .map((tweet) => {
      const user = usersById.get(String(tweet.author_id));
      const attachments =
        tweet.attachments && typeof tweet.attachments === 'object'
          ? (tweet.attachments as Record<string, unknown>)
          : {};
      const mediaKeys = Array.isArray(attachments.media_keys)
        ? attachments.media_keys
        : [];
      const tweetMedia = mediaKeys
        .map((key) => mediaByKey.get(String(key)))
        .filter((item): item is Record<string, unknown> => Boolean(item))
        .map((item) => ({
          ...item,
          media_url_https: item.url || item.preview_image_url
        }));
      const username = cleanText(user?.username);
      return {
        ...tweet,
        user: user
          ? {
              ...user,
              screen_name: user.username,
              followers_count:
                user.public_metrics && typeof user.public_metrics === 'object'
                  ? (user.public_metrics as Record<string, unknown>)
                      .followers_count
                  : undefined
            }
          : undefined,
        media: tweetMedia,
        twitterUrl: username
          ? `https://x.com/${username}/status/${tweet.id}`
          : `https://x.com/i/web/status/${tweet.id}`
      };
    });
}

async function fetchTweetWithXApi(
  tweetId: string
): Promise<Record<string, unknown> | null> {
  const bearerToken = getXBearerToken();
  if (!bearerToken) return null;

  const url = new URL(`https://api.x.com/2/tweets/${tweetId}`);
  url.searchParams.set(
    'tweet.fields',
    'id,text,created_at,public_metrics,entities,attachments,author_id,lang,possibly_sensitive'
  );
  url.searchParams.set('expansions', 'author_id,attachments.media_keys');
  url.searchParams.set(
    'user.fields',
    'id,username,name,public_metrics,verified'
  );
  url.searchParams.set('media.fields', 'media_key,type,url,preview_image_url');

  const payload = await fetchJson(
    url,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json'
      }
    },
    'X API 推文提取失败'
  );
  return hydrateXApiTweets(payload)[0] || null;
}

function getTweetUrlParts(tweetUrl: string) {
  const normalized = normalizeTweetUrl(tweetUrl);
  const tweetId = extractTweetId(normalized);
  const username =
    normalized.match(/(?:x\.com|twitter\.com)\/([^/?#]+)\/status\/\d+/i)?.[1] ||
    '';
  return { normalized, tweetId, username };
}

function normalizeFxTwitterPayload(
  payload: Record<string, unknown>
): Record<string, unknown> | null {
  const tweet =
    payload.tweet && typeof payload.tweet === 'object'
      ? (payload.tweet as Record<string, unknown>)
      : payload;
  if (!getTweetText(tweet)) return null;
  return tweet;
}

async function fetchTweetWithFxTwitter(
  tweetUrl: string
): Promise<Record<string, unknown> | null> {
  const { normalized, tweetId, username } = getTweetUrlParts(tweetUrl);
  if (!tweetId) return null;
  const url = new URL(
    username && username !== 'i'
      ? `https://api.fxtwitter.com/${username}/status/${tweetId}`
      : `https://api.fxtwitter.com/Twitter/status/${tweetId}`
  );
  const payload = await fetchJson(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WebToMind prompt case importer'
      }
    },
    'FxTwitter 推文提取失败'
  );
  const tweet = normalizeFxTwitterPayload(payload);
  return tweet
    ? {
        ...tweet,
        twitterUrl: cleanText(tweet.url) || normalized
      }
    : null;
}

async function fetchTweetWithVxTwitter(
  tweetUrl: string
): Promise<Record<string, unknown> | null> {
  const { normalized, tweetId, username } = getTweetUrlParts(tweetUrl);
  if (!tweetId) return null;
  const url = new URL(
    username && username !== 'i'
      ? `https://api.vxtwitter.com/${username}/status/${tweetId}`
      : `https://api.vxtwitter.com/Twitter/status/${tweetId}`
  );
  const payload = await fetchJson(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WebToMind prompt case importer'
      }
    },
    'VxTwitter 推文提取失败'
  );
  return getTweetText(payload)
    ? {
        ...payload,
        id: payload.id || payload.tweetID || tweetId,
        twitterUrl: cleanText(payload.tweetURL) || normalized,
        author: {
          username: payload.user_screen_name,
          userName: payload.user_screen_name,
          name: payload.user_name
        }
      }
    : null;
}

async function fetchTweetOEmbed(
  tweetUrl: string
): Promise<Record<string, unknown> | null> {
  const tweetId = extractTweetId(tweetUrl);
  const url = new URL('https://publish.twitter.com/oembed');
  url.searchParams.set('url', normalizeTweetUrl(tweetUrl) || tweetUrl);
  url.searchParams.set('omit_script', '1');
  const payload = await fetchJson(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WebToMind prompt case importer'
      }
    },
    'X oEmbed 推文提取失败'
  );
  const html = String(payload.html || '');
  const text = decodeHtmlEntities(
    html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+—\s+[^—]+?\(@[^)]+\)\s+\w+ \d{1,2}, \d{4}\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const authorUrl = cleanText(payload.author_url);
  const username =
    authorUrl.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i)?.[1] || '';
  return {
    id: tweetId,
    text,
    twitterUrl: normalizeTweetUrl(tweetUrl),
    author: {
      name: payload.author_name,
      username,
      userName: username
    }
  };
}

async function fetchTweetWithAisa(
  tweetUrl: string,
  tweetId: string
): Promise<Record<string, unknown> | null> {
  const apiKey = getEnvValue(['AISA_API_KEY', 'TWITTER_RADAR_AISA_API_KEY']);
  const baseUrl =
    getEnvValue(['AISA_API_BASE_URL']) || 'https://api.aisa.one/apis/v1';
  if (!apiKey) return null;

  const url = joinApiUrl(baseUrl, '/twitter/tweet/advanced_search');
  const normalizedUrl = normalizeTweetUrl(tweetUrl);
  url.searchParams.set(
    'query',
    [tweetId, normalizedUrl ? `"${normalizedUrl.replace(/"/g, '')}"` : '']
      .filter(Boolean)
      .join(' OR ')
  );
  url.searchParams.set('queryType', 'Latest');

  const payload = await fetchJson(
    url,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      }
    },
    'AISA 推文提取失败'
  );
  const tweets = unwrapTweetList(payload);
  return (
    tweets.find(
      (tweet) =>
        extractTweetId(tweet.id || tweet.rest_id || tweet.tweet_id) === tweetId
    ) ||
    tweets.find(
      (tweet) => extractTweetId(tweet.url || tweet.twitterUrl) === tweetId
    ) ||
    null
  );
}

function getTweetIdFromPayload(payload: Record<string, unknown>): string {
  return extractTweetId(
    payload.id ||
      payload.rest_id ||
      payload.tweet_id ||
      payload.tweetID ||
      payload.twitterUrl ||
      payload.url
  );
}

function getTweetUsername(payload: Record<string, unknown>): string {
  return (
    getTweetAuthor(payload).username ||
    cleanText(payload.user_screen_name) ||
    cleanText(payload.userName) ||
    cleanText(payload.username) ||
    getTweetUrlParts(cleanText(payload.twitterUrl || payload.url)).username
  );
}

function getTweetUrl(payload: Record<string, unknown>): string {
  const tweetId = getTweetIdFromPayload(payload);
  const username = getTweetUsername(payload);
  const direct = cleanText(
    payload.twitterUrl || payload.tweetURL || payload.url
  );
  if (direct) return normalizeTweetUrl(direct) || direct;
  if (!tweetId) return '';
  return username
    ? `https://x.com/${username}/status/${tweetId}`
    : `https://x.com/i/web/status/${tweetId}`;
}

function appendUniqueTweets(
  target: Record<string, unknown>[],
  seenKeys: Set<string>,
  tweets: Record<string, unknown>[]
): void {
  for (const tweet of tweets) {
    const key = getTweetIdFromPayload(tweet) || getTweetUrl(tweet);
    if (key && seenKeys.has(key)) continue;
    if (key) seenKeys.add(key);
    target.push(tweet);
  }
}

function getAisaNextCursor(payload: Record<string, unknown>): string {
  return cleanText(payload.next_cursor || payload.nextCursor);
}

function hasAisaNextPage(payload: Record<string, unknown>): boolean {
  return payload.has_next_page === true || payload.hasNextPage === true;
}

function getTargetedAisaPromptSearchQueries(
  tweetId: string,
  username: string,
  sourceText: string
): string[] {
  const queries = [`conversation_id:${tweetId} from:${username} -is:retweet`];
  const namedTitle = extractNamedCaseTitle(sourceText);
  if (namedTitle) {
    const safeTitle = namedTitle.replace(/"/g, '');
    queries.push(
      `from:${username} "${safeTitle}" Prompt`,
      `from:${username} "${safeTitle}"`
    );
  }
  return Array.from(new Set(queries));
}

async function fetchTweetPromptRepliesWithAisa(
  tweetId: string,
  username: string,
  sourceText: string,
  deadlineAt?: number
): Promise<Record<string, unknown>[]> {
  const apiKey = getEnvValue(['AISA_API_KEY', 'TWITTER_RADAR_AISA_API_KEY']);
  const baseUrl =
    getEnvValue(['AISA_API_BASE_URL']) || 'https://api.aisa.one/apis/v1';
  if (!apiKey || !username) return [];

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json'
  };
  const maxPages = Math.max(
    1,
    Math.floor(
      getEnvNumber(
        ['AISA_X_REPLIES_MAX_PAGES'],
        AISA_REPLY_SEARCH_DEFAULT_MAX_PAGES,
        AISA_REPLY_SEARCH_MAX_PAGES
      )
    )
  );
  const replies: Record<string, unknown>[] = [];
  const seenReplyKeys = new Set<string>();

  const collectPagedTweets = async (
    pathname: string,
    params: Record<string, string>,
    errorLabel: string
  ): Promise<boolean> => {
    let cursor = '';
    for (let page = 0; page < maxPages; page += 1) {
      if (deadlineAt && deadlineAt - Date.now() < 3000) break;
      const url = joinApiUrl(baseUrl, pathname);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      if (cursor) url.searchParams.set('cursor', cursor);

      const payload = await fetchJson(url, { headers }, errorLabel);
      appendUniqueTweets(replies, seenReplyKeys, unwrapTweetList(payload));
      if (findBestPromptReply(replies, tweetId, username)) {
        return true;
      }

      cursor = getAisaNextCursor(payload);
      if (!hasAisaNextPage(payload) || !cursor) break;
    }
    return false;
  };

  try {
    if (
      await collectPagedTweets(
        '/twitter/tweet/replies/v2',
        { tweetId, queryType: 'Latest' },
        'AISA 评论列表提取失败'
      )
    ) {
      return replies;
    }
  } catch (error) {
    console.warn(
      '[AdminPromptCaseDraftImport] AISA replies/v2 skipped:',
      error
    );
  }

  try {
    if (
      await collectPagedTweets(
        '/twitter/tweet/replies',
        { tweetId },
        'AISA 评论列表提取失败'
      )
    ) {
      return replies;
    }
  } catch (error) {
    console.warn('[AdminPromptCaseDraftImport] AISA replies skipped:', error);
  }

  try {
    if (
      await collectPagedTweets(
        '/twitter/tweet/thread_context',
        { tweetId },
        'AISA 线程上下文提取失败'
      )
    ) {
      return replies;
    }
  } catch (error) {
    console.warn(
      '[AdminPromptCaseDraftImport] AISA thread context skipped:',
      error
    );
  }

  for (const query of getTargetedAisaPromptSearchQueries(
    tweetId,
    username,
    sourceText
  )) {
    if (deadlineAt && deadlineAt - Date.now() < 3000) break;
    const searchUrl = joinApiUrl(baseUrl, '/twitter/tweet/advanced_search');
    searchUrl.searchParams.set('query', query);
    searchUrl.searchParams.set('queryType', 'Latest');

    const payload = await fetchJson(
      searchUrl,
      { headers },
      'AISA 评论 Prompt 提取失败'
    );
    appendUniqueTweets(replies, seenReplyKeys, unwrapTweetList(payload));
    if (findBestPromptReply(replies, tweetId, username)) {
      return replies;
    }
  }

  return replies;
}

function extractThreadNavigatorBlocks(html: string): string[] {
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|article|section|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  const lines = text
    .split(/\n+/)
    .map((line) => cleanText(line))
    .filter(Boolean);
  const blocks: string[] = [];
  let current: string[] = [];
  let started = false;

  for (const line of lines) {
    if (/^\d+$/u.test(line)) {
      if (started && current.length > 0) {
        blocks.push(multilineText(current.join('\n')));
        current = [];
      }
      started = true;
      continue;
    }
    if (started) current.push(line);
  }
  if (started && current.length > 0) {
    blocks.push(multilineText(current.join('\n')));
  }

  return blocks.filter((block) => cleanText(block).length > 0);
}

function cleanThreadNavigatorContinuationBlock(block: string): string {
  const lines = multilineText(block)
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean)
    .filter(
      (line) =>
        !/^(?:visibility|Image: Thread image|Generated by Thread Navigator)$/iu.test(
          line
        )
    );
  return multilineText(lines.join('\n'));
}

function isThreadNavigatorExampleVariablesBlock(block: string): boolean {
  const raw = multilineText(block);
  const normalized = cleanText(raw);
  if (!normalized) return false;
  if (
    /^(?:Example variables?|Example inputs?|Variable examples?)\b/iu.test(
      normalized
    ) ||
    /(?:You can give these to your LLM|more examples)/iu.test(normalized)
  ) {
    return true;
  }
  return (
    /(?:^|\s)--\s*\[CHARACTER SEED\]/iu.test(normalized) &&
    /\[AGE\s*\/\s*BODY TYPE\]/iu.test(normalized) &&
    /\[VISUAL MEDIUM\]/iu.test(normalized) &&
    /\[STYLE\]/iu.test(normalized)
  );
}

function isThreadPromptContinuationBlock(block: string): boolean {
  const normalized = cleanText(block);
  if (!normalized) return false;
  if (
    /(?:Generated by Thread Navigator|Monthly Export Limit|Sign Up to Export|Unlock Pro|Download Pro|Fast Export)/iu.test(
      normalized
    )
  ) {
    return false;
  }
  if (isThreadNavigatorExampleVariablesBlock(block)) return false;
  return (
    /\[(?:CHARACTER SEED|AGE\s*\/\s*BODY TYPE|VISUAL MEDIUM|STYLE|OTHER DETAILS)/iu.test(
      normalized
    ) ||
    /(?:negative prompt|ネガティブ|反向提示词|负面提示词)/iu.test(normalized)
  );
}

function buildThreadNavigatorPromptFromBlocks(
  blocks: string[],
  sourceText: string
): string {
  const sourceNormalized = cleanText(stripUrls(sourceText)).toLowerCase();
  for (let index = 1; index < blocks.length; index += 1) {
    const block = blocks[index];
    const prompt = extractPromptText(block);
    const promptLength = cleanText(prompt).length;
    if (promptLength < 140) continue;
    const normalizedPrompt = cleanText(stripUrls(prompt)).toLowerCase();
    if (
      normalizedPrompt &&
      sourceNormalized &&
      (sourceNormalized.includes(normalizedPrompt.slice(0, 120)) ||
        normalizedPrompt.includes(sourceNormalized.slice(0, 160)))
    ) {
      continue;
    }

    const parts = [prompt];
    for (let nextIndex = index + 1; nextIndex < blocks.length; nextIndex += 1) {
      const continuation = cleanThreadNavigatorContinuationBlock(
        blocks[nextIndex]
      );
      if (!isThreadPromptContinuationBlock(continuation)) break;
      parts.push(continuation);
    }

    return multilineText(parts.join('\n\n'));
  }

  return '';
}

async function fetchTweetPromptReplyWithThreadNavigator(
  tweetId: string,
  username: string,
  sourceText: string,
  deadlineAt?: number
): Promise<Record<string, unknown>[]> {
  if (!tweetId || !username || !hasPromptInReplyCue(sourceText)) return [];

  const url = new URL(`https://threadnavigator.com/thread/${tweetId}/`);
  const remainingMs = deadlineAt
    ? Math.max(1000, deadlineAt - Date.now())
    : X_IMPORT_PROVIDER_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.min(X_IMPORT_PROVIDER_TIMEOUT_MS, remainingMs)
  );
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': 'WebToMind prompt case importer'
      }
    });
    if (!response.ok) return [];

    const blocks = extractThreadNavigatorBlocks(await response.text());
    const prompt = buildThreadNavigatorPromptFromBlocks(blocks, sourceText);
    if (!prompt) return [];

    return [
      {
        id: `${tweetId}-threadnavigator`,
        text: `Prompt:\n${prompt}`,
        full_text: `Prompt:\n${prompt}`,
        rawContent: `Prompt:\n${prompt}`,
        twitterUrl: url.toString(),
        promptReplyUrl: url.toString(),
        promptReplyUrls: [url.toString()],
        threadNavigatorPromptReply: true,
        author: {
          username,
          userName: username
        }
      }
    ];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTweetPromptRepliesWithXApi(
  tweetId: string,
  username: string
): Promise<Record<string, unknown>[]> {
  const bearerToken = getXBearerToken();
  if (!bearerToken || !username) return [];

  const url = new URL(X_API_SEARCH_RECENT_URL);
  url.searchParams.set(
    'query',
    `conversation_id:${tweetId} from:${username} -is:retweet`
  );
  url.searchParams.set('max_results', '20');
  url.searchParams.set(
    'tweet.fields',
    'id,text,created_at,conversation_id,referenced_tweets,public_metrics,entities,attachments,author_id,lang,possibly_sensitive'
  );
  url.searchParams.set('expansions', 'author_id,attachments.media_keys');
  url.searchParams.set(
    'user.fields',
    'id,username,name,public_metrics,verified'
  );
  url.searchParams.set('media.fields', 'media_key,type,url,preview_image_url');

  const payload = await fetchJson(
    url,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: 'application/json'
      }
    },
    'X API 评论 Prompt 提取失败'
  );
  return hydrateXApiTweets(payload);
}

function extractJsonObjectFromText(
  text: string
): Record<string, unknown> | null {
  const trimmed = multilineText(text);
  const fenced = trimmed.match(/```(?:json)?\s*({[\s\S]*?})\s*```/i)?.[1];
  const candidates = [
    fenced,
    trimmed.includes('{') && trimmed.includes('}')
      ? trimmed.slice(trimmed.indexOf('{'), trimmed.lastIndexOf('}') + 1)
      : ''
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function getTuziChatCompletionContent(
  payload: Record<string, unknown>
): string {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const firstChoice = choices.find(
    (choice): choice is Record<string, unknown> =>
      choice !== null && typeof choice === 'object'
  );
  const message =
    firstChoice?.message && typeof firstChoice.message === 'object'
      ? (firstChoice.message as Record<string, unknown>)
      : {};
  return multilineText(
    message.content || firstChoice?.text || payload.output_text
  );
}

function getTuziDeepSearchSourceUrls(
  result: Record<string, unknown>,
  fallbackUrl: string
): string[] {
  const values = [
    result.source_url,
    ...(Array.isArray(result.source_urls) ? result.source_urls : [])
  ];
  const urls = values.map((value) => normalizeTweetUrl(value)).filter(Boolean);
  if (urls.length === 0) {
    const normalizedFallback = normalizeTweetUrl(fallbackUrl);
    if (normalizedFallback) urls.push(normalizedFallback);
  }
  return Array.from(new Set(urls));
}

function isPromptSearchSourceCaptionEcho(
  sourceText: string,
  promptText: string
): boolean {
  const source = cleanText(stripUrls(sourceText)).toLowerCase();
  const prompt = cleanText(stripUrls(promptText)).toLowerCase();
  if (!source || !prompt) return false;
  if (hasPromptInReplyCue(promptText)) return true;
  if (prompt.length >= 60 && source.includes(prompt)) return true;
  if (source.length >= 60 && prompt.includes(source.slice(0, 120))) return true;
  const sourceWords = new Set(
    source
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, ''))
      .filter((word) => word.length >= 4)
  );
  const promptWords = prompt
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, ''))
    .filter((word) => word.length >= 4);
  if (sourceWords.size < 8 || promptWords.length < 8) return false;
  const overlap = promptWords.filter((word) => sourceWords.has(word)).length;
  return (
    overlap / promptWords.length > 0.72 && prompt.length < source.length * 1.35
  );
}

async function fetchTweetPromptReplyWithTuziDeepSearch(
  tweetId: string,
  username: string,
  sourceTweetUrl: string,
  sourceText: string,
  deadlineAt?: number
): Promise<Record<string, unknown>[]> {
  if (!isTuziXDeepSearchEnabled() || !tweetId || !username) return [];

  const apiKey = getTuziXDeepSearchApiKey();
  const baseUrl = getTuziXDeepSearchBaseUrl();
  const model =
    getEnvValue(['TUZI_X_DEEPSEARCH_MODEL']) || TUZI_X_DEEPSEARCH_DEFAULT_MODEL;
  const timeoutMs = getEnvNumber(
    ['TUZI_X_DEEPSEARCH_TIMEOUT_MS'],
    TUZI_X_DEEPSEARCH_DEFAULT_TIMEOUT_MS,
    TUZI_X_DEEPSEARCH_MAX_TIMEOUT_MS
  );
  const attempts = Math.max(
    1,
    Math.floor(
      getEnvNumber(
        ['TUZI_X_DEEPSEARCH_ATTEMPTS'],
        TUZI_X_DEEPSEARCH_DEFAULT_ATTEMPTS,
        TUZI_X_DEEPSEARCH_MAX_ATTEMPTS
      )
    )
  );
  const retryDelayMs = getEnvNumber(
    ['TUZI_X_DEEPSEARCH_RETRY_DELAY_MS'],
    TUZI_X_DEEPSEARCH_DEFAULT_RETRY_DELAY_MS,
    TUZI_X_DEEPSEARCH_MAX_RETRY_DELAY_MS
  );
  const url = joinApiUrl(baseUrl, '/v1/chat/completions');
  const namedTitle = extractNamedCaseTitle(sourceText);
  const searchHints = [
    `source:${sourceTweetUrl}`,
    `from:${username}`,
    namedTitle ? `"${namedTitle}"` : '',
    namedTitle ? `"${namedTitle}" Prompt` : '',
    'Prompt:'
  ]
    .filter(Boolean)
    .join('\n');
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const remainingMs = deadlineAt ? deadlineAt - Date.now() : timeoutMs;
    if (remainingMs < 1000) break;
    const attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, remainingMs));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), attemptTimeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content:
                '你是 WebToMind 案例导入助手。你可以检查公开 X/Twitter 线程，但必须只返回一个 JSON 对象，不要 Markdown，不要编造。'
            },
            {
              role: 'user',
              content: `检查公开 X/Twitter 线程：${sourceTweetUrl}

原帖作者：@${username}
原帖 ID：${tweetId}
原帖文本：
${sourceText.slice(0, 1200)}

任务：查找原帖作者 @${username} 在这条线程的回复/评论区发布的完整 AI 生成提示词 prompt。忽略其他用户回复。
优先使用这些检索线索定位作者回复：
${searchHints}

判定规则：
- 大段可直接粘贴给 AI 图像/视频模型执行的生成指令就是 prompt，即使没有 “Prompt:” 标记。
- 如果原帖正文写了 “Prompt below/Prompt in replies”，且正文里出现了作品名/系列名，请优先查找同作者包含该作品名和 “Prompt:” 的回复。
- 角色表、キャラクターシート、character sheet 的生成指令也是 prompt，不要误判为普通说明。
- “使用方法/步骤/把上面的 prompt 贴上”这类才是用法说明，不应当作为 prompt。
- 原帖正文、作品介绍、caption、或包含 “Prompt below/Prompt in replies” 的摘录不是评论区 prompt，不能作为 prompt_text 返回。
- 若多条连续作者回复组成一个 prompt，请按顺序合并。
- 如果能确认 prompt 文本但无法确认回复 URL，仍返回 found_prompt=true，并把可确认的线程或回复 URL 放到 source_urls。
- 若无法访问、无法确认、或只看到用法说明但没有可执行 prompt，才返回 found_prompt=false。

只返回 JSON：
{
  "found_prompt": boolean,
  "prompt_text": "找到的完整 prompt；没有则为空字符串",
  "source_url": "发布该 prompt 的 X 回复链接；没有则为空字符串",
  "source_urls": ["相关 X 链接"],
  "evidence": "不超过160字的依据"
}`
            }
          ],
          max_tokens: 3200,
          temperature: 0
        })
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Tuzi X DeepSearch failed: HTTP ${response.status}`);
      }
      const payload = JSON.parse(text) as Record<string, unknown>;
      const content = getTuziChatCompletionContent(payload);
      const result = extractJsonObjectFromText(content);
      if (!result || result.found_prompt !== true) return [];

      const promptText = multilineText(result.prompt_text);
      const sourceUrls = getTuziDeepSearchSourceUrls(result, sourceTweetUrl);
      const replyUrl = sourceUrls[0] || '';
      const replyId =
        extractTweetId(result.source_url) ||
        extractTweetId(sourceUrls[0]) ||
        extractTweetId(result.evidence) ||
        tweetId;
      if (
        cleanText(promptText).length < 20 ||
        !replyId ||
        isPromptSearchSourceCaptionEcho(sourceText, promptText)
      ) {
        return [];
      }

      return [
        {
          id: replyId,
          text: `Prompt:\n${promptText}`,
          full_text: `Prompt:\n${promptText}`,
          twitterUrl: replyUrl,
          promptReplyUrl: replyUrl,
          promptReplyUrls: sourceUrls,
          tuziDeepSearchPromptReply: true,
          author: {
            username,
            userName: username
          },
          tuziDeepSearchEvidence: multilineText(result.evidence).slice(0, 240)
        }
      ];
    } catch (error) {
      lastError =
        error instanceof Error && error.name === 'AbortError'
          ? new Error(
              `Tuzi X DeepSearch failed: timeout ${attemptTimeoutMs}ms on attempt ${attempt}/${attempts}`
            )
          : error;
      if (attempt >= attempts) break;
      if (deadlineAt && deadlineAt - Date.now() <= retryDelayMs) break;
      await sleep(retryDelayMs);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Tuzi X DeepSearch failed');
}

function isSameTweetAuthor(
  tweet: Record<string, unknown>,
  username: string
): boolean {
  if (!username) return false;
  return getTweetUsername(tweet).toLowerCase() === username.toLowerCase();
}

function getTweetCreatedTime(payload: Record<string, unknown>): number {
  const legacy =
    payload.legacy && typeof payload.legacy === 'object'
      ? (payload.legacy as Record<string, unknown>)
      : {};
  const createdAt = cleanText(
    payload.created_at || payload.createdAt || legacy.created_at
  );
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareTweetChronology(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const aTime = getTweetCreatedTime(a);
  const bTime = getTweetCreatedTime(b);
  if (aTime && bTime && aTime !== bTime) return aTime - bTime;

  const aId = getTweetIdFromPayload(a);
  const bId = getTweetIdFromPayload(b);
  if (aId.length !== bId.length) return aId.length - bId.length;
  return aId.localeCompare(bId);
}

function mergePromptReplyGroup(
  replies: Array<{
    reply: Record<string, unknown>;
    prompt: string;
    score: number;
  }>
): Record<string, unknown> | null {
  if (replies.length === 0) return null;
  const first = replies[0].reply;
  const prompt = replies.map((item) => item.prompt).join('\n\n');
  const urls = replies.map((item) => getTweetUrl(item.reply)).filter(Boolean);
  return {
    ...first,
    text: `Prompt:\n${prompt}`,
    full_text: `Prompt:\n${prompt}`,
    rawContent: `Prompt:\n${prompt}`,
    promptReplyUrls: Array.from(new Set(urls)),
    promptReplyUrl: urls[0] || getTweetUrl(first),
    promptReplyMergedCount: replies.length
  };
}

function findBestPromptReply(
  replies: Record<string, unknown>[],
  sourceTweetId: string,
  sourceUsername: string
): Record<string, unknown> | null {
  const sameAuthorReplies = replies
    .filter((reply) => {
      const replyId = getTweetIdFromPayload(reply);
      return (
        replyId &&
        replyId !== sourceTweetId &&
        isSameTweetAuthor(reply, sourceUsername)
      );
    })
    .sort(compareTweetChronology);

  const groups: Array<{
    replies: Array<{
      reply: Record<string, unknown>;
      prompt: string;
      score: number;
    }>;
    score: number;
  }> = [];
  let currentGroup: Array<{
    reply: Record<string, unknown>;
    prompt: string;
    score: number;
  }> = [];

  const flushCurrentGroup = () => {
    if (currentGroup.length === 0) return;
    const promptLength = currentGroup.reduce(
      (sum, item) => sum + cleanText(item.prompt).length,
      0
    );
    const markerScore = currentGroup.reduce((sum, item) => sum + item.score, 0);
    groups.push({
      replies: currentGroup,
      score: promptLength + markerScore + currentGroup.length * 80
    });
    currentGroup = [];
  };

  for (const reply of sameAuthorReplies) {
    const text = getTweetText(reply);
    const prompt = extractPromptText(text);
    if (cleanText(prompt).length === 0) {
      flushCurrentGroup();
      continue;
    }

    currentGroup.push({
      reply,
      prompt,
      score: /(?:prompt|提示词|提示詞|プロンプト)\s*[:：]/iu.test(text)
        ? 120
        : 0
    });
  }
  flushCurrentGroup();

  const bestGroup = groups.sort((a, b) => b.score - a.score)[0];
  return bestGroup ? mergePromptReplyGroup(bestGroup.replies) : null;
}

async function fetchPromptReplyForTweet(
  sourcePayload: Record<string, unknown>,
  options: {
    allowTuziDeepSearch?: boolean;
    forceTuziDeepSearch?: boolean;
    overallDeadlineAt?: number;
  } = {}
): Promise<{ payload: Record<string, unknown>; provider: string } | null> {
  const sourceText = getTweetText(sourcePayload);
  const shouldSearchReplies =
    hasPromptInReplyCue(sourceText) ||
    (options.allowTuziDeepSearch === true &&
      options.forceTuziDeepSearch === true);
  if (!shouldSearchReplies) return null;

  const tweetId = getTweetIdFromPayload(sourcePayload);
  const username = getTweetUsername(sourcePayload);
  if (!tweetId || !username) return null;
  const replyDeadlineAt =
    Date.now() +
    getEnvNumber(
      ['X_REPLY_PROMPT_SEARCH_DEADLINE_MS'],
      X_REPLY_PROMPT_SEARCH_DEFAULT_DEADLINE_MS,
      X_REPLY_PROMPT_SEARCH_MAX_DEADLINE_MS
    );
  const deadlineAt = options.overallDeadlineAt
    ? Math.min(replyDeadlineAt, options.overallDeadlineAt)
    : replyDeadlineAt;

  const aisaReplyProvider = async () => ({
    replies: await fetchTweetPromptRepliesWithAisa(
      tweetId,
      username,
      sourceText,
      deadlineAt
    ),
    provider: 'aisa-replies'
  });
  const threadNavigatorReplyProvider = async () => ({
    replies: await fetchTweetPromptReplyWithThreadNavigator(
      tweetId,
      username,
      sourceText,
      deadlineAt
    ),
    provider: 'threadnavigator-thread'
  });
  const xApiReplyProvider = async () => ({
    replies: await fetchTweetPromptRepliesWithXApi(tweetId, username),
    provider: 'x-api-replies'
  });
  const tuziReplyProvider = async () => ({
    replies: await fetchTweetPromptReplyWithTuziDeepSearch(
      tweetId,
      username,
      getTweetUrl(sourcePayload),
      sourceText,
      deadlineAt
    ),
    provider: 'tuzi-grok-deepsearch-replies'
  });
  const providers: Array<
    () => Promise<{ replies: Record<string, unknown>[]; provider: string }>
  > =
    options.allowTuziDeepSearch && options.forceTuziDeepSearch
      ? [tuziReplyProvider]
      : [
          aisaReplyProvider,
          threadNavigatorReplyProvider,
          xApiReplyProvider,
          ...(options.allowTuziDeepSearch ? [tuziReplyProvider] : [])
        ];

  for (const provider of providers) {
    if (Date.now() >= deadlineAt) break;
    try {
      const result = await provider();
      const reply = result.provider.includes('tuzi')
        ? result.replies.find(
            (item) =>
              cleanText(extractPromptText(getTweetText(item))).length > 0
          ) || null
        : result.provider.includes('threadnavigator')
          ? result.replies[0] || null
          : findBestPromptReply(result.replies, tweetId, username);
      if (!reply) continue;
      return { payload: reply, provider: result.provider };
    } catch (error) {
      console.warn('[AdminPromptCaseDraftImport] reply prompt skipped:', error);
    }
  }

  return null;
}

function getTweetCandidateKey(candidate: TweetExtractionCandidate): string {
  return (
    getTweetIdFromPayload(candidate.payload) || getTweetUrl(candidate.payload)
  );
}

function shouldForceTuziReplyPromptSearch(
  candidates: TweetExtractionCandidate[],
  replyPromptCandidates: TweetExtractionCandidate[]
): boolean {
  if (!isTuziXDeepSearchEnabled()) return false;
  if (
    replyPromptCandidates.some((candidate) =>
      candidate.provider.includes('tuzi-grok-deepsearch-replies')
    )
  ) {
    return false;
  }

  const mediaCandidates = candidates.filter(
    (candidate) => candidate.imageCount > 0 || candidate.videoCount > 0
  );
  if (mediaCandidates.length === 0) return false;

  if (candidates.some(hasCompleteInlinePromptCandidate)) return false;

  const bestPromptLength = Math.max(
    0,
    ...candidates.map((candidate) => candidate.promptLength)
  );
  if (bestPromptLength === 0) return true;
  if (bestPromptLength >= 700) return false;

  return candidates.some((candidate) => {
    const prompt = extractPromptText(getTweetText(candidate.payload));
    const text = getTweetText(candidate.payload);
    return (
      cleanText(prompt).length > 0 &&
      cleanText(prompt).length < 700 &&
      (isLikelyTruncatedTweetText(text, prompt) ||
        /(?:同一人物|同一キャラクター|キャラクターシート|character sheet|reference sheet|添付画像|リファレンス)/iu.test(
          prompt
        ))
    );
  });
}

function hasCompleteInlinePromptCandidate(
  candidate: TweetExtractionCandidate
): boolean {
  if (candidate.promptLength < 260 || candidate.truncated) return false;

  const text = getTweetText(candidate.payload);
  if (hasPromptInReplyCue(text)) return false;

  const prompt = extractPromptText(text);
  if (isLikelyTruncatedTweetText(text, prompt)) return false;

  return true;
}

function isConfidentEarlyExitCandidate(
  candidate: TweetExtractionCandidate
): boolean {
  if (candidate.imageCount === 0) return false;
  const prompt = extractPromptText(getTweetText(candidate.payload));
  const promptLength = cleanText(prompt).length;
  if (
    getXArticleText(candidate.payload).startsWith('Prompt:\n') &&
    promptLength >= 80
  ) {
    return true;
  }
  if (!hasCompleteInlinePromptCandidate(candidate)) return false;
  return (
    /(?:negative\s+prompt|负面提示词|反向提示词)/iu.test(prompt) ||
    /[.!?。！？)）\]}]$/u.test(prompt.trim())
  );
}

function pickTuziReplyPromptFallbackSource(
  candidates: TweetExtractionCandidate[],
  alreadySearchedKeys: Set<string>
): TweetExtractionCandidate | null {
  return (
    candidates
      .filter(
        (candidate) => !alreadySearchedKeys.has(getTweetCandidateKey(candidate))
      )
      .filter(
        (candidate) => candidate.imageCount > 0 || candidate.videoCount > 0
      )
      .sort((a, b) => {
        const bMedia = b.imageCount + b.videoCount;
        const aMedia = a.imageCount + a.videoCount;
        if (bMedia !== aMedia) return bMedia - aMedia;
        if (b.textLength !== a.textLength) return b.textLength - a.textLength;
        return b.score - a.score;
      })[0] || null
  );
}

function mergeTweetWithPromptReply(
  source: TweetExtractionCandidate,
  reply: { payload: Record<string, unknown>; provider: string }
): TweetExtractionCandidate {
  const sourceTweetUrl = getTweetUrl(source.payload);
  const explicitReplyUrls = Array.isArray(reply.payload.promptReplyUrls)
    ? reply.payload.promptReplyUrls.filter(
        (url): url is string => typeof url === 'string' && url.length > 0
      )
    : [];
  const replyTweetUrl =
    cleanText(reply.payload.promptReplyUrl) ||
    explicitReplyUrls[0] ||
    getTweetUrl(reply.payload);
  const replyText = getTweetText(reply.payload);
  const prompt = extractPromptText(replyText);
  const payload = {
    ...source.payload,
    text: replyText,
    full_text: replyText,
    rawContent: replyText,
    promptReplyText: replyText,
    promptReplyUrl: replyTweetUrl,
    promptReplyUrls:
      explicitReplyUrls.length > 0 ? explicitReplyUrls : undefined,
    promptReplyProvider: reply.provider,
    promptReplyEvidence:
      typeof reply.payload.tuziDeepSearchEvidence === 'string'
        ? reply.payload.tuziDeepSearchEvidence
        : undefined,
    sourceTweetText: getTweetText(source.payload),
    twitterUrl: sourceTweetUrl || getTweetUrl(source.payload)
  };

  return {
    ...source,
    payload,
    provider: `${source.provider}+${reply.provider}`,
    promptLength: cleanText(prompt).length,
    score:
      cleanText(prompt).length +
      source.imageCount * 120 +
      source.videoCount * 160 +
      250,
    textLength: cleanText(replyText).length,
    truncated: false
  };
}

function normalizeImportPayload(
  input: Record<string, unknown>
): ImportDraftPayload {
  const prompt = multilineText(input.prompt);
  const imageUrls = normalizeImageUrls(input.imageUrls)
    .map(normalizeImageUrl)
    .filter(Boolean);
  const selectedImageUrl =
    typeof input.selectedImageUrl === 'string' &&
    imageUrls.includes(normalizeImageUrl(input.selectedImageUrl))
      ? normalizeImageUrl(input.selectedImageUrl)
      : imageUrls[0];
  const requestedCategory = cleanText(input.category);
  const inferredCategory = inferCategory(
    [prompt, input.title, Array.isArray(input.tags) ? input.tags.join(' ') : '']
      .map((item) => multilineText(item))
      .filter(Boolean)
      .join('\n')
  );
  const generationSettings =
    input.generationSettings && typeof input.generationSettings === 'object'
      ? (input.generationSettings as Record<string, unknown>)
      : {};
  const hasVideoMedia =
    generationSettings.mediaType === 'video' ||
    (Array.isArray(generationSettings.videoUrls) &&
      generationSettings.videoUrls.length > 0) ||
    typeof generationSettings.videoUrl === 'string';
  const category =
    requestedCategory &&
    requestedCategory !== 'featured' &&
    ALLOWED_CATEGORIES.has(requestedCategory)
      ? requestedCategory
      : hasVideoMedia
        ? 'video'
        : inferredCategory;
  return {
    title: normalizeDraftTitle(input.title, prompt),
    category,
    tags: normalizeTags(input.tags),
    prompt,
    negativePrompt: multilineText(input.negativePrompt) || undefined,
    commercialIntent: multilineText(input.commercialIntent) || undefined,
    generationSettings,
    imageUrls,
    selectedImageUrl,
    memberOnly: input.memberOnly === true,
    reviewNotes: multilineText(input.reviewNotes) || undefined
  };
}

async function fetchTweetSyndication(tweetUrl: string) {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error('无法识别推文 ID');
  const url = new URL('https://cdn.syndication.twimg.com/tweet-result');
  url.searchParams.set('id', tweetId);
  url.searchParams.set('lang', 'zh-cn');
  url.searchParams.set('token', '');
  const result = await fetchJson(
    url,
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'WebToMind prompt case importer'
      }
    },
    '推文提取失败'
  );
  if (result.__typename === 'TweetTombstone') {
    throw new Error('这条推文不可访问或已删除');
  }
  return result;
}

async function fetchTweetForImport(
  tweetUrl: string
): Promise<TweetExtractionResult> {
  const tweetId = extractTweetId(tweetUrl);
  if (!tweetId) throw new Error('无法识别推文 ID');
  const overallDeadlineAt =
    Date.now() +
    getEnvNumber(
      ['X_IMPORT_DEADLINE_MS'],
      X_IMPORT_DEFAULT_DEADLINE_MS,
      X_IMPORT_MAX_DEADLINE_MS
    );

  const errors: string[] = [];
  const candidates: TweetExtractionCandidate[] = [];
  const providers: Array<() => Promise<TweetExtractionResult | null>> = [
    async () => {
      const payload = await fetchTweetWithFxTwitter(tweetUrl);
      return payload ? { payload, provider: 'fxtwitter' } : null;
    },
    async () => {
      const payload = await fetchTweetWithVxTwitter(tweetUrl);
      return payload ? { payload, provider: 'vxtwitter' } : null;
    },
    async () => {
      const payload = await fetchTweetWithAisa(tweetUrl, tweetId);
      return payload ? { payload, provider: 'aisa' } : null;
    },
    async () => {
      const payload = await fetchTweetWithXApi(tweetId);
      return payload ? { payload, provider: 'x-api' } : null;
    },
    async () => {
      const payload = await fetchTweetOEmbed(tweetUrl);
      return payload ? { payload, provider: 'oembed' } : null;
    },
    async () => ({
      payload: await fetchTweetSyndication(tweetUrl),
      provider: 'syndication'
    })
  ];

  for (const provider of providers) {
    if (Date.now() >= overallDeadlineAt) {
      errors.push('推文提取超过总时限');
      break;
    }
    try {
      const result = await provider();
      if (!result) continue;
      const sourceText = getTweetText(result.payload);
      const sourcePrompt = extractPromptText(sourceText);
      const foundAltPrompt = pickTweetImageAltPrompt(result.payload);
      const altPrompt = shouldUseImageAltPrompt(
        sourceText,
        sourcePrompt,
        foundAltPrompt
      )
        ? foundAltPrompt
        : '';
      const altTexts = altPrompt ? getTweetImageAltTexts(result.payload) : [];
      const payload = altPrompt
        ? {
            ...result.payload,
            text: altPrompt,
            full_text: altPrompt,
            rawContent: altPrompt,
            sourceTweetText: sourceText,
            sourceImageAltText: altPrompt,
            sourceImageAltTexts: altTexts,
            promptSource: 'image-alt'
          }
        : result.payload;
      const text = altPrompt || sourceText;
      const prompt = extractPromptText(text);
      const imageCount = getTweetImages(payload).length;
      const videoCount = getTweetVideos(payload).length;
      const truncated = isLikelyTruncatedTweetText(text, prompt);
      const candidate: TweetExtractionCandidate = {
        payload,
        provider: altPrompt ? `${result.provider}+image-alt` : result.provider,
        imageCount,
        promptLength: cleanText(prompt).length,
        score:
          cleanText(prompt).length +
          cleanText(text).length * 0.2 +
          imageCount * 80 -
          (truncated ? 1000 : 0) +
          videoCount * 120,
        textLength: cleanText(text).length,
        truncated,
        videoCount
      };
      candidates.push(candidate);
      if (isConfidentEarlyExitCandidate(candidate)) {
        return { payload: candidate.payload, provider: candidate.provider };
      }
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : 'unknown provider error'
      );
    }
  }

  const replyPromptCandidates: TweetExtractionCandidate[] = [];
  const promptReplySourceCandidates = candidates
    .filter((item) => hasPromptInReplyCue(getTweetText(item.payload)))
    .sort((a, b) => b.imageCount + b.videoCount - (a.imageCount + a.videoCount))
    .slice(0, 1);
  const searchedPromptReplySourceKeys = new Set(
    promptReplySourceCandidates.map(getTweetCandidateKey)
  );
  for (const [index, candidate] of promptReplySourceCandidates.entries()) {
    const reply = await fetchPromptReplyForTweet(candidate.payload, {
      allowTuziDeepSearch: index === 0,
      overallDeadlineAt
    });
    if (reply) {
      replyPromptCandidates.push(mergeTweetWithPromptReply(candidate, reply));
    }
  }
  if (shouldForceTuziReplyPromptSearch(candidates, replyPromptCandidates)) {
    const fallbackSource = pickTuziReplyPromptFallbackSource(
      candidates,
      searchedPromptReplySourceKeys
    );
    if (fallbackSource) {
      const reply = await fetchPromptReplyForTweet(fallbackSource.payload, {
        allowTuziDeepSearch: true,
        forceTuziDeepSearch: true,
        overallDeadlineAt
      });
      if (reply) {
        replyPromptCandidates.push(
          mergeTweetWithPromptReply(fallbackSource, reply)
        );
      }
    }
  }
  candidates.push(...replyPromptCandidates);

  const promptCandidates = candidates.filter(
    (candidate) => candidate.promptLength > 0
  );
  const imagePromptCandidates = promptCandidates.filter(
    (candidate) => candidate.imageCount > 0
  );
  const videoMediaCandidates = candidates.filter(
    (candidate) => candidate.videoCount > 0 && candidate.imageCount > 0
  );
  const best = (
    imagePromptCandidates.length > 0
      ? imagePromptCandidates
      : videoMediaCandidates.length > 0
        ? videoMediaCandidates
        : promptCandidates
  ).sort((a, b) => b.score - a.score)[0];
  if (best) {
    return { payload: best.payload, provider: best.provider };
  }

  const mediaFallback = candidates
    .filter((candidate) => candidate.imageCount > 0 || candidate.videoCount > 0)
    .sort((a, b) => {
      const bMedia = b.imageCount + b.videoCount;
      const aMedia = a.imageCount + a.videoCount;
      if (bMedia !== aMedia) return bMedia - aMedia;
      return b.textLength - a.textLength;
    })[0];
  if (mediaFallback) {
    const fallbackText = getTweetText(mediaFallback.payload);
    const replyPromptMissingReason = hasPromptInReplyCue(fallbackText)
      ? [
          '原帖提示 Prompt 在评论区，但自动搜索没有稳定提取到完整 Prompt。',
          !isAisaXSearchConfigured()
            ? 'AISA_API_KEY/TWITTER_RADAR_AISA_API_KEY 未配置，AISA 评论检索未执行。'
            : '',
          !isTuziXDeepSearchEnabled()
            ? 'Tuzi X DeepSearch 未配置或未启用。'
            : ''
        ]
          .filter(Boolean)
          .join(' ')
      : '原帖没有识别到明确 Prompt。';
    return {
      payload: {
        ...mediaFallback.payload,
        importPromptMissing: true,
        importPromptMissingReason: replyPromptMissingReason
      },
      provider: `${mediaFallback.provider}+media-only`
    };
  }

  throw new Error(errors[0] || '推文提取失败，请改用手动导入');
}

function getTweetText(payload: Record<string, unknown>): string {
  const readTextCandidate = (value: unknown): string => {
    if (typeof value === 'string') return multilineText(value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
    const record = value as Record<string, unknown>;
    return multilineText(record.text || record.full_text || record.fullText);
  };
  const legacy =
    payload.legacy && typeof payload.legacy === 'object'
      ? (payload.legacy as Record<string, unknown>)
      : {};
  const noteTweet =
    payload.note_tweet && typeof payload.note_tweet === 'object'
      ? (payload.note_tweet as Record<string, unknown>)
      : {};
  const noteTweetResults =
    noteTweet.note_tweet_results &&
    typeof noteTweet.note_tweet_results === 'object'
      ? (noteTweet.note_tweet_results as Record<string, unknown>)
      : {};
  const noteTweetResult =
    noteTweetResults.result && typeof noteTweetResults.result === 'object'
      ? (noteTweetResults.result as Record<string, unknown>)
      : {};
  return (
    [
      getXArticleText(payload),
      noteTweet.text,
      noteTweetResult.text,
      payload.text,
      payload.full_text,
      payload.rawContent,
      payload.content,
      payload.raw_text,
      legacy.full_text,
      legacy.text
    ]
      .map(readTextCandidate)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)[0] || ''
  );
}

function getTweetAuthor(payload: Record<string, unknown>) {
  const user =
    payload.user && typeof payload.user === 'object'
      ? (payload.user as Record<string, unknown>)
      : {};
  const author =
    payload.author && typeof payload.author === 'object'
      ? (payload.author as Record<string, unknown>)
      : {};
  const core =
    payload.core && typeof payload.core === 'object'
      ? (payload.core as Record<string, unknown>)
      : {};
  const userResults =
    core.user_results && typeof core.user_results === 'object'
      ? (core.user_results as Record<string, unknown>)
      : {};
  const userResult =
    userResults.result && typeof userResults.result === 'object'
      ? (userResults.result as Record<string, unknown>)
      : {};
  const coreLegacy =
    userResult.legacy && typeof userResult.legacy === 'object'
      ? (userResult.legacy as Record<string, unknown>)
      : {};
  const username = cleanText(
    user.screen_name ||
      user.username ||
      author.screen_name ||
      author.userName ||
      author.username ||
      author.user_name ||
      payload.user_screen_name ||
      coreLegacy.screen_name
  );
  const displayName = cleanText(
    user.name || author.name || payload.user_name || coreLegacy.name
  );
  return {
    username,
    displayName,
    profileUrl: username ? `https://x.com/${username}` : undefined
  };
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value
        .map((item) =>
          item && typeof item === 'object'
            ? (item as Record<string, unknown>)
            : null
        )
        .filter((item): item is Record<string, unknown> => Boolean(item))
    : [];
}

function getNestedRecord(
  value: unknown,
  key: string
): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : undefined;
}

function getTweetMediaItems(payload: Record<string, unknown>) {
  const entities =
    payload.entities && typeof payload.entities === 'object'
      ? (payload.entities as Record<string, unknown>)
      : {};
  const extendedEntities =
    payload.extended_entities && typeof payload.extended_entities === 'object'
      ? (payload.extended_entities as Record<string, unknown>)
      : payload.extendedEntities && typeof payload.extendedEntities === 'object'
        ? (payload.extendedEntities as Record<string, unknown>)
        : {};
  const legacy =
    payload.legacy && typeof payload.legacy === 'object'
      ? (payload.legacy as Record<string, unknown>)
      : {};
  const legacyEntities =
    legacy.entities && typeof legacy.entities === 'object'
      ? (legacy.entities as Record<string, unknown>)
      : {};
  const legacyExtendedEntities =
    legacy.extended_entities && typeof legacy.extended_entities === 'object'
      ? (legacy.extended_entities as Record<string, unknown>)
      : {};
  return [
    ...getXArticleMediaItems(payload),
    ...toRecordArray(payload.mediaDetails),
    ...toRecordArray(payload.media),
    ...toRecordArray(payload.media_extended),
    ...toRecordArray(payload.mediaExtended),
    ...toRecordArray(
      payload.media && typeof payload.media === 'object'
        ? (payload.media as Record<string, unknown>).all
        : undefined
    ),
    ...toRecordArray(
      payload.media && typeof payload.media === 'object'
        ? (payload.media as Record<string, unknown>).photos
        : undefined
    ),
    ...toRecordArray(
      payload.media && typeof payload.media === 'object'
        ? (payload.media as Record<string, unknown>).videos
        : undefined
    ),
    ...toRecordArray(payload.images),
    ...toRecordArray(payload.videos),
    ...toRecordArray(entities.media),
    ...toRecordArray(extendedEntities.media),
    ...toRecordArray(legacyEntities.media),
    ...toRecordArray(legacyExtendedEntities.media)
  ];
}

function getMediaType(item: Record<string, unknown>): string {
  return cleanText(
    item.type || item.media_type || item.mediaType
  ).toLowerCase();
}

function isVideoMediaItem(item: Record<string, unknown>): boolean {
  const type = getMediaType(item);
  return (
    type === 'video' ||
    type === 'animated_gif' ||
    type === 'gif' ||
    Boolean(getNestedRecord(item, 'video_info')) ||
    Boolean(getNestedRecord(item, 'videoInfo')) ||
    Boolean(getNestedRecord(item, 'video')) ||
    isLikelyVideoUrl(item.video_url) ||
    isLikelyVideoUrl(item.videoUrl) ||
    isLikelyVideoUrl(item.playback_url) ||
    isLikelyVideoUrl(item.url)
  );
}

function readAltTextValue(value: unknown): string {
  if (typeof value === 'string') return multilineText(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  return multilineText(
    record.text ||
      record.value ||
      record.label ||
      record.description ||
      record.altText ||
      record.alt_text
  );
}

function getMediaAltText(item: Record<string, unknown>): string {
  const fields = [
    item.altText,
    item.alt_text,
    item.ext_alt_text,
    item.description,
    item.accessibilityLabel,
    item.accessibility_label
  ];
  for (const field of fields) {
    const text = readAltTextValue(field);
    if (text) return text;
  }
  return '';
}

function getTweetImageAltTexts(payload: Record<string, unknown>): string[] {
  const altTexts = getTweetMediaItems(payload)
    .filter((item) => !isVideoMediaItem(item))
    .map(getMediaAltText)
    .filter((text) => cleanText(text).length > 0);
  return Array.from(new Set(altTexts));
}

function pickTweetImageAltPrompt(payload: Record<string, unknown>): string {
  const candidates = getTweetImageAltTexts(payload)
    .map((altText, index) => {
      const prompt = extractPromptText(altText);
      return {
        index,
        prompt,
        score: cleanText(prompt).length
      };
    })
    .filter((candidate) => candidate.score >= 80)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
  return candidates[0]?.prompt || '';
}

function shouldUseImageAltPrompt(
  sourceText: string,
  sourcePrompt: string,
  altPrompt: string
): boolean {
  if (!altPrompt) return false;
  if (!sourcePrompt) return true;
  if (hasPromptInImageAltCue(sourceText)) return true;
  if (hasExplicitPromptMarker(sourceText)) return false;

  const sourcePromptLength = cleanText(sourcePrompt).length;
  const altPromptLength = cleanText(altPrompt).length;
  return (
    altPromptLength >= Math.max(160, sourcePromptLength * 1.35) &&
    looksLikePromptCommand(altPrompt) &&
    !looksLikePromptCommand(sourcePrompt)
  );
}

function getTweetImages(payload: Record<string, unknown>): string[] {
  const mediaItems = getTweetMediaItems(payload);
  const imageUrls = mediaItems
    .map((item) => {
      const isVideo = isVideoMediaItem(item);
      const source = isVideo
        ? item.thumbnail_url ||
          item.thumbnailUrl ||
          item.preview_image_url ||
          item.previewImageUrl ||
          item.image_url ||
          item.imageUrl ||
          item.media_url_https ||
          item.media_url
        : item.media_url_https ||
          item.media_url ||
          item.url ||
          item.preview_image_url ||
          item.image_url ||
          item.thumbnail_url;
      if (!source || isLikelyVideoUrl(source)) return '';
      return normalizeImageUrl(source);
    })
    .filter(Boolean);

  return Array.from(
    new Set(
      imageUrls.concat(
        toRecordArray(payload.mediaURLs)
          .map((item) =>
            isLikelyVideoUrl(item.url || item.media_url_https)
              ? ''
              : normalizeImageUrl(item.url || item.media_url_https)
          )
          .filter(Boolean),
        Array.isArray(payload.mediaURLs)
          ? payload.mediaURLs
              .map((item) =>
                isLikelyVideoUrl(item) ? '' : normalizeImageUrl(item)
              )
              .filter(Boolean)
          : []
      )
    )
  ).slice(0, 8);
}

function getVideoVariantUrls(item: Record<string, unknown>): string[] {
  const directUrls = [
    item.video_url,
    item.videoUrl,
    item.playback_url,
    item.playbackUrl,
    item.content_url,
    item.contentUrl,
    item.url
  ];
  const videoInfo =
    getNestedRecord(item, 'video_info') || getNestedRecord(item, 'videoInfo');
  const video = getNestedRecord(item, 'video');
  const variantRecords = [
    ...toRecordArray(item.variants),
    ...toRecordArray(item.formats),
    ...toRecordArray(item.video_variants),
    ...toRecordArray(item.videoVariants),
    ...toRecordArray(videoInfo?.formats),
    ...toRecordArray(videoInfo?.variants),
    ...toRecordArray(video?.formats),
    ...toRecordArray(video?.variants)
  ];
  const variantUrls = variantRecords
    .sort((a, b) => Number(b.bitrate || 0) - Number(a.bitrate || 0))
    .map((variant) => variant.url || variant.src);
  return Array.from(
    new Set(
      [...directUrls, ...variantUrls]
        .map(normalizeMediaUrl)
        .filter((url) => url && isLikelyVideoUrl(url))
    )
  );
}

function getTweetVideos(payload: Record<string, unknown>): string[] {
  const mediaItems = getTweetMediaItems(payload);
  const itemVideoUrls = mediaItems.flatMap((item) =>
    isVideoMediaItem(item) ? getVideoVariantUrls(item) : []
  );
  const mediaUrlVideoUrls = [
    ...toRecordArray(payload.mediaURLs).map(
      (item) => item.url || item.media_url_https
    ),
    ...(Array.isArray(payload.mediaURLs) ? payload.mediaURLs : [])
  ]
    .map(normalizeMediaUrl)
    .filter((url) => url && isLikelyVideoUrl(url));
  return sortVideoUrlsByPlaybackPreference(
    Array.from(new Set([...itemVideoUrls, ...mediaUrlVideoUrls]))
  ).slice(0, 4);
}

function sortVideoUrlsByPlaybackPreference(urls: string[]): string[] {
  const score = (url: string): number => {
    if (/\.mp4(?:$|[?#])/i.test(url)) return 0;
    if (/\.webm(?:$|[?#])/i.test(url)) return 1;
    if (/\.mov(?:$|[?#])/i.test(url)) return 2;
    if (/\.m3u8(?:$|[?#])/i.test(url)) return 10;
    return 5;
  };
  return [...urls].sort((a, b) => score(a) - score(b));
}

function getVideoExtensionFromContentType(contentType: string | null): string {
  if (contentType?.includes('webm')) return 'webm';
  if (contentType?.includes('quicktime')) return 'mov';
  return 'mp4';
}

function getImportVideoCandidateUrls(
  settings: Record<string, unknown>
): string[] {
  return sortVideoUrlsByPlaybackPreference(
    Array.from(
      new Set(
        [
          ...(Array.isArray(settings.videoUrls) ? settings.videoUrls : []),
          settings.videoUrl
        ]
          .map((url) => (typeof url === 'string' ? url.trim() : ''))
          .filter((url) => url && isLikelyVideoUrl(url))
      )
    )
  ).filter((url) => !/\.m3u8(?:$|[?#])/i.test(url));
}

async function mirrorImportedTweetVideo(
  sb: SupabaseClient,
  videoUrls: string[],
  tweetId: string
): Promise<string | null> {
  const storage = createMediaStorageAdapter({
    supabase: sb,
    defaultBucket: process.env.GENERATED_VIDEO_BUCKET || 'user-generated-videos'
  });
  const mirrorDeadlineAt = Date.now() + IMPORTED_VIDEO_MIRROR_DEADLINE_MS;

  for (const videoUrl of videoUrls.slice(0, 3)) {
    const remainingMs = mirrorDeadlineAt - Date.now();
    if (remainingMs < 1000) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetch(videoUrl, { signal: controller.signal });
      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || 'video/mp4';
      if (!/^video\//i.test(contentType)) continue;

      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > IMPORTED_VIDEO_MAX_BYTES) continue;

      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > IMPORTED_VIDEO_MAX_BYTES) continue;

      const extension = getVideoExtensionFromContentType(contentType);
      const key = `prompt-case-imports/x/${tweetId || 'tweet'}/${crypto.randomUUID()}.${extension}`;
      const record = await storage.putObject({
        key,
        body: bytes,
        contentType,
        cacheControl: '31536000',
        byteSize: bytes.byteLength
      });
      return (
        (await storage.signReadUrl({
          locator: {
            provider: record.provider,
            bucket: record.bucket,
            key: record.key
          },
          expiresIn: IMPORTED_VIDEO_SIGNED_URL_EXPIRES_IN,
          fallbackUrl: record.publicUrl
        })) ||
        record.publicUrl ||
        null
      );
    } catch (error) {
      console.warn('[AdminPromptCaseDraftImport] video mirror skipped:', error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

async function mirrorDraftVideoForPreview(
  sb: SupabaseClient | null,
  draft: ImportDraftPayload
): Promise<ImportDraftPayload> {
  if (!sb) return draft;
  const settings = draft.generationSettings || {};
  const sourceVideoUrls = getImportVideoCandidateUrls(settings);
  if (sourceVideoUrls.length === 0) return draft;

  const sourceExternalId =
    typeof settings.sourceExternalId === 'string'
      ? settings.sourceExternalId
      : '';
  const mirroredUrl = await mirrorImportedTweetVideo(
    sb,
    sourceVideoUrls,
    sourceExternalId
  );
  if (!mirroredUrl) return draft;

  const videoUrls = Array.from(new Set([mirroredUrl, ...sourceVideoUrls]));
  return {
    ...draft,
    generationSettings: {
      ...settings,
      videoUrl: mirroredUrl,
      videoUrls,
      sourceVideoUrls,
      importedVideoMirrored: true
    },
    reviewNotes: [draft.reviewNotes || '', `mirroredVideoUrl: ${mirroredUrl}`]
      .filter(Boolean)
      .join('\n')
  };
}

function mapTweetToImportDraft(
  payload: Record<string, unknown>,
  sourceUrl: string,
  extractionProvider: string
): ImportDraftPayload {
  const text = getTweetText(payload);
  const promptParts = splitPromptAndNegativePrompt(extractPromptText(text));
  const prompt = promptParts.prompt;
  const author = getTweetAuthor(payload);
  const imageUrls = getTweetImages(payload);
  const videoUrls = getTweetVideos(payload);
  const tweetId = extractTweetId(
    payload.id ||
      payload.rest_id ||
      payload.tweet_id ||
      payload.tweetID ||
      sourceUrl
  );
  const sourceTweetUrl = normalizeTweetUrl(sourceUrl);
  const sourceTweetText = multilineText(payload.sourceTweetText);
  const caseContext = multilineText(
    [sourceTweetText || text, prompt].filter(Boolean).join('\n\n')
  );
  const title = buildImportedTweetTitle(sourceTweetText || text, prompt);
  const model = inferModel(caseContext);
  const isVideo = videoUrls.length > 0;
  const category = isVideo ? 'video' : inferCategory(caseContext);
  const importPromptMissing = payload.importPromptMissing === true;
  const importPromptMissingReason = multilineText(
    payload.importPromptMissingReason
  );
  const promptReplyUrls = Array.isArray(payload.promptReplyUrls)
    ? payload.promptReplyUrls.filter(
        (url): url is string => typeof url === 'string'
      )
    : [];
  const sourceImageAltTexts = Array.isArray(payload.sourceImageAltTexts)
    ? payload.sourceImageAltTexts.filter(
        (text): text is string => typeof text === 'string' && text.length > 0
      )
    : [];
  return {
    title,
    category,
    tags: buildImportedTweetTags(caseContext || `${text}\n${prompt}`, isVideo),
    prompt,
    negativePrompt: promptParts.negativePrompt,
    commercialIntent: isVideo
      ? 'X/Twitter 视频案例导入，待人工补全 Prompt 并整理为可复用 Prompt Case。'
      : 'X/Twitter 图片生成案例导入，待人工整理为可复用 Prompt Case。',
    generationSettings: {
      model,
      imageSize: 'unknown',
      imageCount: imageUrls.length || 1,
      mediaType: isVideo ? 'video' : 'image',
      videoUrl: videoUrls[0] || undefined,
      videoUrls,
      source: 'x',
      sourceUrl: sourceTweetUrl,
      sourceExternalId: tweetId || null,
      sourceAuthor: author,
      sourceText: text,
      sourceTweetText:
        typeof payload.sourceTweetText === 'string'
          ? payload.sourceTweetText
          : undefined,
      sourcePromptReplyUrl:
        typeof payload.promptReplyUrl === 'string'
          ? payload.promptReplyUrl
          : undefined,
      sourcePromptReplyUrls:
        promptReplyUrls.length > 0 ? promptReplyUrls : undefined,
      sourcePromptReplyProvider:
        typeof payload.promptReplyProvider === 'string'
          ? payload.promptReplyProvider
          : undefined,
      sourcePromptReplyEvidence:
        typeof payload.promptReplyEvidence === 'string'
          ? payload.promptReplyEvidence
          : undefined,
      sourcePromptSource:
        typeof payload.promptSource === 'string'
          ? payload.promptSource
          : undefined,
      sourceImageAltText:
        typeof payload.sourceImageAltText === 'string'
          ? payload.sourceImageAltText
          : undefined,
      sourceImageAltTexts:
        sourceImageAltTexts.length > 0 ? sourceImageAltTexts : undefined,
      extractionWarning:
        importPromptMissingReason ||
        (importPromptMissing ? '未能自动识别完整 Prompt。' : undefined),
      extractionProvider,
      importedFrom: 'prompt-case-admin-import'
    },
    imageUrls,
    selectedImageUrl: imageUrls[0],
    memberOnly: false,
    reviewNotes: [
      '案例管理页从 X/Twitter 链接提取的草稿。发布前需要人工确认版权、作者来源、模型、提示词完整性和图片可用性。',
      `sourceUrl: ${sourceTweetUrl}`,
      `extractionProvider: ${extractionProvider}`,
      importPromptMissing
        ? `promptExtractionWarning: ${
            importPromptMissingReason ||
            '未能自动识别完整 Prompt，请人工补齐后再保存。'
          }`
        : '',
      hasPromptInReplyCue(text) && !prompt
        ? 'promptCue: 原帖提示 Prompt 在评论区。'
        : '',
      videoUrls.length > 0 ? `sourceVideoUrls: ${videoUrls.join(', ')}` : '',
      typeof payload.promptReplyUrl === 'string'
        ? `sourcePromptReplyUrl: ${payload.promptReplyUrl}`
        : '',
      promptReplyUrls.length > 1
        ? `sourcePromptReplyUrls: ${promptReplyUrls.join(', ')}`
        : '',
      typeof payload.promptReplyEvidence === 'string'
        ? `sourcePromptReplyEvidence: ${payload.promptReplyEvidence}`
        : '',
      typeof payload.promptSource === 'string'
        ? `sourcePromptSource: ${payload.promptSource}`
        : '',
      typeof payload.sourceImageAltText === 'string'
        ? `sourceImageAltText: ${payload.sourceImageAltText.slice(0, 1200)}`
        : '',
      author.username ? `sourceAuthor: @${author.username}` : '',
      typeof payload.sourceTweetText === 'string'
        ? `sourceTweetText: ${payload.sourceTweetText.slice(0, 1200)}`
        : '',
      text ? `sourceText: ${text.slice(0, 1200)}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  };
}

function hasVideoDraftMedia(payload: ImportDraftPayload): boolean {
  const settings = payload.generationSettings || {};
  const videoUrls = [
    ...(Array.isArray(settings.videoUrls) ? settings.videoUrls : []),
    ...(Array.isArray(settings.sourceVideoUrls)
      ? settings.sourceVideoUrls
      : []),
    settings.videoUrl,
    settings.sourceVideoUrl
  ]
    .map((url) => (typeof url === 'string' ? url.trim() : ''))
    .filter(Boolean);
  return settings.mediaType === 'video' || videoUrls.length > 0;
}

function validateCreatePayload(payload: ImportDraftPayload): string | null {
  if (!payload.title) return 'title is required';
  if (!payload.prompt && !hasVideoDraftMedia(payload))
    return 'prompt is required';
  if (!ALLOWED_CATEGORIES.has(payload.category)) return 'invalid category';
  if (payload.imageUrls.length === 0)
    return 'at least one imageUrl is required';
  return null;
}

export const __promptCaseDraftImportTestUtils = {
  buildImportedTweetTitle,
  buildTitle,
  extractPromptText,
  fetchTweetForImport,
  hasPromptInReplyCue,
  inferCategory,
  isLikelyTruncatedTweetText,
  mapTweetToImportDraft,
  splitPromptAndNegativePrompt
};

export default async function handler(request: Request) {
  const corsHeaders = getCorsHeadersForRequest(request);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, corsHeaders, 405);
  }

  const admin = await assertPromptCaseAdmin(request);
  if (!admin.ok) {
    return jsonResponse(
      { error: admin.error || 'Prompt case admin access required' },
      corsHeaders,
      admin.status
    );
  }

  const input = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const action = cleanText(input.action);

  if (action === 'extractTweet') {
    const tweetUrl = normalizeTweetUrl(input.tweetUrl);
    if (!tweetUrl) {
      return jsonResponse(
        { error: '请粘贴有效的 X/Twitter 推文链接' },
        corsHeaders,
        400
      );
    }
    try {
      const result = await fetchTweetForImport(tweetUrl);
      const draft = await mirrorDraftVideoForPreview(
        getSupabaseAdmin(),
        mapTweetToImportDraft(result.payload, tweetUrl, result.provider)
      );
      return jsonResponse({ draft }, corsHeaders);
    } catch (error) {
      console.error(
        '[AdminPromptCaseDraftImport] tweet extract failed:',
        error
      );
      return jsonResponse(
        {
          error:
            error instanceof Error
              ? error.message
              : '推文提取失败，请改用手动导入'
        },
        corsHeaders,
        502
      );
    }
  }

  if (action !== 'createDraft') {
    return jsonResponse({ error: 'Invalid import action' }, corsHeaders, 400);
  }

  const sb = getSupabaseAdmin();
  if (!sb) {
    return jsonResponse(
      { error: 'Supabase admin is not configured' },
      corsHeaders,
      500
    );
  }

  const draftInput =
    input.draft && typeof input.draft === 'object'
      ? (input.draft as Record<string, unknown>)
      : {};
  const payload = normalizeImportPayload(draftInput);
  const validationError = validateCreatePayload(payload);
  if (validationError) {
    return jsonResponse({ error: validationError }, corsHeaders, 400);
  }

  const { data, error } = await sb
    .from('prompt_case_drafts')
    .insert({
      package_slug: null,
      source_skill: 'prompt-case-admin-import',
      title: payload.title,
      category: payload.category,
      tags: payload.tags,
      prompt: payload.prompt,
      negative_prompt: payload.negativePrompt || null,
      prompt_preview: derivePromptPreview(payload.prompt),
      commercial_intent: payload.commercialIntent || null,
      generation_settings: {
        model: 'gpt-image-2',
        imageSize: '1024x1536',
        quality: 'auto',
        imageCount: payload.imageUrls.length,
        ...payload.generationSettings
      },
      image_urls: payload.imageUrls,
      selected_image_url: payload.selectedImageUrl || payload.imageUrls[0],
      member_only: payload.memberOnly,
      status: 'draft',
      review_notes: payload.reviewNotes || null,
      created_by_email: admin.email || PROMPT_CASE_ADMIN_EMAIL
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingPromptCaseDraftsTable(error)) {
      return getMissingPromptDraftsResponse(corsHeaders);
    }
    console.error('[AdminPromptCaseDraftImport] create failed:', error);
    return jsonResponse(
      { error: 'Failed to create prompt case draft' },
      corsHeaders,
      500
    );
  }

  return jsonResponse(
    { draft: await mapPromptCaseDraftWithFreshImages(sb, data) },
    corsHeaders,
    201
  );
}
