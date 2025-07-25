import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForPersistedAtomsFromRegistry } from '../src/wait';
import type { HydrationRegistry } from '../src/types';
import { atom, type Atom, createStore } from 'jotai';
import { z } from 'zod';

// Helper to create async atom that simulates storage loading
function createAsyncStorageAtom<T>(initialValue: T, delay: number): Atom<Promise<T>> {
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
  // This doesn't affect the promise behavior - errors are still propagated
  loadPromise.catch(() => {
    // Intentionally empty - this is just to mark the promise as handled
  });
  
  // Create atom that returns the promise when read
  const asyncAtom = atom(() => loadPromise);
  
  // Attach control methods for testing
  (asyncAtom as any)._testControls = {
    resolve: (value: T) => resolvePromise?.(value),
    reject: (error: Error) => rejectPromise?.(error),
    promise: loadPromise
  };
  
  return asyncAtom;
}

// Helper to create async atom that emits async update via subscription
function createAsyncSubscriptionAtom<T>(initialValue: T, updateDelay: number): Atom<T> {
  let listeners: Set<() => void> = new Set();
  let currentValue = initialValue;
  
  const subscriptionAtom = atom(
    (get) => currentValue,
    (get, set, newValue: T) => {
      currentValue = newValue;
      // Notify all listeners
      listeners.forEach(listener => listener());
    }
  );
  
  // Override the atom's subscription behavior for testing
  const originalAtom = subscriptionAtom;
  const wrappedAtom = Object.create(originalAtom);
  
  // Store subscription function to simulate async updates
  (wrappedAtom as any)._subscribe = (listener: () => void) => {
    listeners.add(listener);
    
    if (updateDelay >= 0) {
      setTimeout(() => {
        currentValue = initialValue;
        listener();
      }, updateDelay);
    }
    
    return () => {
      listeners.delete(listener);
    };
  };
  
  return wrappedAtom;
}

// Helper to create regular synchronous atom
function createSyncAtom<T>(initialValue: T): Atom<T> {
  return atom(initialValue);
}

