import { describe, expect, it } from 'vitest';
import {
  isLikelyLegacyCompiledNegativePrompt,
  sanitizeLegacyAutoNegativePrompt
} from '../image-negative-prompt';

describe('image negative prompt sanitization', () => {
  it('detects legacy compiled fallback negative prompts', () => {
    expect(
      isLikelyLegacyCompiledNegativePrompt(
        '画质低，多余手指，手部变形，解剖错误，水印文字'
      )
    ).toBe(true);
    expect(
      isLikelyLegacyCompiledNegativePrompt(
        'low quality, extra fingers, distorted hands, bad anatomy, text watermark'
      )
    ).toBe(true);
    expect(
      isLikelyLegacyCompiledNegativePrompt(
        '文字、标志、水印、对话框、可读招牌、多余主要人物、未成年感、幼态脸、过度性感表达、裸露、透明浴巾、胸部或臀部暴露、正面裸露、身体局部特写、低俗姿势、不自然面部、不自然视线、多余手指、缺失手指、手脚融合、关节变形、浴巾接触不良、浴巾漂浮、不自然重力、矛盾阴影、过度美肌、塑料皮肤、背景粗糙崩坏、男性抢主体、男性表情不可辨识、女性直视镜头、女性完全正面。'
      )
    ).toBe(true);
  });

  it('preserves user-authored negative prompts and removes system ones', () => {
    expect(
      sanitizeLegacyAutoNegativePrompt(
        '画质低，多余手指，手部变形，解剖错误，水印文字'
      )
    ).toBeUndefined();
    expect(
      sanitizeLegacyAutoNegativePrompt(
        '画质低，多余手指，手部变形，解剖错误，水印文字',
        'user'
      )
    ).toBe('画质低，多余手指，手部变形，解剖错误，水印文字');
    expect(sanitizeLegacyAutoNegativePrompt('低清晰度，坏手')).toBe(
      '低清晰度，坏手'
    );
  });
});
