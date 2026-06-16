const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const [browserName, executablePath, widthText, heightText, baseUrl, outputDir, profile = "desktop"] = process.argv.slice(2);
const width = Number(widthText);
const height = Number(heightText);

function cleanUrl(url) {
  return url.replace(baseUrl, "/");
}

async function runPage(browser, pageName, url, gamepad = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    reducedMotion: "no-preference"
  });
  if (profile === "laptop") {
    await context.addInitScript(() => {
      localStorage.setItem("trenchRunnerSettings", JSON.stringify({
        music: 24,
        sfx: 90,
        sensitivity: 100,
        effects: "low",
        subtitles: true,
        colorVision: "normal",
        reducedMotion: true
      }));
    });
  }
  if (gamepad) {
    await context.addInitScript(() => {
      const buttons = Array.from({ length: 16 }, () => ({ pressed: false, touched: false, value: 0 }));
      window.__qaGamepad = {
        id: "QA STANDARD GAMEPAD",
        index: 0,
        connected: true,
        mapping: "standard",
        timestamp: 1,
        axes: [0, 0, 0, 0],
        buttons,
        vibrationActuator: null
      };
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => [window.__qaGamepad, null, null, null]
      });
    });
  }

  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];
  page.on("console", message => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("requestfailed", request => requestFailures.push({
    url: cleanUrl(request.url()),
    error: request.failure()?.errorText || "unknown"
  }));
  page.on("response", response => {
    if (response.status() >= 400) httpErrors.push({ url: cleanUrl(response.url()), status: response.status() });
  });

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1200);
  let details;
  let inputSnapshot = null;

  if (pageName === "submission") {
    details = await page.evaluate(() => ({
      title: document.title,
      images: [...document.images].filter(image => image.getAttribute("src")).map(image => ({
        src: image.getAttribute("src"),
        loaded: image.complete && image.naturalWidth > 0
      })),
      videoReady: document.querySelector("video")?.readyState >= 1,
      playLinks: document.querySelectorAll('a[href="index.html?jury"]').length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth
    }));
  } else {
    await page.waitForFunction(() => window.TR_QA && window.TR_QA.snapshot().state === "playing", null, { timeout: 12000 });
    if (gamepad) {
      await page.evaluate(() => {
        window.__qaGamepad.axes[0] = .85;
        window.__qaGamepad.buttons[7] = { pressed: true, touched: true, value: 1 };
        window.__qaGamepad.buttons[5] = { pressed: true, touched: true, value: 1 };
        window.__qaGamepad.timestamp += 1;
      });
      await page.waitForTimeout(900);
      inputSnapshot = await page.evaluate(() => window.TR_QA.snapshot());
      await page.evaluate(() => {
        window.__qaGamepad.axes[0] = 0;
        window.__qaGamepad.buttons[7] = { pressed: false, touched: false, value: 0 };
        window.__qaGamepad.buttons[5] = { pressed: false, touched: false, value: 0 };
      });
    }
    if (profile === "laptop") await page.waitForTimeout(9000);
    details = await page.evaluate(() => ({
      qa: window.TR_QA.snapshot(),
      performance: window.TR_BENCHMARK?.snapshot().performance || null,
      accessibility: window.TR_ACCESSIBILITY?.snapshot() || null,
      canvas: {
        width: document.querySelector("#game").width,
        height: document.querySelector("#game").height
      },
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth
    }));
    details.inputSnapshot = inputSnapshot;
  }

  const screenshotPath = path.join(outputDir, `${browserName}-${profile}-${pageName}-${width}x${height}.png`);
  await page.screenshot({ path: screenshotPath });
  await context.close();
  return {
    page: pageName,
    url: cleanUrl(url),
    details,
    consoleErrors,
    pageErrors,
    requestFailures,
    httpErrors,
    screenshot: path.basename(screenshotPath)
  };
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const args = ["--autoplay-policy=no-user-gesture-required"];
  const browser = await chromium.launch({ headless: true, executablePath, args });
  try {
    const submission = await runPage(browser, "submission", `${baseUrl}submission.html`);
    const game = await runPage(browser, "game", `${baseUrl}index.html?jury`, true);
    const errors = [
      ...submission.consoleErrors, ...submission.pageErrors,
      ...game.consoleErrors, ...game.pageErrors
    ];
    const networkErrors = [
      ...submission.requestFailures, ...submission.httpErrors,
      ...game.requestFailures, ...game.httpErrors
    ].filter(error => !(
      error.error === "net::ERR_ABORTED" &&
      error.url.endsWith("/trailer/trench-runner-2086-trailer-final.mp4") &&
      submission.details.videoReady
    ));
    const gamepadPassed = game.details.inputSnapshot?.gamepadConnected &&
      Math.abs(game.details.inputSnapshot.playerX) > .01 &&
      game.details.inputSnapshot.shots > 0;
    const voicePassed = game.details.qa.voiceAssets === 6 &&
      game.details.inputSnapshot?.voiceActive;
    const layoutPassed = submission.details.scrollWidth <= submission.details.innerWidth &&
      game.details.scrollWidth <= game.details.innerWidth &&
      game.details.qa.width === width &&
      game.details.qa.height === height;
    const assetsPassed = submission.details.images.every(image => image.loaded) &&
      submission.details.videoReady &&
      submission.details.playLinks === 3;
    const fps = game.details.performance?.averageFps ?? null;
    const performancePassed = profile !== "laptop" || (fps !== null && fps >= 30);

    const report = {
      browser: browserName,
      version: browser.version(),
      profile,
      viewport: `${width}x${height}`,
      passed: errors.length === 0 && networkErrors.length === 0 &&
        gamepadPassed && voicePassed && layoutPassed && assetsPassed && performancePassed,
      checks: { layoutPassed, assetsPassed, gamepadPassed, voicePassed, performancePassed, fps },
      errors,
      networkErrors,
      pages: [submission, game]
    };
    fs.writeFileSync(path.join(outputDir, `${browserName}-${profile}-${width}x${height}.json`), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});
