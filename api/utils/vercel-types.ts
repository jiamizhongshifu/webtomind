export type VercelQueryValue = string | string[] | undefined;

export interface VercelRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, VercelQueryValue>;
  body?: unknown;
}

export interface VercelResponse {
  statusCode: number;
  setHeader(name: string, value: string | number | readonly string[]): void;
  end(body?: unknown): void;
  status(statusCode: number): this;
  send(body?: unknown): this | void;
  json(body?: unknown): this | void;
}
