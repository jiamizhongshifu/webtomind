// Vitest runs Worker modules in Node/jsdom, where Cloudflare's special module
// specifier is not available. Wrangler supplies the real implementation in
// production; this shim only lets Worker entrypoint imports be inspected.
export class DurableObject<Env = unknown> {
  constructor(
    public readonly ctx: unknown,
    public readonly env: Env
  ) {}
}

export class WorkerEntrypoint<Env = unknown, Props = unknown> {
  constructor(
    public readonly ctx: unknown = undefined,
    public readonly env: Env = undefined as Env,
    public readonly props: Props = undefined as Props
  ) {}
}

export const env = {
  WATERMARKS_SERVICE_API_KEY: ''
};
