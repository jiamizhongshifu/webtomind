import process from 'node:process';
import { applyHostedOverlay, decryptOverlay, overlayObjectRequest } from './lib/hosted-overlay.mjs';

const config = JSON.parse(process.env.WEBTOMIND_HOSTED_OVERLAY_CONFIG || '{}');
if (!config.sha256 || !config.keyHex) throw new Error('Hosted overlay secret is not configured');
const bytes = await overlayObjectRequest(config);
const bundle = decryptOverlay(bytes, config.keyHex, config.sha256);
const receipt = applyHostedOverlay(process.cwd(), bundle, config.sha256);
console.log(`PASS authenticated hosted overlay: ${receipt.files.length} files; source ${receipt.commit.slice(0, 12)}.`);
