import { createHash } from 'node:crypto';

const DEFAULT_VERSION_LENGTH = 16;

export function getPromptAssetContentVersion(
  bytes,
  length = DEFAULT_VERSION_LENGTH
) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, length);
}

export function versionPromptAssetPublicUrl(publicUrl, bytes) {
  const url = new URL(publicUrl);
  url.searchParams.set('v', getPromptAssetContentVersion(bytes));
  return url.toString();
}
