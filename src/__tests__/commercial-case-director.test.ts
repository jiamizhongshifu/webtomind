import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_CASE_PACKAGES,
  generateCommercialCaseDrafts
} from '../../api/utils/commercial-case-director';

describe('commercial case director', () => {
  it('generates complete commercial prompt drafts for every package', () => {
    for (const packageSlug of Object.keys(COMMERCIAL_CASE_PACKAGES)) {
      const drafts = generateCommercialCaseDrafts({
        packageSlug,
        businessScene: '新品上市内容投放',
        targetAudience: '内容运营和品牌主理人',
        deliverable: '商用级案例图',
        count: 2,
        locale: 'zh-CN',
        imageSize: '1024x1536',
        memberOnlyDefault: true
      });

      expect(drafts).toHaveLength(2);
      for (const draft of drafts) {
        expect(draft.packageSlug).toBe(packageSlug);
        expect(draft.sourceSkill).toBe('zhong-image-director');
        expect(draft.title).toContain('视觉导演');
        expect(draft.category).toBeTruthy();
        expect(draft.tags).toContain('gpt-image-2');
        expect(draft.prompt).toContain('商业场景');
        expect(draft.prompt).toContain('构图与信息密度');
        expect(draft.negativePrompt).toContain('文字乱码');
        expect(draft.promptPreview).toContain('公开预览');
        expect(draft.commercialIntent).toContain('精准受众');
        expect(draft.generationSettings).toMatchObject({
          model: 'gpt-image-2',
          imageSize: '1024x1536',
          quality: 'auto',
          imageCount: 2
        });
        expect(draft.skillSeedPrompt).toContain('最终行为');
        expect(draft.memberOnly).toBe(true);
      }
    }
  });

  it('rejects unsupported package slugs', () => {
    expect(() =>
      generateCommercialCaseDrafts({
        packageSlug: 'unknown-package'
      })
    ).toThrow(/Unsupported commercial case package/);
  });
});
