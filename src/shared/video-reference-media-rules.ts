export const VIDEO_REFERENCE_MEDIA_LIMITS = {
  duration: { min: 2, max: 15 },
  fileBytes: {
    video: 200 * 1024 * 1024,
    audio: 15 * 1024 * 1024
  },
  video: {
    dimension: { min: 300, max: 6000 },
    aspectRatio: { min: 0.4, max: 2.5 },
    pixels: { min: 640 * 640, max: 3326 * 2494 }
  }
} as const;

export const VIDEO_REFERENCE_MIME_TYPES = [
  'video/mp4',
  'video/quicktime'
] as const;

export const AUDIO_REFERENCE_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave'
] as const;
