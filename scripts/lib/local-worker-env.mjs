function configured(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed.includes('placeholder')) return '';
  return trimmed;
}

export function configureLocalMediaStorageEnv(env = process.env) {
  const explicitProvider = configured(env.MEDIA_STORAGE_PROVIDER);
  if (explicitProvider) {
    return { provider: explicitProvider, source: 'explicit' };
  }

  const hasPublicR2Url = Boolean(configured(env.MEDIA_PUBLIC_BASE_URL));
  const hasR2SigningConfig = Boolean(
    configured(env.R2_S3_ENDPOINT) &&
    configured(env.R2_ACCESS_KEY_ID) &&
    configured(env.R2_SECRET_ACCESS_KEY) &&
    configured(env.MEDIA_R2_BUCKET)
  );
  const provider = hasPublicR2Url || hasR2SigningConfig ? 'dual' : 'supabase';
  env.MEDIA_STORAGE_PROVIDER = provider;
  return {
    provider,
    source: provider === 'supabase' ? 'local-signed-url-fallback' : 'r2-config'
  };
}
