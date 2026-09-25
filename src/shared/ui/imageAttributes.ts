export type ImageFetchPriority = 'high' | 'low' | 'auto';

export function imageFetchPriority(priority: ImageFetchPriority): {
  fetchpriority: ImageFetchPriority;
} {
  return { fetchpriority: priority };
}
