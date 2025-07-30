import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import { hydrateFromEncodedBlob, createHydrationBlob } from '../src/index';
import type { HydrationRegistry, HydrationResult } from '../src/index';
import { createTestAtoms, MockAtomStore, MockLogger } from './test-utils';

describe('hydrateFromEncodedBlob', () => {
  let atomStore: MockAtomStore;
  let logger: MockLogger;
  let testAtoms: ReturnType<typeof createTestAtoms>;

  beforeEach(() => {
    atomStore = new MockAtomStore();
    logger = new MockLogger();
    testAtoms = createTestAtoms();
  });

  describe('successful hydration', () => {
    it('should hydrate valid data matching schema', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
        active: z.boolean(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            active: testAtoms.activeAtom,
          },
        },
      };

      const data = {
        user: {
          name: 'John Doe',
          age: 30,
          active: true,
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user).toEqual({
        success: true,
        appliedFields: ['name', 'age', 'active'],
      });

      // Verify atoms were set
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(3);
      expect(setOps.find(op => op.atom === testAtoms.nameAtom)?.value).toBe('John Doe');
      expect(setOps.find(op => op.atom === testAtoms.ageAtom)?.value).toBe(30);
      expect(setOps.find(op => op.atom === testAtoms.activeAtom)?.value).toBe(true);

      // Verify logger was used
      expect(logger.infoCalls.length).toBeGreaterThan(0);
    });

    it('should hydrate multiple sections', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const settingsSchema = z.object({
        theme: z.string(),
        notifications: z.boolean(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
          },
        },
        settings: {
          schema: settingsSchema,
          atoms: {
            theme: testAtoms.themeAtom,
            notifications: testAtoms.notificationsAtom,
          },
        },
      };

      const data = {
        user: {
          name: 'Jane Smith',
          age: 25,
        },
        settings: {
          theme: 'dark',
          notifications: false,
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user).toEqual({
        success: true,
        appliedFields: ['name', 'age'],
      });
      expect(result.sections.settings).toEqual({
        success: true,
        appliedFields: ['theme', 'notifications'],
      });

      // Verify all atoms were set
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(4);
    });

    it('should handle null and undefined values correctly', async () => {
      // Arrange
      const schema = z.object({
        name: z.string().nullable(),
        count: z.number().optional(),
      });

      const registry: HydrationRegistry = {
        data: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            count: testAtoms.countAtom,
          },
        },
      };

      const data = {
        data: {
          name: null,
          // count is undefined (optional)
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: false, // Allow optional fields
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.data.success).toBe(true);
      expect(result.sections.data.appliedFields).toContain('name');
      // undefined fields should not be in appliedFields
      expect(result.sections.data.appliedFields).not.toContain('count');

      // Verify only name was set (to null)
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toBe(null);
    });
  });

  describe('validation errors', () => {
    it('should fail when data does not match schema', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          age: 'not-a-number', // Invalid type
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(false);
      expect(result.sections.user.error).toBeDefined();
      expect(result.sections.user.error).toContain('expected number');

      // Verify no atoms were set
      expect(atomStore.getSetOperations()).toHaveLength(0);

      // Verify error was logged
      expect(logger.errorCalls.length).toBeGreaterThan(0);
    });

    it('should handle invalid blob gracefully', async () => {
      // Arrange
      const registry: HydrationRegistry = {
        user: {
          schema: z.object({ name: z.string() }),
          atoms: { name: testAtoms.nameAtom },
        },
      };

      const invalidBlob = 'not-valid-base64!@#$%';

      // Act
      const result = await hydrateFromEncodedBlob(invalidBlob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      // All sections should be marked as failed due to blob decode error
      expect(Object.values(result.sections).every(s => s.success === false)).toBe(true);
      
      // Verify error was logged
      expect(logger.errorCalls.length).toBeGreaterThan(0);
    });

    it('should handle partial validation failures', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const settingsSchema = z.object({
        theme: z.string(),
        locale: z.string(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
          },
        },
        settings: {
          schema: settingsSchema,
          atoms: {
            theme: testAtoms.themeAtom,
            locale: testAtoms.localeAtom,
          },
        },
      };

      const data = {
        user: {
          name: 'Valid User',
          age: 25,
        },
        settings: {
          theme: 123, // Invalid - should be string
          locale: 'en-US',
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.settings.success).toBe(false);
      expect(result.sections.settings.error).toContain('expected string');

      // Verify only valid section atoms were set
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(2); // Only user section
      expect(setOps.find(op => op.atom === testAtoms.nameAtom)?.value).toBe('Valid User');
      expect(setOps.find(op => op.atom === testAtoms.ageAtom)?.value).toBe(25);
    });
  });

  describe('strict mode validation', () => {
    it('should handle optional schema fields correctly in strict mode', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        email: z.string().optional(),
        age: z.number().optional(),
      });

      const registry: HydrationRegistry = {
        test: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            email: testAtoms.emailAtom,
            age: testAtoms.ageAtom,
          },
        },
      };

      // Data with only required field
      const data = { test: { name: 'John' } };
      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true,
        logger,
        _testStore: atomStore,
      });

      // Assert - should succeed because all atoms match schema fields
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.test.success).toBe(true);
      
      // Check that only the name atom was set
      const setOps = atomStore.getSetOperations();
      expect(setOps.length).toBe(1);
      expect(setOps[0].atom).toBe(testAtoms.nameAtom);
      expect(setOps[0].value).toBe('John');
    });

    it('should fail in strict mode when schema field lacks corresponding atom', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string(), // No atom for this field
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            // Missing email atom
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          age: 30,
          email: 'john@example.com',
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true, // Explicit strict mode
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(false);
      expect(result.sections.user.error).toContain('missing atom');
      expect(result.sections.user.error).toContain('email');

      // No atoms should be set in strict mode when validation fails
      expect(atomStore.getSetOperations()).toHaveLength(0);
    });

    it('should fail in strict mode when atom has no corresponding schema field', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            active: testAtoms.activeAtom, // Extra atom not in schema
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true,
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(false);
      expect(result.sections.user.error).toContain('Extra atom');
      expect(result.sections.user.error).toContain('active');

      // No atoms should be set
      expect(atomStore.getSetOperations()).toHaveLength(0);
    });

    it('should succeed in strict mode with perfect 1:1 mapping', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
          },
        },
      };

      const data = {
        user: {
          name: 'Perfect Match',
          age: 25,
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.user.appliedFields).toEqual(['name', 'age']);

      // Verify atoms were set
      expect(atomStore.getSetOperations()).toHaveLength(2);
    });
  });

  describe('non-strict mode validation', () => {
    it('should warn but succeed when schema field lacks atom in non-strict mode', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            // Missing email atom
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          age: 30,
          email: 'john@example.com',
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: false,
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.user.warnings).toBeDefined();
      expect(result.sections.user.warnings).toContain('No atom found for field: email');
      expect(result.sections.user.appliedFields).toEqual(['name', 'age']);

      // Verify only available atoms were set
      expect(atomStore.getSetOperations()).toHaveLength(2);

      // Verify warning was logged
      expect(logger.warnCalls.length).toBeGreaterThan(0);
    });

    it('should succeed with extra atoms in non-strict mode', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom, // Extra atom
            active: testAtoms.activeAtom, // Extra atom
          },
        },
      };

      const data = {
        user: {
          name: 'John',
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: false,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.user.appliedFields).toEqual(['name']);

      // Only the matching field should be set
      expect(atomStore.getSetOperations()).toHaveLength(1);
    });
  });

  describe('strict mode default behavior', () => {
    it('should default to strict mode when not specified', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        email: z.string(), // No atom for this field
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            // Missing email atom - should fail by default
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          email: 'john@example.com',
        },
      };

      const blob = createHydrationBlob(data);

      // Act - no strict option specified
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert - should fail because strict mode is true by default
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(false);
      expect(result.sections.user.error).toContain('Schema fields missing atom: email');
      expect(atomStore.getSetOperations()).toHaveLength(0);
    });

    it('should handle explicit strict: true same as default', async () => {
      // Arrange
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            active: testAtoms.activeAtom, // Extra atom
          },
        },
      };

      const data = {
        user: {
          name: 'John',
          age: 30,
        },
      };

      const blob = createHydrationBlob(data);

      // Act - explicit strict: true
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true,
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(false);
      expect(result.sections.user.success).toBe(false);
      expect(result.sections.user.error).toContain('Extra atoms not in schema: active');
    });
  });

  describe('persisted field handling', () => {
    it('should handle sections with explicit persisted field', async () => {
      // Arrange
      const schema = z.object({
        theme: z.string(),
        locale: z.string(),
        fontSize: z.number(),
      });

      const registry: HydrationRegistry = {
        settings: {
          schema,
          atoms: {
            theme: testAtoms.themeAtom,
            locale: testAtoms.localeAtom,
            fontSize: testAtoms.fontSizeAtom,
          },
          persisted: ['theme', 'locale'], // Only these are persisted
        },
      };

      const data = {
        settings: {
          theme: 'dark',
          locale: 'en-US',
          fontSize: 16,
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: false,
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert - all fields should be hydrated regardless of persisted status
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.settings.success).toBe(true);
      expect(result.sections.settings.appliedFields).toEqual(['theme', 'locale', 'fontSize']);
      
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(3);
    });

    it('should hydrate non-persisted fields normally', async () => {
      // Arrange - mix of persisted and non-persisted atoms
      const userSchema = z.object({
        id: z.string(),
        name: z.string(),
        email: z.string(),
        preferences: z.object({
          notifications: z.boolean(),
        }),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            id: testAtoms.idAtom,
            name: testAtoms.nameAtom,
            email: testAtoms.emailAtom,
            preferences: testAtoms.preferencesAtom,
          },
          persisted: ['id', 'preferences'], // Only some fields persisted
        },
      };

      const data = {
        user: {
          id: 'user-123',
          name: 'Jane Doe',
          email: 'jane@example.com',
          preferences: {
            notifications: true,
          },
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert - all fields hydrated, not just persisted ones
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.user.appliedFields).toHaveLength(4);
      expect(result.sections.user.appliedFields).toContain('id');
      expect(result.sections.user.appliedFields).toContain('name');
      expect(result.sections.user.appliedFields).toContain('email');
      expect(result.sections.user.appliedFields).toContain('preferences');
    });
  });

  describe('multiple hydration calls', () => {
    it('should support multiple hydrate calls with non-overlapping data', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      });

      const settingsSchema = z.object({
        theme: z.string(),
        notifications: z.boolean(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
          },
        },
        settings: {
          schema: settingsSchema,
          atoms: {
            theme: testAtoms.themeAtom,
            notifications: testAtoms.notificationsAtom,
          },
        },
      };

      // First hydration blob with only user data
      const firstData = {
        user: {
          name: 'John Doe',
          age: 30,
        },
      };
      const firstBlob = createHydrationBlob(firstData);

      // Second hydration blob with only settings data
      const secondData = {
        settings: {
          theme: 'dark',
          notifications: true,
        },
      };
      const secondBlob = createHydrationBlob(secondData);

      // Act - First hydration
      const firstResult = await hydrateFromEncodedBlob(firstBlob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Check first hydration result
      expect(firstResult.overallSuccess).toBe(true);
      expect(firstResult.sections.user).toEqual({
        success: true,
        appliedFields: ['name', 'age'],
      });
      // settings section should not be present in first result
      expect(firstResult.sections.settings).toBeUndefined();

      // Verify atoms after first hydration
      let setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(2);
      expect(setOps.find(op => op.atom === testAtoms.nameAtom)?.value).toBe('John Doe');
      expect(setOps.find(op => op.atom === testAtoms.ageAtom)?.value).toBe(30);

      // Act - Second hydration
      const secondResult = await hydrateFromEncodedBlob(secondBlob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Check second hydration result
      expect(secondResult.overallSuccess).toBe(true);
      expect(secondResult.sections.settings).toEqual({
        success: true,
        appliedFields: ['theme', 'notifications'],
      });
      // user section should not be present in second result
      expect(secondResult.sections.user).toBeUndefined();

      // Verify all atoms after second hydration
      setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(4); // Should have all 4 atom sets
      
      // User atoms should still have their values
      expect(setOps.find(op => op.atom === testAtoms.nameAtom)?.value).toBe('John Doe');
      expect(setOps.find(op => op.atom === testAtoms.ageAtom)?.value).toBe(30);
      
      // Settings atoms should have their values
      expect(setOps.find(op => op.atom === testAtoms.themeAtom)?.value).toBe('dark');
      expect(setOps.find(op => op.atom === testAtoms.notificationsAtom)?.value).toBe(true);
    });

    it('should handle overlapping sections in multiple hydrations', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
        email: z.string().optional(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            age: testAtoms.ageAtom,
            email: testAtoms.emailAtom,
          },
        },
      };

      // First hydration with partial user data
      const firstData = {
        user: {
          name: 'Initial Name',
          age: 25,
        },
      };
      const firstBlob = createHydrationBlob(firstData);

      // Second hydration with overlapping and new data
      const secondData = {
        user: {
          name: 'Updated Name', // This will overwrite
          age: 26, // This will overwrite
          email: 'user@example.com', // This is new
        },
      };
      const secondBlob = createHydrationBlob(secondData);

      // Act - First hydration
      await hydrateFromEncodedBlob(firstBlob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Act - Second hydration
      await hydrateFromEncodedBlob(secondBlob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert - Check final atom values
      const setOps = atomStore.getSetOperations();
      
      // Find the last set operation for each atom
      const nameOps = setOps.filter(op => op.atom === testAtoms.nameAtom);
      const ageOps = setOps.filter(op => op.atom === testAtoms.ageAtom);
      const emailOps = setOps.filter(op => op.atom === testAtoms.emailAtom);

      // Values should reflect the second hydration
      expect(nameOps[nameOps.length - 1]?.value).toBe('Updated Name');
      expect(ageOps[ageOps.length - 1]?.value).toBe(26);
      expect(emailOps[emailOps.length - 1]?.value).toBe('user@example.com');
    });

    it('should handle partial hydration with mixed sections', async () => {
      // Arrange
      const userSchema = z.object({
        name: z.string(),
        preferences: z.object({
          theme: z.string(),
          language: z.string(),
        }),
      });

      const settingsSchema = z.object({
        notifications: z.boolean(),
        autoSave: z.boolean(),
      });

      const registry: HydrationRegistry = {
        user: {
          schema: userSchema,
          atoms: {
            name: testAtoms.nameAtom,
            preferences: testAtoms.preferencesAtom,
          },
        },
        settings: {
          schema: settingsSchema,
          atoms: {
            notifications: testAtoms.notificationsAtom,
            autoSave: testAtoms.autoSaveAtom,
          },
        },
      };

      // Three separate hydration passes
      const blob1 = createHydrationBlob({
        user: {
          name: 'Alice',
          preferences: { theme: 'light', language: 'en' },
        },
      });

      const blob2 = createHydrationBlob({
        settings: {
          notifications: true,
          autoSave: false,
        },
      });

      const blob3 = createHydrationBlob({
        user: {
          name: 'Alice',
          preferences: { theme: 'dark', language: 'en' }, // Theme updated
        },
      });

      // Act - Multiple hydrations
      const result1 = await hydrateFromEncodedBlob(blob1, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      const result2 = await hydrateFromEncodedBlob(blob2, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      const result3 = await hydrateFromEncodedBlob(blob3, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result1.overallSuccess).toBe(true);
      expect(result2.overallSuccess).toBe(true);
      expect(result3.overallSuccess).toBe(true);

      // Check final state
      const setOps = atomStore.getSetOperations();
      
      const prefsOps = setOps.filter(op => op.atom === testAtoms.preferencesAtom);
      const latestPrefs = prefsOps[prefsOps.length - 1]?.value;
      
      expect(latestPrefs).toEqual({ theme: 'dark', language: 'en' });
      
      // Settings should remain unchanged from blob2
      expect(setOps.find(op => op.atom === testAtoms.notificationsAtom)?.value).toBe(true);
      expect(setOps.find(op => op.atom === testAtoms.autoSaveAtom)?.value).toBe(false);
    });
  });

  describe('object-storing atoms', () => {
    it('should support atoms that store entire objects matching schema structure', async () => {
      // Arrange - Modern pattern: single atom storing related state
      const relationshipSchema = z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(['friend', 'family', 'colleague']),
      });

      const relationshipStateSchema = z.object({
        relationships: z.array(relationshipSchema),
        currentId: z.string().nullable(),
      });

      // Single atom storing the entire state object
      const relationshipStateAtom = testAtoms.relationshipStateAtom;

      const registry: HydrationRegistry = {
        relationshipState: {
          schema: relationshipStateSchema,
          atoms: {
            relationshipState: relationshipStateAtom, // Single atom for entire object
          },
          persisted: ['relationshipState'],
        },
      };

      const data = {
        relationshipState: {
          relationships: [
            { id: '1', name: 'Alice', type: 'friend' },
            { id: '2', name: 'Bob', type: 'colleague' },
          ],
          currentId: '1',
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        strict: true, // Should work in strict mode
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.relationshipState.success).toBe(true);
      expect(result.sections.relationshipState.appliedFields).toEqual(['relationshipState']);

      // Verify the entire object was set to the atom
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].atom).toBe(relationshipStateAtom);
      expect(setOps[0].value).toEqual({
        relationships: [
          { id: '1', name: 'Alice', type: 'friend' },
          { id: '2', name: 'Bob', type: 'colleague' },
        ],
        currentId: '1',
      });
    });

    it('should detect object-storing atoms automatically based on structure', async () => {
      // Arrange
      const userProfileSchema = z.object({
        personal: z.object({
          firstName: z.string(),
          lastName: z.string(),
          email: z.string().email(),
        }),
        preferences: z.object({
          theme: z.enum(['light', 'dark', 'auto']),
          language: z.string(),
          notifications: z.boolean(),
        }),
        metadata: z.object({
          createdAt: z.string(),
          lastLoginAt: z.string().nullable(),
        }),
      });

      // Single atom storing entire user profile
      const userProfileAtom = testAtoms.userProfileAtom;

      const registry: HydrationRegistry = {
        userProfile: {
          schema: userProfileSchema,
          atoms: {
            userProfile: userProfileAtom, // Name matches section name
          },
          persisted: ['userProfile'],
        },
      };

      const data = {
        userProfile: {
          personal: {
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane@example.com',
          },
          preferences: {
            theme: 'dark',
            language: 'en-US',
            notifications: true,
          },
          metadata: {
            createdAt: '2023-01-01T00:00:00Z',
            lastLoginAt: '2023-12-25T10:30:00Z',
          },
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.userProfile.success).toBe(true);
      
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toEqual(data.userProfile);
    });

    it('should still support flat atom structures alongside object-storing atoms', async () => {
      // Arrange - Mixed registry with both patterns
      const flatSchema = z.object({
        name: z.string(),
        email: z.string(),
      });

      const objectSchema = z.object({
        settings: z.object({
          theme: z.string(),
          fontSize: z.number(),
        }),
        flags: z.object({
          betaFeatures: z.boolean(),
          analytics: z.boolean(),
        }),
      });

      const registry: HydrationRegistry = {
        // Traditional flat structure
        user: {
          schema: flatSchema,
          atoms: {
            name: testAtoms.nameAtom,
            email: testAtoms.emailAtom,
          },
        },
        // Object-storing atom
        appState: {
          schema: objectSchema,
          atoms: {
            appState: testAtoms.appStateAtom,
          },
          persisted: ['appState'],
        },
      };

      const data = {
        user: {
          name: 'John Smith',
          email: 'john@example.com',
        },
        appState: {
          settings: {
            theme: 'light',
            fontSize: 14,
          },
          flags: {
            betaFeatures: true,
            analytics: false,
          },
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      
      // Check flat structure section
      expect(result.sections.user.success).toBe(true);
      expect(result.sections.user.appliedFields).toEqual(['name', 'email']);
      
      // Check object-storing section
      expect(result.sections.appState.success).toBe(true);
      expect(result.sections.appState.appliedFields).toEqual(['appState']);

      // Verify atoms
      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(3); // 2 flat + 1 object
      
      expect(setOps.find(op => op.atom === testAtoms.nameAtom)?.value).toBe('John Smith');
      expect(setOps.find(op => op.atom === testAtoms.emailAtom)?.value).toBe('john@example.com');
      expect(setOps.find(op => op.atom === testAtoms.appStateAtom)?.value).toEqual(data.appState);
    });
  });

  describe('edge cases', () => {
    it('should handle empty registry', async () => {
      // Arrange
      const registry: HydrationRegistry = {};
      const data = { user: { name: 'John' } };
      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections).toEqual({});
      expect(atomStore.getSetOperations()).toHaveLength(0);
    });

    it('should handle registry with no matching sections in data', async () => {
      // Arrange
      const registry: HydrationRegistry = {
        user: {
          schema: z.object({ name: z.string() }),
          atoms: { name: testAtoms.nameAtom },
        },
      };

      const data = {
        settings: { theme: 'dark' }, // No 'user' section
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        logger,
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections).toEqual({}); // No sections processed
      expect(atomStore.getSetOperations()).toHaveLength(0);

      // Should log info about skipping section
      expect(logger.infoCalls.some(call => 
        call.some(arg => String(arg).includes('No data for section'))
      )).toBe(true);
    });

    it('should handle complex nested schemas', async () => {
      // Arrange
      const configSchema = z.object({
        config: z.object({
          debug: z.boolean(),
          verbose: z.boolean(),
        }),
      });

      const registry: HydrationRegistry = {
        app: {
          schema: configSchema,
          atoms: {
            config: testAtoms.configAtom,
          },
        },
      };

      const data = {
        app: {
          config: {
            debug: true,
            verbose: false,
          },
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.app.success).toBe(true);
      expect(result.sections.app.appliedFields).toEqual(['config']);

      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toEqual({ debug: true, verbose: false });
    });

    it('should handle array data', async () => {
      // Arrange
      const schema = z.object({
        items: z.array(z.string()),
      });

      const registry: HydrationRegistry = {
        list: {
          schema,
          atoms: {
            items: testAtoms.itemsAtom,
          },
        },
      };

      const data = {
        list: {
          items: ['apple', 'banana', 'orange'],
        },
      };

      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(result.sections.list.success).toBe(true);

      const setOps = atomStore.getSetOperations();
      expect(setOps).toHaveLength(1);
      expect(setOps[0].value).toEqual(['apple', 'banana', 'orange']);
    });

    it('should use console as default logger when none provided', async () => {
      // Arrange
      const consoleSpy = {
        info: vi.spyOn(console, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      };

      const registry: HydrationRegistry = {
        user: {
          schema: z.object({ name: z.string() }),
          atoms: { name: testAtoms.nameAtom },
        },
      };

      const data = { user: { name: 'Test' } };
      const blob = createHydrationBlob(data);

      // Act
      const result = await hydrateFromEncodedBlob(blob, registry, {
        // @ts-expect-error - passing test store for testing
        _testStore: atomStore,
      });

      // Assert
      expect(result.overallSuccess).toBe(true);
      expect(consoleSpy.info).toHaveBeenCalled();

      // Cleanup
      consoleSpy.info.mockRestore();
      consoleSpy.warn.mockRestore();
      consoleSpy.error.mockRestore();
    });
  });
});