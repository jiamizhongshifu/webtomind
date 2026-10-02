export const IMAGE_MASK_EDIT_UNSUPPORTED = 'IMAGE_MASK_EDIT_UNSUPPORTED';

export function getMaskEditUnavailableMessage(isEnglish = false): string {
  return isEnglish
    ? 'Selection editing is unavailable for this model’s current channels. Clear the selection to edit the whole image, or try again later.'
    : '当前模型的可用渠道暂不支持选区编辑。请清除选区后进行整图编辑，或稍后重试。';
}

export class ImageMaskEditUnsupportedError extends Error {
  constructor() {
    super(getMaskEditUnavailableMessage());
    this.name = 'ImageMaskEditUnsupportedError';
  }
}
