import type { DiscoveryImage } from '@/services/create-workspace-v2-api';
import {
  importGenerationAsReference,
  uploadImageReference
} from '@/services/agent-api';
import { fileToDataUrl } from '../components/image-create/referenceFileUtils';

export interface MoodboardItemInput {
  source: string;
  imageUrl: string;
  title?: string;
  prompt?: string;
  imageReferenceId?: string;
  imageGenerationId?: string;
  promptCaseId?: string;
}

export async function prepareUploadedMoodboardItems(
  files: File[],
  limit: number
): Promise<MoodboardItemInput[]> {
  const references: MoodboardItemInput[] = [];
  for (const file of files.slice(0, limit)) {
    const reference = await uploadImageReference({
      imageBase64: await fileToDataUrl(file),
      mimeType: file.type,
      role: 'style',
      label: file.name,
      sourceApp: 'visual_moodboard'
    });
    references.push({
      source: 'upload',
      imageUrl: reference.thumbnailUrl,
      title: reference.label,
      imageReferenceId: reference.id
    });
  }
  return references;
}

export async function prepareDiscoveryMoodboardItem(
  image: DiscoveryImage
): Promise<MoodboardItemInput> {
  const reference =
    image.kind === 'gallery'
      ? await importGenerationAsReference({
          generationId: image.id,
          role: 'style',
          label: image.title,
          description: image.prompt || image.promptPreview || ''
        })
      : undefined;

  return {
    source:
      image.kind === 'prompt_case'
        ? 'prompt_case'
        : image.kind === 'gallery'
          ? 'generation'
          : 'gallery',
    imageUrl: image.imageUrl,
    title: image.title,
    prompt: image.prompt || image.promptPreview,
    ...(reference ? { imageReferenceId: reference.id } : {}),
    ...(image.kind === 'prompt_case' ? { promptCaseId: image.id } : {}),
    ...(image.kind === 'gallery' ? { imageGenerationId: image.id } : {})
  };
}
