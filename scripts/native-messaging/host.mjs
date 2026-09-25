#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function sanitizeFileSegment(input) {
  return String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function resolveDirectory(rawDir) {
  const dir = String(rawDir || '').trim();
  if (!dir) {
    return path.join(os.homedir(), 'Downloads', 'WebToMind', 'TwitterBookmarks');
  }
  if (dir.startsWith('~/')) {
    return path.join(os.homedir(), dir.slice(2));
  }
  return path.resolve(dir);
}

function readMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => {
      try {
        const buffer = Buffer.concat(chunks);
        if (buffer.length < 4) {
          resolve(null);
          return;
        }
        const length = buffer.readUInt32LE(0);
        const content = buffer.slice(4, 4 + length).toString('utf8');
        resolve(JSON.parse(content));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', reject);
  });
}

function sendMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(header);
  process.stdout.write(payload);
}

async function handleSaveMarkdown(message) {
  const directory = resolveDirectory(message.directory);
  const title = sanitizeFileSegment(message.title || 'twitter-bookmark');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${title || 'twitter-bookmark'}-${timestamp}.md`;
  const targetPath = path.join(directory, filename);

  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(targetPath, String(message.markdown || ''), 'utf8');
  return { success: true, path: targetPath };
}

async function main() {
  try {
    const message = await readMessage();
    if (!message) {
      sendMessage({ success: false, error: 'empty message' });
      return;
    }

    if (message.action === 'save_markdown') {
      const result = await handleSaveMarkdown(message);
      sendMessage(result);
      return;
    }

    sendMessage({ success: false, error: 'unsupported action' });
  } catch (error) {
    sendMessage({
      success: false,
      error: error instanceof Error ? error.message : 'unknown error'
    });
  }
}

main();
