import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForPersistedAtomsFromRegistry } from '../src/wait';
import { hydrateFromEncodedBlob } from '../src/hydrate';
import { createHydrationBlob } from '../src/blob';
import type { HydrationRegistry } from '../src/types';
import { z } from 'zod';
import { MockAtomStore, MockLogger } from './test-utils';
import { createMockSyncAtom, createMockAtomWithStorage } from './mock-atoms';

describe('Integration: hydration with persisted atoms', () => {
  let mockStore: MockAtomStore;
  let mockLogger: MockLogger;

  describe('with fake timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      mockStore = new MockAtomStore();
      mockLogger = new MockLogger();
    });

    afterEach(() => {
      vi.clearAllTimers();
      vi.restoreAllMocks();
      mockStore.clear();
      mockLogger.clear();
    });

    it('should wait for persisted atoms before hydrating', async () => {
      // Create atoms with different delays
      const userNameAtom = createMockSyncAtom('');
      const themeAtom = createMockAtomWithStorage('theme', 'light', { delay: 200 });
      const tokenAtom = createMockAtomWithStorage('token', '', { delay: 100 });
      
      const registry: HydrationRegistry = {
        user: {
          schema: z.object({
            name: z.string()
          }),
          atoms: {
            name: userNameAtom
          }
          // No persisted fields
        },
        settings: {
          schema: z.object({
            theme: z.string(),
            token: z.string()
          }),
          atoms: {
            theme: themeAtom,
            token: tokenAtom
          },
          persisted: ['theme', 'token']
        }
      };

      // Create test data
      const testData = {
        user: { name: 'John Doe' },
        settings: { theme: 'dark', token: 'abc123' }
      };
      const blob = createHydrationBlob(testData);

      // Wait for persisted atoms first
      const waitPromise = waitForPersistedAtomsFromRegistry(registry);
      
      // Persisted atoms should not be ready yet
      let waitResolved = false;
      waitPromise.then(() => { waitResolved = true; });
      
      await vi.advanceTimersByTimeAsync(50);
      expect(waitResolved).toBe(false);
      
      await vi.advanceTimersByTimeAsync(100); // token loads at 100ms
      expect(waitResolved).toBe(false);
      
      await vi.advanceTimersByTimeAsync(60); // theme loads at 200ms
      await waitPromise;
      expect(waitResolved).toBe(true);

      // Now hydrate
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger: mockLogger,
        _testStore: mockStore
      });

      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.settings.success).toBe(true);
      
      // Check that values were set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(3);
      expect(setOps.find(op => op.atom === userNameAtom)?.value).toBe('John Doe');
      expect(setOps.find(op => op.atom === themeAtom)?.value).toBe('dark');
      expect(setOps.find(op => op.atom === tokenAtom)?.value).toBe('abc123');
    });

    it('should handle mixed sync and async atoms in single section', async () => {
      const syncAtom1 = createMockSyncAtom('sync1');
      const syncAtom2 = createMockSyncAtom('sync2');
      const asyncAtom1 = createMockAtomWithStorage('async1', 'async1', { delay: 100 });
      const asyncAtom2 = createMockAtomWithStorage('async2', 'async2', { delay: 150 });
      
      const registry: HydrationRegistry = {
        mixed: {
          schema: z.object({
            sync1: z.string(),
            sync2: z.string(),
            async1: z.string(),
            async2: z.string()
          }),
          atoms: {
            sync1: syncAtom1,
            sync2: syncAtom2,
            async1: asyncAtom1,
            async2: asyncAtom2
          },
          persisted: ['async1', 'async2'] // Only async atoms are persisted
        }
      };

      const testData = {
        mixed: {
          sync1: 'new-sync1',
          sync2: 'new-sync2',
          async1: 'new-async1',
          async2: 'new-async2'
        }
      };
      const blob = createHydrationBlob(testData);

      // Wait for persisted atoms
      await vi.advanceTimersByTimeAsync(151);
      await waitForPersistedAtomsFromRegistry(registry);

      // Hydrate
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger: mockLogger,
        _testStore: mockStore
      });

      expect(result.overallSuccess).toBe(true);
      expect(result.sections.mixed.appliedFields).toHaveLength(4);
      
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(4);
    });

    it('should work with bootstrapHydration workflow', async () => {
      // This tests the expected usage pattern:
      // 1. App starts
      // 2. bootstrapHydration is called
      // 3. It waits for persisted atoms
      // 4. Then hydrates from blob
      
      const userAtom = createMockSyncAtom('');
      const themeAtom = createMockAtomWithStorage('theme', 'light', { delay: 300 });
      
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({
            user: z.string(),
            theme: z.string()
          }),
          atoms: {
            user: userAtom,
            theme: themeAtom
          },
          persisted: ['theme']
        }
      };

      // In a real app, this would be set via URL params or env var
      const testBlob = createHydrationBlob({
        app: { user: 'test-user', theme: 'dark' }
      });

      // Simulate the bootstrap flow
      let bootstrapComplete = false;
      const bootstrapPromise = (async () => {
        // Wait for persisted atoms
        await waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 5000 });
        
        // Then hydrate
        const result = await hydrateFromEncodedBlob(testBlob, registry, {
          logger: mockLogger,
          _testStore: mockStore
        });
        
        bootstrapComplete = true;
        return result;
      })();

      // Bootstrap should not be complete yet
      expect(bootstrapComplete).toBe(false);
      
      // Advance time to load the theme atom
      await vi.advanceTimersByTimeAsync(301);
      
      const result = await bootstrapPromise;
      expect(bootstrapComplete).toBe(true);
      expect(result.overallSuccess).toBe(true);
      
      // Verify both atoms were set
      const setOps = mockStore.getSetOperations();
      expect(setOps).toHaveLength(2);
      expect(setOps.find(op => op.atom === userAtom)?.value).toBe('test-user');
      expect(setOps.find(op => op.atom === themeAtom)?.value).toBe('dark');
    });
  });

  describe('with real timers', () => {
    beforeEach(() => {
      vi.useRealTimers();
      mockStore = new MockAtomStore();
      mockLogger = new MockLogger();
    });

    afterEach(() => {
      vi.useFakeTimers();
      mockStore.clear();
      mockLogger.clear();
    });

    it('should handle hydration when persisted atom fails to load', async () => {
      const nameAtom = createMockSyncAtom('');
      const failingAtom = createMockAtomWithStorage('theme', 'light', { 
        failOnLoad: true,
        errorMessage: 'Storage corrupted',
        delay: 100
      });
      
      const registry: HydrationRegistry = {
        settings: {
          schema: z.object({
            name: z.string(),
            theme: z.string()
          }),
          atoms: {
            name: nameAtom,
            theme: failingAtom
          },
          persisted: ['theme']
        }
      };

      // Try to wait for persisted atoms
      const waitPromise = waitForPersistedAtomsFromRegistry(registry);
      
      await expect(waitPromise).rejects.toThrow('Failed to load persisted atom: Storage corrupted');
    });

    it('should handle timeout during bootstrap', async () => {
      const slowAtom = createMockAtomWithStorage('slow', 'value', { delay: 200 });
      
      const registry: HydrationRegistry = {
        app: {
          schema: z.object({
            slow: z.string()
          }),
          atoms: {
            slow: slowAtom
          },
          persisted: ['slow']
        }
      };

      // Try to wait with short timeout
      const waitPromise = waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 100 });
      
      await expect(waitPromise).rejects.toThrow('Timeout waiting for persisted atoms to load after 100ms');
    });
  });
});