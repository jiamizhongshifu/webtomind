/**
 * Agent-Reach 服务
 * 封装 Agent-Reach CLI 调用，提供全网搜索和内容提取能力
 *
 * Agent-Reach 通过 Exa (MCP) 进行语义搜索，通过 Jina Reader 提取网页内容
 * 参考: https://github.com/Panniantong/Agent-Reach
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 超时配置
const SEARCH_TIMEOUT_MS = 30000;
const EXTRACT_TIMEOUT_MS = 15000;

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source: string;   // 域名
  favicon?: string;
  score?: number;    // 相关性分数
}

export interface ExtractedContent {
  url: string;
  title: string;
  content: string;   // Markdown 全文
  success: boolean;
  error?: string;
}

export interface HealthStatus {
  installed: boolean;
  channels: Record<string, boolean>;
}

/**
 * Agent-Reach 服务
 */
export class AgentReachService {
  /**
   * 检查 agent-reach 是否已安装
   */
  async checkInstalled(): Promise<boolean> {
    try {
      await execAsync('agent-reach --version', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 全网搜索（通过 Exa via mcporter）
   * 如果 mcporter/Exa 不可用，回退到 Jina Search
   */
  async search(query: string, maxResults = 10): Promise<SearchResult[]> {
    // 尝试 mcporter + Exa 搜索
    try {
      return await this.searchViaExa(query, maxResults);
    } catch (exaError) {
      console.warn('[AgentReach] Exa search failed, falling back to Jina:', exaError);
    }

    // 回退：Jina Search API（免费，无需 Key）
    try {
      return await this.searchViaJina(query, maxResults);
    } catch (jinaError) {
      console.error('[AgentReach] Jina search also failed:', jinaError);
    }

    return [];
  }

  /**
   * 通过 Exa MCP 搜索
   */
  private async searchViaExa(query: string, maxResults: number): Promise<SearchResult[]> {
    const escapedQuery = query.replace(/'/g, "\\'").replace(/"/g, '\\"');
    const cmd = `mcporter call 'exa.search(query: "${escapedQuery}", numResults: ${maxResults})'`;

    const { stdout } = await execAsync(cmd, { timeout: SEARCH_TIMEOUT_MS });

    // mcporter 返回 JSON
    const data = JSON.parse(stdout);
    const results: SearchResult[] = [];

    if (data?.results && Array.isArray(data.results)) {
      for (const item of data.results) {
        const url = item.url || '';
        results.push({
          title: item.title || '',
          snippet: item.text || item.snippet || '',
          url,
          source: this.extractDomain(url),
          score: item.score
        });
      }
    }

    return results;
  }

  /**
   * 通过 Jina Search API 搜索（免费，无需 Key）
   */
  private async searchViaJina(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = `https://s.jina.ai/${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Return-Format': 'json'
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Jina search failed: ${response.status}`);
    }

    const data = await response.json() as {
      data?: Array<{
        title?: string;
        description?: string;
        url?: string;
        content?: string;
      }>;
    };

    const results: SearchResult[] = [];
    if (data?.data && Array.isArray(data.data)) {
      for (const item of data.data.slice(0, maxResults)) {
        const itemUrl = item.url || '';
        results.push({
          title: item.title || '',
          snippet: item.description || item.content?.substring(0, 200) || '',
          url: itemUrl,
          source: this.extractDomain(itemUrl)
        });
      }
    }

    return results;
  }

  /**
   * 提取 URL 内容（通过 Jina Reader）
   */
  async extractUrl(url: string): Promise<ExtractedContent> {
    try {
      const readerUrl = `https://r.jina.ai/${url}`;
      const response = await fetch(readerUrl, {
        headers: {
          'Accept': 'text/markdown',
          'X-Return-Format': 'markdown'
        },
        signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS)
      });

      if (!response.ok) {
        return {
          url,
          title: '',
          content: '',
          success: false,
          error: `HTTP ${response.status}`
        };
      }

      const content = await response.text();

      // 从 Markdown 内容中提取标题
      const titleMatch = content.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1] || this.extractDomain(url);

      return {
        url,
        title,
        content,
        success: true
      };
    } catch (error) {
      return {
        url,
        title: '',
        content: '',
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 批量提取 URL 内容
   */
  async extractUrls(urls: string[]): Promise<ExtractedContent[]> {
    // 并行提取，限制并发数为 5
    const concurrency = 5;
    const results: ExtractedContent[] = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((url) => this.extractUrl(url))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * 健康检查
   */
  async doctor(): Promise<HealthStatus> {
    const installed = await this.checkInstalled();
    if (!installed) {
      return { installed: false, channels: {} };
    }

    try {
      const { stdout } = await execAsync('agent-reach doctor --json', { timeout: 10000 });
      const data = JSON.parse(stdout);
      return {
        installed: true,
        channels: data.channels || {}
      };
    } catch {
      return { installed: true, channels: {} };
    }
  }

  /**
   * 从 URL 提取域名
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}

// 导出单例
export const agentReachService = new AgentReachService();
