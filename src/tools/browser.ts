import type { Browser } from 'playwright';
import { z } from 'zod';

import type { ToolDefinition } from './types';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserInstance) {
    return browserInstance;
  }

  const { chromium } = await import('playwright');
  browserInstance = await chromium.launch({ headless: true });
  return browserInstance;
}

const browserToolSchema = z.object({
  action: z.enum(['navigate', 'screenshot', 'click', 'type', 'extract', 'close']),
  url: z.string().url().optional(),
  selector: z.string().optional(),
  text: z.string().optional(),
  fullPage: z.boolean().optional(),
});

export const browserTool: ToolDefinition<typeof browserToolSchema> = {
  name: 'browser',
  type: 'browser',
  description: 'Control a headless browser for navigation and extraction',
  parameters: browserToolSchema,
  requiresConsent: true,
  async execute(args) {
    if (args.action === 'close') {
      if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
      }
      return { success: true };
    }

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
      if (args.url) {
        await page.goto(args.url, { waitUntil: 'domcontentloaded' });
      }

      if (args.action === 'navigate') {
        return { url: page.url(), title: await page.title() };
      }

      if (args.action === 'screenshot') {
        const data = await page.screenshot({ fullPage: args.fullPage ?? false });
        return { screenshotBase64: data.toString('base64') };
      }

      if (!args.selector) {
        throw new Error('selector is required for click/type/extract');
      }

      if (args.action === 'click') {
        await page.click(args.selector);
        return { success: true };
      }

      if (args.action === 'type') {
        await page.fill(args.selector, args.text ?? '');
        return { success: true };
      }

      const content = await page.textContent(args.selector);
      return { content: content ?? '' };
    } finally {
      await page.close();
    }
  },
};
