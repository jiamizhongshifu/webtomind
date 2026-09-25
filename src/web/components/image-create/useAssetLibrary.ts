/**
 * 素材库领域:公开运营库 + 个人上传库的加载、合并、浏览筛选。
 *
 * 从 ImageCreatePage 抽出。集中持有:
 * - 公开库:assets(远程优先,失败回退本地默认) + assetSource / assetLoadError
 * - 个人库:userAssets + userAssetsLoaded + 删除
 * - 浏览态:librarySource(公开/我的)/ query / activeTag
 * - 派生:userAssetsAsPromptAssets / mergedAssets(跨源合并供 selection 解析)/
 *   browsableAssets(当前 source)/ filteredAssets(按 slot+tag+query)/ slotTags
 *
 * composer 态(activeSlot / selection)仍由页面持有,通过入参传入:
 * - activeSlot:filteredAssets / slotTags / activeTag 重置依赖
 * - setSelection:远程库加载后规范化 selection + 删除素材后清理引用
 * - setError:删除失败提示
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteUserPromptAsset,
  listUserPromptAssets,
  type UserPromptAsset
} from '@/services/agent-api';
import {
  removeImagePromptSelectionId,
  slotVisualDefaults,
  type ImagePromptAsset,
  type ImagePromptSelection,
  type ImagePromptSlot
} from '../../data/image-prompt-core';
import {
  getLocalPublicImagePromptAssets,
  loadPublicImagePromptAssetSlotLibrary,
  loadPublicImagePromptAssetLibrary,
  mergeHydratedPromptAssetSlot,
  normalizeSelectionForAssets,
  resolveBrowsablePromptAssets
} from './assetLibraryResolver';

const TAG_GROUP_RULES: Partial<
  Record<ImagePromptSlot, Array<{ label: string; match: RegExp }>>
> = {
  character: [
    {
      label: '日常人像',
      match: /女性|男性|人物|人像|休闲|现代|通勤|日常|街头|human/u
    },
    {
      label: '职业设定',
      match:
        /赛博|偶像|音乐|复古|哥特|知性|工程师|侦探|管家|制作人|server|detective|engineer|butler/u
    },
    { label: '商业写实', match: /写实|时装|商业/u },
    {
      label: '二次元幻想',
      match: /二次元|幻想|角色|法师|精灵|mage|fantasy|anime/u
    }
  ],
  expression: [
    {
      label: '正向',
      match: /开心|笑容|微笑|喜欢|庆祝|满足|可爱|感动|温柔|安心|甜感/u
    },
    { label: '俏皮', match: /俏皮|互动|搞怪|幽默|角色|偷笑/u },
    { label: '平静', match: /平静|克制|冷淡|沉默|留白|知性|审视|保密/u },
    {
      label: '负向',
      match: /低落|焦虑|压力|疲惫|纠结|痛苦|嫌弃|紧张|尴尬|冷感/u
    },
    {
      label: '惊讶',
      match: /惊喜|震惊|脸红|害羞|高温|寒冷|晕眩|混乱|信息|剧情|反应|夸张/u
    },
    { label: '思考', match: /思考|怀疑|观察|隐喻/u },
    { label: 'Emoji 控制', match: /^emoji$/iu }
  ],
  pose: [
    { label: '手势', match: /手势|互动|指向|点赞|合掌|鼓掌|挥手|敬礼|emoji/u },
    { label: '站姿', match: /站姿|全身|自然|侧身|优雅|杂志/u },
    { label: '动态', match: /动态|行走|运动|奔跑|舞蹈|活力|跳跃|攀爬|冲浪/u },
    { label: '坐跪', match: /坐姿|跪姿|平静/u },
    { label: '情绪动作', match: /庆祝|温柔|无奈|感谢|祈愿|支持|自信/u }
  ],
  top: [
    { label: '外套', match: /外套|夹克|通勤|街头|雨衣|透明/u },
    { label: '针织', match: /针织|浅色|柔和|粉色/u },
    { label: '学院制服', match: /学院|领型|偶像|甜美/u },
    { label: '设定层次', match: /设定|军装感|马甲|绑带|蕾丝|披肩|层次/u }
  ],
  bottom: [
    { label: '裙装', match: /裙装|半身|长裙|短裙|纱质|浪漫/u },
    { label: '裤装', match: /长裤|短裤|工装|街头/u },
    { label: '学院', match: /学院|格纹/u },
    { label: '结构酷感', match: /结构|皮革|不对称/u }
  ],
  shoes: [
    { label: '日常平底', match: /芭蕾|日常|运动|白色/u },
    { label: '靴子', match: /靴子|黑色|银色|厚底/u },
    { label: '学院复古', match: /复古|皮鞋|乐福鞋|牛津鞋|棕色|学院/u },
    { label: '舞台高跟', match: /高跟|缎带|舞台/u }
  ],
  background: [
    { label: '城市街景', match: /城市|街拍|街头|便利店|夜景/u },
    { label: '室内生活', match: /室内|日常|卧室|音乐|复古/u },
    { label: '校园旅途', match: /校园|车站|旅行|夕阳/u },
    { label: '自然留白', match: /自然|花园|柔和|天台|傍晚/u },
    { label: '霓虹夜色', match: /霓虹|雨景/u }
  ],
  productSubject: [
    { label: '消费品', match: /产品|商品|包装|瓶|耳机|水壶|护肤|香薰|蜡烛/u },
    { label: '食物饮品', match: /食物|甜品|蛋糕|挞|饮品|咖啡|餐饮/u },
    { label: '空间建筑', match: /建筑|空间|舞台|展台|室内|结构/u },
    { label: '品牌物件', match: /品牌|logo|KV|主视觉|联名/u }
  ],
  productSurface: [
    { label: '台面', match: /台面|桌面|石材|木质|玻璃|金属/u },
    { label: '展示场景', match: /展台|橱窗|棚拍|工作室|商业/u },
    { label: '自然环境', match: /自然|植物|水面|阳光|户外/u },
    { label: '生活方式', match: /生活|居家|厨房|浴室|办公/u }
  ],
  composition: [
    { label: '主图', match: /主图|居中|大主体|电商|白底/u },
    { label: 'KV', match: /KV|品牌|广告|宣发|海报/u },
    { label: '封面', match: /封面|公众号|社媒|标题|留白/u },
    { label: '网格', match: /网格|拼图|系列|多图/u }
  ],
  titleArea: [
    { label: '顶部标题', match: /顶部|上方|页眉|标题/u },
    { label: '侧边标题', match: /侧边|竖排|左右|边栏/u },
    { label: '底部信息', match: /底部|页脚|信息栏|卖点/u },
    { label: '大留白', match: /留白|安全区|空白|文案/u }
  ],
  style: [
    { label: '写真摄影', match: /写真|摄影|时装|商业|产品|图录/u },
    { label: '电影叙事', match: /电影感|雨景|黑白|高反差|复古|音乐/u },
    { label: '街拍穿搭', match: /街拍|日系|穿搭/u },
    { label: '柔和插画', match: /二次元|水彩|柔和|3D|软陶|梦感|户外/u },
    { label: '角色设定', match: /游戏|设定|角色|偶像|杂志/u }
  ],
  lighting: [
    { label: '影棚', match: /影棚|柔光|干净|彩光/u },
    { label: '自然光', match: /自然光|低对比|写实|暖光/u },
    { label: '氛围光', match: /氛围|逆光|轮廓|霓虹|夜景|低照度/u },
    { label: '戏剧光', match: /硬光|窗影|戏剧|对比/u }
  ],
  visualEffect: [
    { label: '氛围', match: /氛围|雾化|空间|高光|发光|微尘|雨景|前景/u },
    { label: '动态', match: /动效|速度|叠影/u },
    {
      label: '镜头后期',
      match: /后期|镜头|景深|主体|色散|故障|RGB|暗角|聚焦/u
    },
    { label: '胶片质感', match: /胶片|颗粒|质感|漏光/u }
  ],
  layoutDesign: [
    { label: '标题海报', match: /标题|海报|玻璃|动势/u },
    { label: '档案设定', match: /档案|信息|角色|世界观|符号|设定|文件|印章/u },
    { label: '商业图录', match: /电商|卖点|KV|服装|标注|图录/u },
    { label: '编辑版式', match: /封面|栅格|留白|编辑|极简|归档|画廊/u },
    { label: '注释标签', match: /注释|手写|边框|标签|贴纸|科技|玻璃/u }
  ],
  accessory: [
    { label: '首饰', match: /耳环|珍珠|项链|银色|精致/u },
    { label: '头饰帽子', match: /发饰|帽子|法式|轮廓|角色/u },
    { label: '眼镜丝巾', match: /眼镜|知性|轻盈|围巾|优雅|色点/u },
    { label: '包袋腰带', match: /手包|通勤|皮革|腰带|结构/u }
  ],
  prop: [
    { label: '手中物', match: /手中物|饮品|日常|花|浪漫|雨伞/u },
    { label: '设备', match: /设备|现代|相机|旅行|耳机|音乐/u },
    { label: '阅读叙事', match: /书|知性|叙事/u },
    { label: '舞台氛围', match: /麦克风|舞台|金属|雨景/u }
  ]
};

const TAG_GROUP_ORDER: Partial<Record<ImagePromptSlot, string[]>> = {
  character: ['日常人像', '职业设定', '商业写实', '二次元幻想'],
  expression: ['正向', '俏皮', '平静', '负向', '惊讶', '思考', 'Emoji 控制'],
  pose: ['手势', '站姿', '动态', '坐跪', '情绪动作'],
  top: ['外套', '针织', '学院制服', '设定层次'],
  bottom: ['裙装', '裤装', '学院', '结构酷感'],
  shoes: ['日常平底', '靴子', '学院复古', '舞台高跟'],
  background: ['城市街景', '室内生活', '校园旅途', '自然留白', '霓虹夜色'],
  productSubject: ['消费品', '食物饮品', '空间建筑', '品牌物件'],
  productSurface: ['台面', '展示场景', '自然环境', '生活方式'],
  composition: ['主图', 'KV', '封面', '网格'],
  titleArea: ['顶部标题', '侧边标题', '底部信息', '大留白'],
  style: ['写真摄影', '电影叙事', '街拍穿搭', '柔和插画', '角色设定'],
  lighting: ['影棚', '自然光', '氛围光', '戏剧光'],
  visualEffect: ['氛围', '动态', '镜头后期', '胶片质感'],
  layoutDesign: ['标题海报', '档案设定', '商业图录', '编辑版式', '注释标签'],
  accessory: ['首饰', '头饰帽子', '眼镜丝巾', '包袋腰带'],
  prop: ['手中物', '设备', '阅读叙事', '舞台氛围']
};

function getDisplayTag(slot: ImagePromptSlot, tag: string): string {
  const rules = TAG_GROUP_RULES[slot];
  if (!rules) return tag;
  return rules.find((rule) => rule.match.test(tag))?.label || tag;
}

function getAssetDisplayTags(asset: ImagePromptAsset): string[] {
  return [...new Set(asset.tags.map((tag) => getDisplayTag(asset.slot, tag)))];
}

function sortDisplayTags(slot: ImagePromptSlot, tags: string[]): string[] {
  const order = TAG_GROUP_ORDER[slot] || [];
  return tags.sort((a, b) => {
    const aIndex = order.indexOf(a);
    const bIndex = order.indexOf(b);
    if (aIndex !== -1 || bIndex !== -1) {
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
    }
    return a.localeCompare(b);
  });
}

export function buildAssetSearchText(asset: ImagePromptAsset): string {
  return [
    asset.title,
    asset.subtitle,
    asset.prompt,
    ...getAssetDisplayTags(asset),
    ...asset.tags,
    ...(asset.searchAliases || [])
  ]
    .join(' ')
    .toLowerCase();
}

function filterAssets(options: {
  assets: ImagePromptAsset[];
  slot: ImagePromptSlot;
  query: string;
  tag: string | null;
}) {
  const normalizedQuery = options.query.trim().toLowerCase();
  return options.assets.filter((asset) => {
    if (asset.slot !== options.slot) return false;
    const displayTags = getAssetDisplayTags(asset);
    if (options.tag && !displayTags.includes(options.tag)) return false;
    if (!normalizedQuery) return true;

    const searchable = buildAssetSearchText(asset);
    return searchable.includes(normalizedQuery);
  });
}

export interface UseAssetLibraryParams {
  isAuthenticated: boolean;
  /** Recipe browsing hydrates one slot; the legacy picker explicitly requests all. */
  loadScope?: 'none' | 'active-slot' | 'full';
  /** 当前聚焦 slot(composer 态)— 筛选 + activeTag 重置依赖 */
  activeSlot: ImagePromptSlot;
  setSelection: Dispatch<SetStateAction<ImagePromptSelection>>;
  setError: (message: string) => void;
}

