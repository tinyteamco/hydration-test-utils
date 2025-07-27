# Hydration Test Utils

**Inject complex test state into your Jotai + React app for E2E testing.**

Skip the repetitive UI interactions and jump straight to testing the scenarios that matter. This library lets you hydrate your Jotai atoms with validated test data, making your E2E tests faster and more maintainable.

## Why?

Testing complex application states often requires clicking through multiple UI steps. With Hydration Test Utils, you can:
- Start tests with any application state instantly
- Test edge cases that are hard to reproduce through the UI
- Make your E2E tests faster and more reliable
- Ensure test data matches your application's expectations with Zod validation

## Features

- 🎯 **Simple API** - One line to hydrate your entire app state
- 🔒 **Type-safe** - Full TypeScript + Zod schema validation
- 🧪 **Test framework agnostic** - Works with Playwright, Cypress, or any E2E tool
- ⚡ **Async aware** - Handles persisted/async atoms correctly
- 🛡️ **Production safe** - No-op when hydration data isn't present

## Installation

```bash
npm install @tinyteamco/hydration-test-utils
# or
yarn add @tinyteamco/hydration-test-utils
# or
pnpm add @tinyteamco/hydration-test-utils
```

## Quick Start

### 1. Write a test with hydrated state (Playwright)

```typescript
import { hydratePage } from '@tinyteamco/hydration-test-utils/playwright';

test('admin user can edit settings', async ({ page }) => {
  // Inject test state and navigate to your app
  await hydratePage(page, {
    data: {
      user: {
        id: 1,
        name: 'Admin User',
        email: 'admin@example.com',
        role: 'admin'
      },
      settings: {
        theme: 'dark',
        locale: 'en'
      }
    }
  });
  
  // Your app starts with the injected state!
  await expect(page.getByTestId('user-name')).toHaveText('Admin User');
  await expect(page.getByTestId('theme-toggle')).toBeChecked(); // dark mode
  
  // Now test your admin-specific functionality
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('tab', { name: 'Admin' })).toBeVisible();
});
```

### 2. Set up your app for hydration

First, define your atoms and validation schemas:

```typescript
// hydration-setup.ts
import { z } from 'zod';
import { atom } from 'jotai';
import type { HydrationRegistry } from '@tinyteamco/hydration-test-utils';

// Define your schemas
const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user'])
});

// Your existing atoms
export const userIdAtom = atom(0);
export const userNameAtom = atom('');
export const userEmailAtom = atom('');
export const userRoleAtom = atom<'admin' | 'user'>('user');

// Create the registry
export const hydrationRegistry: HydrationRegistry = {
  user: {
    schema: userSchema,
    atoms: {
      id: userIdAtom,
      name: userNameAtom,
      email: userEmailAtom,
      role: userRoleAtom
    }
  }
};
```

Then bootstrap hydration in your app:

```typescript
// main.tsx or app.tsx
import { bootstrapHydration } from '@tinyteamco/hydration-test-utils';
import { hydrationRegistry } from './hydration-setup';

// Before rendering your app
await bootstrapHydration(hydrationRegistry);

// Render your app
createRoot(document.getElementById('root')!).render(<App />);
```

That's it! Your app now accepts test data injection.

## More Examples

### Testing error states

```typescript
test('shows error message for invalid data', async ({ page }) => {
  await hydratePage(page, {
    data: {
      form: {
        email: 'not-an-email', // Will fail validation
        age: -5 // Invalid age
      }
    }
  });
  
  // Test will throw with detailed validation errors
  // Perfect for testing your error handling!
});
```

### Testing with persisted state

```typescript
test('remembers user preferences', async ({ page }) => {
  // First visit - set preferences
  await hydratePage(page, {
    data: {
      preferences: {
        theme: 'dark',
        fontSize: 'large'
      }
    }
  });
  
  // Reload - persisted atoms are maintained
  await page.reload();
  await expect(page.getByTestId('theme')).toHaveAttribute('data-theme', 'dark');
});
```

### Different test frameworks

