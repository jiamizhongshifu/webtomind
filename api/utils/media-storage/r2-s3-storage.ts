import type {
  MediaObjectLocator,
  MediaObjectRecord,
  MediaStorageAdapter,
  PutMediaObjectInput,
  SignReadUrlInput
} from './types.js';

interface R2S3Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
}

const encoder = new TextEncoder();

function getEnv(name: string): string {
  return typeof process !== 'undefined' ? process.env[name] || '' : '';
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function sha256Hex(value: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof value === 'string'
      ? encoder.encode(value)
      : value instanceof Uint8Array
        ? value
        : new Uint8Array(value);
  return toHex(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)));
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, value: string) {
  const rawKey = key instanceof Uint8Array ? toArrayBuffer(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

async function getSigningKey(secret: string, date: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(encoder.encode(`AWS4${secret}`), date);
  const kRegion = await hmacSha256(kDate, 'auto');
  const kService = await hmacSha256(kRegion, 's3');
  return hmacSha256(kService, 'aws4_request');
}

function formatAmzDate(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function encodeKey(key: string): string {
  return key
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

async function toUint8Array(
  body: PutMediaObjectInput['body']
): Promise<Uint8Array> {
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (body instanceof Blob) return new Uint8Array(await body.arrayBuffer());
  return new Uint8Array(body);
}

function buildConfig(): R2S3Config | null {
  const bucket =
    getEnv('MEDIA_R2_BUCKET') || getEnv('R2_BUCKET_NAME') || getEnv('MEDIA_BUCKET_NAME');
  const accessKeyId = getEnv('R2_ACCESS_KEY_ID') || getEnv('MEDIA_R2_ACCESS_KEY_ID');
  const secretAccessKey =
    getEnv('R2_SECRET_ACCESS_KEY') || getEnv('MEDIA_R2_SECRET_ACCESS_KEY');
  const endpoint =
    getEnv('R2_S3_ENDPOINT') ||
    getEnv('MEDIA_R2_ENDPOINT') ||
    (getEnv('CLOUDFLARE_ACCOUNT_ID')
      ? `https://${getEnv('CLOUDFLARE_ACCOUNT_ID')}.r2.cloudflarestorage.com`
      : '');
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return {
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint: normalizeEndpoint(endpoint),
    publicBaseUrl: getEnv('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '')
  };
}

async function signHeadersRequest(input: {
  config: R2S3Config;
  method: string;
  bucket: string;
  key: string;
  payloadHash: string;
  contentType?: string;
  cacheControl?: string;
}) {
  const url = new URL(`${input.config.endpoint}/${input.bucket}/${encodeKey(input.key)}`);
  const { amzDate, dateStamp } = formatAmzDate();
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': input.payloadHash,
    'x-amz-date': amzDate
  };
  if (input.contentType) headers['content-type'] = input.contentType;
  if (input.cacheControl) headers['cache-control'] = input.cacheControl;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('');
  const canonicalRequest = [
    input.method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    input.payloadHash
  ].join('\n');
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');
  const signingKey = await getSigningKey(input.config.secretAccessKey, dateStamp);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${input.config.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url, headers };
}

async function createPresignedUrl(input: {
  config: R2S3Config;
  bucket: string;
  key: string;
  expiresIn: number;
}) {
  const url = new URL(`${input.config.endpoint}/${input.bucket}/${encodeKey(input.key)}`);
  const { amzDate, dateStamp } = formatAmzDate();
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  url.searchParams.set('X-Amz-Algorithm', 'AWS4-HMAC-SHA256');
  url.searchParams.set(
    'X-Amz-Credential',
    `${input.config.accessKeyId}/${credentialScope}`
  );
  url.searchParams.set('X-Amz-Date', amzDate);
  url.searchParams.set('X-Amz-Expires', String(Math.max(1, input.expiresIn)));
  url.searchParams.set('X-Amz-SignedHeaders', 'host');

  const canonicalQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  const canonicalRequest = [
    'GET',
    url.pathname,
    canonicalQuery,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join('\n');
  const signingKey = await getSigningKey(input.config.secretAccessKey, dateStamp);
  url.searchParams.set(
    'X-Amz-Signature',
    toHex(await hmacSha256(signingKey, stringToSign))
  );
  return url.toString();
}

export function hasR2S3Config(): boolean {
  return Boolean(buildConfig());
}

// Stored import URLs may outlive their seven-day S3 signature. Only re-sign
// objects belonging to our configured endpoint and bucket.
export async function refreshR2SignedStorageUrl(
  value: string,
  expiresIn = 60 * 60 * 24 * 7
): Promise<string> {
  const config = buildConfig();
  if (!config) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return value;
  }
  const endpoint = new URL(config.endpoint);
  const prefix = `${endpoint.pathname.replace(/\/$/, '')}/${config.bucket}/`;
  if (
    url.origin !== endpoint.origin ||
    !url.pathname.startsWith(prefix) ||
    !url.searchParams.has('X-Amz-Signature')
  )
    return value;
  const date = url.searchParams.get('X-Amz-Date') || '';
  const duration = Number(url.searchParams.get('X-Amz-Expires'));
  const timestamp = Date.parse(
    date.replace(
      /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
      '$1-$2-$3T$4:$5:$6Z'
    )
  );
  if (
    Number.isFinite(timestamp) &&
    duration > 0 &&
    timestamp + duration * 1000 > Date.now() + 60_000
  )
    return value;
  let key: string;
  try {
    key = url.pathname
      .slice(prefix.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/');
  } catch {
    return value;
  }
  if (!key) return value;
  return createPresignedUrl({
    config,
    bucket: config.bucket,
    key,
    expiresIn: Math.min(604800, Math.max(1, expiresIn))
  });
}

export function createR2S3MediaStorageAdapter(): MediaStorageAdapter | null {
  const config = buildConfig();
  if (!config) return null;

  return {
    provider: 'r2',

    async putObject(input: PutMediaObjectInput): Promise<MediaObjectRecord> {
      const bucket = input.bucket || config.bucket;
      const body = await toUint8Array(input.body);
      const payloadHash = await sha256Hex(body);
      const cacheControl = input.cacheControl || '31536000';
      const { url, headers } = await signHeadersRequest({
        config,
        method: 'PUT',
        bucket,
        key: input.key,
        payloadHash,
        contentType: input.contentType,
        cacheControl
      });
      const response = await fetch(url, {
        method: 'PUT',
        headers,
        body: toArrayBuffer(body)
      });
      if (!response.ok) {
        throw new Error(`R2 upload failed with status ${response.status}`);
      }
      const publicUrl = config.publicBaseUrl
        ? `${config.publicBaseUrl}/${encodeKey(input.key)}`
        : undefined;
      return {
        provider: 'r2',
        bucket,
        key: input.key,
        contentType: input.contentType,
        width: input.width,
        height: input.height,
        duration: input.duration,
        byteSize: input.byteSize ?? body.byteLength,
        etag: response.headers.get('etag') || undefined,
        cacheControl,
        publicUrl
      };
    },

    async signReadUrl(input: SignReadUrlInput): Promise<string | null> {
      if (input.locator.provider !== 'r2') return input.fallbackUrl || null;
      if (config.publicBaseUrl) {
        return `${config.publicBaseUrl}/${encodeKey(input.locator.key)}`;
      }
      return createPresignedUrl({
        config,
        bucket: input.locator.bucket,
        key: input.locator.key,
        expiresIn: input.expiresIn
      });
    },

    async deleteObjects(locators: MediaObjectLocator[]): Promise<void> {
      for (const locator of locators) {
        if (locator.provider !== 'r2') continue;
        const { url, headers } = await signHeadersRequest({
          config,
          method: 'DELETE',
          bucket: locator.bucket,
          key: locator.key,
          payloadHash: await sha256Hex('')
        });
        const response = await fetch(url, { method: 'DELETE', headers });
        if (!response.ok && response.status !== 404) {
          throw new Error(`R2 delete failed with status ${response.status}`);
        }
      }
    },

    async downloadObject(locator: MediaObjectLocator): Promise<ArrayBuffer | null> {
      if (locator.provider !== 'r2') return null;
      const url = await createPresignedUrl({
        config,
        bucket: locator.bucket,
        key: locator.key,
        expiresIn: 60
      });
      const response = await fetch(url);
      if (!response.ok) return null;
      return response.arrayBuffer();
    }
  };
}
