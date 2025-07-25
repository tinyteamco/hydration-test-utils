import type { HydrationRegistry, WaitOptions } from './types';
import type { Atom } from 'jotai';
import { getDefaultStore } from 'jotai';

/**
 * Waits for all persisted atoms in the registry to finish loading.
 * This is crucial before hydration to prevent race conditions where
 * hydration might overwrite values that are still being loaded from storage.
 * 
 * @param registry - The hydration registry containing persisted atom definitions
 * @param options - Optional configuration including timeout
 * @throws {Error} If timeout is exceeded or any persisted atom fails to load
 * 
 * @example
 * // Define persisted atoms in your registry
 * const registry = {
 *   settings: {
 *     schema: settingsSchema,
 *     atoms: { theme: themeAtom, locale: localeAtom },
 *     persisted: ['theme', 'locale']  // These will be awaited
 *   }
 * };
 * 
 * // Wait for them to load before hydration
 * try {
 *   await waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 5000 });
 *   console.log('All persisted atoms loaded');
 * } catch (error) {
 *   console.error('Failed to load persisted state:', error);
 * }
 */
export async function waitForPersistedAtomsFromRegistry(
  registry: HydrationRegistry,
  options?: WaitOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  const store = options?._testStore || getDefaultStore();
  
  // Collect all unique persisted atoms from the registry
  const atomSet = new Set<Atom<any>>();
  
  for (const registryEntry of Object.values(registry)) {
    const persistedKeys = registryEntry.persisted || [];
    
    for (const key of persistedKeys) {
      const atom = registryEntry.atoms[key];
      if (atom) {
        atomSet.add(atom);
      }
    }
  }
  
  const persistedAtoms = Array.from(atomSet);
  
  if (persistedAtoms.length === 0) {
    return;
  }

  // For async atoms, we'll wait for their promises directly
  const atomPromises: Promise<unknown>[] = [];

  for (const atom of persistedAtoms) {
    try {
      const value = store.get(atom);
      // If the value is a promise, wait for it
      if (value && typeof (value as any).then === 'function') {
        // Catch errors to convert to settled promises
        const settledPromise = (value as Promise<unknown>).then(
          v => ({ status: 'fulfilled', value: v }),
          e => ({ status: 'rejected', reason: e })
        );
        atomPromises.push(settledPromise);
      }
    } catch (err) {
      // Suspense-style: store.get threw a promise
      if (err && typeof (err as any).then === 'function') {
        const settledPromise = (err as Promise<unknown>).then(
          v => ({ status: 'fulfilled', value: v }),
          e => ({ status: 'rejected', reason: e })
        );
        atomPromises.push(settledPromise);
      } else {
        // Re-throw non-promise errors
        throw err;
      }
    }
  }

  // If no async atoms found, return immediately
  if (atomPromises.length === 0) {
    return;
  }

  // Create timeout promise
  let timeoutId: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for persisted atoms to load after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  // Add catch handler to prevent unhandled rejection warnings
  timeoutPromise.catch(() => {
    // Intentionally empty - errors are handled in the race
  });

  interface SettledPromise<T> {
  status: 'fulfilled' | 'rejected';
  value?: T;
  reason?: any;
}

// ... (rest of the file is the same until the try/finally block)

  try {
    // Race between all atom promises and timeout
    await Promise.race([
      Promise.all(atomPromises).then(results => {
        // Check if any failed
        const typedResults = results as SettledPromise<any>[];
        const firstError = typedResults.find(
          (r): r is SettledPromise<any> & { status: 'rejected' } =>
            r.status === 'rejected',
        );
        if (firstError?.reason) {
          const reason = firstError.reason;
          const message = reason instanceof Error ? reason.message : String(reason);
          throw new Error(`Failed to load persisted atom: ${message}`);
        }
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}