```typescript
// Cypress
import { createHydrationBlob } from '@tinyteamco/hydration-test-utils';

it('loads admin dashboard', () => {
  const blob = createHydrationBlob({
    user: { role: 'admin' }
  });
  
  cy.visit(`/?hydrate=${blob}`);
  cy.get('[data-testid="admin-panel"]').should('be.visible');
});

// Any framework - use URL params
const blob = createHydrationBlob(testData);
await browser.get(`http://localhost:3000?hydrate=${blob}`);
```

## Primary APIs

The library provides two primary APIs for different use cases:

### `hydratePage(page: Page, options: HydratePageOptions): Promise<HydrationResult>`

**Playwright-specific helper** that handles the complete hydration flow:

```typescript
import { hydratePage } from '@tinyteamco/hydration-test-utils/playwright';

test('user can access admin panel', async ({ page }) => {
  await hydratePage(page, {
    data: {
      user: { role: 'admin', name: 'Admin User' }
    },
    url: 'http://localhost:3000/admin',
    timeout: 10000
  });
  
  await expect(page.getByTestId('admin-panel')).toBeVisible();
});
```

**Options:**
- `data` - Test data matching your registry structure
- `url` - Target URL (defaults to current page URL)
- `timeout` - Max wait time in ms (default: 5000)
- `waitUntil` - Navigation wait condition (default: 'load')

### `bootstrapHydration(registry: HydrationRegistry, options?: BootstrapOptions): Promise<HydrationResult | undefined>`

**Application-side bootstrap** that discovers and applies hydration data:

```typescript
// In your app's entry point (main.tsx)
import { bootstrapHydration } from '@tinyteamco/hydration-test-utils';
import { hydrationRegistry } from './hydration-setup';

// Before rendering
const hydrationResult = await bootstrapHydration(hydrationRegistry);

// Render your app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
```

This function automatically:
1. Discovers hydration data from URL params or window globals
2. Waits for persisted atoms to finish loading
3. Validates and applies the test data
4. Returns results (or undefined if no hydration data found)

## Additional APIs

### `createHydrationBlob(data: any): string`

Creates a URL-safe encoded blob from your test data.

```typescript
const blob = createHydrationBlob({
  user: { name: 'Alice', id: 123 },
  settings: { theme: 'dark' }
});
```

### `decodeHydrationBlob(blob: string): any`

Decodes a hydration blob back to its original data.

```typescript
const data = decodeHydrationBlob(blob);
console.log(data); // { user: { name: 'Alice', id: 123 }, ... }
```

### `bootstrapHydration(registry: HydrationRegistry, options?: BootstrapOptions): Promise<HydrationResult | undefined>`

High-level function that handles the complete hydration flow.

**Options:**
- `blob?: string` - Explicit blob (skips discovery)
- `strict?: boolean` - Enforce schema-atom consistency (default: true)
- `timeoutMs?: number` - Timeout for persisted atoms (default: 3000ms)
- `logger?: HydrationLogger` - Custom logger

**Blob Discovery Order:**
1. Explicit blob in options (highest priority)
2. `window.__HYDRATION_BLOB__` global variable
3. `hydrate` URL query parameter

```typescript
const result = await bootstrapHydration(registry, {
  strict: false,    // Allow partial hydration
  timeoutMs: 5000,  // Wait longer for persisted atoms
  logger: customLogger
});
```

### `hydrateFromEncodedBlob(blob: string, registry: HydrationRegistry, options?: HydrateOptions): Promise<HydrationResult>`

Lower-level function for hydrating from a specific blob.

```typescript
const result = await hydrateFromEncodedBlob(blob, registry, {
  strict: true,
  logger: console
});

if (result.overallSuccess) {
  console.log('All sections hydrated successfully');
} else {
  // Check individual section results
  Object.entries(result.sections).forEach(([section, result]) => {
    if (!result.success) {
      console.error(`Section ${section} failed:`, result.error);
    }
  });
}
```

### `waitForPersistedAtomsFromRegistry(registry: HydrationRegistry, options?: WaitOptions): Promise<void>`

Waits for all persisted atoms to finish loading from storage.

```typescript
await waitForPersistedAtomsFromRegistry(registry, {
  timeoutMs: 10000  // Wait up to 10 seconds
});
```

## Documentation

- **[Technical Specification](./docs/spec.md)** - Detailed architecture, algorithms, and implementation details
- **[Example Application](./example/)** - Full working example with React, Vite, and Playwright tests

## Advanced Usage

### Custom Logger

```typescript
const customLogger: HydrationLogger = {
  info: (message, ...args) => logger.debug(message, ...args),
  warn: (message, ...args) => logger.warning(message, ...args),
  error: (message, ...args) => logger.error(message, ...args)
};

