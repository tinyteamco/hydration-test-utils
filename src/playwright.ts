/// <reference lib="dom" />

import type { Page } from '@playwright/test';
import { createHydrationBlob } from './blob';
import type { HydrationResult } from './types';

/**
 * Simple hash function to generate a unique key for a blob.
 * This is used to track whether hydration has already occurred.
 */
function hashBlob(blob: string): string {
  let hash = 0;
  for (let i = 0; i < blob.length; i++) {
    const char = blob.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Prepares the Playwright Page for hydration by injecting the data blob
 * via an initialization script. This should be called before `page.goto()`.
 *
 * @param page The Playwright Page object.
 * @param data The data to be hydrated into the application.
 */
export async function preparePageForHydration(
  page: Page,
  data: Record<string, unknown>,
): Promise<void> {
  const blob = createHydrationBlob(data);
  const blobHash = hashBlob(blob);
  const storageKey = `__hydration_${blobHash}`;

  await page.addInitScript(
    ({ blob, storageKey }) => {
      // Initialize array if it doesn't exist
      if (!window.__HYDRATION_BLOBS__) {
        window.__HYDRATION_BLOBS__ = [];
      }
      
      // Check if we've already added this specific blob (by hash)
      const alreadyAdded = window.__HYDRATION_BLOBS__.some(
        (item: any) => item.storageKey === storageKey
      );
      
      if (!alreadyAdded) {
        // Add this blob to the array (maintains order: oldest to newest)
        window.__HYDRATION_BLOBS__.push({ blob, storageKey });
      }
    },
    { blob, storageKey },
  );
}

/**
 * Formats hydration errors into a readable string for error messages.
 * @param result The HydrationResult containing error information
 * @returns A formatted error string
 */
function formatHydrationErrors(result: HydrationResult): string {
  const errorLines: string[] = ['Hydration failed with the following errors:'];
  
  for (const [sectionName, sectionResult] of Object.entries(result.sections)) {
    if (!sectionResult.success && sectionResult.error) {
      errorLines.push(`  - ${sectionName}: ${sectionResult.error}`);
    }
    if (sectionResult.warnings && sectionResult.warnings.length > 0) {
      sectionResult.warnings.forEach(warning => {
        errorLines.push(`  - ${sectionName} (warning): ${warning}`);
      });
    }
  }
  
  return errorLines.join('\n');
}

/**
 * Waits for the hydration process to complete in the browser and retrieves
 * the structured result. Throws an error if hydration failed.
 *
 * @param page The Playwright Page object.
 * @returns A promise that resolves with the HydrationResult.
 * @throws Error with detailed information if hydration failed
 */
export async function getHydrationResult(page: Page): Promise<HydrationResult> {
  const resultHandle = await page.waitForFunction(
    () => window.__HYDRATION_RESULT__,
    { timeout: 5000 },
  );
  const result = await resultHandle.jsonValue() as HydrationResult;
  
  // Check if hydration failed and throw with detailed error information
  if (!result.overallSuccess) {
    const errorMessage = formatHydrationErrors(result);
    const error = new Error(errorMessage);
    // Attach the full result for programmatic access
    (error as any).hydrationResult = result;
    throw error;
  }
  
  return result;
}

/**
 * A high-level helper that orchestrates the entire hydration flow for a Playwright test.
 * It prepares the page, navigates to the specified URL, and waits for the hydration
 * result to be returned.
 *
 * @param page The Playwright Page object.
 * @param options The options for the hydration.
 * @param options.data The data to be hydrated.
 * @param options.url The URL to navigate to (defaults to '/').
 * @param options.useUrlParam If true, pass data via URL param instead of window injection (default: false).
 * @returns A promise that resolves with the HydrationResult.
 */
export async function hydratePage(
  page: Page,
  options: {
    data: Record<string, unknown>;
    url?: string;
    useUrlParam?: boolean;
  },
): Promise<HydrationResult> {
  const targetUrl = options.url !== undefined ? options.url : '/';
  
  if (options.useUrlParam) {
    // Use URL parameter approach - naturally doesn't persist across reloads
    const blob = createHydrationBlob(options.data);
    const urlWithParam = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}hydrate=${blob}`;
    await page.goto(urlWithParam);
  } else {
    // Use window injection approach - persists across reloads due to addInitScript
    await preparePageForHydration(page, options.data);
    await page.goto(targetUrl);
  }
  
  return getHydrationResult(page);
}

// Augment the global window interface for the init scripts
declare global {
  interface Window {
    __HYDRATION_BLOBS__?: Array<{ blob: string; storageKey: string }>;
    __HYDRATION_RESULT__?: HydrationResult;
  }
}
