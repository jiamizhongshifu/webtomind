// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  zhongFemalePortraitDirectorSkill,
  FEMALE_PORTRAIT_MODES,
  resolveFemalePortraitMode,
  buildFemalePortraitSystemPrompt,
  FEMALE_POSE_POOL,
  FEMALE_CAMERA_POOL,
  FEMALE_LIGHT_POOL,
  FEMALE_MAKEUP_POOL,
  FEMALE_EXPRESSION_POOL
} from '../zhong-female-portrait-director-skill';

describe('zhong_female_portrait_director skill (official)', () => {
  it('exposes valid metadata with generate_image tool', () => {
    expect(zhongFemalePortraitDirectorSkill.metadata.name).toBe(
      'zhong_female_portrait_director'
    );
    expect(zhongFemalePortraitDirectorSkill.metadata.source).toBe('system');
    expect(zhongFemalePortraitDirectorSkill.metadata.category).toBe('creative');
    expect(zhongFemalePortraitDirectorSkill.metadata.output?.primaryType).toBe(
      'image'
    );
    expect(
      zhongFemalePortraitDirectorSkill.metadata.capabilities?.allowedTools
    ).toContain('generate_image');
    expect(zhongFemalePortraitDirectorSkill.associatedTools).toContain(
      'generate_image'
    );
  });

  it('defines the four official modes', () => {
    expect(FEMALE_PORTRAIT_MODES.map((m) => m.id)).toEqual([
      'free',
      'themed',
      'series',
      'explore'
    ]);
  });

  it('resolves modes from Chinese and English intent', () => {
    expect(resolveFemalePortraitMode('给我做一张写真')?.id).toBe('free');
    expect(resolveFemalePortraitMode('主题：夜街漫步')?.id).toBe('themed');
    expect(resolveFemalePortraitMode('同一个女孩同一套衣服拍4张')?.id).toBe(
      'series'
    );
    expect(resolveFemalePortraitMode('做一组5张的探索')?.id).toBe('explore');
    expect(resolveFemalePortraitMode('female portrait for my feed')?.id).toBe(
      'free'
    );
  });

  it('builds a system prompt with safety boundary and seven-section protocol', () => {
    const prompt = buildFemalePortraitSystemPrompt();
    expect(prompt).toContain('Zhong 女性写真视觉导演');
    expect(prompt).toContain('主体必须明确成年');
    expect(prompt).toContain('【GPT Image2提示词】');
    expect(prompt).toContain('负面：');
    expect(prompt).toContain('generate_image');

    const themed = buildFemalePortraitSystemPrompt('series');
    expect(themed).toContain('当前创作模式：单角色连续写真');
  });

  it('embeds curated structure pools with consistent shape', () => {
    for (const pool of [
      FEMALE_POSE_POOL,
      FEMALE_CAMERA_POOL,
      FEMALE_LIGHT_POOL,
      FEMALE_MAKEUP_POOL,
      FEMALE_EXPRESSION_POOL
    ]) {
      expect(pool.length).toBeGreaterThanOrEqual(6);
      for (const sample of pool) {
        expect(sample.id).toBeTruthy();
        expect(sample.name).toBeTruthy();
      }
    }
    // 手部安全：近景最多一只手
    expect(
      FEMALE_CAMERA_POOL.find((c) => c.id === 'close-up-hand-prop')?.detail
    ).toContain('最多一只手入镜');
  });
});
