#!/usr/bin/env node
// 确保 dashboard.webtomind.com Worker route 存在（幂等）
// 用途：部署后调用，保证自定义域名路由绑定不丢失
//
// 注意：DNS 记录（CNAME dashboard.webtomind.com -> webtomind-backlink-dashboard.webtomind.workers.dev）
// 需要在 Cloudflare Dashboard 手动创建（当前 API token 无 Zone:DNS:Edit 权限）。
import { fetch, ProxyAgent } from 'undici';
import { getCloudflareCredential } from './lib/cloudflare-credentials.mjs';

const ZONE_ID = 'b09f6a6f7b3fe4b5395050efa887e342';
const PATTERN = 'dashboard.webtomind.com/*';
const SCRIPT = 'webtomind-backlink-dashboard';

async function main() {
  const cred = getCloudflareCredential('workers');
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || 'http://127.0.0.1:7890';
  const base = `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`;
  const headers = { Authorization: `Bearer ${cred.token}`, 'Content-Type': 'application/json' };

  const list = await fetch(base, { headers, dispatcher: new ProxyAgent(proxy) });
  const listBody = await list.json();
  const existing = (listBody.result || []).find((r) => r.pattern === PATTERN);
  if (existing) {
    console.log(`route exists: ${PATTERN} -> ${existing.script} (id=${existing.id})`);
    return;
  }
  const created = await fetch(base, {
    method: 'POST',
    headers,
    body: JSON.stringify({ pattern: PATTERN, script: SCRIPT }),
    dispatcher: new ProxyAgent(proxy),
  });
  const createdBody = await created.json();
  if (!created.ok) {
    console.error(`route create failed: ${created.status} ${JSON.stringify(createdBody.errors || []).slice(0, 200)}`);
    process.exitCode = 1;
    return;
  }
  console.log(`route created: ${PATTERN} -> ${SCRIPT} (id=${createdBody.result?.id})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
