import os

src = 'src/background/message-handler.ts'
with open(src, 'r', encoding='utf-8') as f:
    text = f.read()

def get_block(start_str, end_str):
    start = text.find(start_str)
    if start == -1: return ""
    if end_str:
        end = text.find(end_str, start)
        if end == -1: end = len(text)
    else:
        end = len(text)
    return text[start:end]

# Extract blocks
ai_part1 = get_block("export async function handleSummarize", "export async function handleGetConfig")
ai_part2 = get_block("export async function handleChatWithContext", "// ==================== 对话历史相关处理器 ====================")
config_part = get_block("export async function handleGetConfig", "export async function handleSmartLogin")
auth_part1 = get_block("export async function handleSmartLogin", "export async function handleSaveSummary")
ws_part = get_block("export async function handleSaveSummary", "export async function handleChatWithContext")
conv_part = get_block("// ==================== 对话历史相关处理器 ====================", "// ==================== 快捷指令相关处理器 ====================")
short_part = get_block("// ==================== 快捷指令相关处理器 ====================", "export async function handleSyncToCloud")
sync_part = get_block("export async function handleSyncToCloud", "export async function handleFetchImage")
image_part = get_block("export async function handleFetchImage", "async function handleSavingStarted")
save_notif_part = get_block("async function handleSavingStarted", "// ==================== 积分系统相关处理器 ====================")
sys_part = sync_part + save_notif_part
credits_part = get_block("// ==================== 积分系统相关处理器 ====================", "export async function handleMessage")
master_handler = get_block("export async function handleMessage", None)

os.makedirs('src/background/handlers', exist_ok=True)

def write_f(name, imports, code):
    with open(f'src/background/handlers/{name}.ts', 'w', encoding='utf-8') as f:
        f.write(imports + "\n\n" + code)

write_f("ai", """import { AIServiceFactory } from '@/services/ai-factory';
import { ConfigManager } from '@/services/config';
import { RateLimiter } from '@/services/rate-limiter';
import { loggers } from '@/utils/logger';
import type { SummaryOptions } from '@/types';
import type { MessageResponse, StreamChunkData, AIServiceExtended, ChatResultLike } from '../message-types';
import { MessageType } from '../message-types';

const log = loggers.messageHandler;
const rateLimiter = new RateLimiter();
""", ai_part1 + ai_part2)

write_f("config", """import { ConfigManager } from '@/services/config';
import { loggers } from '@/utils/logger';
import type { AIConfig } from '@/types/ai';
import type { MessageResponse } from '../message-types';

const log = loggers.messageHandler;
""", config_part)

write_f("auth", """import { APP_URLS, URL_PATTERNS } from '@/utils/constants';
import { loggers } from '@/utils/logger';
import { broadcastAuthStateChanged } from '@/utils/chrome-helpers';
import { getAuthState, getAccessToken, getValidAccessToken, loginWithToken, requestTokenRefresh } from '@/services/auth';
import type { MessageResponse, SmartLoginData } from '../message-types';

const log = loggers.messageHandler;
""", auth_part1)

write_f("workspace", """import { DatabaseService } from '@/services/database';
import * as CloudStorage from '@/services/cloud-storage';
import { getValidAccessToken, getAccessToken, requestTokenRefresh } from '@/services/auth';
import { APP_URLS, URL_PATTERNS } from '@/utils/constants';
import { loggers } from '@/utils/logger';
import type { MessageResponse, SaveSummaryData, UpdateSummaryData } from '../message-types';

const log = loggers.messageHandler;
""", ws_part)

write_f("conversation", """import { DatabaseService, ChatMessage } from '@/services/database';
import { loggers } from '@/utils/logger';
import type { MessageResponse } from '../message-types';

const log = loggers.messageHandler;
""", conv_part)

write_f("shortcut", """import { DatabaseService, Shortcut } from '@/services/database';
import * as CloudStorage from '@/services/cloud-storage';
import { loggers } from '@/utils/logger';
import type { MessageResponse } from '../message-types';

const log = loggers.messageHandler;
""", short_part)

write_f("image", """import { loggers } from '@/utils/logger';
import type { MessageResponse } from '../message-types';

const log = loggers.messageHandler;
const MAX_BATCH_IMAGE_COUNT = 100;
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_IMAGE_DOMAINS = [
  'webtomind.com', 'www.webtomind.com', 'supabase.co', 'supabase.com',
  'imgur.com', 'i.imgur.com', 'unsplash.com', 'images.unsplash.com',
  'pbs.twimg.com', 'abs.twimg.com', 'mmbiz.qpic.cn', 'mmbiz.qlogo.cn',
  'wx.qlogo.cn', 'res.wx.qq.com', 'qpic.cn', 'avatars.githubusercontent.com',
  'raw.githubusercontent.com', 'oaidalleapiprodscus.blob.core.windows.net',
  'replicate.delivery', 'localhost', '127.0.0.1'
];

export function isAllowedImageDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    return ALLOWED_IMAGE_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}
""", image_part)

write_f("system", """import * as CloudStorage from '@/services/cloud-storage';
import { URL_PATTERNS } from '@/utils/constants';
import { loggers } from '@/utils/logger';
import { getContentScriptFilePath } from '../content-script-path';
import type { MessageResponse, SavingStartedData, SavingFailedData } from '../message-types';

const log = loggers.messageHandler;
""", sys_part)

write_f("credits", """import { getValidAccessToken, getAccessToken } from '@/services/auth';
import { APP_URLS } from '@/utils/constants';
import { loggers } from '@/utils/logger';
import type { MessageResponse, ConsumeCreditsRequest, PaginationParams, ConsumeCreditsApiResult, CreditPackagesApiResult } from '../message-types';

const log = loggers.messageHandler;
""", credits_part)

# Master index export logic
master_imports = """import { MessageType, Message, MessageResponse, SmartLoginData } from './message-types';
import { loggers } from '@/utils/logger';
import { getAuthState, getValidAccessToken, getAccessToken } from '@/services/auth';

import { handleSummarize, handleChatWithContext, handleGenerateImage, handleSmartChat, handleSmartChatStream } from './handlers/ai';
import { handleGetConfig, handleSaveConfig, handleOpenSidePanel } from './handlers/config';
import { handleSmartLogin } from './handlers/auth';
import { handleSaveSummary, handleGetProjects, handleGetAllSummaries, handleDeleteSummary, handleUpdateSummary } from './handlers/workspace';
import { handleSaveConversation, handleGetAllConversations, handleGetConversation, handleDeleteConversation, handleUpdateConversation } from './handlers/conversation';
import { handleSaveShortcut, handleGetAllShortcuts, handleUpdateShortcut, handleDeleteShortcut, handleReorderShortcuts } from './handlers/shortcut';
import { handleFetchImage, handleFetchImagesBatch } from './handlers/image';
import { handleSyncToCloud } from './handlers/system';

const log = loggers.messageHandler;
// Note: Some handlers are not directly imported here because they were internal like `handleCheckSummaryReady`, `handleSavingStarted`, etc. 
// You will need to export them in the handlers if they are used by handleMessage.
"""

new_main_content = master_imports + "\n\n" + master_handler

with open('src/background/message-handler.ts.new', 'w', encoding='utf-8') as f:
    f.write(new_main_content)

print('Split complete. Please check the files and run pnpm type-check.')
