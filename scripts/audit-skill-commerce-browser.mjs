import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';
const base = process.env.SKILL_COMMERCE_BASE_URL || 'http://127.0.0.1:4198';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out = path.resolve('output/skill-commerce-browser');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const results=[];
try {
 for(const width of [1440,390]) for(const locale of ['en-US','zh-CN']) {
  const context=await browser.newContext({viewport:{width,height:1000},isMobile:width<500,hasTouch:width<500});
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.route('**/api/**',route=>route.fulfill({json:{items:[],tasks:[],subscriptions:[]}}));
  await installUiAuditMockRoutes(context,{baseUrl:base});
  await context.route(`${base}/${locale}/**`,async route=>{
   if(!route.request().isNavigationRequest()) return route.continue();
   const response=await route.fetch();
   return route.fulfill({response:response.status()===404?await route.fetch({url:`${base}/web.html`}):response});
  });
  await context.addInitScript(()=>localStorage.setItem('webtomind-language-prompt-dismissed','1'));
  let mode='open'; let canceled=false; const orders=[];
  const product={id:'skill_pro_content_v2',kind:'subscription',name:'Skill Pro',slug:null,priceUsd:999,priceCny:4900,yearlyUsd:7900,yearlyCny:39900,checkoutEnabled:true,checkoutProviders:['stripe','alipay'],owned:false};
  const single={...product,id:'single',kind:'single',slug:'xhs-carousel',priceUsd:999,priceCny:5900,yearlyUsd:null,yearlyCny:null};
  await context.route('**/api/membership/skill-products',route=>route.fulfill(mode==='error'?{status:503,json:{error:'unavailable'}}:{json:{products:mode==='closed'?[]:[{...product,owned:mode==='owned'},{...single,owned:mode==='owned'}],access:{premiumAccess:mode==='owned',subscriptions:mode==='owned'?[{id:'sub-row',status:'active',endsAt:'2099-01-01',prepaid:false,cancelAtPeriodEnd:canceled}]:[]}}}));
  await context.route('**/api/membership/cancellation?scope=skills',route=>{
   if(route.request().method()==='POST') canceled=true;
   const subscription={id:'sub-row',planName:'skill_pro_content_v2',status:'active',currentPeriodEnd:'2099-01-01T00:00:00Z',cancelAtPeriodEnd:canceled,canCancel:!canceled,prepaid:false};
   return route.fulfill({json:route.request().method()==='POST'?{subscription,syncPending:false}:{subscriptions:mode==='owned'?[subscription]:[]}});
  });
  await context.route('**/api/membership/checkout',async route=>{
   orders.push(route.request().postDataJSON());await route.fulfill({status:409,json:{errorCode:'SKILL_CHECKOUT_CONFLICT'}});
  });
  await context.route('**/api/membership/order-status?*',route=>route.fulfill({json:{order:{id:'00000000-0000-4000-8000-000000000123',status:'pending'}}}));
  await context.route('**/api/skill-catalog/skills/xhs-carousel',route=>route.fulfill({json:{slug:'xhs-carousel',name:{'en-US':'Xiaohongshu Carousel','zh-CN':'小红书图文轮播'},summary:{'en-US':'A complete content workflow'},description:{'en-US':'Turn a brief into editable cards.','zh-CN':'把简报制作成可编辑图文。'},outputTypes:['image'],sceneTags:[],languages:['zh-CN'],tier:'premium',installCount:0,ratingAvg:null,ratingCount:0,publishedAt:null,latestVersion:'1.0.1',compatibleAgents:['claude-code','codex'],installCommand:'npx webtomind-cli install xhs-carousel',versions:[],examples:[]}}));
  const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const zh=locale==='zh-CN';
  await page.goto(`${base}/${locale}/skills/pricing`);
  await page.getByRole('button',{name:zh?'订阅 Skill Pro':'Get Skill Pro',exact:true}).waitFor();
  await page.getByRole('button',{name:zh?'订阅 Skill Pro':'Get Skill Pro',exact:true}).click();
  assert.equal(orders.at(-1).type,'skill_subscription');assert.equal(orders.at(-1).billingCycle,'yearly');assert.equal(orders.at(-1).paymentProvider,zh?'alipay':'stripe');
  await page.getByRole('button',{name:zh?'月付':'Monthly',exact:true}).click();
  await page.getByRole('button',{name:zh?'订阅 Skill Pro':'Get Skill Pro',exact:true}).click();
  assert.equal(orders.at(-1).billingCycle,'monthly');
  await page.getByRole('button',{name:zh?'年付':'Yearly',exact:true}).click();
  assert.ok((await page.locator('.skill-pricing').innerText()).includes(zh?'32%':'34%'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.reload();
  await page.getByRole('button',{name:zh?'订阅 Skill Pro':'Get Skill Pro',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,`${locale}-${width}-pricing.png`),fullPage:true});
  await page.locator('.skill-pricing').screenshot({path:path.join(out,`${locale}-${width}-pricing-section.png`)});
  mode='owned';await page.reload();
  await page.getByRole('button',{name:zh?'已包含全库权益':'Library access included',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:zh?'已包含全库权益':'Library access included',exact:true}).isDisabled(),true);
  const cancel=page.locator('.subscription-management__row button');await cancel.click();
  await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByRole('button').last().click();
  await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(canceled,true);
  mode='closed';await page.reload();
  await page.getByRole('button',{name:zh?'即将开放':'Coming soon',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:zh?'即将开放':'Coming soon',exact:true}).isDisabled(),true);
  mode='error';await page.reload();await page.getByRole('button',{name:zh?'重试':'Retry',exact:true}).waitFor();
  mode='open';await page.getByRole('button',{name:zh?'重试':'Retry',exact:true}).click();
  await page.getByRole('button',{name:zh?'订阅 Skill Pro':'Get Skill Pro',exact:true}).waitFor();
  await page.goto(`${base}/${locale}/skills/xhs-carousel`);
  await page.getByRole('button',{name:zh?'单独购买':'Buy this Skill',exact:true}).click();
  assert.equal(orders.at(-1).type,'skill_purchase');assert.equal(orders.at(-1).id,'single');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`${locale}-${width}-single.png`),fullPage:true});
  await page.goto(`${base}/${locale}/skills/pricing?payment=success&orderId=00000000-0000-4000-8000-000000000123`);
  await page.getByText(zh?'正在核对付款与权益…':'Checking payment and access…',{exact:true}).waitFor();
  assert.equal(await page.getByText(zh?'付款与交付已确认。':'Payment and delivery confirmed.',{exact:true}).count(),0);
  await page.goto(`${base}/${locale}/terms`);await page.getByText(zh?'8. Skill 访问与授权':'8. Skill access and license',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(out,`${locale}-${width}-terms.png`),fullPage:true});
  assert.deepEqual(errors,[]);results.push({locale,width,checks:['billing-cycle','regional-price','server-checkout-request','owned','cancellation','closed','retry','single-purchase','unconfirmed-return','terms','no-overflow'],errors});
  await context.close();
 }
 const guestBase=process.env.SKILL_COMMERCE_GUEST_BASE_URL;
 if(guestBase) {
  assert.ok(['127.0.0.1','localhost'].includes(new URL(guestBase).hostname));
  for(const width of [1440,390]) for(const locale of ['en-US','zh-CN']) {
   const context=await browser.newContext({viewport:{width,height:1000}});
   await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(guestBase).origin?route.continue():route.abort());
   await context.route('**/api/**',route=>route.fulfill({json:{items:[],tasks:[],subscriptions:[]}}));
   await context.route('**/api/auth/me',route=>route.fulfill({status:401,json:{error:'Unauthorized'}}));
   await context.route('**/api/membership/skill-products',route=>route.fulfill({json:{products:[{id:'skill_pro_content_v2',kind:'subscription',name:'Skill Pro',slug:null,priceUsd:999,priceCny:4900,yearlyUsd:7900,yearlyCny:39900,checkoutEnabled:true,checkoutProviders:['stripe','alipay'],owned:false}],access:null}}));
   await context.route(`${guestBase}/${locale}/**`,async route=>{
    if(!route.request().isNavigationRequest()) return route.continue();
    const response=await route.fetch();
    return route.fulfill({response:response.status()===404?await route.fetch({url:`${guestBase}/web.html`}):response});
   });
   await context.addInitScript(()=>localStorage.setItem('webtomind-language-prompt-dismissed','1'));
   const page=await context.newPage();
   let checkouts=0;page.on('request',request=>{if(request.url().includes('/api/membership/checkout'))checkouts++;});
   await page.goto(`${guestBase}/${locale}/skills/pricing`);
   await page.getByRole('button',{name:locale==='zh-CN'?'订阅 Skill Pro':'Get Skill Pro',exact:true}).click();
   await page.waitForURL(url=>url.pathname.endsWith('/login'));
   assert.equal(new URL(page.url()).searchParams.get('redirect'),`/${locale}/skills/pricing`);
   assert.equal(checkouts,0);
   results.push({locale,width,scope:'built guest UI; product API fixture',checks:['login-before-checkout','return-path-preserved'],errors:[]});
   await context.close();
  }
 }
} finally {await browser.close();await writeFile(path.join(out,'results.json'),JSON.stringify({scope:'local simulated API; authenticated dev and optional built guest UI; no real payments',results},null,2));}
console.log(JSON.stringify({passed:results.length,out}));
