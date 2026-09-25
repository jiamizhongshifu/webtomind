export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('图片读取失败'));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

export async function imageUrlToReferencePayload(
  imageUrl: string
): Promise<{ imageBase64: string; mimeType: string }> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error('预设角色图片加载失败');
  }
  const blob = await response.blob();
  return {
    imageBase64: await fileToDataUrl(
      new File([blob], 'official-character.webp', {
        type: blob.type || 'image/webp'
      })
    ),
    mimeType: blob.type || 'image/webp'
  };
}
