import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const iconsDir = path.join(__dirname, '../public/icons');
const sizes = [16, 32, 48, 128];

async function convertIcons() {
  console.log('Converting SVG icons to PNG...\n');

  for (const size of sizes) {
    const svgPath = path.join(iconsDir, `icon${size}.svg`);
    const pngPath = path.join(iconsDir, `icon${size}.png`);

    if (!fs.existsSync(svgPath)) {
      console.log(`⚠ ${svgPath} not found, skipping...`);
      continue;
    }

    try {
      await sharp(svgPath)
        .resize(size, size)
        .png()
        .toFile(pngPath);
      console.log(`✓ Created icon${size}.png`);
    } catch (error) {
      console.error(`✗ Failed to convert icon${size}.svg:`, error.message);
    }
  }

  console.log('\nDone!');
}

convertIcons();
