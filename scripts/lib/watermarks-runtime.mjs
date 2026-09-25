export function assertWatermarksRuntimeEnv(
  env = process.env,
  { production = false } = {}
) {
  const mode = String(env.WATERMARKS_SERVICE_MODE || 'http')
    .trim()
    .toLowerCase();
  const url = String(env.WATERMARKS_SERVICE_URL || '').trim();
  const apiKey = String(env.WATERMARKS_SERVICE_API_KEY || '').trim();

  if (mode === 'container') {
    if (!apiKey) {
      throw new Error(
        'AI marks container runtime requires WATERMARKS_SERVICE_API_KEY.'
      );
    }
    if (apiKey.length < 32) {
      throw new Error(
        'WATERMARKS_SERVICE_API_KEY must contain at least 32 characters.'
      );
    }
    if (production && apiKey.startsWith('local-')) {
      throw new Error(
        'A local watermarks API key cannot be used for production deployment.'
      );
    }
    return {
      mode,
      url: 'cloudflare-container://watermarks-remover',
      apiKey
    };
  }

  if (mode !== 'http') {
    throw new Error(
      'WATERMARKS_SERVICE_MODE must be either container or http.'
    );
  }

  if (!url || !apiKey) {
    throw new Error(
      'AI marks production runtime requires WATERMARKS_SERVICE_URL and WATERMARKS_SERVICE_API_KEY.'
    );
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('WATERMARKS_SERVICE_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('WATERMARKS_SERVICE_URL must use http or https.');
  }
  if (production && parsedUrl.protocol !== 'https:') {
    throw new Error(
      'Production WATERMARKS_SERVICE_URL must use HTTPS, including private service endpoints.'
    );
  }
  if (apiKey.length < 32) {
    throw new Error(
      'WATERMARKS_SERVICE_API_KEY must contain at least 32 characters.'
    );
  }
  if (production && apiKey.startsWith('local-')) {
    throw new Error(
      'A local watermarks API key cannot be used for production deployment.'
    );
  }

  return { mode, url: parsedUrl.toString().replace(/\/$/, ''), apiKey };
}
