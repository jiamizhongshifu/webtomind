import os
import re

def fix_file(filepath, replacements):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    for old, new in replacements:
        content = content.replace(old, new)
    # Also blindly replace 'async function' with 'export async function' for all handlers
    # But only if it's not already exported
    content = re.sub(r'^(?!export\s)(async function handle)', r'export \1', content, flags=re.MULTILINE)
    content = re.sub(r'^(?!export\s)(async function callCreditsApi)', r'export \1', content, flags=re.MULTILINE)
    content = re.sub(r'^(?!export\s)(async function consumeQuickReplyQuotaFallback)', r'export \1', content, flags=re.MULTILINE)
    content = re.sub(r'^(?!export\s)(function broadcastCreditsChanged)', r'export \1', content, flags=re.MULTILINE)
    content = re.sub(r'^(?!export\s)(async function sendMessageWithRetry)', r'export \1', content, flags=re.MULTILINE)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('src/background/handlers/workspace.ts', [])
fix_file('src/background/handlers/system.ts', [])
fix_file('src/background/handlers/credits.ts', [])

# Now let's completely rewrite message-handler.ts imports
message_handler = 'src/background/message-handler.ts'
with open(message_handler, 'r', encoding='utf-8') as f:
    content = f.read()

# Make sure we re-export everything from message-types
new_imports = """export * from './message-types';
import { MessageType, Message, MessageResponse, SmartLoginData } from './message-types';
import { loggers } from '@/utils/logger';
import { APP_URLS, URL_PATTERNS } from '@/utils/constants';
import { getAuthState, getValidAccessToken, getAccessToken, requestTokenRefresh } from '@/services/auth';

export * from './handlers/ai';
export * from './handlers/config';
export * from './handlers/auth';
export * from './handlers/workspace';
export * from './handlers/conversation';
export * from './handlers/shortcut';
export * from './handlers/image';
export * from './handlers/system';
export * from './handlers/credits';

import { handleSummarize, handleChatWithContext, handleGenerateImage, handleSmartChat, handleSmartChatStream } from './handlers/ai';
import { handleGetConfig, handleSaveConfig, handleOpenSidePanel } from './handlers/config';
import { handleSmartLogin } from './handlers/auth';
import { handleSaveSummary, handleGetProjects, handleCheckSummaryReady, handleGetAllSummaries, handleDeleteSummary, handleUpdateSummary } from './handlers/workspace';
import { handleSaveConversation, handleGetAllConversations, handleGetConversation, handleDeleteConversation, handleUpdateConversation } from './handlers/conversation';
import { handleSaveShortcut, handleGetAllShortcuts, handleUpdateShortcut, handleDeleteShortcut, handleReorderShortcuts } from './handlers/shortcut';
import { handleFetchImage, handleFetchImagesBatch } from './handlers/image';
import { handleSyncToCloud, handleSavingStarted, handleSavingFailed } from './handlers/system';
import { handleGetCreditsBalance, handleConsumeCredits, handleConsumeQuickReplyQuota, handleDailyCheckin, handleGetCreditTransactions, callCreditsApi } from './handlers/credits';
import { CreditPackagesApiResult } from './message-types';

const log = loggers.messageHandler;
"""

# Replace the top imports
content = re.sub(r'^.*?const log = loggers\.messageHandler;', new_imports, content, flags=re.DOTALL)

with open(message_handler, 'w', encoding='utf-8') as f:
    f.write(content)
