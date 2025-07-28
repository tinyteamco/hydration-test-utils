import type { HydrationRegistry, HydrationResult, BootstrapOptions } from './types';
import { waitForPersistedAtomsFromRegistry } from './wait';
import { hydrateFromEncodedBlob } from './hydrate';

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

// Extended options type for testing
interface ExtendedBootstrapOptions extends BootstrapOptions {
  _testStore?: {
    get: (atom: any) => any;
    set: (atom: any, value: any) => void;
  };
}

// Type for global window object
interface HydrationWindow {
  __HYDRATION_BLOBS__?: Array<{ blob: string; storageKey: string }>;
  __HYDRATION_RESULT__?: HydrationResult;
  localStorage?: Storage;
}

/**
 * High-level orchestration function that handles the complete hydration flow.
 * This is the recommended entry point for most applications.
 * 
 * Process:
 * 1. Discovers hydration blob (from options, window, or URL)
 * 2. Waits for persisted atoms to load from storage
 * 3. Hydrates the registry with blob data
 * 4. Exposes result on window.__HYDRATION_RESULT__
 * 
 * Blob discovery precedence:
 * 1. Explicit blob in options (highest priority)
 * 2. window.__HYDRATION_BLOB__ global variable
 * 3. 'hydrate' URL query parameter
 * 
 * @param registry - The hydration registry defining your application state
 * @param options - Optional configuration for the bootstrap process
 * @returns HydrationResult if blob was found and processed, undefined if no blob found
 * @throws {Error} If persisted atoms fail to load or hydration fails critically
 * 
 * @example
 * // Basic usage
 * const registry = {
 *   user: { schema: userSchema, atoms: userAtoms },
 *   settings: { schema: settingsSchema, atoms: settingsAtoms, persisted: ['theme'] }
 * };
 * 
 * const result = await bootstrapHydration(registry);
 * if (result?.overallSuccess) {
 *   console.log('State hydrated successfully');
 * }
 * 
 * @example
 * // With explicit blob
 * const result = await bootstrapHydration(registry, {
 *   blob: testBlob,
 *   strict: false,  // Allow partial hydration
 *   timeoutMs: 10000  // Wait longer for persisted atoms
 * });
 */
export async function bootstrapHydration(
  registry: HydrationRegistry,
  options?: ExtendedBootstrapOptions
): Promise<HydrationResult | undefined> {
  const logger = options?.logger || {
    info: (...args: unknown[]) => console.info('[Hydration]', ...args),
    warn: (...args: unknown[]) => console.warn('[Hydration]', ...args),
    error: (...args: unknown[]) => console.error('[Hydration]', ...args),
  };

  logger.info?.('Starting bootstrap hydration');

  try {
    // Step 1: Discover blobs
    let blobs: Array<{ blob: string; storageKey: string }> = [];
    let blobSource: string | undefined;
    
    if (options?.blob) {
      // If explicit blob provided, use only that
      blobs = [{ blob: options.blob, storageKey: `__hydration_${hashBlob(options.blob)}` }];
      blobSource = 'explicit option';
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).window) {
      const win = (globalThis as any).window as HydrationWindow & { 
        __HYDRATION_BLOBS__?: Array<{ blob: string; storageKey: string }> 
      };
      
      // Check for blobs array on window
      if (win.__HYDRATION_BLOBS__ && win.__HYDRATION_BLOBS__.length > 0) {
        blobs = win.__HYDRATION_BLOBS__;
        blobSource = 'window.__HYDRATION_BLOBS__';
        // Clear the blobs after consuming them
        win.__HYDRATION_BLOBS__ = [];
        logger.info?.(`Consumed ${blobs.length} blobs from window.__HYDRATION_BLOBS__`);
      } 
      // Check URL query string for 'hydrate' parameter
      else if (typeof globalThis !== 'undefined' && (globalThis as any).window?.location?.href) {
        try {
          const url = new URL((globalThis as any).window.location.href);
          const hydrateParam = url.searchParams.get('hydrate');
          if (hydrateParam) {
            blobs = [{ blob: hydrateParam, storageKey: `__hydration_${hashBlob(hydrateParam)}` }];
            blobSource = 'URL parameter "hydrate"';
          }
        } catch (error) {
          logger.warn?.('Failed to parse URL for hydrate parameter', error);
        }
      }
    }
    
    if (blobs.length === 0) {
      logger.info?.('No hydration blobs found, skipping hydration');
      return undefined;
    }
    
    logger.info?.(`Found ${blobs.length} hydration blob(s) from ${blobSource}`);

    // Step 2: Wait for persisted atoms
    logger.info?.('Waiting for persisted atoms to load');
    await waitForPersistedAtomsFromRegistry(registry, {
      timeoutMs: options?.timeoutMs
    });
    logger.info?.('Persisted atoms loaded successfully');

    // Step 3: Hydrate from blobs in sequence
    let aggregatedResult: HydrationResult = {
      sections: {},
      overallSuccess: true
    };

    for (let i = 0; i < blobs.length; i++) {
      const blobItem = blobs[i];
      if (!blobItem) continue; // TypeScript safety check
      const { blob, storageKey } = blobItem;
      
      // Check if this blob was already hydrated
      if (typeof globalThis !== 'undefined' && (globalThis as any).window?.localStorage) {
        const alreadyHydrated = (globalThis as any).window.localStorage.getItem(storageKey);
        if (alreadyHydrated) {
          logger.info?.(`Blob ${i + 1}/${blobs.length} already hydrated (${storageKey}), skipping`);
          continue;
        }
      }

      logger.info?.(`Hydrating blob ${i + 1}/${blobs.length}`);
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: options?.strict,
        logger: options?.logger,
        _testStore: options?._testStore
      } as any);

      // Aggregate results
      // For sections: later results overwrite earlier ones
      Object.assign(aggregatedResult.sections, result.sections);
      
      // Overall success is true only if all hydrations succeed
      aggregatedResult.overallSuccess = aggregatedResult.overallSuccess && result.overallSuccess;

      // Mark this blob as hydrated if successful
      if (result.overallSuccess && typeof globalThis !== 'undefined' && (globalThis as any).window?.localStorage) {
        try {
          (globalThis as any).window.localStorage.setItem(storageKey, 'true');
          logger.info?.(`Marked blob as hydrated: ${storageKey}`);
        } catch (e) {
          logger.warn?.('Failed to mark blob in localStorage:', e);
        }
      }
    }

    // Step 4: Expose aggregated result on window
    if (typeof globalThis !== 'undefined' && (globalThis as any).window) {
      const win = (globalThis as any).window as HydrationWindow;
      win.__HYDRATION_RESULT__ = aggregatedResult;
      logger.info?.('Aggregated hydration result exposed on window.__HYDRATION_RESULT__');
    }

    logger.info?.('Bootstrap hydration complete', { overallSuccess: aggregatedResult.overallSuccess });
    return aggregatedResult;
  } catch (error) {
    logger.error?.('Failed to bootstrap hydration', error);
    
    // Create error result
    const errorResult: HydrationResult = {
      sections: {},
      overallSuccess: false
    };
    
    // Add error for each section in registry
    for (const sectionName of Object.keys(registry)) {
      errorResult.sections[sectionName] = {
        success: false,
        error: `Bootstrap failed: ${(error as Error).message}`
      };
    }
    
    // Expose error result on window
    if (typeof globalThis !== 'undefined' && (globalThis as any).window) {
      const win = (globalThis as any).window as HydrationWindow;
      win.__HYDRATION_RESULT__ = errorResult;
    }
    
    // Re-throw for tests that expect specific errors
    throw error;
  }
}