await bootstrapHydration(registry, { logger: customLogger });
```

### Strict vs Non-Strict Mode

```typescript
// Strict mode (default): Every schema field must have an atom and vice versa
const strictRegistry: HydrationRegistry = {
  user: {
    schema: z.object({ id: z.number(), name: z.string() }),
    atoms: { id: idAtom, name: nameAtom }  // Must match schema exactly
  }
};

// Non-strict mode: Allows partial hydration
await bootstrapHydration(registry, { strict: false });
// - Missing atoms produce warnings but don't fail
// - Extra atoms are ignored
// - Useful during development or migration
```

### Testing with Different States

```typescript
// Create a test helper
function createTestScenario(overrides: Partial<TestState> = {}) {
  const defaultState = {
    user: { id: 1, name: 'Test User', email: 'test@example.com', role: 'user' },
    settings: { theme: 'light', locale: 'en' }
  };
  
  const state = { ...defaultState, ...overrides };
  return createHydrationBlob(state);
}

// Use in tests
test('dark mode behavior', async ({ page }) => {
  const blob = createTestScenario({
    settings: { theme: 'dark', locale: 'en' }
  });
  
  await page.goto(`/app?hydrate=${blob}`);
  // Test dark mode specific behavior
});
```

### Debugging Hydration

The hydration result is exposed on `window.__HYDRATION_RESULT__` for debugging:

```typescript
// In your E2E test
const result = await page.evaluate(() => window.__HYDRATION_RESULT__);
console.log('Hydration result:', result);

// Check specific sections
if (!result.sections.user.success) {
  console.error('User hydration failed:', result.sections.user.error);
}
```

## TypeScript Usage

The library is fully typed. Define your state types for better IDE support:

```typescript
// types.ts
import { z } from 'zod';

export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['admin', 'user'])
});

export type User = z.infer<typeof userSchema>;

// hydration-registry.ts
import type { HydrationRegistry, HydrationRegistryEntry } from '@tinyteamco/hydration-test-utils';
import type { User } from './types';

// Type-safe registry entry
const userEntry: HydrationRegistryEntry<User> = {
  schema: userSchema,
  atoms: {
    id: userIdAtom,
    name: userNameAtom,
    email: userEmailAtom,
    role: userRoleAtom
  }
};
```

## Best Practices

1. **Keep test state minimal**: Only include the data necessary for your test scenario
2. **Use strict mode in production**: Ensures your registry stays in sync with your schemas
3. **Handle errors gracefully**: Check hydration results and have fallback behavior
4. **Organize by feature**: Group related atoms and schemas in the same registry section
5. **Document persisted atoms**: Clearly mark which atoms are backed by storage
6. **Version your schemas**: Consider schema evolution for long-running test suites

### Testing Patterns

**Create reusable test scenarios:**
```typescript
// test-scenarios.ts
export const testScenarios = {
  adminUser: {
    user: { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' }
  },
  newUser: {
    user: { id: 2, name: 'New User', email: 'new@test.com', role: 'user' },
    settings: { showOnboarding: true }
  },
  darkMode: {
    settings: { theme: 'dark', fontSize: 16 }
  }
};

// In your tests
test('admin features', async ({ page }) => {
  await hydratePage(page, { data: testScenarios.adminUser });
  // Test admin-specific functionality
});
```

## Troubleshooting

### "Schema fields missing atom" error
- In strict mode, every field in your schema must have a corresponding atom
- Either add the missing atom or switch to non-strict mode

### "Timeout waiting for persisted atoms"
- Increase the timeout: `bootstrapHydration(registry, { timeoutMs: 10000 })`
- Check that your persisted atoms are actually completing their async operations
- Verify your storage implementation is working correctly

### Hydration not working
- Check the browser console for the hydration result
- Verify the blob is being passed correctly (check Network tab or window object)
- Ensure bootstrapHydration is called before your app reads the atoms

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT