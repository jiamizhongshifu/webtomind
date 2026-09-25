// @vitest-environment node
/**
 * Property-Based Tests for NotebookLM Skill Trigger Recognition
 * **Property 14: 技能触发词识别**
 * **验证: 需求 10.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { 
  notebookLMSkill, 
  matchesNotebookLMTriggers, 
  getMatchedTriggers 
} from '../notebooklm-skill';

describe('NotebookLM Skill Trigger Recognition Property Tests', () => {
  /**
   * Property 14: 技能触发词识别
   * **Validates: Requirements 10.2**
   * 
   * For any user input containing NotebookLM skill trigger words
   * (闪卡, 脑图, 测验, 报告, etc.), Agent should activate NotebookLM skill.
   */
  
  // All defined triggers
  const allTriggers = notebookLMSkill.metadata.triggers;
  
  // Chinese triggers
  const chineseTriggers = [
    '闪卡', '学习卡片', '记忆卡',
    '脑图', '思维导图', '知识图谱',
    '测验', '考试题', '练习题', '题目',
    '报告', '学习报告', '内容报告',
    '摘要', '总结', '要点',
    '学习材料', '学习内容',
    '生成闪卡', '制作脑图', '创建测验',
    '生成报告', '生成摘要',
  ];
  
  // English triggers
  const englishTriggers = [
    'flashcard', 'flashcards', 'flash card',
    'mindmap', 'mind map', 'mind-map',
    'quiz', 'quizzes', 'test questions',
    'report', 'summary', 'summarize',
    'learning material', 'study guide',
    'generate flashcards', 'create mindmap',
    'make quiz', 'create summary',
  ];

  it('should recognize all defined Chinese triggers', () => {
    for (const trigger of chineseTriggers) {
      const input = `帮我${trigger}`;
      const matches = matchesNotebookLMTriggers(input);
      
      expect(matches).toBe(true);
    }
  });

  it('should recognize all defined English triggers', () => {
    for (const trigger of englishTriggers) {
      const input = `Please ${trigger} for me`;
      const matches = matchesNotebookLMTriggers(input);
      
      expect(matches).toBe(true);
    }
  });

  it('should be case-insensitive for English triggers', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...englishTriggers),
        (trigger: string) => {
          const variations = [
            trigger.toLowerCase(),
            trigger.toUpperCase(),
            trigger.charAt(0).toUpperCase() + trigger.slice(1).toLowerCase(),
          ];

          for (const variant of variations) {
            const matches = matchesNotebookLMTriggers(`I want ${variant}`);
            expect(matches).toBe(true);
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it('should match triggers in various sentence positions', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allTriggers),
        fc.constantFrom('开头', '中间', '结尾'),
        (trigger: string, position: string) => {
          let input: string;
          
          switch (position) {
            case '开头':
              input = `${trigger}，帮我生成一下`;
              break;
            case '中间':
              input = `请帮我生成${trigger}好吗`;
              break;
            case '结尾':
              input = `我想要${trigger}`;
              break;
            default:
              input = trigger;
          }

          const matches = matchesNotebookLMTriggers(input);
          expect(matches).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should return matched triggers correctly', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...allTriggers),
        (trigger: string) => {
          const input = `帮我生成${trigger}`;
          const matched = getMatchedTriggers(input);

          // Should find at least one match
          expect(matched.length).toBeGreaterThan(0);
          
          // The trigger should be in the matched list
          const normalizedTrigger = trigger.toLowerCase();
          const normalizedMatched = matched.map(m => m.toLowerCase());
          expect(normalizedMatched).toContain(normalizedTrigger);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should not match unrelated inputs', () => {
    const unrelatedInputs = [
      '今天天气怎么样',
      '帮我写一封邮件',
      '搜索一下新闻',
      '打开网页',
      'Hello world',
      'What is the weather',
      '计算 1+1',
    ];

    for (const input of unrelatedInputs) {
      const matches = matchesNotebookLMTriggers(input);
      expect(matches).toBe(false);
    }
  });

  it('should handle multiple triggers in one input', () => {
    const input = '帮我把这个链接生成闪卡和脑图';
    const matched = getMatchedTriggers(input);

    // Should match both triggers
    expect(matched.length).toBeGreaterThanOrEqual(2);
    
    const normalizedMatched = matched.map(m => m.toLowerCase());
    expect(normalizedMatched).toContain('闪卡');
    expect(normalizedMatched).toContain('脑图');
  });

  it('should handle empty and whitespace inputs', () => {
    expect(matchesNotebookLMTriggers('')).toBe(false);
    expect(matchesNotebookLMTriggers('   ')).toBe(false);
    expect(matchesNotebookLMTriggers('\n\t')).toBe(false);
  });
});

describe('NotebookLM Skill Metadata Tests', () => {
  it('should have valid metadata', () => {
    expect(notebookLMSkill.metadata.name).toBe('notebooklm_learning');
    expect(notebookLMSkill.metadata.category).toBe('content');
    expect(notebookLMSkill.metadata.priority).toBe(85);
    expect(notebookLMSkill.metadata.triggers.length).toBeGreaterThan(0);
  });

  it('should have associated tools defined', () => {
    expect(notebookLMSkill.associatedTools).toContain('notebooklm_process');
    expect(notebookLMSkill.associatedTools).toContain('notebooklm_status');
  });

  it('should have core instructions', () => {
    expect(notebookLMSkill.coreInstructions).toBeTruthy();
    expect(notebookLMSkill.coreInstructions.length).toBeGreaterThan(100);
    
    // Should mention key concepts
    expect(notebookLMSkill.coreInstructions).toContain('闪卡');
    expect(notebookLMSkill.coreInstructions).toContain('脑图');
    expect(notebookLMSkill.coreInstructions).toContain('测验');
  });

  it('should have tool guidelines', () => {
    expect(notebookLMSkill.toolGuidelines).toBeTruthy();
    expect(notebookLMSkill.toolGuidelines).toContain('notebooklm_process');
    expect(notebookLMSkill.toolGuidelines).toContain('notebooklm_status');
  });
});

describe('NotebookLM Skill Integration Tests', () => {
  it('should be importable and have correct structure', () => {
    // Verify skill structure matches AgentSkillDefinition
    expect(notebookLMSkill).toHaveProperty('metadata');
    expect(notebookLMSkill).toHaveProperty('coreInstructions');
    expect(notebookLMSkill).toHaveProperty('associatedTools');
    
    // Verify metadata structure
    expect(notebookLMSkill.metadata).toHaveProperty('name');
    expect(notebookLMSkill.metadata).toHaveProperty('description');
    expect(notebookLMSkill.metadata).toHaveProperty('triggers');
    expect(notebookLMSkill.metadata).toHaveProperty('category');
    expect(notebookLMSkill.metadata).toHaveProperty('priority');
  });
});
