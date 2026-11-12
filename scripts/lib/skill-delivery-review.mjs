import { writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function writeDeliveryReview(out, results) {
await writeFile(path.join(out, 'review.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebToMind — Skill delivery review</title>
<style>
body{font:16px/1.6 system-ui,sans-serif;color:#20211d;background:#f4f3ee;margin:0;padding:40px}
main{max-width:1280px;margin:auto}h1{font-size:36px;line-height:1.2}h2{margin-top:50px}
.note{max-width:850px;color:#555}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px}
figure{margin:0;background:white;padding:12px;border-radius:12px}img{width:100%;height:340px;object-fit:contain}figcaption{font-size:13px;overflow-wrap:anywhere}video{width:100%;max-height:600px;background:#111}a{color:#235d47}.hash{font:12px monospace;overflow-wrap:anywhere}
@media(max-width:500px){body{padding:20px}h1{font-size:28px}}
</style><main>
<p>WEBTOMIND / LOCAL DELIVERY ACCEPTANCE</p><h1>${results.length} verified Skill packages.</h1>
<p class="note">Actual outputs rendered from the archived packages installed into isolated Agent directories. Authored demonstration inputs are rendered using installed package files. This is a local technical acceptance run, not a new independent Agent discovery test, a customer case or a production purchase.</p>
<p class="note">Videos below are silent Skill outputs; dimensions and duration are reported per file. No payment or publication was performed.</p>
${results.map(result => `<section><h2>${result.slug} <small>v${result.version}</small></h2>
<p>Codex + Claude Code directory installation · unchanged reinstall · tamper rejection · offline rendering</p>
<p><a href="${result.slug}/input.html">Editable input</a>${(result.outputType === 'slides' || result.slug === 'weekly-report-deck') ? ` · <a href="${result.slug}/deck.pdf">PDF</a>` : ''} · <a href="${result.slug}/${result.slug}-${result.version}.tar.gz">Reviewed package</a></p>
<p class="hash">SHA-256 ${result.archiveSha256}</p>
${result.video ? `<video src="${result.slug}/result.mp4" poster="${result.slug}/result-poster.jpg" controls preload="metadata"></video><p>${result.video.width} × ${result.video.height} · ${result.video.duration}s · no audio</p>` : ''}
<div class="grid">${result.images.map(img => `<figure><a href="${result.slug}/${img.file}"><img src="${result.slug}/${img.file}" alt="${result.slug} ${img.file}"></a><figcaption>${img.file} · ${img.width} × ${img.height}</figcaption></figure>`).join('')}</div></section>`).join('')}
<p><a href="results.json">Machine-readable evidence</a></p></main></html>`);

}
