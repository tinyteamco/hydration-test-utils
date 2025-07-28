import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bootstrapHydration } from '../src/bootstrap';
import type { HydrationRegistry } from '../src/types';
import { z } from 'zod';
import { MockAtomStore, MockLogger } from './test-utils';
import { createMockSyncAtom, createMockAtomWithStorage } from './mock-atoms';

describe('bootstrapHydration', () => {
  let mockStore: MockAtomStore;
  let mockLogger: MockLogger;
  let originalWindow: any;
  let originalLocation: any;

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockStore = new MockAtomStore();
      mockLogger = new MockLogger();
      
      // Save original window and location
      originalWindow = globalThis.window;
      if (originalWindow) {
        originalLocation = originalWindow.location;
      }
      
      // Create mock window
      globalThis.window = {
        __HYDRATION_BLOBS__: undefined,
        __HYDRATION_RESULT__: undefined,
        location: {
          href: 'http://localhost:3000/',
          search: '',
          searchParams: new URLSearchParams()
        }
      } as any;
    });

    afterEach(() => {
      // Clear all pending timers without executing them
      vi.clearAllTimers();
      vi.restoreAllMocks();
      mockStore.clear();
      mockLogger.clear();
      
      // Restore original window
      if (originalWindow) {
        globalThis.window = originalWindow;
        if (originalLocation) {
          globalThis.window.location = originalLocation;
        }
      } else {
        delete (globalThis as any).window;
      }
    });

    it('should return undefined when no blob is found', async () => {
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: createMockSyncAtom('') }
        }
      };

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeUndefined();
      expect(mockLogger.infoCalls).toContainEqual(['No hydration blobs found, skipping hydration']);
    });

    it('should use blob from options when provided', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Create blob manually
      const testBlob = btoa(JSON.stringify({ app: { name: 'Test User' } }));

      const result = await bootstrapHydration(registry, {
        blob: testBlob,
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(true);
      expect(result?.sections.app.success).toBe(true);
      
      // Check atom was set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe('Test User');
    });

    it('should discover blob from window.__HYDRATION_BLOBS__', async () => {
      const ageAtom = createMockSyncAtom(0);
      const registry: HydrationRegistry = {
        user: {
          schema: z.object({ age: z.number() }),
          atoms: { age: ageAtom }
        }
      };

      // Set blobs array on window
      const testData = { user: { age: 25 } };
      const blob = btoa(JSON.stringify(testData));
      window.__HYDRATION_BLOBS__ = [{ blob, storageKey: `__hydration_test` }];

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(true);
      
      // Check atom was set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe(25);
    });

    it('should wait for persisted atoms before hydrating', async () => {
      const nameAtom = createMockSyncAtom('');
      const themeAtom = createMockAtomWithStorage('theme', 'light', { delay: 200 });
      
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({
            name: z.string(),
            theme: z.string()
          }),
          atoms: {
            name: nameAtom,
            theme: themeAtom
          },
          persisted: ['theme']
        }
      };

      const testData = { app: { name: 'User', theme: 'dark' } };
      const blob = btoa(JSON.stringify(testData));

      // Start bootstrap
      let bootstrapComplete = false;
      const bootstrapPromise = bootstrapHydration(registry, {
        blob,
        logger: mockLogger,
        _testStore: mockStore
      } as any).then(result => {
        bootstrapComplete = true;
        return result;
      });

      // Should not complete immediately
      expect(bootstrapComplete).toBe(false);
      
      // Advance time for theme atom to load
      await vi.advanceTimersByTimeAsync(201);
      
      const result = await bootstrapPromise;
      expect(bootstrapComplete).toBe(true);
      expect(result?.overallSuccess).toBe(true);
      
      // Both atoms should be set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(2);
    });

    it('should expose result on window.__HYDRATION_RESULT__', async () => {
      const activeAtom = createMockSyncAtom(false);
      const registry: HydrationRegistry = {
        flags: {
          schema: z.object({ active: z.boolean() }),
          atoms: { active: activeAtom }
        }
      };

      const blob = btoa(JSON.stringify({ flags: { active: true } }));

      const result = await bootstrapHydration(registry, {
        blob,
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(window.__HYDRATION_RESULT__).toBe(result);
      expect(window.__HYDRATION_RESULT__?.overallSuccess).toBe(true);
    });

    it('should use custom logger', async () => {
      const customLogger = new MockLogger();
      const registry: HydrationRegistry = {
        test: {
          schema: z.object({ value: z.string() }),
          atoms: { value: createMockSyncAtom('') }
        }
      };

      const blob = btoa(JSON.stringify({ test: { value: 'test' } }));

      await bootstrapHydration(registry, {
        blob,
        logger: customLogger,
        _testStore: mockStore
      } as any);

      expect(customLogger.infoCalls.length).toBeGreaterThan(0);
      expect(customLogger.infoCalls).toContainEqual(['Starting bootstrap hydration']);
    });

    it('should handle hydration errors gracefully', async () => {
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ num: z.number() }),
          atoms: { num: createMockSyncAtom(0) }
        }
      };

      // Invalid data (string instead of number)
      const blob = btoa(JSON.stringify({ app: { num: 'not-a-number' } }));

      const result = await bootstrapHydration(registry, {
        blob,
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(false);
      expect(result?.sections.app.success).toBe(false);
      expect(result?.sections.app.error).toContain('expected number, received string');
      
      // Result should still be exposed even on failure
      expect(window.__HYDRATION_RESULT__).toBe(result);
    });

    it('should handle malformed blob gracefully', async () => {
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: createMockSyncAtom('') }
        }
      };

      // Invalid base64
      const result = await bootstrapHydration(registry, {
        blob: 'not-valid-base64!!!',
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(false);
      
      // Check that an error was logged
      expect(mockLogger.errorCalls.length).toBeGreaterThan(0);
      // The error happens during decoding
      const errorMessages = mockLogger.errorCalls.map(call => call[0]);
      expect(errorMessages).toContain('Failed to decode blob: Invalid JSON in decoded blob');
    });

    it('should respect strict mode option', async () => {
      const nameAtom = createMockSyncAtom('');
      // Missing ageAtom for age field
      
      const registry: HydrationRegistry = {
        user: {
          schema: z.object({
            name: z.string(),
            age: z.number()
          }),
          atoms: {
            name: nameAtom
            // age atom is missing - strict mode should fail
          }
        }
      };

      const blob = btoa(JSON.stringify({ user: { name: 'Test', age: 30 } }));

      const result = await bootstrapHydration(registry, {
        blob,
        strict: true, // Explicit strict mode
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result?.overallSuccess).toBe(false);
      expect(result?.sections.user.error).toContain('Schema fields missing atom: age');
    });

    it('should discover blob from URL parameter "hydrate"', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set blob in URL parameter
      const testData = { app: { name: 'URL User' } };
      const testBlob = btoa(JSON.stringify(testData));
      window.location.href = `http://localhost:3000/?hydrate=${testBlob}`;

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
      
      // Check atom was set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe('URL User');
    });

    it('should respect precedence: option > window > URL', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set different blobs in all three sources
      const optionData = { app: { name: 'Option User' } };
      const windowData = { app: { name: 'Window User' } };
      const urlData = { app: { name: 'URL User' } };
      
      const optionBlob = btoa(JSON.stringify(optionData));
      const windowBlob = btoa(JSON.stringify(windowData));
      const urlBlob = btoa(JSON.stringify(urlData));
      
      // Set window and URL blobs
      window.__HYDRATION_BLOBS__ = [{ blob: windowBlob, storageKey: '__hydration_precedence_window' }];
      window.location.href = `http://localhost:3000/?hydrate=${urlBlob}`;

      // Test 1: Option should take precedence over everything
      let result = await bootstrapHydration(registry, {
        blob: optionBlob,
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from explicit option']);
      let setOps = mockStore.getSetOperations();
      expect(setOps[setOps.length - 1].value).toBe('Option User');

      // Reset for next test
      mockStore.clear();
      mockLogger.clear();

      // Test 2: Window should take precedence over URL when no option
      result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from window.__HYDRATION_BLOBS__']);
      setOps = mockStore.getSetOperations();
      expect(setOps[setOps.length - 1].value).toBe('Window User');

      // Reset and remove window blob
      mockStore.clear();
      mockLogger.clear();
      delete window.__HYDRATION_BLOBS__;

      // Test 3: URL should be used when no option or window
      result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
      setOps = mockStore.getSetOperations();
      expect(setOps[setOps.length - 1].value).toBe('URL User');
    });

    it('should handle invalid URL gracefully', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set an invalid URL that can't be parsed
      window.location.href = 'not-a-valid-url';

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeUndefined();
      expect(mockLogger.warnCalls).toContainEqual(['Failed to parse URL for hydrate parameter', expect.any(Error)]);
      expect(mockLogger.infoCalls).toContainEqual(['No hydration blobs found, skipping hydration']);
    });

    it('should handle URL with multiple parameters correctly', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set blob in URL with other parameters
      const testData = { app: { name: 'Multi Param User' } };
      const testBlob = btoa(JSON.stringify(testData));
      window.location.href = `http://localhost:3000/?foo=bar&hydrate=${testBlob}&baz=qux`;

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
      
      // Check atom was set correctly
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe('Multi Param User');
    });

    it('should ignore empty hydrate parameter', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set empty hydrate parameter
      window.location.href = 'http://localhost:3000/?hydrate=';

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeUndefined();
      expect(mockLogger.infoCalls).toContainEqual(['No hydration blobs found, skipping hydration']);
    });

    it('should handle malformed base64 in URL parameter', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Set malformed base64 in URL parameter
      window.location.href = 'http://localhost:3000/?hydrate=not-valid-base64!!!@@@###';

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(false);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
      
      // Check that an error was logged during decoding
      expect(mockLogger.errorCalls.length).toBeGreaterThan(0);
      const errorMessages = mockLogger.errorCalls.map(call => call[0]);
      expect(errorMessages).toContain('Failed to decode blob: Invalid JSON in decoded blob');
    });

    it('should handle URL with encoded special characters in hydrate parameter', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Create blob with special characters
      const testData = { app: { name: 'User & Co <test>' } };
      const testBlob = btoa(JSON.stringify(testData));
      // URL encode the blob
      const encodedBlob = encodeURIComponent(testBlob);
      window.location.href = `http://localhost:3000/?hydrate=${encodedBlob}`;

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeDefined();
      expect(result?.overallSuccess).toBe(true);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
      
      // Check atom was set with special characters preserved
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe('User & Co <test>');
    });

    it('should handle when window.location is missing', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      // Remove location from window
      delete window.location;

      const result = await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      expect(result).toBeUndefined();
      expect(mockLogger.infoCalls).toContainEqual(['No hydration blobs found, skipping hydration']);
    });

    it('should properly log which source was used for blob discovery', async () => {
      const nameAtom = createMockSyncAtom('');
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ name: z.string() }),
          atoms: { name: nameAtom }
        }
      };

      const testData = { app: { name: 'Test User' } };
      const testBlob = btoa(JSON.stringify(testData));

      // Test 1: Explicit option
      mockLogger.clear();
      await bootstrapHydration(registry, {
        blob: testBlob,
        logger: mockLogger,
        _testStore: mockStore
      } as any);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from explicit option']);

      // Test 2: Window global
      mockLogger.clear();
      mockStore.clear();
      window.__HYDRATION_BLOBS__ = [{ blob: testBlob, storageKey: '__hydration_test' }];
      await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from window.__HYDRATION_BLOBS__']);

      // Test 3: URL parameter
      mockLogger.clear();
      mockStore.clear();
      delete window.__HYDRATION_BLOBS__;
      window.location.href = `http://localhost:3000/?hydrate=${testBlob}`;
      await bootstrapHydration(registry, {
        logger: mockLogger,
        _testStore: mockStore
      } as any);
      expect(mockLogger.infoCalls).toContainEqual(['Found 1 hydration blob(s) from URL parameter "hydrate"']);
    });
  });

  describe('with real timers', () => {
    beforeEach(() => {
      vi.useRealTimers();
      mockStore = new MockAtomStore();
      mockLogger = new MockLogger();
      
      // Save original window and location
      originalWindow = globalThis.window;
      if (originalWindow) {
        originalLocation = originalWindow.location;
      }
      
      // Create mock window
      globalThis.window = {
        __HYDRATION_BLOBS__: undefined,
        __HYDRATION_RESULT__: undefined,
        location: {
          href: 'http://localhost:3000/',
          search: '',
          searchParams: new URLSearchParams()
        }
      } as any;
    });

    afterEach(() => {
      vi.useFakeTimers();
      mockStore.clear();
      mockLogger.clear();
      
      // Restore original window
      if (originalWindow) {
        globalThis.window = originalWindow;
        if (originalLocation) {
          globalThis.window.location = originalLocation;
        }
      } else {
        delete (globalThis as any).window;
      }
    });

    it('should handle timeout waiting for persisted atoms', async () => {
      const slowAtom = createMockAtomWithStorage('slow', 'value', { delay: 200 });
      
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({ slow: z.string() }),
          atoms: { slow: slowAtom },
          persisted: ['slow']
        }
      };

      const blob = btoa(JSON.stringify({ app: { slow: 'new-value' } }));

      const bootstrapPromise = bootstrapHydration(registry, {
        blob,
        timeoutMs: 100,
        logger: mockLogger,
        _testStore: mockStore
      } as any);

      await expect(bootstrapPromise).rejects.toThrow('Timeout waiting for persisted atoms to load after 100ms');
    });
  });
});