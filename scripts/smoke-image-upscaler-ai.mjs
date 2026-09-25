import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

// Real WebGPU inference, no cloud generation or paid API requests.
const baseUrl = process.env.UPSCALER_AI_BASE_URL || 'http://127.0.0.1:4174';
const outputDir = resolve(process.env.UPSCALER_AI_OUTPUT_DIR || '.artifacts/image-upscaler-ai');
await mkdir(outputDir, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1000}});
const page = await context.newPage();
const errors = [];
const progressLog=setInterval(() => { void page.locator('.image-tool-status, .image-upscale-queue-item').allTextContents().then(text=>console.log({progress:text})).catch(()=>{}); }, 15000);
progressLog.unref();
page.on('pageerror', error => errors.push(error.message));
try {
  if (new URL(baseUrl).hostname === '127.0.0.1') {
    await context.route('**/models/image-tools/**', async route => {
      const response = await context.request.get(`https://webtomind.com${new URL(route.request().url()).pathname}`,{timeout:120000});
      await route.fulfill({response});
    });
  }
  const photo = (await readFile(resolve('server/public/create-apps/image-upscaler.webp'))).toString('base64');
  const source = await page.evaluate(async data => {
    const img = await createImageBitmap(await (await fetch(`data:image/webp;base64,${data}`)).blob());
    const c=document.createElement('canvas');c.width=1024;c.height=576;const x=c.getContext('2d');x.drawImage(img,0,0,1024,576);
    // Known sharp fine-detail patch exposes loss caused by pre-inference shrink.
    x.fillStyle='white';x.fillRect(10,10,270,80);x.fillStyle='black';x.font='16px sans-serif';x.fillText('Original detail 1024 → 2048',20,36);
    for(let i=0;i<120;i+=4)x.fillRect(20+i,48,1,30);
    return c.toDataURL('image/png');
  },photo);
  await writeFile(resolve(outputDir,'source-1024.png'),Buffer.from(source.split(',')[1],'base64'));
  await page.goto(`${baseUrl}/zh-CN/tools/image-upscaler?ai-smoke=${Date.now()}`);
  assert(await page.evaluate(() => Boolean(navigator.gpu)), 'WebGPU unavailable');
  await page.locator('input[type=file]').setInputFiles({name:'detail-1024.png',mimeType:'image/png',buffer:Buffer.from(source.split(',')[1],'base64')});
  await page.locator('.image-upscale-queue-item').waitFor();
  const started=Date.now();
  await page.locator('.image-tool-run-button').click();
  await page.waitForFunction(() => document.querySelector('.image-tool-result-header')?.textContent.includes('Real-ESRGAN') || document.querySelector('.image-upscale-queue-copy .status.error'),{},{timeout:600000});
  const text=await page.locator('.image-tool-result-header').innerText();
  assert(text.includes('Real-ESRGAN'),text);
  const result=await page.locator('.image-tool-comparison img').nth(1).evaluate(img => {const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);return {width:c.width,height:c.height,data:c.toDataURL('image/png')};});
  assert.equal(result.width,2048);assert.equal(result.height,1152);
  await writeFile(resolve(outputDir,'result-2048.png'),Buffer.from(result.data.split(',')[1],'base64'));
  await page.screenshot({path:resolve(outputDir,'real-ai.png'),fullPage:true});
  const report={ok:true,engine:'Real-ESRGAN · WebGPU',input:[1024,576],output:[result.width,result.height],elapsedMs:Date.now()-started,errors,baseUrl,qualityBenchmark:false};
  await writeFile(resolve(outputDir,'results.json'),JSON.stringify(report,null,2));console.log(report);
} finally {clearInterval(progressLog); await browser.close();}
