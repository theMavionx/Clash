import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).map((value) => {
    const separator = value.indexOf('=');
    return separator === -1
      ? [value.replace(/^--/, ''), '1']
      : [value.slice(0, separator).replace(/^--/, ''), value.slice(separator + 1)];
  }),
);

const playwrightRoot = process.env.PLAYWRIGHT_CORE_PATH
  || 'C:/Users/Admin/AppData/Local/OpenAI/Codex/runtimes/cua_node/03b1cdac8af3a530/bin/node_modules/playwright-core';
const chromePath = process.env.CHROME_PATH
  || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const playwright = await import(pathToFileURL(path.join(playwrightRoot, 'index.mjs')).href);
const { chromium } = playwright;

const runId = args.run || `warmup_${Date.now()}`;
const baseUrl = args.url || 'http://127.0.0.1:5173/';
const url = new URL(baseUrl);
url.searchParams.set('guest', '1');
url.searchParams.set('guest_id', args['guest-id'] || `g_${runId}`);
const outputPath = path.resolve(args.output || `.tmp/perf/${runId}.json`);
const screenshotPath = path.resolve(args.screenshot || `.tmp/perf/${runId}.png`);
const warmupScreenshotPath = path.resolve(
  args['warmup-screenshot'] || `.tmp/perf/${runId}.warmup.png`,
);
const postReadyMs = Number(args['post-ready-ms'] || 20000);
const sampleMs = Number(args['sample-ms'] || 8000);
const warmupTimeoutMs = Number(args['warmup-timeout-ms'] || 120000);
const authDelayMs = Number(args['auth-delay-ms'] || 0);
const headed = String(args.headed || '1') !== '0';
const viewportWidth = Number(args['viewport-width'] || 1365);
const viewportHeight = Number(args['viewport-height'] || 768);
const attackMode = String(args.attack || '0');
const runAttack = attackMode !== '0';
const runEarlyAttack = attackMode === 'early';
const mockManualHud = String(args['mock-manual-hud'] || '0') !== '0';
const mockManualHudReady = String(args['mock-manual-ready'] || '1') !== '0';
const dismissUi = String(args['dismiss-ui'] || '1') !== '0';
const triggerVisibilityRecovery = String(args['visibility-recovery'] || '0') !== '0';

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
await fs.mkdir(path.dirname(warmupScreenshotPath), { recursive: true });

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: !headed,
  chromiumSandbox: false,
  args: [
    '--no-first-run',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--ignore-gpu-blocklist',
  ],
});
const context = await browser.newContext({
  viewport: { width: viewportWidth, height: viewportHeight },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const consoleEvents = [];
const pageErrors = [];
const requestFailures = [];
const startedAt = Date.now();

if (authDelayMs > 0) {
  await page.route('**/api/players/login-wallet', async (route) => {
    let isProbe = false;
    try {
      isProbe = route.request().postDataJSON()?.probeOnly === true;
    } catch {
      isProbe = false;
    }
    if (!isProbe) {
      await new Promise((resolve) => setTimeout(resolve, authDelayMs));
    }
    await route.continue();
  });
}

page.on('console', async (message) => {
  const text = message.text();
  if (
    text.includes('[WARMUP')
    || text.includes('[BATTLE_ENTRY]')
    || text.includes('[FPS_PROFILE]')
    || text.includes('[WEB_RENDER]')
    || text.includes('[GodotCanvas]')
    || message.type() === 'error'
    || message.type() === 'warning'
  ) {
    consoleEvents.push({
      at_ms: Date.now() - startedAt,
      type: message.type(),
      text,
    });
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

await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(
  () => Array.isArray(window.__clashGodotLoadingEvents)
    && window.__clashGodotLoadingEvents.some((event) => event.phase === 'stage2_complete'),
  null,
  { timeout: 120000 },
);
const stage2CompleteAtMs = Date.now() - startedAt;
await page.waitForFunction(
  () => window.__clashGodotStartupInteractive === true,
  null,
  { timeout: 30000 },
);
const readyAtMs = Date.now() - startedAt;
if (dismissUi) {
  const dismissPatterns = [
    /^got it$/i,
    /^play$/i,
    /^continue$/i,
    /^close$/i,
    /^skip$/i,
  ];
  for (let pass = 0; pass < 4; pass += 1) {
    let clicked = false;
    for (const pattern of dismissPatterns) {
      const button = page.getByRole('button', { name: pattern }).last();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        clicked = true;
      }
    }
    if (!clicked) break;
  }
  const canvas = page.locator('canvas').first();
  const bounds = await canvas.boundingBox();
  if (bounds) {
    const canvasDismissPasses = Number(
      args['canvas-dismiss-passes'] ?? (runEarlyAttack ? 1 : 4),
    );
    for (let pass = 0; pass < canvasDismissPasses; pass += 1) {
      await page.mouse.click(
        bounds.x + bounds.width * 0.424,
        bounds.y + bounds.height * 0.868,
      );
      await page.waitForTimeout(350);
    }
  }
}

if (mockManualHud) {
  await page.evaluate((ready) => {
    window.onGodotMessage?.({
      action: 'enemy_mode',
      data: { active: true, is_replay: false },
    });
    window.onGodotMessage?.({
      action: 'fleet_info',
      data: {
        mode: 'manual_troops',
        ready,
        selected_group: 0,
        remaining: 24,
        ship: { level: 6, capacity: 24 },
        troop_groups: [
          { key: 'knight', label: 'Knight', count: 4 },
          { key: 'archer', label: 'Archer', count: 4 },
          { key: 'mage', label: 'Mage', count: 3 },
          { key: 'peashooter', label: 'Pea Shooter', count: 3 },
          { key: 'barrel', label: 'Barrel', count: 3 },
          { key: 'mechanicaldragon', label: 'Mech Dragon', count: 2 },
          { key: 'icegolem', label: 'Ice Golem', count: 2 },
          { key: 'necromancer', label: 'Necromancer', count: 2 },
          { key: 'horror', label: 'Horror', count: 2 },
          { key: 'windmage', label: 'Wind Mage', count: 1 },
          { key: 'demonking', label: 'Demon King', count: 1 },
          { key: 'firedragon', label: 'Fire Dragon', count: 1 },
        ],
      },
    });
    window.onGodotMessage?.({
      action: 'cannon_energy',
      data: {
        energy: 14,
        next_cost: 1,
        rally_next_cost: 1,
        medkit_cost: 6,
        medkit_unlocked: true,
        medkit_used: false,
        freeze_cost: 5,
        freeze_unlocked: true,
        freeze_used: false,
        rage_cost: 7,
        rage_unlocked: true,
        rage_used: false,
        skeleton_barrel_cost: 8,
        skeleton_barrel_unlocked: true,
        skeleton_barrel_used: false,
      },
    });
  }, mockManualHudReady);
  await page.waitForSelector('[aria-label="Troops available to deploy"]', {
    timeout: 5000,
  });
  for (let pass = 0; pass < 4; pass += 1) {
    const skipButton = page.getByRole('button', { name: /^skip$/i }).last();
    if (!await skipButton.isVisible().catch(() => false)) break;
    await skipButton.click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

const collectFpsSample = (durationMs) => page.evaluate(async (sampleDurationMs) => {
  const frameTimes = [];
  const longFrames = [];
  const start = performance.now();
  let previous = start;
  await new Promise((resolve) => {
    const tick = (now) => {
      const frameMs = now - previous;
      frameTimes.push(frameMs);
      if (frameMs > 33.34) {
        longFrames.push({
          at_ms: Math.round(now - start),
          frame_ms: frameMs,
        });
      }
      previous = now;
      if (now - start >= sampleDurationMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const sorted = [...frameTimes].sort((a, b) => a - b);
  const percentile = (ratio) => sorted[Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * ratio)),
  )] || 0;
  const total = frameTimes.reduce((sum, value) => sum + value, 0);
  return {
    frames: frameTimes.length,
    duration_ms: Math.round(total),
    average_fps: total > 0 ? (frameTimes.length * 1000) / total : 0,
    median_frame_ms: percentile(0.5),
    p95_frame_ms: percentile(0.95),
    p99_frame_ms: percentile(0.99),
    max_frame_ms: sorted.at(-1) || 0,
    frames_over_33ms: frameTimes.filter((value) => value > 33.34).length,
    frames_over_50ms: frameTimes.filter((value) => value > 50).length,
    frames_over_100ms: frameTimes.filter((value) => value > 100).length,
    long_frames: longFrames
      .sort((a, b) => b.frame_ms - a.frame_ms)
      .slice(0, 20),
  };
}, durationMs);

const triggerAttackProbe = async () => {
  for (let pass = 0; pass < 10; pass += 1) {
    let dismissed = false;
    for (const label of [/^skip$/i, /^done$/i, /^close$/i]) {
      const button = page.getByRole('button', { name: label }).last();
      if (await button.isVisible().catch(() => false)) {
        await button.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(250);
        dismissed = true;
        break;
      }
    }
    if (!dismissed) break;
  }
  const canvas = page.locator('canvas').first();
  const bounds = await canvas.boundingBox();
  if (!bounds) return null;
  const attackStartedAt = Date.now();
  const attackButton = page.locator('[data-tutorial="attack-btn"]').first();
  if (await attackButton.isVisible().catch(() => false)) {
    await attackButton.click({ timeout: 2000 });
  } else {
    await page.mouse.click(
      bounds.x + bounds.width * 0.055,
      bounds.y + bounds.height * 0.88,
    );
  }
  const attackDeadline = Date.now() + 30000;
  while (Date.now() < attackDeadline) {
    if (consoleEvents.some(
      (entry) => entry.text.includes('[BATTLE_ENTRY] attack_mode_entered'),
    )) {
      break;
    }
    const bridgeActive = await page.evaluate(
      () => window.__clashGodotMessages?.some?.(
        (entry) => String(entry?.type || '') === 'enemy_mode'
          && entry?.payload?.active === true,
      ) || false,
    );
    if (bridgeActive) break;
    await page.waitForTimeout(100);
  }
  return {
    elapsed_ms: Date.now() - attackStartedAt,
    logs: consoleEvents.filter((entry) => entry.text.includes('[BATTLE_ENTRY]')),
  };
};

let attack = null;
if (runEarlyAttack) {
  attack = await triggerAttackProbe();
}
await page.waitForTimeout(900);
await page.screenshot({ path: warmupScreenshotPath, fullPage: false });

const warmupFpsSample = await collectFpsSample(postReadyMs);
let warmupCompletionTimedOut = false;
const postReadyWarmupState = await page.evaluate(
  () => window.__clashCombatIdleWarmup || null,
);
if (postReadyWarmupState && postReadyWarmupState.state !== 'complete') {
  try {
    await page.waitForFunction(
      () => window.__clashCombatIdleWarmup?.state === 'complete',
      null,
      { timeout: warmupTimeoutMs },
    );
  } catch {
    warmupCompletionTimedOut = true;
  }
}
const warmupCompleteAtMs = postReadyWarmupState
  ? Date.now() - startedAt
  : readyAtMs;
let visibilityRecovery = null;
if (triggerVisibilityRecovery) {
  const recoveryStartedAt = Date.now();
  const previousFinishCount = await page.evaluate(
    () => (window.__clashGodotLoadingEvents || [])
      .filter((event) => event.phase === 'fps_recovery_finish').length,
  );
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  let timedOut = false;
  try {
    await page.waitForFunction(
      (finishCount) => (window.__clashGodotLoadingEvents || [])
        .filter((event) => event.phase === 'fps_recovery_finish').length > finishCount,
      previousFinishCount,
      { timeout: 10000 },
    );
  } catch {
    timedOut = true;
  }
  visibilityRecovery = {
    elapsed_ms: Date.now() - recoveryStartedAt,
    timed_out: timedOut,
    diagnostics: await page.evaluate(() => ({
      hidden: document.hidden,
      has_visibility_handler: typeof window.__clashFpsVisibilityHandler === 'function',
      has_godot_callback: typeof window._godotFpsVisibilityCb === 'function',
    })),
    events: await page.evaluate(
      () => (window.__clashGodotLoadingEvents || [])
        .filter((event) => String(event.phase || '').startsWith('fps_recovery_'))
        .slice(-8),
    ),
  };
}
const fpsSample = await collectFpsSample(sampleMs);

if (runAttack && !runEarlyAttack) {
  attack = await triggerAttackProbe();
}

const manualHudScrollProbe = mockManualHud
  ? await page.evaluate(() => {
    const scroller = document.querySelector('[aria-label="Troops available to deploy"]');
    const lastCard = scroller?.querySelector('[data-troop-index]:last-child');
    if (!scroller || !lastCard) return null;
    const initialScrollLeft = scroller.scrollLeft;
    scroller.scrollLeft = scroller.scrollWidth;
    const lastCardRect = lastCard.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    return {
      initial_scroll_left: initialScrollLeft,
      final_scroll_left: scroller.scrollLeft,
      max_scroll_left: scroller.scrollWidth - scroller.clientWidth,
      last_card_visible: lastCardRect.left >= scrollerRect.left
        && lastCardRect.right <= scrollerRect.right,
    };
  })
  : null;
if (manualHudScrollProbe) {
  await page.waitForTimeout(120);
}
await page.screenshot({ path: screenshotPath, fullPage: false });
const loadingEvents = await page.evaluate(
  () => Array.isArray(window.__clashGodotLoadingEvents)
    ? window.__clashGodotLoadingEvents.slice()
    : [],
);
const result = {
  run_id: runId,
  url: url.href,
  headed,
  stage2_complete_at_ms: stage2CompleteAtMs,
  ready_at_ms: readyAtMs,
  warmup_complete_at_ms: warmupCompleteAtMs,
  warmup_completion_timed_out: warmupCompletionTimedOut,
  post_ready_warmup_state: postReadyWarmupState,
  visibility_recovery: visibilityRecovery,
  captured_at_ms: Date.now() - startedAt,
  loading_events: loadingEvents,
  warmup_fps: warmupFpsSample,
  fps: fpsSample,
  attack,
  manual_hud_scroll: manualHudScrollProbe,
  manual_hud: mockManualHud
    ? await page.evaluate(() => {
      const scroller = document.querySelector('[aria-label="Troops available to deploy"]');
      const cards = [...(scroller?.querySelectorAll('[data-troop-index]') || [])];
      const rect = scroller?.getBoundingClientRect();
      const surrender = document.querySelector('[aria-label="Surrender"]')?.getBoundingClientRect();
      const pea = document.querySelector('[aria-label^="Deploy Pea Shooter"]');
      const peaRect = pea?.getBoundingClientRect();
      const abilityButtons = [...document.querySelectorAll('[aria-label]')]
        .filter((element) => /cannon|rally|medkit|freeze|rage|skeleton barrel/i.test(
          element.getAttribute('aria-label') || '',
        ))
        .map((element) => element.getBoundingClientRect());
      const overlaps = (a, b) => !!a && !!b
        && a.left < b.right
        && a.right > b.left
        && a.top < b.bottom
        && a.bottom > b.top;
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroller: rect ? {
          left: rect.left,
          right: rect.right,
          width: rect.width,
          client_width: scroller.clientWidth,
          scroll_width: scroller.scrollWidth,
        } : null,
        card_count: cards.length,
        card_widths: cards.map((card) => card.getBoundingClientRect().width),
        pea_present: !!pea,
        pea_rect: peaRect ? {
          left: peaRect.left,
          right: peaRect.right,
          top: peaRect.top,
          bottom: peaRect.bottom,
        } : null,
        surrender_overlap: cards.some((card) => overlaps(card.getBoundingClientRect(), surrender)),
        ability_overlap: cards.some((card) => abilityButtons.some(
          (ability) => overlaps(card.getBoundingClientRect(), ability),
        )),
        cards_outside_viewport: cards.filter((card) => {
          const cardRect = card.getBoundingClientRect();
          return cardRect.top < 0 || cardRect.bottom > window.innerHeight;
        }).length,
      };
    })
    : null,
  console_events: consoleEvents,
  page_errors: pageErrors,
  request_failures: requestFailures,
  screenshot: screenshotPath,
  warmup_screenshot: warmupScreenshotPath,
};
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  output: outputPath,
  screenshot: screenshotPath,
  warmup_screenshot: warmupScreenshotPath,
  stage2_complete_at_ms: stage2CompleteAtMs,
  ready_at_ms: readyAtMs,
  warmup_complete_at_ms: warmupCompleteAtMs,
  warmup_completion_timed_out: warmupCompletionTimedOut,
  visibility_recovery: visibilityRecovery,
  warmup_fps: warmupFpsSample,
  fps: fpsSample,
  page_errors: pageErrors.length,
  request_failures: requestFailures.length,
  warmup_logs: consoleEvents.filter((entry) => entry.text.includes('[WARMUP')).length,
  attack_elapsed_ms: attack?.elapsed_ms ?? null,
}, null, 2));
await browser.close();
