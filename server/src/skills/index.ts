/**
 * Skills 模块导出
 * 严格遵循官方 Agent Skills 标准
 */

export * from './types.js';
export * from './built-in-skills.js';
export { SkillManager, createSkillManager } from './skill-manager.js';
export { PromptBuilder, createPromptBuilder, buildDefaultSystemPrompt } from './prompt-builder.js';

// V2 模块 (官方标准)
export { EnhancedSkillManager, createEnhancedSkillManager, type UserSkillData } from './enhanced-skill-manager.js';
export { ToolExecutor, createToolExecutor, type ToolDefinition, type ToolResult, type SendEventFn } from './tool-executor.js';
export { parseFrontmatter, frontmatterToDbFields, dbFieldsToFrontmatter, type SkillFrontmatter, type FrontmatterParseResult } from './frontmatter-parser.js';
export { extractURL, type ExtractionResult, type ExtractionOptions } from './url-extractor.js';
