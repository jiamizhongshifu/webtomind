import type {
  MediaObjectLocator,
  MediaObjectRecord,
  MediaStorageAdapter,
  PutMediaObjectInput,
  SignReadUrlInput
} from './types.js';

interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Object extends R2ObjectBody {
  etag?: string;
  httpEtag?: string;
  size?: number;
}

interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
}

export interface R2BucketBinding {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | Blob | ReadableStream,
    options?: R2PutOptions
  ): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(keys: string | string[]): Promise<void>;
}

type RuntimeGlobal = typeof globalThis & {
  __WEBTOMIND_MEDIA_BUCKET?: R2BucketBinding;
};

function getEnv(name: string): string {
  return typeof process !== 'undefined' ? process.env[name] || '' : '';
}

function getDefaultBucketName(): string {
  return (
    getEnv('MEDIA_R2_BUCKET') ||
    getEnv('R2_BUCKET_NAME') ||
    getEnv('MEDIA_BUCKET_NAME') ||
    'webtomind-media-prod'
  );
}

function getPublicBaseUrl(): string {
  return getEnv('MEDIA_PUBLIC_BASE_URL').replace(/\/+$/, '');
}

function encodeKey(key: string): string {
  return key
    .replace(/^\/+/, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

async function toR2Body(
  body: PutMediaObjectInput['body']
): Promise<ArrayBuffer | Uint8Array | Blob | ReadableStream> {
  if (body instanceof Uint8Array || body instanceof ArrayBuffer) return body;
  if (body instanceof Blob) return body;
  return new Uint8Array(body);
}

export function getRuntimeR2BucketBinding(): R2BucketBinding | null {
  return ((globalThis as RuntimeGlobal).__WEBTOMIND_MEDIA_BUCKET ||
    null) as R2BucketBinding | null;
}

export function createR2BindingMediaStorageAdapter(options: {
  bucket?: R2BucketBinding | null;
  defaultBucket?: string;
  publicBaseUrl?: string;
  signReadUrlFallback?: MediaStorageAdapter | null;
} = {}): MediaStorageAdapter | null {
  const bucket = options.bucket || getRuntimeR2BucketBinding();
  if (!bucket) return null;

  const defaultBucket = options.defaultBucket || getDefaultBucketName();
  const publicBaseUrl =
    options.publicBaseUrl === undefined ? getPublicBaseUrl() : options.publicBaseUrl;

  return {
    provider: 'r2',

    async putObject(input: PutMediaObjectInput): Promise<MediaObjectRecord> {
      const body = await toR2Body(input.body);
      const record = await bucket.put(input.key, body, {
        httpMetadata: {
          contentType: input.contentType,
          cacheControl: input.cacheControl || '31536000'
        }
      });
      const recordBucket = input.bucket || defaultBucket;
      return {
        provider: 'r2',
        bucket: recordBucket,
        key: input.key,
        contentType: input.contentType,
        width: input.width,
        height: input.height,
        duration: input.duration,
        byteSize:
          input.byteSize ??
          record?.size ??
          (body instanceof ArrayBuffer
            ? body.byteLength
            : body instanceof Uint8Array
              ? body.byteLength
              : undefined),
        etag: record?.httpEtag || record?.etag,
        cacheControl: input.cacheControl || '31536000',
        publicUrl: publicBaseUrl
          ? `${publicBaseUrl}/${encodeKey(input.key)}`
          : undefined
      };
    },

    async signReadUrl(input: SignReadUrlInput): Promise<string | null> {
      if (input.locator.provider !== 'r2') return input.fallbackUrl || null;
      if (publicBaseUrl) {
        return `${publicBaseUrl}/${encodeKey(input.locator.key)}`;
      }
      return (
        (await options.signReadUrlFallback?.signReadUrl(input)) ||
        input.fallbackUrl ||
        null
      );
    },

    async deleteObjects(locators: MediaObjectLocator[]): Promise<void> {
      const keys = locators
        .filter((locator) => locator.provider === 'r2')
        .map((locator) => locator.key);
      if (keys.length === 0) return;
      await bucket.delete(keys.length === 1 ? keys[0] : keys);
    },

    async downloadObject(locator: MediaObjectLocator): Promise<ArrayBuffer | null> {
      if (locator.provider !== 'r2') return null;
      const object = await bucket.get(locator.key);
      return object ? object.arrayBuffer() : null;
    }
  };
}