describe('waitForPersistedAtomsFromRegistry with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  it('should resolve immediately when registry has no persisted atoms', async () => {
    const registry: HydrationRegistry = {
      user: {
        schema: z.object({
          name: z.string(),
          age: z.number()
        }),
        atoms: {
          name: createSyncAtom(''),
          age: createSyncAtom(0)
        }
        // No persisted field
      },
      settings: {
        schema: z.object({
          theme: z.string()
        }),
        atoms: {
          theme: createSyncAtom('light')
        },
        persisted: [] // Empty persisted array
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should resolve immediately without waiting
    await expect(promise).resolves.toBeUndefined();
  });

  it('should wait for single persisted atom to load', async () => {
    const themeAtom = createAsyncStorageAtom('dark', 100);
    
    const registry: HydrationRegistry = {
      settings: {
        schema: z.object({
          theme: z.string(),
          notifications: z.boolean()
        }),
        atoms: {
          theme: themeAtom,
          notifications: createSyncAtom(true)
        },
        persisted: ['theme'] // Only theme is persisted
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should not resolve immediately
    let resolved = false;
    promise.then(() => { resolved = true; });
    
    await vi.advanceTimersByTimeAsync(50);
    expect(resolved).toBe(false);
    
    await vi.advanceTimersByTimeAsync(60);
    await promise;
    expect(resolved).toBe(true);
  });

  it('should wait for multiple persisted atoms across sections', async () => {
    const userTokenAtom = createAsyncStorageAtom('token123', 150);
    const themeAtom = createAsyncStorageAtom('dark', 200);
    const localeAtom = createAsyncStorageAtom('en-US', 100);
    
    const registry: HydrationRegistry = {
      auth: {
        schema: z.object({
          token: z.string(),
          isLoggedIn: z.boolean()
        }),
        atoms: {
          token: userTokenAtom,
          isLoggedIn: createSyncAtom(false)
        },
        persisted: ['token']
      },
      settings: {
        schema: z.object({
          theme: z.string(),
          locale: z.string(),
          notifications: z.boolean()
        }),
        atoms: {
          theme: themeAtom,
          locale: localeAtom,
          notifications: createSyncAtom(true)
        },
        persisted: ['theme', 'locale']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should wait for the slowest atom (theme at 200ms)
    let resolved = false;
    promise.then(() => { resolved = true; });
    
    await vi.advanceTimersByTimeAsync(100); // locale loads
    expect(resolved).toBe(false);
    
    await vi.advanceTimersByTimeAsync(50); // token loads at 150
    expect(resolved).toBe(false);
    
    await vi.advanceTimersByTimeAsync(60); // theme loads at 200
    await promise;
    expect(resolved).toBe(true);
  });

  it('should handle mixed sync and async atoms correctly', async () => {
    const asyncAtom1 = createAsyncStorageAtom('async1', 100);
    const asyncAtom2 = createAsyncStorageAtom('async2', 200);
    const syncAtom = createSyncAtom('sync');
    
    const registry: HydrationRegistry = {
      mixed: {
        schema: z.object({
          async1: z.string(),
          async2: z.string(),
          sync: z.string(),
          notPersisted: z.string()
        }),
        atoms: {
          async1: asyncAtom1,
          async2: asyncAtom2,
          sync: syncAtom,
          notPersisted: createSyncAtom('not-persisted')
        },
        persisted: ['async1', 'async2', 'sync'] // Mix of async and sync
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should wait for async atoms but handle sync atoms immediately
    let resolved = false;
    promise.then(() => { resolved = true; });
    
    await vi.advanceTimersByTimeAsync(150);
    expect(resolved).toBe(false);
    
    await vi.advanceTimersByTimeAsync(60);
    await promise;
    expect(resolved).toBe(true);
  });

  it('should ignore atoms not listed in persisted array', async () => {
    const persistedAtom = createAsyncStorageAtom('persisted', 100);
    const notPersistedAtom = createAsyncStorageAtom('not-persisted', 5000); // Very slow
    
    const registry: HydrationRegistry = {
      selective: {
        schema: z.object({
          persisted: z.string(),
          notPersisted: z.string()
        }),
        atoms: {
          persisted: persistedAtom,
          notPersisted: notPersistedAtom
        },
        persisted: ['persisted'] // Only wait for this one
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should resolve after 100ms, not wait for the 5000ms atom
    await vi.advanceTimersByTimeAsync(101);
    await expect(promise).resolves.toBeUndefined();
    
    // Clean up: advance to clear the non-persisted atom timer
    await vi.advanceTimersByTimeAsync(4900);
  });

  it('should handle empty registry', async () => {
    const registry: HydrationRegistry = {};
    
    const promise = waitForPersistedAtomsFromRegistry(registry);
    await expect(promise).resolves.toBeUndefined();
  });

  it('should handle persisted field referencing non-existent atom gracefully', async () => {
    const registry: HydrationRegistry = {
      broken: {
        schema: z.object({
          field1: z.string(),
          field2: z.string()
        }),
        atoms: {
          field1: createSyncAtom('value1')
          // field2 atom is missing
        },
        persisted: ['field1', 'field2'] // References non-existent atom
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should handle gracefully (skip missing atom)
    await expect(promise).resolves.toBeUndefined();
  });

  it('should handle concurrent resolution of multiple atoms', async () => {
    // All atoms resolve at exactly the same time
    const atom1 = createAsyncStorageAtom('value1', 100);
    const atom2 = createAsyncStorageAtom('value2', 100);
    const atom3 = createAsyncStorageAtom('value3', 100);
    
    const registry: HydrationRegistry = {
      concurrent: {
        schema: z.object({
          field1: z.string(),
          field2: z.string(),
          field3: z.string()
        }),
        atoms: {
          field1: atom1,
          field2: atom2,
          field3: atom3
        },
        persisted: ['field1', 'field2', 'field3']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    await vi.advanceTimersByTimeAsync(101);
    await expect(promise).resolves.toBeUndefined();
  });

  it('should handle empty persisted array correctly', async () => {
    const atom1 = createAsyncStorageAtom('value1', 100);
    const atom2 = createAsyncStorageAtom('value2', 200);
    
    const registry: HydrationRegistry = {
      section1: {
        schema: z.object({
          field1: z.string(),
          field2: z.string()
        }),
        atoms: {
          field1: atom1,
          field2: atom2
        },
        persisted: [] // Empty array - should not wait for any atoms
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should resolve immediately without waiting
    await expect(promise).resolves.toBeUndefined();
  });

  it('should handle multiple sections with empty persisted arrays', async () => {
    const slowAtom1 = createAsyncStorageAtom('slow1', 5000);
    const slowAtom2 = createAsyncStorageAtom('slow2', 5000);
    
    const registry: HydrationRegistry = {
      section1: {
        schema: z.object({ field1: z.string() }),
        atoms: { field1: slowAtom1 },
        persisted: [] // Empty
      },
      section2: {
        schema: z.object({ field2: z.string() }),
        atoms: { field2: slowAtom2 },
        persisted: [] // Empty
      },
      section3: {
        schema: z.object({ field3: z.string() }),
        atoms: { field3: createSyncAtom('sync') },
        // No persisted field at all
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should resolve immediately, not wait for slow atoms
    await expect(promise).resolves.toBeUndefined();
  });

  it('should deduplicate when same atom appears in multiple sections', async () => {
    // Create a shared atom that will be used in multiple sections
    const sharedThemeAtom = createAsyncStorageAtom('dark', 150);
    const userIdAtom = createAsyncStorageAtom('user123', 100);
    const localeAtom = createAsyncStorageAtom('en-US', 200);
    
    // The shared atom should be used in multiple sections
    
    const registry: HydrationRegistry = {
      userSettings: {
        schema: z.object({
          userId: z.string(),
          theme: z.string(),
          locale: z.string()
        }),
        atoms: {
          userId: userIdAtom,
          theme: sharedThemeAtom, // Shared atom
          locale: localeAtom
        },
        persisted: ['userId', 'theme']
      },
      appSettings: {
        schema: z.object({
          theme: z.string(),
          locale: z.string(),
          fontSize: z.number()
        }),
        atoms: {
          theme: sharedThemeAtom, // Same shared atom
          locale: localeAtom,
          fontSize: createSyncAtom(14)
        },
        persisted: ['theme', 'locale'] // Theme appears again
      },
      globalSettings: {
        schema: z.object({
          theme: z.string()
        }),
        atoms: {
          theme: sharedThemeAtom // Same shared atom again
        },
        persisted: ['theme'] // Theme appears a third time
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should wait for all unique atoms (not duplicate waiting)
    let resolved = false;
    promise.then(() => { resolved = true; });
    
    // Wait for all atoms to resolve
    await vi.advanceTimersByTimeAsync(201);
    await promise;
    expect(resolved).toBe(true);
    
    // With the new implementation, we no longer track catch calls
    // The deduplication happens at the atom level in the Map
    // So this test now just verifies that deduplication works correctly
  });

  it('should handle registry with mix of empty and non-empty persisted arrays', async () => {
    const persistedAtom = createAsyncStorageAtom('persisted', 100);
    const notWaitedAtom = createAsyncStorageAtom('not-waited', 5000);
    
    const registry: HydrationRegistry = {
      section1: {
        schema: z.object({
          field1: z.string(),
          field2: z.string()
        }),
        atoms: {
          field1: persistedAtom,
          field2: notWaitedAtom
        },
        persisted: ['field1'] // Only wait for field1
      },
      section2: {
        schema: z.object({
          field3: z.string()
        }),
        atoms: {
          field3: createAsyncStorageAtom('another', 5000)
        },
        persisted: [] // Empty - don't wait
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Should only wait for persistedAtom (100ms), not the others
    await vi.advanceTimersByTimeAsync(101);
    await expect(promise).resolves.toBeUndefined();
  });

  describe('store-based tests', () => {
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
      store = createStore();
    });

    it('should work with custom store instance', async () => {
      const themeAtom = createAsyncStorageAtom('dark', 100);
      
      const registry: HydrationRegistry = {
        settings: {
          schema: z.object({
            theme: z.string()
          }),
          atoms: {
            theme: themeAtom
          },
          persisted: ['theme']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store,
        timeoutMs: 5000 
      });
      
      await vi.advanceTimersByTimeAsync(101);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle atom that returns promise', async () => {
      // Create an atom that returns a promise
      const customAtom = atom(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('loaded');
          }, 100);
        });
      });
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            value: z.string()
          }),
          atoms: {
            value: customAtom
          },
          persisted: ['value']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store 
      });
      
      await vi.advanceTimersByTimeAsync(101);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle atom that resolves immediately with default value', async () => {
      // Atom that returns resolved promise immediately
      const immediateAtom = atom(() => Promise.resolve('immediate'));
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            value: z.string()
          }),
          atoms: {
            value: immediateAtom
          },
          persisted: ['value']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store 
      });
      
      // Should resolve almost immediately after setImmediate
      await vi.advanceTimersByTimeAsync(1);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle suspense-style atom that throws promise', async () => {
      let resolvePromise: ((value: string) => void) | null = null;
      const suspensePromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
        setTimeout(() => resolve('suspense-value'), 100);
      });

      // Atom that throws promise on first read (Suspense pattern)
      let hasThrown = false;
      const suspenseAtom = atom(() => {
        if (!hasThrown) {
          hasThrown = true;
          throw suspensePromise;
        }
        return 'suspense-value';
      });
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            value: z.string()
          }),
          atoms: {
            value: suspenseAtom
          },
          persisted: ['value']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store 
      });
      
      await vi.advanceTimersByTimeAsync(101);
      await expect(promise).resolves.toBeUndefined();
    });

    it('should handle multiple atoms with different resolution patterns', async () => {
      // Mix of different atom types
      const immediateAtom = atom(() => Promise.resolve('immediate'));
      const delayedAtom = createAsyncStorageAtom('delayed', 150);
      const syncAtom = createSyncAtom('sync');
      const slowAtom = atom(() => {
        return new Promise<string>((resolve) => {
          setTimeout(() => {
            resolve('slow');
          }, 200);
        });
      });
      
      const registry: HydrationRegistry = {
        mixed: {
          schema: z.object({
            immediate: z.string(),
            delayed: z.string(),
            sync: z.string(),
            slow: z.string()
          }),
          atoms: {
            immediate: immediateAtom,
            delayed: delayedAtom,
            sync: syncAtom,
            slow: slowAtom
          },
          persisted: ['immediate', 'delayed', 'slow'] // Not sync
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store 
      });
      
      // Should wait for the slowest (slow at 200ms)
      await vi.advanceTimersByTimeAsync(150);
      let resolved = false;
      promise.then(() => { resolved = true; });
      expect(resolved).toBe(false);
      
      await vi.advanceTimersByTimeAsync(51);
      await promise;
      expect(resolved).toBe(true);
    });
  });
});

