const { mkdir } = require('node:fs/promises');
const path = require('node:path');

const reviewDirectory = path.resolve(__dirname, '../.local/design-review');
const screens = {
  mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 } },
};

async function main() {
  const [address, label, selector] = process.argv.slice(2);
  if (!address || !/^[a-z\d][a-z\d_-]*$/i.test(label ?? '')) {
    throw new Error('Usage: node scripts/design-screenshots.cjs <local URL> <label> [selector]');
  }
  const url = new URL(address);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error('Use the local ENKA preview URL.');
  }

  const moduleDirectory = path.join(reviewDirectory, 'tools/node_modules/playwright-core');
  let playwrightPath;
  try {
    playwrightPath = require.resolve(moduleDirectory);
  } catch {
    throw new Error('Install the local Playwright tools using scripts/DESIGN-REVIEW.md.');
  }
  const { chromium } = require(playwrightPath);
  const outputDirectory = path.join(reviewDirectory, 'captures', label);
  await mkdir(outputDirectory, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const [screen, options] of Object.entries(screens)) {
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({ ...options, colorScheme: theme, reducedMotion: 'reduce' });
        try {
          await page.addInitScript(value => localStorage.setItem('enka_theme', value), theme);
          const response = await page.goto(url.href, { timeout: 15000 });
          if (!response?.ok()) throw new Error(`Preview returned HTTP ${response?.status()} for ${url.href}`);
          const target = selector ? page.locator(selector) : page;
          const filename = path.join(outputDirectory, `${screen}-${theme}.png`);
          await target.screenshot({ path: filename, scale: 'css', animations: 'disabled', timeout: 10000 });
          console.log(path.relative(process.cwd(), filename));
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
