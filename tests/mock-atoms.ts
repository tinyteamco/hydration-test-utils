import { atom, type Atom, type WritableAtom } from 'jotai';

/**
 * Creates a mock async atom that simulates storage loading behavior.
 * The atom returns a promise when read, simulating async loading.
 * 
 * @param initialValue - The value the atom will resolve to
 * @param delay - Milliseconds to wait before resolving. If negative, manual control is required.
 * @returns An atom that behaves like an async storage atom
 */
export function createMockPersistedAtom<T>(
  initialValue: T,
  delay: number
): Atom<Promise<T>> & {
  _testControls: {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    promise: Promise<T>;
  };
} {
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;
  
  const loadPromise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    
    if (delay >= 0) {
      setTimeout(() => resolve(initialValue), delay);
    }
    // If delay is negative, we'll manually control resolution
  });
  
  // Add a catch handler to prevent unhandled rejection warnings in tests
  loadPromise.catch(() => {
    // Intentionally empty - this is just to mark the promise as handled
  });
  
  // Create atom that returns the promise when read
  const asyncAtom = atom(() => loadPromise) as any;
  
  // Attach control methods for testing
  asyncAtom._testControls = {
    resolve: (value: T) => resolvePromise?.(value),
    reject: (error: Error) => rejectPromise?.(error),
    promise: loadPromise
  };
  
  return asyncAtom;
}

/**
 * Creates a regular synchronous atom
 */
export function createMockSyncAtom<T>(initialValue: T): WritableAtom<T, [T], void> {
  return atom(initialValue);
}

/**
 * Creates a mock atomWithStorage that simulates Jotai's atomWithStorage behavior.
 * This is useful for testing persisted atoms that load asynchronously from storage.
 * 
 * @param key - Storage key (not used in mock, but matches real API)
 * @param initialValue - The value to resolve to
 * @param options - Options including delay for async simulation
 */
export function createMockAtomWithStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    delay?: number;
    failOnLoad?: boolean;
    errorMessage?: string;
  }
): Atom<Promise<T>> & {
  _testControls: {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
    promise: Promise<T>;
    key: string;
  };
} {
  const delay = options?.delay ?? 100; // Default 100ms delay
  const failOnLoad = options?.failOnLoad ?? false;
  const errorMessage = options?.errorMessage ?? 'Storage load failed';
  
  let resolvePromise: ((value: T) => void) | null = null;
  let rejectPromise: ((error: Error) => void) | null = null;
  
  const loadPromise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
    
    if (delay >= 0 && !failOnLoad) {
      setTimeout(() => resolve(initialValue), delay);
    } else if (failOnLoad) {
      setTimeout(() => reject(new Error(errorMessage)), delay >= 0 ? delay : 0);
    }
    // If delay is negative and not failing, manual control is required
  });
  
  // Add a catch handler to prevent unhandled rejection warnings in tests
  loadPromise.catch(() => {
    // Intentionally empty - this is just to mark the promise as handled
  });
  
  // Create atom that mimics atomWithStorage behavior by returning the promise
  const storageAtom = atom(() => loadPromise) as any;
  
  // Attach test controls
  storageAtom._testControls = {
    resolve: (value: T) => resolvePromise?.(value),
    reject: (error: Error) => rejectPromise?.(error),
    promise: loadPromise,
    key
  };
  
  return storageAtom;
}

/**
 * Helper to create a set of test atoms with mixed sync/async behavior
 */
export interface TestAtomSet {
  // Sync atoms
  nameAtom: WritableAtom<string, [string], void>;
  ageAtom: WritableAtom<number, [number], void>;
  activeAtom: WritableAtom<boolean, [boolean], void>;
  
  // Async atoms (persisted)
  themeAtom: Atom<Promise<string>> & { _testControls: any };
  tokenAtom: Atom<Promise<string>> & { _testControls: any };
  localeAtom: Atom<Promise<string>> & { _testControls: any };
}

export function createTestAtomSet(options?: {
  themeDelay?: number;
  tokenDelay?: number;
  localeDelay?: number;
}): TestAtomSet {
  return {
    // Sync atoms
    nameAtom: createMockSyncAtom(''),
    ageAtom: createMockSyncAtom(0),
    activeAtom: createMockSyncAtom(false),
    
    // Async atoms (persisted)
    themeAtom: createMockAtomWithStorage('theme', 'light', { delay: options?.themeDelay ?? 100 }),
    tokenAtom: createMockAtomWithStorage('token', '', { delay: options?.tokenDelay ?? 150 }),
    localeAtom: createMockAtomWithStorage('locale', 'en', { delay: options?.localeDelay ?? 200 }),
  };
}