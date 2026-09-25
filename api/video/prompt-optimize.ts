/**
 * Video prompt optimizer
 * POST /api/video/prompt-optimize
 *
 * Provider fallback and response parsing are shared with the image optimizer.
 * The request's mediaType selects the video-specific direction contract.
 */

export { config, default } from '../image/prompt-optimize';
