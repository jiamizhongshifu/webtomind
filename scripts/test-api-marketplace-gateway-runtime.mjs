import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
// Isolated localhost runtime check: upstream/database are mocks; outbound is blocked.
const repo = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(repo, 'package.json'));
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { Miniflare } = wranglerRequire('miniflare');
const { build } = wranglerRequire('esbuild');
const runtime = `
export const API_MARKETPLACE_MARKUP=1.3, API_MARKETPLACE_DEFAULT_GROUP='default';
export const buildOpenAiModelList=()=>({data:[]});
export const estimateCustomerChargeCents=(_,u)=>u.outputTokens===1024?100:u.inputTokens+u.outputTokens;
export const extractUsage=(v)=>({inputTokens:v?.usage?.prompt_tokens||0,outputTokens:v?.usage?.completion_tokens||0});
export const getApiMarketplaceCatalog=async()=>({models:[{id:'mock',pricingMode:'token'}]});
export const getBearerToken=(r)=>r.headers.get('Authorization').slice(7);
export const getMarketplaceRelayBaseUrlError=()=>null, getMarketplaceRelayConfigError=()=>null;
export const getUpstreamApiKey=()=>'fake',getUpstreamBaseUrl=()=>'https://mock.invalid';
export const hashApiKey=async()=>'fake',isApiMarketplaceAdminUserId=async()=>true,isEndpointAllowed=()=>true;
export const isMarketplaceRelayConfigured=()=>false,isMarketplaceRelayRequired=()=>false;
export const jsonResponse=(_,body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
export const normalizeEndpointPath=(p)=>p.replace(/^\\/v1/,'');
export const preflightResponse=()=>null;
`;
const auth = `export const getSupabaseAdmin=()=>globalThis.mockDatabase;`;
const entry = `
import { legacyHandler as handler } from './api/api-marketplace/gateway.ts';
const state={calls:[],upstreamCancelled:false,upstreamFinished:false,waitUntilFinished:false};
globalThis.mockDatabase={
 from(){const b={select:()=>b,eq:()=>b,maybeSingle:async()=>({data:{id:'key',user_id:'user',status:'active'}})};return b;},
 rpc(name,args){state.calls.push({name,args}); const data=name==='check_api_gateway_rate_limit'?{limited:false}:name==='reserve_api_wallet'?{ok:true,idempotent:false}:name==='settle_api_usage'?{ok:false}:{ok:true}; const p=Promise.resolve({data,error:null});p.abortSignal=()=>p;return p;}
};
globalThis.fetch=async()=>new Response(new ReadableStream({
 async start(c){const enc=new TextEncoder();c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\\n\\n'));for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,100));c.enqueue(enc.encode(':'+ ' '.repeat(65536)+'\\n\\n'));}await new Promise(r=>setTimeout(r,100));c.enqueue(enc.encode('data: {"usage":{"prompt_tokens":30,"completion_tokens":20}}\\n\\ndata: [DONE]\\n\\n'));c.close();state.upstreamFinished=true;},
 cancel(){state.upstreamCancelled=true;}
}),{headers:{'Content-Type':'text/event-stream'}});
export default {fetch(request,env,ctx){
 if(new URL(request.url).pathname==='/__test/state')return Response.json(state);
 return handler(request,{waitUntil(p){ctx.waitUntil(p.then(()=>{state.waitUntilFinished=true;}));}});
}};
`;
const output = await build({
  stdin: {
    contents: entry,
    resolveDir: repo,
    sourcefile: 'smoke-entry.ts',
    loader: 'ts'
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  plugins: [
    {
      name: 'isolate',
      setup(b) {
        b.onResolve({ filter: /\.\/runtime$/ }, () => ({
          path: 'runtime',
          namespace: 'mock'
        }));
        b.onResolve({ filter: /\.\.\/utils\/auth$/ }, () => ({
          path: 'auth',
          namespace: 'mock'
        }));
        b.onLoad({ filter: /.*/, namespace: 'mock' }, (a) => ({
          contents: a.path === 'runtime' ? runtime : auth,
          loader: 'ts'
        }));
      }
    }
  ]
});
const config = readFileSync(
  resolve(repo, 'workers/webtomind.wrangler.toml'),
  'utf8'
);
const compatibilityDate = /compatibility_date = "([^"]+)"/.exec(config)[1];
const compatibilityFlags = JSON.parse(
  /compatibility_flags = (\[[^\]]+\])/.exec(config)[1]
);
const mf = new Miniflare({
  modules: true,
  script: output.outputFiles[0].text,
  compatibilityDate,
  compatibilityFlags,
  unsafeDirectSockets: [{ host: '127.0.0.1', port: 0 }],
  host: '127.0.0.1',
  port: 0,
  outboundService: () => {
    throw new Error('Unexpected external request');
  }
});
try {
  const base = await mf.unsafeGetDirectURL();
  await new Promise((resolve, reject) => {
    const req = httpRequest(
      new URL('/v1/chat/completions', base),
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk-wtm_fake',
          'Content-Type': 'application/json',
          'Idempotency-Key': 'runtime-mock'
        }
      },
      (res) => {
        assert.equal(res.statusCode, 200);
        assert.equal(res.headers['x-webtomind-billing-status'], 'pending');
        res.once('data', () => {
          res.destroy();
          resolve();
        });
      }
    );
    req.on('error', reject);
    req.end(JSON.stringify({ model: 'mock', stream: true }));
  });
  let state;
  for (let n = 0; n < 40; n++) {
    await delay(100);
    state = await (await fetch(new URL('/__test/state', base))).json();
    if (state.waitUntilFinished) break;
  }
  assert.equal(state.upstreamFinished, true);
  assert.equal(state.upstreamCancelled, false);
  assert.equal(state.waitUntilFinished, true);
  const settled = state.calls.filter((c) => c.name === 'settle_api_usage');
  const queued = state.calls.filter(
    (c) => c.name === 'queue_api_usage_settlement'
  );
  assert.equal(settled.length, 3);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].args.p_actual_customer_cents, 50);
  assert.equal(queued[0].args.p_metadata.output_tokens, 20);
  assert.equal(queued[0].args.p_metadata.stream_outcome, 'disconnected');
  console.log(
    'PASS local workerd: HTTP socket disconnect -> late usage drained -> 3 settlement attempts -> queue ack -> waitUntil complete; no upstream cancellation or external calls'
  );
} finally {
  await mf.dispose();
}
