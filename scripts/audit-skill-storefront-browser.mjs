import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
const base=process.env.SKILL_STOREFRONT_URL||'http://127.0.0.1:4199';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.SKILL_BROWSER_OUTPUT||'output/skill-storefront-browser');await mkdir(out,{recursive:true});
const names=[['case-study-deck','Customer Case Study','客户案例提案','slides','premium','case-study'],['product-launch-deck','Product Launch Deck','产品发布演示','slides','premium','product-launch'],['saas-landing-page','SaaS Landing Page','SaaS 落地页','web','premium','saas-page'],['app-feature-demo-video','App Feature Demo','App 功能演示','video','premium','app-demo'],['og-image','Product Share Image','产品分享图','image','free','og-image'],['weekly-report-deck','Weekly Report','每周工作报告','slides','free','report']];
const items=names.map(([slug,en,zh,type,tier,cover])=>({slug,name:{'en-US':en,'zh-CN':zh},summary:{'en-US':'Original editable example. Review the inputs and dependencies.','zh-CN':'原创可编辑示例，查看输入要求与依赖说明。'},outputTypes:[type],sceneTags:[],languages:['en'],tier,isFeatured:true,installCount:0,installs7d:0,ratingAvg:null,ratingCount:0,latestVersion:'1.0.1',compatibleAgents:['codex','claude-code'],publishedAt:null,coverUrl:`/skill-previews/${cover}.${cover==='app-demo'?'jpg':'png'}`}));
const browser=await chromium.launch({channel:'chrome'});const results=[];
try{for(const width of [1440,390,360]) for(const locale of ['en-US','zh-CN']){
 const context=await browser.newContext({viewport:{width,height:1000}});let mode='ready';
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 await context.route('**/api/**',r=>r.fulfill({json:{items:[],subscriptions:[],products:[],access:null}}));
 await context.route('**/api/auth/me',r=>r.fulfill({status:401,json:{error:'Unauthorized'}}));
 await context.route('**/api/skill-catalog?*',r=>{if(mode==='error')return r.fulfill({status:503,json:{error:'unavailable'}});const q=new URL(r.request().url()).searchParams;const found=mode==='empty'?[]:items.filter(i=>(!q.get('tier')||i.tier===q.get('tier'))&&(!q.get('output_type')||i.outputTypes.includes(q.get('output_type')))&&(!q.get('q')||JSON.stringify(i.name).toLowerCase().includes(q.get('q').toLowerCase())));return r.fulfill({json:{items:found,total:found.length}});});
 await context.route(`${base}/**`,async r=>{if(!r.request().isNavigationRequest())return r.fallback();const response=await r.fetch();return r.fulfill({response:response.status()===404?await r.fetch({url:`${base}/web.html`}):response});});
 await context.addInitScript(()=>{localStorage.setItem('webtomind-language-prompt-dismissed','1');sessionStorage.setItem('webtomind:google-login-fallback-dismissed','1');});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const zh=locale==='zh-CN';
 await page.goto(`${base}/${locale}/overview`);await page.locator('.skill-card').first().waitFor();
 assert.equal(await page.locator('.skill-shelf').first().locator('.skill-card').count(),4);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.waitForFunction(()=>[...document.querySelectorAll('.skill-output-stage img')].every(i=>i.complete&&i.naturalWidth>0));
 assert.ok((await page.locator('.skill-output-stage').boundingBox()).width>200);
 await page.waitForFunction(()=>[...document.querySelectorAll('.skill-shelf img')].every(i=>i.complete&&i.naturalWidth>0));
 await page.screenshot({path:path.join(out,`${locale}-${width}-home.png`),fullPage:true});await page.screenshot({path:path.join(out,`${locale}-${width}-hero.png`)});
 if(width<500){await page.getByRole('button',{name:zh?'菜单':'Menu',exact:true}).click();await page.locator('.nav-mobile-panel').waitFor();await page.locator('.nav-mobile-panel summary').click();await page.locator('.nav-mobile-panel a[href="/create"]').waitFor();await page.screenshot({path:path.join(out,`${locale}-${width}-menu.png`)});await page.keyboard.press('Escape');assert.equal(await page.locator('.nav-mobile-panel').count(),0);}
 else {await page.locator('.nav-tools summary').click();await page.locator('.nav-tools-panel a[href="/create"]').waitFor();await page.locator('.nav-tools summary').click();}
 await page.getByRole('textbox',{name:zh?'搜索创作任务':'Search creative tasks'}).fill('case');await page.locator('.skill-hero-search button').click();await page.waitForURL(/q=case/);await page.waitForFunction(()=>document.querySelectorAll('.skill-card').length===1);
 await page.goto(`${base}/${locale}/overview`);await page.locator('.skill-task-nav a[href$="type=video"]').click();await page.waitForURL(/type=video/);await page.waitForFunction(()=>document.querySelectorAll('.skill-card').length===1);
 await page.goto(`${base}/${locale}/skills?tier=premium`);await page.waitForFunction(()=>document.querySelectorAll('.skill-card').length===4);await page.screenshot({path:path.join(out,`${locale}-${width}-paid.png`),fullPage:true});
 // Changing locale keeps the current paid filter.
 await page.locator('.nav-language-button').click();await page.locator('.nav-lang-menu-item').filter({hasText:zh?'English':'简体中文'}).click();await page.waitForURL(u=>u.pathname.includes(zh?'en-US':'zh-CN')&&u.searchParams.get('tier')==='premium');
 mode='error';await page.goto(`${base}/${locale}/overview`);await page.locator('.skill-shelf-empty').first().waitFor();assert.equal(await page.locator('.skill-shelf-empty').count(),2);
 await page.goto(`${base}/${locale}/skills`);const retry=page.getByRole('button',{name:zh?'重试':'Try again',exact:true});await retry.waitFor();mode='ready';await retry.click();await page.locator('.skill-card').first().waitFor();
 mode='empty';await page.reload();await page.locator('.skill-empty').waitFor();assert.equal(await page.locator('.skill-card').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
 results.push({width,locale,checks:['real-preview-assets','paid-and-free-shelves','search-route','task-filter','paid-filter','secondary-tools','mobile-menu-escape','locale-preserves-filter','error-retry','empty-state','no-overflow','no-page-errors'],scope:'Mock catalog and guest API; real local React app. Cover fixtures are illustrative, not published product records.'});await context.close();
}}finally{await browser.close();await writeFile(path.join(out,'results.json'),JSON.stringify(results,null,2));}
console.log(`PASS ${results.length} storefront viewport/locale scenarios`);
