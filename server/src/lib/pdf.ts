import type { Browser } from 'puppeteer';
import { AppError } from './errors';
import { logger } from './logger';

let browser: Promise<Browser> | null = null;

/** Thrown when Chrome can't start (not installed, no sandbox support, ...). Mapped to 503. */
export const pdfUnavailable = () =>
  new AppError(503, 'PDF_UNAVAILABLE', 'PDF rendering is unavailable on this server; open /print and use the browser\'s Save as PDF');

/** One headless Chrome for the whole process, started on first use and reused. */
function getBrowser(): Promise<Browser> {
  if (process.env.NODE_ENV === 'test') return Promise.reject(pdfUnavailable()); // CI never launches Chrome
  browser ??= import('puppeteer')
    .then((p) => p.default.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] }))
    .then((b) => {
      b.on('disconnected', () => (browser = null)); // crashed: launch again next time
      return b;
    })
    .catch((err) => {
      browser = null; // let a later request try again
      logger.error({ err }, 'could not launch Chrome for PDFs');
      throw pdfUnavailable();
    });
  return browser;
}

/** HTML page → A4 PDF bytes. */
export async function renderPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
  } finally {
    await page.close();
  }
}

/** Called on shutdown. */
export async function closeBrowser() {
  if (!browser) return;
  const b = await browser.catch(() => null);
  browser = null;
  await b?.close();
}
