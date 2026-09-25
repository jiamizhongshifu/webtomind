import { GPT_IMAGE_2_DENOISE_CREDIT_COST } from './gpt-image-2-denoise';

export type CreateAppLocale = 'zh-CN' | 'en-US';
export type ImageToolProcessing = 'local' | 'hybrid' | 'service';
export type ImageToolFormat =
  | 'JPEG'
  | 'PNG'
  | 'WebP'
  | 'SVG'
  | 'AVIF'
  | 'HEIC'
  | 'BMP'
  | 'GIF'
  | 'TIFF'
  | 'PDF'
  | 'DOCX'
  | 'XLSX'
  | 'PPTX'
  | 'ODT'
  | 'HTML'
  | 'Markdown'
  | 'TXT'
  | 'MP4'
  | 'MOV'
  | 'M4A'
  | 'M4V'
  | 'WAV'
  | 'MP3'
  | 'Same format'
  | 'ZIP'
  | 'CSV';

export interface ImageToolDefinition {
  slug:
    | 'image-upscaler'
    | 'image-splitter'
    | 'watermark-remover'
    | 'ai-mark-remover'
    | 'background-remover'
    | 'gpt-image-2-denoiser'
    | 'image-compressor'
    | 'pindou-pattern-maker'
    | 'image-editor';
  title: string;
  description: string;
  seoTitle?: string;
  seoDescription?: string;
  href: `/tools/${string}`;
  processing: ImageToolProcessing;
  inputFormats: ImageToolFormat[];
  outputFormats: ImageToolFormat[];
  coverImage: string;
  featured: boolean;
  seoKeywords: string[];
  useCases: string[];
  steps: string[];
  capabilityNote: string;
  faq?: Array<{ question: string; answer: string }>;
  operatingSystem: 'Web';
}

export type CreateAppContentItem = ImageToolDefinition;
export type LocalizedCreateAppContentItem = ImageToolDefinition & {
  locale: CreateAppLocale;
};

const commonInput: ImageToolFormat[] = ['JPEG', 'PNG', 'WebP'];

