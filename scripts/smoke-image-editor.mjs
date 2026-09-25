import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { installUiAuditMockRoutes } from './lib/ui-audit-fixtures.mjs';

// Real rendered UI + local pixel checks, with all API calls intercepted.
// This never submits a paid generation or writes a production asset.
const baseUrl = process.env.EDITOR_SMOKE_BASE_URL || 'http://127.0.0.1:4174';
const outputDir = resolve(process.env.EDITOR_SMOKE_OUTPUT_DIR || '.artifacts/image-editor-optimization');
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL || 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width:1440, height:1000 } });
const uploads = [], submissions = [], originals = [], checks = [];
let fixture;
try {
  await context.route('**/api/**', (route) => route.fulfill({ json: { success:true, items:[], tasks:[], models:[] } }));
  await installUiAuditMockRoutes(context, { baseUrl, seedAuthSession:true });
  const page = await context.newPage();
  await page.goto(baseUrl);
  fixture = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=1024; canvas.height=768;
    const ctx=canvas.getContext('2d'); ctx.fillStyle='#ddd2bb';ctx.fillRect(0,0,1024,768);
    ctx.fillStyle='#284638';ctx.fillRect(190,150,260,370);
    ctx.fillStyle='#efe8db';ctx.font='48px sans-serif';ctx.fillText('EDIT 1024',500,390);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await context.route('**/__editor-fixture/*.png', (route) => route.fulfill({ contentType:'image/png', body:fixture }));
  await context.route('**/api/image/references/upload', (route) => {
    const request = route.request().postDataJSON(); uploads.push(request);
    return route.fulfill({ json:{ reference:{ id:`reference-${uploads.length}`, thumbnailUrl:`${baseUrl}/__editor-fixture/source.png` } } });
  });
  await context.route('**/api/image/references/from-generation', (route) => route.fulfill({ json:{ reference:{id:'current-original-reference',thumbnailUrl:`${baseUrl}/__editor-fixture/source.png`} } }));
  await context.route('**/api/image/history?*content=*', (route) => {
    originals.push(route.request().url()); return route.fulfill({ contentType:'image/png', body:fixture });
  });
  await context.route('**/api/image/generate', (route) => {
    submissions.push(route.request().postDataJSON());
    return submissions.length === 1
      ? route.fulfill({ status:503, json:{ error:'测试提交失败，请重试' } })
      : route.fulfill({ status:202, json:{ queued:true,taskId:'editor-test-task' } });
  });
  await context.route('**/api/image/task?*', (route) => route.fulfill({ json:{ status:'succeeded', images:[{generationId:'edited-version',imageUrl:`${baseUrl}/__editor-fixture/result.png`}] } }));
  await page.goto(`${baseUrl}/zh-CN/tools/image-editor`);
  await page.locator('input[type=file]').first().setInputFiles({name:'source.png',mimeType:'image/png',buffer:fixture});
  await page.locator('.image-editor-workspace').waitFor();
  await page.locator('[data-editor-tool=region] .image-editor-tool-trigger').click();
  const box = await page.locator('.image-editor-canvas-image').boundingBox(); assert(box);
  await page.mouse.move(box.x+box.width*.2,box.y+box.height*.2);
  await page.mouse.down(); await page.mouse.move(box.x+box.width*.4,box.y+box.height*.45,{steps:8}); await page.mouse.up();
  const regionInput=page.locator('.image-editor-panel-region textarea').first();
  assert((await page.locator('.image-editor-panel-generate').innerText()).includes('100'), 'selection guide must be included in the displayed credit estimate');
  await regionInput.fill('Make the door blue'); await regionInput.press('End'); await regionInput.press('Space');
  assert((await regionInput.inputValue()).endsWith(' '));
  for (const width of [1440,1280,390]) {
    await page.setViewportSize({width,height:width===390?844:1000});
    await page.waitForFunction(() => [...document.querySelectorAll('.image-editor-workspace, .image-editor-panel')].every(x=>{const r=x.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;}),{},{timeout:5000});
    const geometry=await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth>innerWidth,clipped:[...document.querySelectorAll('.image-editor-workspace, .image-editor-panel, .image-editor-panel-generate')].some(x=>{const r=x.getBoundingClientRect();return r.left<0||r.right>innerWidth+1;}),upsell:!!document.querySelector('.credits-upgrade-prompt'),buttons:[...document.querySelectorAll('.image-editor-panel-region button')].map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})),generateCount:document.querySelectorAll('.image-editor-panel-generate').length }));
    assert(!geometry.overflow, `${width}px overflow`);assert(!geometry.clipped, `${width}px clipped controls`);assert(!geometry.upsell);assert.equal(geometry.generateCount,1);
    assert(geometry.buttons.every(b=>b.width>=44&&b.height>=44));
    const imageRect=await page.locator('.image-editor-source-image').boundingBox();assert(Math.abs(imageRect.width/imageRect.height-1024/768)<0.01,'letterboxing changes selection coordinates');
    assert.equal(await page.locator('.image-editor-region').first().evaluate(x=>getComputedStyle(x).zIndex),'2');
    await page.screenshot({path:resolve(outputDir,`editor-${width}.png`),fullPage:true}); checks.push({width,...geometry});
  }
  await regionInput.press('Enter');
  await page.getByRole('alert').filter({hasText:'测试提交失败'}).waitFor();
  assert(await page.locator('.image-editor-panel-generate').isEnabled());
  assert.equal(submissions.length,1); assert(submissions[0].maskImageId);
  const maskUpload=uploads.find(x=>x.label==='选区蒙版'); assert(maskUpload);
  const maskPixels=await page.evaluate(async (base64) => {
    const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();
    const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    return {width:c.width,height:c.height,inside:ctx.getImageData(Math.round(c.width*.3),Math.round(c.height*.3),1,1).data[3],outside:ctx.getImageData(5,5,1,1).data[3]};
  },maskUpload.imageBase64);
  assert.deepEqual(maskPixels,{width:1024,height:768,inside:0,outside:255});
  await page.locator('.image-editor-panel-generate').click();
  await page.locator('.image-editor-versions-strip button').nth(1).waitFor();
  assert.equal(submissions.length,2); assert.equal(await page.locator('.image-editor-panel-region').count(),0);
  await page.locator('[data-editor-tool=enhance] .image-editor-tool-trigger').click();
  await page.locator('.image-editor-enhance-options summary').click();
  await page.locator('.image-editor-enhance-options details button').filter({hasText:/^2K$/}).click();
  await page.locator('.image-editor-versions-strip button').nth(2).waitFor({timeout:30000});
  assert(originals.some(url=>url.includes('id=edited-version')&&url.includes('content=original')));
  assert(page.url().includes('/tools/image-editor')); assert.equal(submissions.length,2);
  await page.locator('.image-editor-versions-strip button').first().click();
  assert((await page.locator('.image-editor-canvas-image img').first().getAttribute('src')).startsWith('data:'));
  checks.push({retrySucceeded:true,maskPixels,inlineUpscaleOriginal:true,versions:3,noExtraCloudGeneration:true});
  const prefill=`${baseUrl}/zh-CN/tools/image-upscaler?source=${encodeURIComponent(`${baseUrl}/__editor-fixture/source.png`)}`;
  for(let visit=0;visit<2;visit++) { await page.goto(prefill); await page.locator('.image-upscale-queue-item').waitFor(); assert.equal(await page.locator('.image-upscale-queue-item').count(),1);assert(await page.locator('.image-tool-run-button').isEnabled()); }
  checks.push({repeatPrefill:true});
  await writeFile(resolve(outputDir,'results.json'),JSON.stringify({ok:true,api:'mocked',checks},null,2));
  console.log(JSON.stringify({ok:true,api:'mocked',checks},null,2));
} catch(error) {
  const page=context.pages().at(-1); if(page) console.error(await page.locator('.image-editor-panel').evaluate(el=>{const a=[];for(let x=el;x;x=x.parentElement){const s=getComputedStyle(x);a.push({class:x.className,rect:x.getBoundingClientRect().toJSON(),width:s.width,minWidth:s.minWidth,margin:s.margin,grid:s.gridTemplateColumns})}return a;})); if(page) await page.screenshot({path:resolve(outputDir,'failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally { await browser.close(); }
