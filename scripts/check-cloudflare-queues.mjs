import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const repoRoot = process.cwd();
const wranglerConfig = path.join(repoRoot, 'workers/webtomind.wrangler.toml');

applyCloudflareCredential('ops');

const expectedQueues = [
  {
    workload: 'image',
    producerBinding: 'IMAGE_JOBS',
    queue: 'webtomind-image-jobs',
    dlqBinding: 'IMAGE_JOBS_DLQ',
    dlq: 'webtomind-image-jobs-dlq'
  },
  {
    workload: 'video',
    producerBinding: 'VIDEO_JOBS',
    queue: 'webtomind-video-jobs',
    dlqBinding: 'VIDEO_JOBS_DLQ',
    dlq: 'webtomind-video-jobs-dlq'
  },
  {
    workload: 'email',
    producerBinding: 'EMAIL_CAMPAIGN_JOBS',
    queue: 'webtomind-email-campaign-jobs',
    dlqBinding: 'EMAIL_CAMPAIGN_JOBS_DLQ',
    dlq: 'webtomind-email-campaign-jobs-dlq'
  }
];

function parseWranglerQueueBlocks(kind) {
  const text = readFileSync(wranglerConfig, 'utf8');
  const marker =
    kind === 'producer' ? '[[queues.producers]]' : '[[queues.consumers]]';
  const blocks = [];
  const parts = text.split(marker).slice(1);
  for (const part of parts) {
    const body = part.split(/\n\[\[/)[0].split(/\n\[/)[0];
    const record = {};
    for (const line of body.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*"?([^"\n]+)"?\s*$/);
      if (match) record[match[1]] = match[2];
    }
    blocks.push(record);
  }
  return blocks;
}

function runWrangler(args) {
  return execFileSync('npx', ['wrangler', ...args, '--config', wranglerConfig], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function getQueueInfo(queueName) {
  const output = runWrangler(['queues', 'info', queueName]);
  const id = output.match(/Queue ID:\s*([a-f0-9]+)/i)?.[1] || null;
  const producers = Number(
    output.match(/Number of Producers:\s*(\d+)/i)?.[1] || 0
  );
  const consumers = Number(
    output.match(/Number of Consumers:\s*(\d+)/i)?.[1] || 0
  );
  return { id, producers, consumers };
}

const producers = parseWranglerQueueBlocks('producer');
const consumers = parseWranglerQueueBlocks('consumer');
const failures = [];
const report = [];

for (const expected of expectedQueues) {
  const producer = producers.find(
    (item) =>
      item.binding === expected.producerBinding && item.queue === expected.queue
  );
  const dlqProducer = producers.find(
    (item) => item.binding === expected.dlqBinding && item.queue === expected.dlq
  );
  const consumer = consumers.find((item) => item.queue === expected.queue);

  if (!producer) {
    failures.push(`${expected.workload}: missing producer ${expected.producerBinding}`);
  }
  if (!dlqProducer) {
    failures.push(`${expected.workload}: missing DLQ producer ${expected.dlqBinding}`);
  }
  if (!consumer) {
    failures.push(`${expected.workload}: missing consumer for ${expected.queue}`);
  } else if (consumer.dead_letter_queue !== expected.dlq) {
    failures.push(
      `${expected.workload}: consumer DLQ is ${consumer.dead_letter_queue || '<unset>'}`
    );
  }

  for (const queueName of [expected.queue, expected.dlq]) {
    try {
      report.push({
        workload: expected.workload,
        queue: queueName,
        role: queueName === expected.dlq ? 'dead_letter' : 'primary',
        ...getQueueInfo(queueName)
      });
    } catch (error) {
      failures.push(
        `${expected.workload}: live queue lookup failed for ${queueName}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

console.log(JSON.stringify({ ok: failures.length === 0, queues: report }, null, 2));

if (failures.length > 0) {
  console.error('Cloudflare queue readiness failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
