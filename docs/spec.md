# @your-org/hydration-test-utils  
**Reusable library for injecting typed test state into a Jotai-based application**  

---

## Table of Contents
1. [Overview](#overview)
2. [Goals](#goals)
3. [Architecture Summary](#architecture-summary)
4. [Public API](#public-api)
5. [Type Definitions](#type-definitions)
6. [Algorithms & Behaviour](#algorithms--behaviour)
7. [Window Globals (Test Bridge)](#window-globals-test-bridge)
8. [Monorepo & File Layout](#monorepo--file-layout)
9. [Build & Tooling](#build--tooling)
10. [Example App Specification](#example-app-specification)
11. [Unit Tests (Vitest)](#unit-tests-vitest)
12. [Playwright E2E Tests](#playwright-e2e-tests)
13. [README Content Outline](#readme-content-outline)
14. [Edge Cases & Limitations](#edge-cases--limitations)
15. [Future Extensions](#future-extensions)
16. [Key Takeaways](#key-takeaways)

---

## Overview
This library enables end-to-end tests (e.g. Playwright) to inject **typed**, **validated** state into a frontend application using **Zod** for schemas and **Jotai** for runtime state.  

Tests provide a base64-encoded blob of structured JSON. The app decodes it during bootstrap, validates it, and writes values into the correct atoms. Atoms that use `atomWithStorage` automatically persist per the app’s existing persistence mechanism; ephemeral atoms remain in-memory.

A helper (`bootstrapHydration`) handles ordering: waiting for persisted atoms’ async storage to resolve before injecting test data.

---

## Goals
- **Single source of truth** for test state shape via Zod schemas.
- **No duplication** of persistence logic: atoms with storage persist themselves.
- **Deterministic ordering**: avoid race where async storage overwrites injected values.
- **Structured feedback**: tests can inspect a `HydrationResult` instead of scraping console logs.
- **Strict mode**: enforce 1:1 mapping between schema fields and atoms.

---

## Architecture Summary
Core components:

| Component | Responsibility |
|-----------|----------------|
| `HydrationRegistry` | Maps section key → `{ schema, atoms, persisted }`. |
| `createHydrationBlob` | Serialises arbitrary object → URL-safe base64 string (test side). |
| `waitForPersistedAtomsFromRegistry` | Ensures all persisted atoms (declared via `persisted`) have finished initial async load. |
| `hydrateFromEncodedBlob` | Decodes blob, validates sections, sets atom values, returns structured result. |
| `bootstrapHydration` | High-level orchestration: discover blob + wait + hydrate + expose result. |
| `HydrationResult` | Machine-readable success/failure summary for each section. |

---

## Public API

All exports come from `@your-org/hydration-test-utils`.

| Export | Signature | Purpose |
|--------|-----------|---------|
| `createHydrationBlob` | `(data: Record<string, unknown>) => string` | Encode test data → URL-safe base64 blob. Use in Playwright (Node). |
| `decodeHydrationBlob` | `(blob: string) => any` | Utility for debugging: reverse of above. |
| `hydrateFromEncodedBlob` | `(blob: string, registry: HydrationRegistry, options?: HydrateOptions) => Promise<HydrationResult>` | Core hydration: decode, validate, set atoms. |
| `waitForPersistedAtomsFromRegistry` | `(registry: HydrationRegistry, options?: WaitOptions) => Promise<void>` | Prevent race by waiting until persisted atoms finish async storage load. |
| `bootstrapHydration` | `(registry: HydrationRegistry, options?: BootstrapOptions) => Promise<HydrationResult | undefined>` | One-call bootstrap used in app entrypoint before render. |
| Types | `HydrationRegistryEntry`, `HydrationRegistry`, `HydrationResult`, `HydrationSectionResult`, `HydrateOptions`, `BootstrapOptions`, `WaitOptions`, `HydrationLogger` | For registry creation and result inspection. |

---

## Type Definitions

```ts
import type { Atom } from 'jotai';
import type { z } from 'zod';

export interface HydrationLogger {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface HydrationRegistryEntry<T extends Record<string, any>> {
  schema: z.ZodType<T>;
  atoms: Record<keyof T & string, Atom<any>>;
  /** Schema keys backed by storage (persisted). */
  persisted?: (keyof T & string)[];
}

export type HydrationRegistry = Record<string, HydrationRegistryEntry<any>>;

export interface HydrationSectionResult {
  success: boolean;
  error?: string;
  warnings?: string[];
  appliedFields?: string[];
}

export interface HydrationResult {
  sections: Record<string, HydrationSectionResult>;
  overallSuccess: boolean;
}

export interface HydrateOptions {
  /** Default true. If true: every schema key must have an atom and no extra atoms allowed. */
  strict?: boolean;
  /** Logger for diagnostics (defaults to console). */
  logger?: HydrationLogger;
}

export interface WaitOptions {
  /** Milliseconds before rejecting. Default 3000. */
  timeoutMs?: number;
}

export interface BootstrapOptions extends HydrateOptions, WaitOptions {
  /** Explicit blob override (skips discovery). */
  blob?: string;
}
