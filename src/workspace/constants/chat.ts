export const IMAGE_EDIT_KEYWORDS =
  /去掉|删除|移除|修改|改成|换成|替换|调整|改一下|换一下|加上|添加|变成|不要|只要|保留|去除|拿掉|消除|抹掉/;
export const IMAGE_EDIT_CONTEXT =
  /副标题|标题|文字|背景|颜色|风格|尺寸|大小|位置|logo|水印|主体|构图|比例|画幅|中间|左边|右边|感觉|氛围|气氛|调性|味道|韵味/;
export const NEW_IMAGE_KEYWORDS = /重新生成|全新|新图|再来一张|从头|重新来一张/;

export const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif'
];

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'text/x-python',
  'application/x-python-code',
  'text/markdown',
  'text/csv',
  'text/xml',
  'application/json'
];

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/mov',
  'video/avi',
  'video/x-flv',
  'video/mpg',
  'video/webm',
  'video/wmv',
  'video/3gpp',
  'video/quicktime'
];

export const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/aiff',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
];

export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
  ...SUPPORTED_VIDEO_TYPES,
  ...SUPPORTED_AUDIO_TYPES
];
