import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const desktopStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create.css'),
  'utf8'
);
const mobileStyles = readFileSync(
  join(process.cwd(), 'src/web/styles/image-create-mobile.css'),
  'utf8'
);

const singleImageTrackContract =
  /\.image-session-conversation\[data-media-type='image'\][\s\S]*?\.image-session-result-grid\[data-count='1'\]\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*min\(50%,\s*340px\)\);[\s\S]*?justify-content:\s*center;/;

describe('ImageSessionConversation result sizing contracts', () => {
  it('renders one generated image at half of the former desktop track width', () => {
    expect(desktopStyles).toMatch(singleImageTrackContract);
  });

  it('keeps the compact single-image track on mobile', () => {
    expect(mobileStyles).toMatch(singleImageTrackContract);
  });
});
