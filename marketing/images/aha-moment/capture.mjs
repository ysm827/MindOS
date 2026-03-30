import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function captureFile(page, htmlFile, prefix) {
  const htmlPath = join(__dirname, htmlFile);
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const canvas = page.locator('.canvas');

  // Dark version
  await canvas.screenshot({
    path: join(__dirname, '..', `${prefix}-dark.png`),
    type: 'png',
  });
  console.log(`OK ${prefix}-dark.png`);

  // Light version
  await page.evaluate(() => document.body.classList.add('light'));
  await page.waitForTimeout(800);
  await canvas.screenshot({
    path: join(__dirname, '..', `${prefix}-light.png`),
    type: 'png',
  });
  console.log(`OK ${prefix}-light.png`);
}

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1100, height: 2400 },
    deviceScaleFactor: 2,
  });

  // English
  await captureFile(page, 'index.html', 'aha-moment');

  // Chinese
  await captureFile(page, 'index-zh.html', 'aha-moment-zh');

  await browser.close();
}

capture().catch(console.error);
