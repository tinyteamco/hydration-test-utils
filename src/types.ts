import type { Atom } from 'jotai';
import type { z } from 'zod';

/**
 * Logger interface for diagnostic output during hydration.
 * Compatible with console or any custom logging implementation.
 */
export interface HydrationLogger {
  /** Log informational messages */
  info?: (...args: unknown[]) => void;
  /** Log warning messages */
  warn?: (...args: unknown[]) => void;
  /** Log error messages */
  error?: (...args: unknown[]) => void;
}

/**
 * Configuration for a single section in the hydration registry.
 * Each section defines a schema, corresponding atoms, and persisted fields.
 * 
 * @template T - The shape of data for this section, must be an object
 */
export interface HydrationRegistryEntry<T extends Record<string, any>> {
  /** Zod schema defining the expected shape and validation rules for this section */
  schema: z.ZodType<T>;
  /** Map of field names to Jotai atoms that will receive the hydrated values */
  atoms: Record<keyof T & string, Atom<any>>;
  /** Schema keys backed by storage (persisted). These atoms will be awaited before hydration. */
  persisted?: (keyof T & string)[];
}

/**
 * Collection of hydration sections, where each key is a section name
 * and the value defines how to hydrate that section.
 * 
 * @example
 * const registry: HydrationRegistry = {
 *   user: { schema: userSchema, atoms: { name: nameAtom, id: idAtom } },
 *   settings: { schema: settingsSchema, atoms: { theme: themeAtom }, persisted: ['theme'] }
 * };
 */
export type HydrationRegistry = Record<string, HydrationRegistryEntry<any>>;

/**
 * Result of hydrating a single section from the registry.
 * Contains success status and diagnostic information.
 */
export interface HydrationSectionResult {
  /** Whether this section was successfully hydrated */
  success: boolean;
  /** Error message if hydration failed */
  error?: string;
  /** Non-fatal warnings (e.g., missing atoms in non-strict mode) */
  warnings?: string[];
  /** List of field names that were successfully applied to atoms */
  appliedFields?: string[];
}

/**
 * Overall result of a hydration operation.
 * Contains results for each section and aggregate success status.
 */
export interface HydrationResult {
  /** Results for each section that was processed */
  sections: Record<string, HydrationSectionResult>;
  /** True only if all sections succeeded */
  overallSuccess: boolean;
}

/**
 * Options for the hydration process.
 */
export interface HydrateOptions {
  /** 
   * Strict mode validation (defaults to true).
   * When true: 
   * - Every schema field must have a corresponding atom
   * - Every atom must have a corresponding schema field
   * - Any mismatch will cause hydration to fail
   * 
   * When false:
   * - Missing atoms produce warnings but don't fail hydration
   * - Extra atoms are silently ignored
   */
  strict?: boolean;
  /** Logger for diagnostics (defaults to console). */
  logger?: HydrationLogger;
}

/**
 * Options for waiting operations.
 */
export interface WaitOptions {
  /** Maximum time to wait for persisted atoms to load before timing out (default: 3000ms) */
  timeoutMs?: number;
  /** @internal Test-only: custom store instance for testing */
  _testStore?: any;
}

/**
 * Options for the bootstrap function.
 * Combines hydration and wait options with blob discovery control.
 */
export interface BootstrapOptions extends HydrateOptions, WaitOptions {
  /** 
   * Explicit blob to use for hydration.
   * When provided, skips the discovery process.
   * When omitted, discovers blob in this order:
   * 1. window.__HYDRATION_BLOB__
   * 2. URL query parameter 'hydrate'
   */
  blob?: string;
}