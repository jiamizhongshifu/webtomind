import { describe, expect, it } from 'vitest';
import {
  buildPortraitPhotographicExecution,
  formatPortraitPhotographicExecution,
  type PortraitExecutionAssetLike
} from '../portrait-photographic-execution';

const asset = (
  id: string,
  slot: string,
  title: string,
  prompt: string,
  promptZh = prompt,
  tags: string[] = []
): PortraitExecutionAssetLike => ({
  id,
  slot,
  title,
  prompt,
  promptZh,
  tags
});

describe('portrait photographic execution compiler', () => {
  it('compiles six observable contracts without introducing a second shot', () => {
    const execution = buildPortraitPhotographicExecution(
      [
        asset('shot-knee-up', 'shot', '膝上中全景', 'knee-up shot'),
        asset(
          'composition-negative-space',
          'composition',
          '负空间',
          'subject on one side with negative space'
        ),
        asset(
          'expression-concerned',
          'expression',
          '克制担忧',
          'restrained concerned expression'
        ),
        asset(
          'pose-seated',
          'pose',
          '放松坐姿',
          'relaxed seated pose',
          '放松坐姿'
        ),
        asset(
          'background-reading-room',
          'background',
          '安静阅读室',
          'quiet reading room'
        ),
        asset(
          'lighting-window',
          'lighting',
          '侧窗光',
          'soft side window light'
        ),
        asset('outfit-satin', 'outfit', '缎面套装', 'coordinated satin outfit')
      ],
      'zh-CN'
    );

    expect(execution.pictureCoordinates).toContain('膝部上缘');
    expect(execution.pictureCoordinates).toContain('一侧三分线');
    expect(execution.pictureCoordinates).not.toMatch(/腰线|全身|特写/);
    expect(execution.expressionMechanics).toContain('视线落点');
    expect(execution.expressionMechanics).toContain('克制担忧');
    expect(execution.expressionMechanics).toContain('二至四个可共存证据');
    expect(execution.expressionMechanics).toContain('同一肌肉');
    expect(execution.expressionMechanics).toContain(
      '头部朝向与下巴高度服从已选姿势和机位'
    );
    expect(execution.expressionMechanics).not.toContain(
      '头部姿态与镜头关系中选择'
    );
    expect(execution.poseMechanics).toContain('坐面或交叠腿部承重');
    expect(execution.poseMechanics).toContain('唯一动作');
    expect(execution.sceneInteraction).toContain('安静阅读室');
    expect(execution.sceneInteraction).toContain('可见、可信');
    expect(execution.lightingCausality).toContain('主光来自');
    expect(execution.lightingCausality).toContain('阴影落向');
    expect(execution.materialPhysics).toContain('接触阴影');
    expect(execution.materialPhysics).toContain('丝缎');
    expect(execution.materialPhysics).toContain('材质表现只作用于');
  });

  it('formats a stable six-field prompt card in both locales', () => {
    const assets = [
      asset('shot-full-body', 'shot', '全身', 'full-body shot'),
      asset('pose-standing', 'pose', '自然站立', 'natural standing pose'),
      asset('lighting-softbox', 'lighting', '柔箱', 'softbox key'),
      asset('top-knit', 'top', '针织上装', 'knit top')
    ];

    const chinese = formatPortraitPhotographicExecution(
      buildPortraitPhotographicExecution(assets, 'zh-CN'),
      'zh-CN'
    );
    const english = formatPortraitPhotographicExecution(
      buildPortraitPhotographicExecution(assets, 'en-US'),
      'en-US'
    );

    expect(chinese).toMatch(
      /摄影执行：画面坐标：.+；表情观察量：.+；姿态力学：.+；场景接触：.+；光线因果：.+；材质物理：.+/
    );
    expect(english).toMatch(
      /Photographic execution — picture coordinates:.+; expression observables:.+; pose mechanics:.+; scene contact:.+; lighting causality:.+; material physics:.+/
    );
  });

  it('translates selected engineered materials into physical and light behavior', () => {
    const execution = buildPortraitPhotographicExecution(
      [
        asset(
          'outfit-smoked-acrylic',
          'outfit',
          '烟灰亚克力工具围裙',
          'smoked acrylic tool apron'
        ),
        asset(
          'accessory-mirror-metal',
          'accessory',
          '镜面金属配饰',
          'mirror metal accessory'
        )
      ],
      'zh-CN'
    );

    expect(execution.materialPhysics).toContain('板材厚度');
    expect(execution.materialPhysics).toContain('反射内容只来自当前场景与主光');
    expect(execution.materialPhysics).toContain('不扩散到皮肤、脸部或头发');
  });

  it('treats many selected props as a composition pool rather than parallel actions', () => {
    const execution = buildPortraitPhotographicExecution(
      [
        asset('pose-touch-flower', 'pose', '触碰花瓣', 'touching one flower'),
        asset('prop-flower', 'prop', '花束', 'flower bouquet'),
        asset('prop-book', 'prop', '旧书', 'old book'),
        asset('prop-cup', 'prop', '杯子', 'cup'),
        asset('prop-camera', 'prop', '相机', 'camera'),
        asset('prop-ribbon', 'prop', '丝带', 'ribbon')
      ],
      'zh-CN'
    );

    expect(execution.sceneInteraction).toContain('只取二至四件');
    expect(execution.sceneInteraction).toContain(
      '只有与动作有关的一件进入任务手'
    );
    expect(execution.sceneInteraction).toContain('不强制出现');
  });
});
