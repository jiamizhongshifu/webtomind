/**
 * Gemini Tool Adapter
 * 将 Anthropic 格式的工具定义转换为 Gemini 格式
 */

import type {
  FunctionDeclaration,
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty
} from '@google/generative-ai';
import { SchemaType } from '@google/generative-ai';
import { getToolDefinitions } from './index.js';

// ============================================
// Anthropic 工具定义类型
// ============================================

interface AnthropicSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: AnthropicSchemaProperty;
  properties?: Record<string, AnthropicSchemaProperty>;
  required?: string[];
}

interface AnthropicInputSchema {
  type: 'object';
  properties: Record<string, AnthropicSchemaProperty>;
  required?: string[];
}

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: AnthropicInputSchema;
}

// ============================================
// 类型转换
// ============================================

/**
 * 将 Anthropic 的类型字符串转换为 Gemini SchemaType
 */
function convertType(type: string): SchemaType {
  switch (type.toLowerCase()) {
    case 'string':
      return SchemaType.STRING;
    case 'number':
    case 'integer':
      return SchemaType.NUMBER;
    case 'boolean':
      return SchemaType.BOOLEAN;
    case 'array':
      return SchemaType.ARRAY;
    case 'object':
      return SchemaType.OBJECT;
    default:
      return SchemaType.STRING;
  }
}

/**
 * 将 Anthropic 属性转换为 Gemini 属性
 */
function convertProperty(
  prop: AnthropicSchemaProperty
): FunctionDeclarationSchemaProperty {
  const result: FunctionDeclarationSchemaProperty = {
    type: convertType(prop.type),
    description: prop.description
  };

  // 处理枚举
  if (prop.enum) {
    result.enum = prop.enum;
  }

  // 处理数组的 items
  if (prop.type === 'array' && prop.items) {
    result.items = convertProperty(prop.items);
  }

  // 处理嵌套对象
  if (prop.type === 'object' && prop.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(prop.properties)) {
      result.properties[key] = convertProperty(value);
    }
    if (prop.required) {
      result.required = prop.required;
    }
  }

  return result;
}

/**
 * 将 Anthropic input_schema 转换为 Gemini parameters
 */
function convertInputSchema(
  schema: AnthropicInputSchema
): FunctionDeclarationSchema {
  const properties: Record<string, FunctionDeclarationSchemaProperty> = {};

  for (const [key, value] of Object.entries(schema.properties)) {
    properties[key] = convertProperty(value);
  }

  return {
    type: SchemaType.OBJECT,
    properties,
    required: schema.required,
    description: undefined
  };
}

/**
 * 将单个 Anthropic 工具定义转换为 Gemini FunctionDeclaration
 */
export function convertToGeminiFunctionDeclaration(
  tool: AnthropicToolDefinition
): FunctionDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    parameters: convertInputSchema(tool.input_schema)
  };
}

/**
 * 获取 Gemini 格式的所有工具定义
 */
export function getGeminiToolDefinitions(): FunctionDeclaration[] {
  const anthropicTools = getToolDefinitions() as AnthropicToolDefinition[];
  return anthropicTools.map(convertToGeminiFunctionDeclaration);
}

/**
 * 获取 Gemini 格式的工具配置（用于 generateContent 请求）
 */
export function getGeminiToolsConfig(): {
  functionDeclarations: FunctionDeclaration[];
} {
  return {
    functionDeclarations: getGeminiToolDefinitions()
  };
}
