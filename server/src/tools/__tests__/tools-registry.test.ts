// @vitest-environment node
/**
 * 工具注册表单元测试
 * 覆盖工具注册、工具定义导出与确认要求判断。
 */

import { describe, it, expect } from 'vitest';
import { tools, getToolDefinitions, requiresToolConfirmation } from '../index.js';

describe('tools registry', () => {
  it('registers the expected tool names', () => {
    expect(Object.keys(tools).sort()).toEqual(
      [
        'web_search',
        'extract_url',
        'save_note',
        'notebooklm_process',
        'notebooklm_status',
        'notebooklm_health',
        'slide_deck_generate',
        'generate_image',
        'wechat_publish',
        'grok_x_search',
        'e2b_execute'
      ].sort()
    );
  });

  it('exposes the synchronous tools directly and nulls special-cased tools', () => {
    expect(tools.web_search).toBeTypeOf('function');
    expect(tools.extract_url).toBeTypeOf('function');
    expect(tools.save_note).toBeTypeOf('function');
    // 需要 userId / 上下文注入的工具在 executeTool 中特殊处理
    expect(tools.notebooklm_process).toBeNull();
    expect(tools.slide_deck_generate).toBeNull();
    expect(tools.generate_image).toBeNull();
    expect(tools.wechat_publish).toBeNull();
    expect(tools.grok_x_search).toBeNull();
    expect(tools.e2b_execute).toBeNull();
  });
});

describe('getToolDefinitions', () => {
  it('returns a non-empty list of tool definitions', () => {
    const definitions = getToolDefinitions();
    expect(definitions.length).toBeGreaterThan(10);
  });

  it('includes core tool definitions by name', () => {
    const definitions = getToolDefinitions();
    const names = definitions.map((definition) => definition.name);
    expect(names).toContain('web_search');
    expect(names).toContain('extract_url');
    expect(names).toContain('save_note');
    expect(names).toContain('slide_deck_generate');
    expect(names).toContain('generate_image');
  });

  it('every definition carries a name and input_schema', () => {
    for (const definition of getToolDefinitions()) {
      expect(definition.name).toBeTypeOf('string');
      expect(definition.input_schema).toBeDefined();
    }
  });
});

describe('requiresToolConfirmation', () => {
  it('requires confirmation for default high-risk tools', () => {
    expect(requiresToolConfirmation('wechat_publish')).toBe(true);
    expect(requiresToolConfirmation('e2b_execute')).toBe(true);
    expect(requiresToolConfirmation('summary_delete')).toBe(true);
  });

  it('does not require confirmation for ordinary tools', () => {
    expect(requiresToolConfirmation('web_search')).toBe(false);
    expect(requiresToolConfirmation('extract_url')).toBe(false);
    expect(requiresToolConfirmation('save_note')).toBe(false);
    expect(requiresToolConfirmation('generate_image')).toBe(false);
  });

  it('returns false for unknown tool names', () => {
    expect(requiresToolConfirmation('does_not_exist')).toBe(false);
  });
});
