/**
 * YAML Frontmatter Parser
 * 解析 Skill 内容中的 YAML frontmatter 配置
 *
 * 严格遵循官方 Agent Skills 标准 (https://github.com/anthropics/skills)
 *
 * 官方标准字段：
 * - name: 技能名称 (必需)
 * - description: 技能描述 (必需)
 * - allowed-tools: 允许的工具列表 (可选)
 * - license: 许可证 (可选)
 * - compatibility: 兼容性说明 (可选)
 * - metadata: 自定义元数据 (可选)
 */

/**
 * Frontmatter 配置接口 (官方标准)
 */
export interface SkillFrontmatter {
  /** 技能名称 (官方标准: 必需) */
  name?: string;
  /** 技能描述 (官方标准: 必需) */
  description?: string;
  /** 允许使用的工具列表 (官方标准: 可选) */
  allowedTools: string[];
  /** 许可证 (官方标准: 可选) */
  license?: string;
  /** 兼容性说明 (官方标准: 可选) */
  compatibility?: string;
  /** 自定义元数据 (官方标准: 可选) */
  metadata: Record<string, string>;
}

/**
 * 解析结果接口
 */
export interface FrontmatterParseResult {
  /** 解析后的配置 */
  config: SkillFrontmatter;
  /** 去除 frontmatter 后的纯内容 */
  content: string;
  /** 是否包含 frontmatter */
  hasFrontmatter: boolean;
}

/**
 * 默认 frontmatter 配置 (官方标准)
 */
const DEFAULT_FRONTMATTER: SkillFrontmatter = {
  allowedTools: [],
  metadata: {}
};

/**
 * 解析 YAML frontmatter (官方标准)
 *
 * @param rawContent 原始内容（可能包含 frontmatter）
 * @returns 解析结果
 *
 * @example
 * ```typescript
 * const result = parseFrontmatter(`---
 * name: my-skill
 * description: A skill that does something
 * allowed-tools: web_search extract_url
 * license: MIT
 * ---
 *
 * # Skill Instructions
 * ...
 * `);
 *
 * console.log(result.config.name); // "my-skill"
 * console.log(result.config.allowedTools); // ["web_search", "extract_url"]
 * ```
 */
export function parseFrontmatter(rawContent: string): FrontmatterParseResult {
  const trimmed = rawContent.trim();

  // 检查是否以 --- 开头
  if (!trimmed.startsWith('---')) {
    return {
      config: { ...DEFAULT_FRONTMATTER },
      content: rawContent,
      hasFrontmatter: false
    };
  }

  // 查找结束的 ---
  const endIndex = trimmed.indexOf('---', 3);
  if (endIndex === -1) {
    return {
      config: { ...DEFAULT_FRONTMATTER },
      content: rawContent,
      hasFrontmatter: false
    };
  }

  // 提取 frontmatter 部分
  const frontmatterStr = trimmed.substring(3, endIndex).trim();
  const content = trimmed.substring(endIndex + 3).trim();

  // 解析 YAML（简单实现，不依赖外部库）
  const config = parseSimpleYaml(frontmatterStr);

  // 官方标准: allowed-tools 是空格分隔的字符串
  const allowedToolsRaw = config['allowed-tools'] || config['allowed_tools'];
  const allowedTools = parseAllowedTools(allowedToolsRaw);

  // 解析 metadata
  const metadata = parseMetadata(config.metadata);

  return {
    config: {
      name: config.name as string | undefined,
      description: config.description as string | undefined,
      allowedTools,
      license: config.license as string | undefined,
      compatibility: config.compatibility as string | undefined,
      metadata
    },
    content,
    hasFrontmatter: true
  };
}

/**
 * 简单的 YAML 解析器
 * 支持基本的键值对和数组
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    // 检查是否是数组项
    if (trimmedLine.startsWith('- ')) {
      if (currentKey && currentArray) {
        const value = trimmedLine.substring(2).trim();
        // 移除引号
        currentArray.push(removeQuotes(value));
      }
      continue;
    }

    // 检查是否是键值对
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex > 0) {
      // 保存之前的数组
      if (currentKey && currentArray) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const key = trimmedLine.substring(0, colonIndex).trim();
      const value = trimmedLine.substring(colonIndex + 1).trim();

      if (value === '' || value === '[]') {
        // 可能是数组开始
        currentKey = key;
        currentArray = [];
      } else {
        // 普通键值对
        result[key] = parseYamlValue(value);
        currentKey = null;
      }
    }
  }

  // 保存最后的数组
  if (currentKey && currentArray) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * 解析 YAML 值
 */
function parseYamlValue(value: string): unknown {
  const trimmed = value.trim();

  // 布尔值
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // 内联数组 [a, b, c]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(',').map((s) => removeQuotes(s.trim()));
  }

  // 字符串（移除引号）
  return removeQuotes(trimmed);
}

/**
 * 移除字符串两端的引号
 */
function removeQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * 解析 allowed-tools (官方标准: 空格分隔的字符串)
 */
function parseAllowedTools(value: unknown): string[] {
  if (typeof value === 'string') {
    // 官方标准: 空格分隔
    return value.split(/\s+/).filter((s) => s.trim());
  }
  if (Array.isArray(value)) {
    return value.filter((v) => typeof v === 'string');
  }
  return [];
}

/**
 * 解析 metadata (官方标准: string-to-string map)
 */
function parseMetadata(value: unknown): Record<string, string> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string') {
        result[k] = v;
      } else if (v !== null && v !== undefined) {
        result[k] = String(v);
      }
    }
    return result;
  }
  return {};
}

/**
 * 将 SkillFrontmatter 转换为数据库字段格式 (官方标准)
 */
export function frontmatterToDbFields(config: SkillFrontmatter): {
  allowed_tools: string[];
  license: string | null;
  compatibility: string | null;
  metadata: Record<string, string>;
} {
  return {
    allowed_tools: config.allowedTools,
    license: config.license || null,
    compatibility: config.compatibility || null,
    metadata: config.metadata
  };
}

/**
 * 从数据库字段转换为 SkillFrontmatter (官方标准)
 */
export function dbFieldsToFrontmatter(fields: {
  allowed_tools?: string[];
  license?: string | null;
  compatibility?: string | null;
  metadata?: Record<string, string>;
}): SkillFrontmatter {
  return {
    allowedTools: fields.allowed_tools || [],
    license: fields.license || undefined,
    compatibility: fields.compatibility || undefined,
    metadata: fields.metadata || {}
  };
}
