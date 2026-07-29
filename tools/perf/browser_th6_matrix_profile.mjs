import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const separator = value.indexOf('=');
    return separator === -1
      ? [value.replace(/^--/, ''), '1']
      : [value.slice(2, separator), value.slice(separator + 1)];
  }),
);

const playwrightRoot = process.env.PLAYWRIGHT_CORE_PATH
  || 'C:/Users/Admin/AppData/Local/OpenAI/Codex/runtimes/cua_node/03b1cdac8af3a530/bin/node_modules/playwright-core';
const chromePath = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { chromium } = await import(
  pathToFileURL(path.join(playwrightRoot, 'index.mjs')).href
);

const serveDir = args['serve-dir']
  ? path.resolve(args['serve-dir'])
  : null;
const servePort = Number(args.port || 5181);
const url = args.url || `http://127.0.0.1:${servePort}/Work.html`;
const outputPath = path.resolve(
  args.output || '.codex-artifacts/perf/th6-matrix/report.json',
);
const screenshotDir = path.resolve(
  args.screenshots || '.codex-artifacts/perf/th6-matrix/screenshots',
);
const headed = String(args.headed || '1') !== '0';
const timeoutMs = Number(args['timeout-ms'] || 300000);
const viewport = {
  width: Number(args.width || 1365),
  height: Number(args.height || 768),
};
const resultPrefix = args['result-prefix']
  || '[TH6_BROWSER_MATRIX] RESULT ';
const successPrefix = args['success-prefix'] || '';

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(screenshotDir, { recursive: true });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pck': 'application/octet-stream',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};
let server = null;
if (serveDir) {
  server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, `http://${request.headers.host}`).pathname,
      );
      const relativePath = pathname === '/'
        ? 'Work.html'
        : pathname.replace(/^\/+/, '');
      const filePath = path.resolve(serveDir, relativePath);
      const allowedPrefix = `${serveDir}${path.sep}`;
      if (filePath !== serveDir && !filePath.startsWith(allowedPrefix)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      fsSync.createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(servePort, '127.0.0.1', resolve);
  });
}

const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clash-th6-profile-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: chromePath,
  headless: !headed,
  chromiumSandbox: false,
  viewport,
  deviceScaleFactor: 1,
  args: [
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--ignore-gpu-blocklist',
  ],
});
const pages = context.pages();
const page = pages[0] || await context.newPage();
const startedAt = Date.now();
const consoleEvents = [];
const pageErrors = [];
const requestFailures = [];
const screenshots = [];
let finalReport = null;
let screenshotQueue = Promise.resolve();
let browserEnvironment = {};

const safeName = (value) => String(value)
  .replace(/[^a-z0-9_-]+/gi, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80);

