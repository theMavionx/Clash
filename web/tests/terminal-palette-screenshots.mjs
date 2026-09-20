// Local-only screenshots of production components with deterministic mock data.
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')).href);
const output = join(process.cwd(), 'artifacts/terminal-palette');
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  for (const [device, viewport] of [['desktop',{width:1920,height:1080}],['mobile',{width:390,height:844}]]) {
    const page = await browser.newPage({viewport});
    const errors=[];
    page.on('pageerror', error=>errors.push(error.message));
    await page.route('**/decibel.png', route=>route.fulfill({path:join(process.cwd(),'src/assets/decibel.svg'),contentType:'image/svg+xml'}));
    await page.route('**/api/**', route=>route.fulfill({json:route.request().url().includes('/tasks')?[]:{gold:1000}}));
    await page.goto('http://127.0.0.1:5200/?balance=100&position=1&terminal=1&theme=dark');
    await page.locator('.tab-btn').first().waitFor();
    await page.waitForTimeout(1200);
    const tokens=await page.locator('.futures-terminal-shell').evaluate(el=>{
      const s=getComputedStyle(el); return Object.fromEntries(['canvas','surface','text','text-muted','long','short'].map(n=>[n,s.getPropertyValue('--terminal-'+n).trim()]));
    });
    console.log(device, tokens);
    assert.equal(tokens.canvas.toLowerCase(),'#000000');
    assert.equal(tokens.surface.toLowerCase(),'#111112');
    assert.equal(tokens.long.toLowerCase(),'#3ce362');
    assert.equal(tokens.short.toLowerCase(),'#ff4953');
    for(const tab of ['Trade','Positions','Orders','Quests','Account','History','Funding']) {
      await page.locator('.tab-btn').filter({hasText:new RegExp('^'+tab+'$')}).click();
      await page.waitForTimeout(350);
      await page.screenshot({path:join(output,`${device}-${tab.toLowerCase()}.png`),fullPage:true});
    }
    await page.locator('.tab-btn').filter({hasText:/^Trade$/}).click();
    await page.getByRole('button',{name:/^Adjust leverage,/}).click();
    await page.waitForTimeout(150);
    await page.screenshot({path:join(output,`${device}-leverage.png`),fullPage:true});
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByRole('button',{name:/^Select market,/}).click();
    const row=page.locator('.futures-symbol-row').first();
    await row.hover();
    assert.equal(await row.locator('td').last().evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(29, 31, 33)');
    await page.screenshot({path:join(output,`${device}-markets.png`),fullPage:true});
    await page.reload();
    await page.locator('.tab-btn').filter({hasText:/^Positions$/}).click();
    await page.getByRole('button',{name:'TP/SL',exact:true}).first().click();
    await page.waitForTimeout(150);
    await page.screenshot({path:join(output,`${device}-position-tpsl.png`),fullPage:true});
    await page.reload();
    await page.getByRole('button',{name:'Submit long',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(output,`${device}-ticket.png`),fullPage:true});
    await page.keyboard.press('Tab');
    const focus=await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle);
    assert.equal(focus,'solid','Keyboard focus remains visible');
    await page.goto('http://127.0.0.1:5200/?balance=100&position=1&terminal=1&theme=light');
    await page.locator('.futures-terminal-shell').waitFor();
    assert.notEqual(await page.locator('.futures-terminal-shell').evaluate(el=>getComputedStyle(el).getPropertyValue('--terminal-surface').trim()),'#111112');
    await page.screenshot({path:join(output,`${device}-light-regression.png`),fullPage:true});
    assert.deepEqual(errors,[]);
    await page.close();
  }
} finally {await browser.close();}
console.log('Screenshots:',output);
const files=(await readdir(output)).filter(name=>name.endsWith('.png'));
await writeFile(join(output,'index.html'),`<!doctype html><meta charset="utf-8"><title>Terminal palette — local previews</title><style>body{background:#000;color:#e8e9ef;font:16px system-ui;margin:24px}section{margin:32px 0}img{max-width:100%;border:1px solid #ffffff12}a{color:#fa8038}</style><h1>Terminal palette · local previews</h1><p>Mock account and market data. No production deployment. History, funding and orders show empty states.</p>${files.map(name=>`<section><h2>${name}</h2><a href="${name}"><img loading="lazy" src="${name}" alt="${name}"></a></section>`).join('')}`);
