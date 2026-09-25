export const IMAGE_TOOL_ROUTE_PATHS = [
  '/tools/image-upscaler',
  '/tools/image-splitter',
  '/tools/watermark-remover',
  '/tools/gpt-image-2-denoiser',
  '/tools/image-compressor',
  '/tools/pindou-pattern-maker',
  '/tools/image-editor'
] as const;

export function isImageToolRoute(pathname: string): boolean {
  return IMAGE_TOOL_ROUTE_PATHS.some((route) => route === pathname);
}