const allCreateAppContentItems: ImageToolDefinition[] = [
  {
    slug: 'image-editor',
    title: 'AI 图片编辑',
    seoTitle: 'AI 图片编辑工具 - 局部修改、扩图与光影调整 | WebToMind',
    seoDescription:
      '在线 AI 图片编辑：上传或从资产库选择图片，用文字指令修改局部区域、更换光照、改变视角、扩展画布，支持连续迭代编辑。',
    description:
      '上传或从资产库选择图片，用文字指令调整局部、更换光照、改变视角、扩展画布，像聊天一样连续编辑并随时下载结果。',
    href: '/tools/image-editor',
    processing: 'hybrid',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP'],
    coverImage: '/create-apps/tool-image-editor.webp',
    featured: true,
    seoKeywords: ['AI 图片编辑', '图片局部修改', 'AI 扩图', '图片光照调整'],
    useCases: [
      '用一句话修改图片局部内容',
      '更换光照氛围与相机视角',
      '扩展画布边缘并补全新区域'
    ],
    steps: [
      '上传图片或从资产库选择一张图',
      '描述想修改的内容，可框选区域',
      '生成后继续迭代，或下载 PNG / WebP'
    ],
    capabilityNote:
      '云端 AI 编辑以原图为主参考并锁定上下文，生成消耗积分，失败任务自动退回。',
    operatingSystem: 'Web'
  },
  {
    slug: 'pindou-pattern-maker',
    title: '免费在线拼豆图案生成器',
    seoTitle: '免费拼豆生成器 - 在线拼豆图案图纸生成',
    seoDescription:
      '免费拼豆生成器：上传图片在线生成拼豆图案图纸，支持 8 套品牌色板匹配、色号统计与 PNG/CSV/PDF 分页导出，无需注册。',
    description:
      '免费拼豆生成器：上传照片一键转拼豆图纸，支持 8 套品牌色板匹配、主色像素化、去背景、色号统计、CSV 与分页 PDF 导出。',
    href: '/tools/pindou-pattern-maker',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'CSV', 'PDF'],
    coverImage: '/create-apps/tool-pindou-pattern-maker.webp',
    featured: false,
    seoKeywords: [
      '拼豆生成器',
      '拼豆图案生成器',
      '拼豆图纸生成器免费',
      '拼豆颜色表',
      '拼豆色号对照表',
      'mard拼豆色卡',
      '拼豆色号rgb转换表',
      'Perler bead pattern',
      '拼豆色号'
    ],
    useCases: ['把照片转成拼豆图纸', '统计色号与珠子数量', '导出打印制作说明'],
    steps: ['上传图片', '选择色板与珠子数', '导出图纸、CSV 或打印 PDF'],
    capabilityNote: '纯浏览器处理，保留现有色板、PNG、CSV 和打印功能。',
    operatingSystem: 'Web'
  },
  {
    slug: 'image-upscaler',
    title: 'AI 图像放大器',
    description: '将图片放大到 2K 或 4K，优先使用本地 AI 超分并保留透明通道。',
    href: '/tools/image-upscaler',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP'],
    coverImage: '/create-apps/tool-image-upscaler.webp',
    featured: true,
    seoKeywords: ['AI 图像放大', '图片变清晰', '4K 图片放大'],
    useCases: [
      '放大低分辨率照片',
      '增强插画与产品图',
      '为高分辨率导出准备素材'
    ],
    steps: ['上传图片', '选择 2K 或 4K', '下载 PNG 或 WebP'],
    capabilityNote:
      '图片默认只在浏览器中处理；无 WebGPU 时会明确切换到标准高质量放大。',
    operatingSystem: 'Web'
  },
  {
    slug: 'image-splitter',
    title: '图像分割器',
    description:
      '按常用网格或自定义行列把一张图切成规则切片，支持九宫格、长图轮播、比例裁切、焦点控制与 ZIP 批量导出。',
    href: '/tools/image-splitter',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP', 'ZIP'],
    coverImage: '/create-apps/tool-image-splitter.webp',
    featured: true,
    seoKeywords: ['图片分割', '九宫格切图', '图片切片'],
    useCases: [
      '制作小红书、朋友圈九宫格帖子',
      '把长图拆成轮播图或分镜素材',
      '按 1:1、4:5、3:4 等比例批量导出切片',
      '把海报拆成可单独使用的局部素材',
      '为电商详情页拆分模块图',
      '批量处理多张图片并导出 ZIP'
    ],
    steps: [
      '上传一张或多张图片（JPEG/PNG/WebP）。',
      '选择网格：3×3 九宫格，或自定义行列数。',
      '设置每格比例（如 1:1、4:5）和焦点位置。',
      '预览切片，调整裁切范围。',
      '单独下载或一次性导出 ZIP。'
    ],
    capabilityNote: '纯浏览器 Canvas 处理，图片不会上传。',
    faq: [
      {
        question: '九宫格切图会压缩画质吗？',
        answer:
          '不会。切片按原图区域裁切并保留原尺寸像素，导出格式可选 PNG 或 WebP，仅在需要时做格式转换。'
      },
      {
        question: '图片会上传到服务器吗？',
        answer: '不会。分割完全在浏览器本地完成，工具可以离线使用。'
      },
      {
        question: '如何保证每张切片都是正方形？',
        answer:
          '选择 1:1 网格后按焦点位置自动裁切，超出部分按你选择的焦点（居中、顶部或底部）取舍。'
      },
      {
        question: '可以导出不同比例的切片组合吗？',
        answer: '可以。先选择网格，再逐格设置比例与焦点，最后统一预览并导出。'
      }
    ],
    operatingSystem: 'Web'
  },
  {
    slug: 'background-remover',
    title: '去除背景',
    description: '自动识别图片主体并移除背景，输出透明 PNG / WebP。',
    href: '/tools/background-remover',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP'],
    coverImage: '/create-apps/tool-background-remover.webp',
    featured: false,
    seoKeywords: ['图片去背景', '一键抠图', '透明底', '主体提取'],
    useCases: ['商品图换底色', '人物写真抠图', '素材透明化'],
    steps: ['上传图片', 'AI 自动识别主体', '下载透明 PNG'],
    capabilityNote:
      '仅处理用户有权使用的图片；全部在本地浏览器完成，不离开设备。',
    operatingSystem: 'Web'
  },
  {
    slug: 'watermark-remover',
    title: '去水印',
    description: '用画笔或矩形标记需要移除的区域，再进行局部图像修复。',
    href: '/tools/watermark-remover',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP'],
    coverImage: '/create-apps/tool-watermark-remover.webp',
    featured: false,
    seoKeywords: ['图片去水印', '物体移除', '局部修复'],
    useCases: ['清理自有图片水印', '移除小范围杂物', '修复图片局部瑕疵'],
    steps: ['上传有权处理的图片', '绘制修复蒙版', '处理并下载结果'],
    capabilityNote:
      '仅处理用户有权使用的图片。模型不可用时会标注并降级为邻域纹理填充。',
    operatingSystem: 'Web'
  },
  {
    slug: 'ai-mark-remover',
    title: 'AI 标记清理',
    seoTitle: 'AI 水印清理工具 - 移除 C2PA、EXIF 与不可见标记 | WebToMind',
    seoDescription:
      '在线清理你有权处理的内容中的 AI 来源标记：检查并移除不可见 Unicode、C2PA、EXIF、XMP 与常见文档属性，并对用户框选的可见 Logo / 文字区域做像素修复。',
    description:
      '检查并清理 AI 来源标记、不可见字符与文件元数据；图片可框选可见 Logo / 文字区域做局部像素修复，像素域 AI 后端只在真实可用时开放。',
    href: '/tools/ai-mark-remover',
    processing: 'service',
    inputFormats: [
      'JPEG',
      'PNG',
      'WebP',
      'SVG',
      'AVIF',
      'PDF',
      'DOCX',
      'XLSX',
      'PPTX',
      'HTML',
      'Markdown',
      'TXT',
      'MP4',
      'MOV',
      'M4A',
      'M4V',
      'WAV',
      'MP3'
    ],
    outputFormats: ['Same format'],
    coverImage: '/create-apps/tool-ai-mark-remover.svg',
    featured: true,
    seoKeywords: [
      'AI 水印清理',
      'C2PA 移除',
      'EXIF 清理',
      'AI 元数据清理',
      '不可见 Unicode 清理'
    ],
    useCases: [
      '清理自有 AI 图片的 C2PA / EXIF / XMP 元数据',
      '移除文本中的不可见 Unicode 与双向控制字符',
      '批量整理文档属性并导出同格式文件',
      '框选自有图片中的 Logo / 文字区域并做局部修复',
      '在服务已配置后检测清理前后的像素域标记'
    ],
    steps: ['上传文件或粘贴文本', '框选可见区域并选择清理范围', '下载同格式清理结果'],
    capabilityNote:
      '基于 watermarks-remover service；默认清理 Layer A 与容器元数据，可对用户框选的可见区域做 CPU 像素修复，不宣称“证明人工创作”。',
    faq: [
      {
        question: '它会移除图片上肉眼可见的 Logo 吗？',
        answer:
          '可以。上传 PNG、JPEG、WebP、BMP 或 TIFF 后，在预览图上框选 Logo / 文字区域，服务只修复选区内像素；不会自动猜测所有水印位置。'
      },
      {
        question: '清理后能证明内容是人工创作吗？',
        answer:
          '不能。清理只报告实际移除的标记与元数据，不等同于作者来源证明，也不能保证通过任何第三方检测器。'
      },
      {
        question: '文件会上传到哪里？',
        answer:
          '文件会发送到你们部署并配置的 watermarks-remover service。页面会在服务状态栏明确显示服务是否在线。'
      }
    ],
    operatingSystem: 'Web'
  },
  {
    slug: 'gpt-image-2-denoiser',
    title: 'GPT Image 2 噪点清理',
    description:
      '针对 GPT Image 2 的细碎颗粒与彩噪做保真清理，保持原始尺寸；支持本地即时清理与登录后以原图为主参考的双参考降噪。',
    href: '/tools/gpt-image-2-denoiser',
    processing: 'hybrid',
    inputFormats: commonInput,
    outputFormats: ['PNG', 'WebP'],
    coverImage: '/create-apps/tool-gpt-image-2-denoiser.webp',
    featured: false,
    seoKeywords: ['GPT Image 2 降噪', 'AI 图片噪点', '图片保真清理'],
    useCases: [
      '清理暗部与纯色区域的彩噪',
      '降低皮肤和材质上的细碎颗粒',
      '在不放大的前提下改善整体质感',
      '批量整理 GPT Image 2 生成图',
      '为印刷或高分辨率展示准备素材'
    ],
    steps: [
      '上传 GPT Image 2 生成的图片。',
      '选择清理强度：轻、中、强。',
      '本地模式即时预览清理结果。',
      '登录后可选择双参考降噪，以原图为颜色与材质主参考。',
      '对比前后效果后导出 PNG 或 WebP。'
    ],
    capabilityNote: `云端流程以原图作为颜色与材质的唯一主参考，灰阶结构参考由原图确定性转换；固定消耗 ${GPT_IMAGE_2_DENOISE_CREDIT_COST} 个积分。`,
    faq: [
      {
        question: '降噪会改变原图构图吗？',
        answer:
          '不会。工具保持原始尺寸与构图，只清理噪点和颗粒；双参考模式下灰阶结构由原图确定性转换，不会引入新结构。'
      },
      {
        question: '本地模式和云端模式有什么区别？',
        answer:
          '本地模式不消耗积分、不上传图片；云端双参考降噪以原图为主参考处理，固定消耗一次生成积分，更适合批量精修。'
      },
      {
        question: '适合处理哪些图片？',
        answer:
          '主要针对 GPT Image 2 生成的图片；其他 AI 模型的轻度噪点也可使用，重噪或低分辨率图建议先放大再清理。'
      },
      {
        question: '清理强度怎么选？',
        answer:
          '轻档适合轻微颗粒，中档适合常规噪点，强档适合明显彩噪；建议先用轻档对比效果，再逐步加强。'
      }
    ],
    operatingSystem: 'Web'
  },
  {
    slug: 'image-compressor',
    title: '图片压缩工具',
    description:
      '按质量、最长边或目标大小压缩图片，实时对比压缩前后体积，支持 JPEG、PNG 与 WebP 格式互转，并如实核对节省比例。',
    href: '/tools/image-compressor',
    processing: 'local',
    inputFormats: commonInput,
    outputFormats: ['JPEG', 'PNG', 'WebP'],
    coverImage: '/create-apps/tool-image-compressor.webp',
    featured: false,
    seoKeywords: ['图片压缩', 'WebP 压缩', '减小图片体积'],
    useCases: [
      '把网页图片压缩到指定体积以内',
      '把 PNG 转 WebP 减小体积',
      '压缩社交媒体配图并保持清晰度',
      '控制电商平台上传文件大小',
      '批量压缩一组素材',
      '验证压缩后是否真的变小'
    ],
    steps: [
      '上传一张或多张图片。',
      '选择输出格式：JPEG、PNG 或 WebP。',
      '按质量、最长边或目标大小设定压缩目标。',
      '预览压缩前后体积与画质对比。',
      '结果没有变小时会明确提示，避免误导出。'
    ],
    capabilityNote: '纯浏览器处理；结果未变小时会明确提示，不宣称压缩成功。',
    faq: [
      {
        question: '压缩后图片会不会变模糊？',
        answer:
          '压缩只减少文件体积，不放大也不缩小像素；质量滑块越低细节损失越多，页面会同时展示体积与画质对比。'
      },
      {
        question: 'WebP 和 JPEG 哪个更小？',
        answer:
          '同质量下 WebP 通常比 JPEG 小 20%–40%，适合网页与社媒；需要最大兼容性时仍可选 JPEG。'
      },
      {
        question: '图片会离开我的电脑吗？',
        answer: '不会。压缩在浏览器本地完成，不上传服务器。'
      },
      {
        question: '批量压缩一次可以处理多少张？',
        answer: '一次可以上传多张图片并逐张对比体积，结果各自独立保存。'
      }
    ],
    operatingSystem: 'Web'
  }
];

