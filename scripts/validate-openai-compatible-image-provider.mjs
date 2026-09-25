#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_ERROR_BODY_LENGTH = 800;

const ENV_KEYS = {
  baseUrl: ['OPENAI_IMAGE_API_BASE_URL', 'OPENAI_BASE_URL'],
  apiKey: ['OPENAI_IMAGE_API_KEY', 'OPENAI_API_KEY'],
  model: ['OPENAI_IMAGE_MODEL']
};

export class OpenAICompatibleImageProviderValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'OpenAICompatibleImageProviderValidationError';
    this.details = details;
  }
}

function fail(message, details) {
  throw new OpenAICompatibleImageProviderValidationError(message, details);
}

function cleanProviderEnvValue(value) {
  return String(value || '')
    .replace(/\\n/g, '')
    .replace(/\n/g, '')
    .trim();
}

function firstConfiguredEnv(env, keys) {
  for (const key of keys) {
    const value = cleanProviderEnvValue(env[key]);
    if (value) return { key, value };
  }
  return { key: keys[0], value: '' };
}

export function maskSecret(value) {
  const normalized = cleanProviderEnvValue(value);
  if (!normalized) return '(missing)';
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}...`;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function normalizeOpenAICompatibleBaseUrl(value) {
  const normalized = cleanProviderEnvValue(value).replace(/\/+$/g, '');
  if (!normalized) fail('OpenAI-compatible image API base URL is required');

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    fail('OpenAI-compatible image API base URL is invalid', {
      baseUrl: normalized
    });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail('OpenAI-compatible image API base URL must be http(s)', {
      protocol: parsed.protocol
    });
  }

  return normalized;
}

export function buildModelsUrl(baseUrl) {
  const normalizedBaseUrl = normalizeOpenAICompatibleBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/models`;
}

export function resolveOpenAICompatibleImageProviderEnv(env = process.env) {
  const baseUrl = firstConfiguredEnv(env, ENV_KEYS.baseUrl);
  const apiKey = firstConfiguredEnv(env, ENV_KEYS.apiKey);
  const model = firstConfiguredEnv(env, ENV_KEYS.model);

  if (!baseUrl.value) {
    fail('Missing OPENAI_IMAGE_API_BASE_URL or OPENAI_BASE_URL');
  }
  if (!apiKey.value) {
    fail('Missing OPENAI_IMAGE_API_KEY or OPENAI_API_KEY');
  }
  if (!model.value) {
    fail('Missing OPENAI_IMAGE_MODEL');
  }

  return {
    baseUrl: normalizeOpenAICompatibleBaseUrl(baseUrl.value),
    baseUrlEnvKey: baseUrl.key,
    apiKey: apiKey.value,
    apiKeyEnvKey: apiKey.key,
    model: model.value,
    modelEnvKey: model.key
  };
}

export function parseOpenAIModelsPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    fail('/models response JSON must be an object');
  }

  if (!Array.isArray(payload.data)) {
    fail('/models response JSON must include a data array', {
      object: payload.object,
      keys: Object.keys(payload)
    });
  }

  const modelIds = [];
  const invalidItems = [];

  payload.data.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      invalidItems.push({ index, reason: 'not_object' });
      return;
    }
    if (typeof item.id !== 'string' || !item.id.trim()) {
      invalidItems.push({ index, reason: 'missing_id' });
      return;
    }
    modelIds.push(item.id.trim());
  });

  if (invalidItems.length > 0) {
    fail('/models response data contains invalid model entries', {
      invalidItems
    });
  }

  return Array.from(new Set(modelIds));
}

export function validateOpenAIModelsDiscoveryPayload(payload, configuredModel) {
  const model = String(configuredModel || '').trim();
  if (!model) fail('Configured OPENAI_IMAGE_MODEL is required');

  const modelIds = parseOpenAIModelsPayload(payload);
  const configuredModelExists = modelIds.includes(model);
  const nonUserModels = modelIds.filter((id) => id !== model);

  if (!configuredModelExists) {
    fail('Configured OPENAI_IMAGE_MODEL was not returned by /models', {
      configuredModel: model,
      returnedModels: modelIds
    });
  }

  return {
    configuredModel: model,
    configuredModelExists,
    modelIds,
    nonUserModels
  };
}

function readResponseBodySnippet(text) {
  return text.length > MAX_ERROR_BODY_LENGTH
    ? `${text.slice(0, MAX_ERROR_BODY_LENGTH)}...`
    : text;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    fail('/models request did not return HTTP 200', {
      status: response.status,
      statusText: response.statusText,
      body: readResponseBodySnippet(text)
    });
  }

  try {
    return JSON.parse(text);
  } catch {
    fail('/models response was not valid JSON', {
      body: readResponseBodySnippet(text)
    });
  }
}

export async function discoverOpenAICompatibleImageProvider({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== 'function') {
    fail('Global fetch is unavailable; run this script with Node 18+');
  }

  const config = resolveOpenAICompatibleImageProviderEnv(env);
  const modelsUrl = buildModelsUrl(config.baseUrl);
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(modelsUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: 'application/json'
      },
      signal: abortController.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      fail('/models request timed out', { timeoutMs });
    }
    fail('/models request failed', {
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await readJsonResponse(response);
  const validation = validateOpenAIModelsDiscoveryPayload(
    payload,
    config.model
  );

  logger.log('# OpenAI-compatible image provider discovery');
  logger.log(`Base URL: ${config.baseUrl} (${config.baseUrlEnvKey})`);
  logger.log(`Models URL: ${modelsUrl}`);
  logger.log(`API key: present via ${config.apiKeyEnvKey}`);
  logger.log(`Configured model: ${config.model} (${config.modelEnvKey})`);
  logger.log(`Returned models: ${validation.modelIds.length}`);
  logger.log(`Configured model found: ${validation.configuredModel}`);

  if (validation.nonUserModels.length > 0) {
    logger.log(
      `Non-user models returned (not failing): ${validation.nonUserModels.join(
        ', '
      )}`
    );
  } else {
    logger.log('Non-user models returned (not failing): none');
  }

  return {
    config: {
      baseUrl: config.baseUrl,
      baseUrlEnvKey: config.baseUrlEnvKey,
      apiKeyEnvKey: config.apiKeyEnvKey,
      maskedApiKey: maskSecret(config.apiKey),
      model: config.model,
      modelEnvKey: config.modelEnvKey
    },
    modelsUrl,
    ...validation
  };
}

function isDirectRun() {
  return (
    Boolean(process.argv[1]) &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}

if (isDirectRun()) {
  try {
    await discoverOpenAICompatibleImageProvider();
  } catch (error) {
    console.error(
      `OpenAI-compatible image provider discovery failed: ${error.message}`
    );
    if (error.details) {
      console.error(JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }
}