export interface UseAssetLibraryResult {
  assetSource: 'local' | 'hybrid' | 'remote';
  assetLoadError: string;
  userAssets: UserPromptAsset[];
  setUserAssets: Dispatch<SetStateAction<UserPromptAsset[]>>;
  userAssetsLoaded: boolean;
  setUserAssetsLoaded: Dispatch<SetStateAction<boolean>>;
  userAssetsAsPromptAssets: ImagePromptAsset[];
  mergedAssets: ImagePromptAsset[];
  browsableAssets: ImagePromptAsset[];
  filteredAssets: ImagePromptAsset[];
  slotTags: string[];
  librarySource: 'public' | 'mine';
  setLibrarySource: Dispatch<SetStateAction<'public' | 'mine'>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  activeTag: string | null;
  setActiveTag: Dispatch<SetStateAction<string | null>>;
  prefetchPublicSlot: (slot: ImagePromptSlot) => boolean;
  handleDeleteUserAsset: (id: string) => Promise<void>;
}

interface NetworkInformationLike {
  effectiveType?: string;
  saveData?: boolean;
}

export function shouldPrefetchPublicPromptAssets(
  connection?: NetworkInformationLike,
  online = true
): boolean {
  if (!online || connection?.saveData) return false;
  return !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
}

export function useAssetLibrary({
  isAuthenticated,
  loadScope = 'full',
  activeSlot,
  setSelection,
  setError
}: UseAssetLibraryParams): UseAssetLibraryResult {
  const { t } = useTranslation('imageCreate');

  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [assets, setAssets] = useState<ImagePromptAsset[]>(
    getLocalPublicImagePromptAssets
  );
  const [assetSource, setAssetSource] = useState<'local' | 'hybrid' | 'remote'>(
    'local'
  );
  const [assetLoadError, setAssetLoadError] = useState('');
  const [librarySource, setLibrarySource] = useState<'public' | 'mine'>(
    'public'
  );
  const [userAssets, setUserAssets] = useState<UserPromptAsset[]>([]);
  const [userAssetsLoaded, setUserAssetsLoaded] = useState(false);

  const userAssetsAsPromptAssets = useMemo<ImagePromptAsset[]>(() => {
    return userAssets.map((item) => ({
      id: item.id,
      slot: item.slot as ImagePromptSlot,
      title: item.title || '未命名',
      subtitle: item.subtitle || '',
      prompt: item.prompt,
      promptZh: item.promptZh || undefined,
      negativePrompt: item.negativePrompt || undefined,
      negativePromptZh: item.negativePromptZh || undefined,
      tags: item.tags || [],
      thumbnailUrl: item.thumbnailUrl,
      visual:
        slotVisualDefaults[item.slot as ImagePromptSlot] ||
        slotVisualDefaults.style
    }));
  }, [userAssets]);

  const loadUserAssets = useCallback(async () => {
    if (!isAuthenticated) {
      setUserAssets([]);
      setUserAssetsLoaded(true);
      return;
    }
    try {
      const items = await listUserPromptAssets(200);
      setUserAssets(items);
    } catch (loadError) {
      console.warn('[ImageCreate] load user assets failed:', loadError);
    } finally {
      setUserAssetsLoaded(true);
    }
  }, [isAuthenticated]);

  // 登录态翻转时复位个人库:登录后不再卡在游客空列表;登出后清掉残留数据
  useEffect(() => {
    setUserAssets([]);
    setUserAssetsLoaded(false);
  }, [isAuthenticated]);

  useEffect(() => {
    if (librarySource === 'mine' && !userAssetsLoaded) {
      void loadUserAssets();
    }
  }, [librarySource, userAssetsLoaded, loadUserAssets]);

  const requestedPublicSlot = loadScope === 'active-slot' ? activeSlot : null;

  const prefetchPublicSlot = useCallback(
    (slot: ImagePromptSlot) => {
      if (loadScope === 'full' || typeof navigator === 'undefined') {
        return false;
      }
      const connection = (
        navigator as Navigator & { connection?: NetworkInformationLike }
      ).connection;
      if (!shouldPrefetchPublicPromptAssets(connection, navigator.onLine)) {
        return false;
      }
      void loadPublicImagePromptAssetSlotLibrary(slot);
      return true;
    },
    [loadScope]
  );

  useEffect(() => {
    if (loadScope === 'none') return undefined;
    let isMounted = true;
    const request = requestedPublicSlot
      ? loadPublicImagePromptAssetSlotLibrary(requestedPublicSlot)
      : loadPublicImagePromptAssetLibrary();

    request
      .then((library) => {
        if (!isMounted) return;
        setAssets((current) =>
          requestedPublicSlot
            ? mergeHydratedPromptAssetSlot(
                current,
                requestedPublicSlot,
                library.assets
              )
            : library.assets
        );
        setAssetSource(library.source);
        setAssetLoadError(library.error);
        if (!requestedPublicSlot) {
          setSelection((current) =>
            normalizeSelectionForAssets(current, library.assets)
          );
        }
      })
      .catch((loadError) => {
        if (!isMounted) return;
        setAssetSource('local');
        const message =
          loadError instanceof Error
            ? loadError.message
            : 'remote prompt library unavailable';
        setAssetLoadError(message);
        console.warn(
          '[ImageCreate] remote asset library unavailable:',
          message
        );
      });

    return () => {
      isMounted = false;
    };
  }, [loadScope, requestedPublicSlot, setSelection]);

  useEffect(() => {
    setActiveTag(null);
  }, [activeSlot]);

  // 合并公开库与个人库：selection 引用 id 时两边都能解析
  const mergedAssets = useMemo<ImagePromptAsset[]>(() => {
    if (userAssetsAsPromptAssets.length === 0) return assets;
    return [...assets, ...userAssetsAsPromptAssets];
  }, [assets, userAssetsAsPromptAssets]);

  // 素材库面板只显示当前 source 的内容；selection 仍可跨源（合并查找）
  const browsableAssets = useMemo(
    () =>
      resolveBrowsablePromptAssets(
        librarySource,
        assets,
        userAssetsAsPromptAssets
      ),
    [librarySource, userAssetsAsPromptAssets, assets]
  );

  const filteredAssets = useMemo(() => {
    return filterAssets({
      assets: browsableAssets,
      slot: activeSlot,
      query,
      tag: activeTag
    });
  }, [activeSlot, activeTag, browsableAssets, query]);

  const slotTags = useMemo(() => {
    const tagSet = new Set<string>();
    browsableAssets
      .filter((asset) => asset.slot === activeSlot)
      .forEach((asset) =>
        getAssetDisplayTags(asset).forEach((tag) => tagSet.add(tag))
      );
    return sortDisplayTags(activeSlot, [...tagSet]);
  }, [activeSlot, browsableAssets]);

  const handleDeleteUserAsset = async (id: string) => {
    if (!window.confirm(t('mine.deleteConfirm') as string)) return;
    try {
      await deleteUserPromptAsset(id);
      setUserAssets((prev) => prev.filter((item) => item.id !== id));
      setSelection((prev) => removeImagePromptSelectionId(prev, id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : t('mine.deleteFailed')
      );
    }
  };

  return {
    assetSource,
    assetLoadError,
    userAssets,
    setUserAssets,
    userAssetsLoaded,
    setUserAssetsLoaded,
    userAssetsAsPromptAssets,
    mergedAssets,
    browsableAssets,
    filteredAssets,
    slotTags,
    librarySource,
    setLibrarySource,
    query,
    setQuery,
    activeTag,
    setActiveTag,
    prefetchPublicSlot,
    handleDeleteUserAsset
  };
}