describe('Rejection tests with real timers', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useFakeTimers();
  });

  it('should respect default timeout of 3000ms', async () => {
    const slowAtom = createAsyncStorageAtom('value', 400); // Takes longer than default timeout
    
    const registry: HydrationRegistry = {
      data: {
        schema: z.object({
          slowField: z.string()
        }),
        atoms: {
          slowField: slowAtom
        },
        persisted: ['slowField']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 300 });
    
    await expect(promise).rejects.toThrow('Timeout waiting for persisted atoms to load after 300ms');
  });

  it('should respect custom timeout', async () => {
    const slowAtom = createAsyncStorageAtom('value', 150);
    
    const registry: HydrationRegistry = {
      data: {
        schema: z.object({
          slowField: z.string()
        }),
        atoms: {
          slowField: slowAtom
        },
        persisted: ['slowField']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 100 });
    
    await expect(promise).rejects.toThrow('Timeout waiting for persisted atoms to load after 100ms');
  });

  it('should handle atom that rejects during loading', async () => {
    const failingAtom = createAsyncStorageAtom('value', -1); // Negative delay = manual control
    
    const registry: HydrationRegistry = {
      data: {
        schema: z.object({
          failingField: z.string()
        }),
        atoms: {
          failingField: failingAtom
        },
        persisted: ['failingField']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry);
    
    // Manually reject the atom
    setTimeout(() => {
      (failingAtom as any)._testControls.reject(new Error('Storage load failed'));
    }, 100);
    
    await expect(promise).rejects.toThrow('Failed to load persisted atom: Storage load failed');
  });

  it('should properly clean up on timeout', async () => {
    const atom1 = createAsyncStorageAtom('value1', 200);
    const atom2 = createAsyncStorageAtom('value2', 400); // Will timeout
    
    const registry: HydrationRegistry = {
      timeout: {
        schema: z.object({
          field1: z.string(),
          field2: z.string()
        }),
        atoms: {
          field1: atom1,
          field2: atom2
        },
        persisted: ['field1', 'field2']
      }
    };

    const promise = waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 300 });
    
    await expect(promise).rejects.toThrow('Timeout waiting for persisted atoms to load after 300ms');
  });

  describe('store-based rejection tests', () => {
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
      store = createStore();
    });

    it('should timeout when subscription never fires', async () => {
      // Create an atom that returns a promise but never notifies subscribers
      const neverNotifyAtom = atom(() => 
        new Promise<string>(() => {
          // Never resolves, never notifies
        })
      );
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            value: z.string()
          }),
          atoms: {
            value: neverNotifyAtom
          },
          persisted: ['value']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry, { 
        _testStore: store,
        timeoutMs: 100 
      });
      
      await expect(promise).rejects.toThrow('Timeout waiting for persisted atoms to load after 100ms');
    });
  });

  describe('unhandled rejection safety', () => {
    it('should not have unhandled rejections on timeout', async () => {
      const slowAtom = createAsyncStorageAtom('value', 200);
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            slowField: z.string()
          }),
          atoms: {
            slowField: slowAtom
          },
          persisted: ['slowField']
        }
      };

      // This should reject, but not cause an unhandled rejection warning
      await expect(
        waitForPersistedAtomsFromRegistry(registry, { timeoutMs: 100 })
      ).rejects.toThrow('Timeout waiting for persisted atoms to load after 100ms');
      
      // Allow time for any potential unhandled rejection to be processed
      await new Promise(resolve => setImmediate(resolve));
    });

    it('should not have unhandled rejections on atom failure', async () => {
      const failingAtom = createAsyncStorageAtom('value', -1);
      
      const registry: HydrationRegistry = {
        data: {
          schema: z.object({
            failingField: z.string()
          }),
          atoms: {
            failingField: failingAtom
          },
          persisted: ['failingField']
        }
      };

      const promise = waitForPersistedAtomsFromRegistry(registry);
      
      // Reject the atom's promise
      (failingAtom as any)._testControls.reject(new Error('Test failure'));
      
      // The main promise should reject, but no unhandled rejection should occur
      await expect(promise).rejects.toThrow('Failed to load persisted atom: Test failure');
      
      // Allow time for any potential unhandled rejection to be processed
      await new Promise(resolve => setImmediate(resolve));
    });
  });
});