page.on('console', (message) => {
  const text = message.text();
  if (
    text.includes('[TH6_BROWSER_MATRIX]')
    || text.includes('[TH6_IDLE_RENDER]')
    || text.includes('[TH6_BOTTLENECK]')
    || text.includes('[TH6_DEFENSE_BREAKDOWN]')
    || text.includes('[WATER_VARIANT]')
    || text.includes('[FPS_PROFILE]')
    || text.includes('[TROOP_AI_PROFILE]')
    || text.includes('[TROOP_CROWD_PROFILE]')
    || text.includes('[WARMUP_PROFILE]')
    || text.includes('[WEB_STATIC_BATCH]')
    || text.includes('[WEB_STATIC_MULTIMESH]')
    || text.includes('[WEB_BUILDING_BASE_BATCH]')
    || message.type() === 'error'
    || message.type() === 'warning'
  ) {
    if (String(args.live || '0') === '1') {
      console.log(text);
    }
    consoleEvents.push({
      at_ms: Date.now() - startedAt,
      type: message.type(),
      text,
    });
  }
  const captureMatch = text.match(
    /\[(?:TH6_BROWSER_MATRIX|WATER_VARIANT)\] capture index=(\d+) name=([^\s]+)/,
  );
  if (captureMatch) {
    const index = Number(captureMatch[1]);
    const name = safeName(captureMatch[2]);
    const screenshotPath = path.join(
      screenshotDir,
      `${String(index).padStart(2, '0')}-${name}.png`,
    );
    screenshotQueue = screenshotQueue.then(async () => {
      await page.screenshot({
        path: screenshotPath,
        type: 'png',
      });
      screenshots.push(screenshotPath);
    }).catch((error) => {
      consoleEvents.push({
        at_ms: Date.now() - startedAt,
        type: 'screenshot_error',
        text: error.message,
      });
    });
  }
  const resultOffset = text.indexOf(resultPrefix);
  if (resultOffset !== -1) {
    try {
      finalReport = JSON.parse(
        text.slice(resultOffset + resultPrefix.length),
      );
    } catch (error) {
      pageErrors.push({
        at_ms: Date.now() - startedAt,
        message: `Failed to parse TH6 report: ${error.message}`,
      });
    }
  }
  if (successPrefix && text.includes(successPrefix)) {
    finalReport = { success: true, message: text };
  }
});
page.on('pageerror', (error) => {
  pageErrors.push({
    at_ms: Date.now() - startedAt,
    message: error.message,
    stack: error.stack || '',
  });
});
page.on('requestfailed', (request) => {
  requestFailures.push({
    at_ms: Date.now() - startedAt,
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
  });
});

try {
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForFunction(
    () => document.querySelector('canvas') != null,
    null,
    { timeout: 120000 },
  );
  await page.waitForFunction(
    () => performance.getEntriesByType('resource')
      .some((entry) => entry.name.endsWith('/Work.pck')),
    null,
    { timeout: 120000 },
  );
  browserEnvironment = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      hardware_concurrency: navigator.hardwareConcurrency || null,
      device_memory_gb: navigator.deviceMemory || null,
      user_agent: navigator.userAgent,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio,
      },
      webgl: gl ? {
        version: gl.getParameter(gl.VERSION),
        vendor: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          : gl.getParameter(gl.VENDOR),
        renderer: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      } : null,
    };
  });
  browserEnvironment.chrome_version = context.browser()?.version() || null;
  browserEnvironment.headed = headed;
  const deadline = Date.now() + timeoutMs;
  while (!finalReport && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }
  if (!finalReport) {
    throw new Error(`TH6 profile did not finish within ${timeoutMs}ms`);
  }
  await screenshotQueue;
  await page.screenshot({
    path: path.join(screenshotDir, 'final.png'),
    type: 'png',
  });
} finally {
  const payload = {
    url,
    elapsed_ms: Date.now() - startedAt,
    environment: browserEnvironment,
    report: finalReport,
    screenshots,
    console_events: consoleEvents,
    page_errors: pageErrors,
    request_failures: requestFailures,
  };
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2));
  await context.close();
  await fs.rm(profileDir, { recursive: true, force: true });
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

if (!finalReport) {
  throw new Error(`No report was produced. Diagnostics: ${outputPath}`);
}

const ranked = [...(
  finalReport.scenarios
  || finalReport.modes
  || finalReport.variants
  || []
)].sort(
  (left, right) => Number(left.median_fps) - Number(right.median_fps),
);
process.stdout.write(JSON.stringify({
  output: outputPath,
  elapsed_ms: Date.now() - startedAt,
  idle_fps: finalReport.idle?.median_fps
    ?? finalReport.idle?.default?.median_fps
    ?? null,
  slowest: ranked.slice(0, 5).map((item) => ({
    index: item.index,
    name: item.name,
    fps: item.median_fps,
    p95_frame_ms: item.p95_frame_ms,
    physics_ms: item.avg_physics_ms,
    draw_calls: item.avg_draw_calls,
    troops: item.active_troops,
    particles: item.active_particles,
  })),
  errors: pageErrors.length,
  failed_requests: requestFailures.length,
}, null, 2));