// 暂停 AI 去水印工具的公开入口；保留定义与本地化文案，便于后续重新评估后恢复。
export const DISABLED_CREATE_APP_SLUGS = new Set<string>(['ai-mark-remover']);

export const createAppContentItems: ImageToolDefinition[] =
  allCreateAppContentItems.filter(
    (item) => !DISABLED_CREATE_APP_SLUGS.has(item.slug)
  );

const english: Record<
  ImageToolDefinition['slug'],
  Pick<
    ImageToolDefinition,
    | 'title'
    | 'description'
    | 'seoTitle'
    | 'seoDescription'
    | 'useCases'
    | 'steps'
    | 'capabilityNote'
    | 'faq'
  >
> = {
  'image-editor': {
    title: 'AI Image Editor',
    seoTitle: 'AI Image Editor - Local Edits, Expansion & Lighting | WebToMind',
    seoDescription:
      'Edit images online with AI: upload or pick an image from your library, then use text instructions to modify regions, change lighting, shift camera angles, and expand the canvas.',
    description:
      'Upload an image or pick one from your library, then edit it with text: change regions, relight, shift camera angles, expand the canvas, and keep iterating until it is right.',
    useCases: [
      'Modify a region of an image with one sentence',
      'Change lighting mood and camera angle',
      'Expand canvas edges with new content'
    ],
    steps: [
      'Upload an image or pick one from your library',
      'Describe the change, optionally box a region',
      'Iterate after each result, then download PNG or WebP'
    ],
    capabilityNote:
      'Cloud AI editing keeps the original as the main reference with locked context. Generations consume credits and failed tasks are refunded automatically.'
  },
  'image-upscaler': {
    title: 'AI Image Upscaler',
    description:
      'Upscale an image to 2K or 4K with local AI super-resolution and alpha preservation.',
    useCases: [
      'Enlarge small photos',
      'Enhance illustrations and products',
      'Prepare high-resolution exports'
    ],
    steps: ['Upload an image', 'Choose 2K or 4K', 'Download PNG or WebP'],
    capabilityNote:
      'Images stay in your browser. Without WebGPU, the tool clearly switches to standard high-quality resizing.'
  },
  'image-splitter': {
    title: 'Image Splitter',
    description:
      'Split one image into tiles with preset or custom grids, crop ratios and focal positioning, then export ZIPs for social carousels and detail-page modules.',
    useCases: [
      'Create Xiaohongshu or social 3x3 grid posts',
      'Split long images into carousel or storyboard frames',
      'Export tiles at fixed ratios such as 1:1, 4:5 or 3:4',
      'Cut a poster into standalone local assets',
      'Split e-commerce detail-page modules',
      'Batch-process several images and export a ZIP'
    ],
    steps: [
      'Upload one or more images (JPEG, PNG or WebP).',
      'Pick a 3x3 grid or set custom rows and columns.',
      'Choose a per-tile ratio and focal position.',
      'Preview the tiles and adjust the crop area.',
      'Download tiles individually or as a ZIP.'
    ],
    capabilityNote: 'Canvas processing runs entirely in your browser.',
    faq: [
      {
        question: 'Does grid splitting compress my image?',
        answer:
          'No. Each tile keeps the original pixels of its crop region; export is PNG or WebP, so conversion only happens when you choose it.'
      },
      {
        question: 'Are my images uploaded to a server?',
        answer:
          'No. Splitting happens locally in your browser and the tool can be used offline.'
      },
      {
        question: 'How do I get perfect square tiles?',
        answer:
          'Choose the 1:1 grid and the tool crops to the focal position you set (center, top or bottom) for each tile.'
      },
      {
        question: 'Can tiles have different ratios in one export?',
        answer:
          'Yes. Pick the grid first, then set the ratio and focus per tile and export them together.'
      }
    ]
  },
  'watermark-remover': {
    title: 'Watermark Remover',
    description:
      'Mark an area with a brush or rectangle, then repair only the selected pixels.',
    useCases: [
      'Clean owned images',
      'Remove small distractions',
      'Repair local defects'
    ],
    steps: [
      'Upload an image you may edit',
      'Paint a repair mask',
      'Process and download'
    ],
    capabilityNote:
      'Only edit images you have the right to use. If the model is unavailable, the engine is labeled as neighborhood fill.'
  },
  'ai-mark-remover': {
    title: 'AI Marks Cleaner',
    seoTitle:
      'AI Watermark Cleaner - Remove C2PA, EXIF & Invisible Marks | WebToMind',
    seoDescription:
      'Inspect and clean AI provenance marks from content you own: invisible Unicode, C2PA, EXIF, XMP and common document properties, plus pixel repair for user-selected visible logo/text areas.',
    description:
      'Inspect and clean AI provenance marks, invisible characters, and file metadata across images, documents, and text. Images can also repair user-selected visible logo/text areas.',
    useCases: [
      'Clean C2PA, EXIF, and XMP from owned AI images',
      'Remove invisible Unicode and bidi controls from text',
      'Tidy document properties and export the same format',
      'Select visible logo/text areas and repair only those pixels',
      'Measure marks before and after cleaning when a detector is available'
    ],
    steps: [
      'Upload a file or paste text',
      'Select visible areas, then choose the cleanup scope',
      'Download the cleaned file in the same format'
    ],
    capabilityNote:
      'Powered by the watermarks-remover service. It cleans Layer A and container metadata by default, and can repair user-selected visible logo/text areas without claiming to prove human authorship.',
    faq: [
      {
        question: 'Does it remove a visible logo from an image?',
        answer:
          'Yes, for supported raster images: select the logo/text area in the preview and only that region is repaired. It does not guess every watermark automatically.'
      },
      {
        question: 'Does cleaning prove that content was written by a human?',
        answer:
          'No. It reports the marks and metadata it actually removed and cannot guarantee any third-party detector result.'
      },
      {
        question: 'Where is my file sent?',
        answer:
          'The file is sent to the watermarks-remover service configured by your deployment. The page shows whether that service is online.'
      }
    ]
  },
  'background-remover': {
    title: 'Remove Background',
    description:
      'Auto-detect the subject and remove the background, outputting transparent PNG / WebP.',
    useCases: [
      'Product shots with a new backdrop',
      'Portrait cutouts',
      'Transparent assets'
    ],
    steps: [
      'Upload an image',
      'AI isolates the subject',
      'Download a transparent PNG'
    ],
    capabilityNote:
      'Only edit images you have the right to use; everything runs locally in your browser.'
  },
  'gpt-image-2-denoiser': {
    title: 'GPT Image 2 Denoiser',
    description:
      'Clean fine grain and chroma noise from GPT Image 2 output while preserving dimensions; preview locally or use signed-in dual-reference denoising.',
    useCases: [
      'Clean chroma noise in shadows and flat areas',
      'Reduce fine grain on skin and materials',
      'Improve overall texture without upscaling',
      'Batch-tidy a set of GPT Image 2 outputs',
      'Prepare assets for print or high-resolution display'
    ],
    steps: [
      'Upload a GPT Image 2 image.',
      'Choose a strength: light, medium or strong.',
      'Preview the local cleanup instantly.',
      'Sign in to use dual-reference denoising with the original as the color and material authority.',
      'Compare before and after, then export PNG or WebP.'
    ],
    capabilityNote: `Cloud denoising treats the original as the sole color and material authority; its grayscale structure guide is deterministic. It costs exactly ${GPT_IMAGE_2_DENOISE_CREDIT_COST} credits.`,
    faq: [
      {
        question: 'Does denoising change the composition?',
        answer:
          'No. The tool keeps the original size and composition and only removes noise; the dual-reference pass derives its grayscale structure deterministically from the original.'
      },
      {
        question: 'What is the difference between local and cloud modes?',
        answer:
          'Local mode costs no credits and never uploads. Cloud dual-reference denoising treats the original as the main reference and costs one generation credit, which suits batch cleanup.'
      },
      {
        question: 'Which images is this for?',
        answer:
          'Mainly GPT Image 2 outputs. Mild noise from other AI models also cleans up; for heavy noise or low resolution, upscale first and then clean.'
      },
      {
        question: 'Which strength should I pick?',
        answer:
          'Light suits mild grain, medium suits typical noise, and strong suits obvious chroma noise. Start light and compare before increasing.'
      }
    ]
  },
  'image-compressor': {
    title: 'Image Compressor',
    description:
      'Compress by quality, longest edge or target size with live before/after volume comparison, convert JPEG/PNG/WebP, and verify actual byte savings.',
    useCases: [
      'Bring web images under a target file size',
      'Convert PNG to WebP to save bandwidth',
      'Compress social media assets while keeping detail',
      'Meet e-commerce upload limits',
      'Compress a batch of assets',
      'Verify a file really got smaller'
    ],
    steps: [
      'Upload one or more images.',
      'Choose the output format: JPEG, PNG or WebP.',
      'Set a quality, longest-edge or target-size goal.',
      'Compare volume and quality before and after.',
      'Export only when the result is actually smaller.'
    ],
    capabilityNote:
      'Processing stays local. If the result is not smaller, the tool says so plainly.',
    faq: [
      {
        question: 'Will compression make my image blurry?',
        answer:
          'Compression only reduces file size; it never upscales or downscales pixels. Lower quality settings lose more detail, and the page shows both volume and quality side by side.'
      },
      {
        question: 'Which is smaller, WebP or JPEG?',
        answer:
          'At equal quality, WebP is usually 20–40% smaller than JPEG, which suits the web and social media; choose JPEG when compatibility matters most.'
      },
      {
        question: 'Do my images leave my computer?',
        answer: 'No. Compression runs entirely in your browser.'
      },
      {
        question: 'How many images can I compress at once?',
        answer:
          'Upload several images and compare each volume side by side; results are saved independently.'
      }
    ]
  },
  'pindou-pattern-maker': {
    title: 'Free Perler Bead Pattern Maker',
    seoTitle: 'Free Bead Pattern Ideas & Perler Bead Pattern Maker',
    seoDescription:
      'Free bead pattern ideas for pet portraits, anime, pixel art and kids crafts, plus a photo-to-grid maker with 8 brand palettes, bead counts and PDF export.',
    description:
      'Turn a photo into a bead chart with 8 brand palettes, dominant-color pixelation, background removal, color list, CSV, and PDF export.',
    useCases: [
      'Convert photos to bead charts',
      'Count colors and beads',
      'Export printable instructions'
    ],
    steps: [
      'Upload an image',
      'Choose palette and grid size',
      'Export PNG, CSV, or PDF'
    ],
    capabilityNote:
      'Local-only processing with the existing palettes and export workflow.'
  }
};

export const createHomeFeaturedAppSlugs = [
  'image-upscaler',
  'image-splitter',
  'image-compressor'
] as const;

export function getCreateAppContent(slug: string) {
  return createAppContentItems.find((item) => item.slug === slug);
}

export function localizeCreateAppContent(
  item: ImageToolDefinition,
  locale: CreateAppLocale
): LocalizedCreateAppContentItem {
  return locale === 'en-US'
    ? { ...item, ...english[item.slug], locale }
    : { ...item, locale };
}

export function getLocalizedCreateAppContentItems(locale: CreateAppLocale) {
  return createAppContentItems.map((item) =>
    localizeCreateAppContent(item, locale)
  );
}

export function getLocalizedCreateAppContent(
  slug: string,
  locale: CreateAppLocale
) {
  const item = getCreateAppContent(slug);
  return item ? localizeCreateAppContent(item, locale) : undefined;
}
