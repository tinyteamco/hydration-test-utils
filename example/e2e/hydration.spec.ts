import { test, expect } from '@playwright/test';
import { createHydrationBlob } from '@tinyteamco/hydration-test-utils';
import {
  hydratePage,
  getHydrationResult,
  preparePageForHydration,
} from '@tinyteamco/hydration-test-utils/playwright';

test.describe('Hydration Test Utils E2E', () => {
  test('should inject valid data for all sections', async ({ page }) => {
    const hydrationData = {
      userProfile: {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      },
      settings: {
        theme: 'dark',
        notificationsEnabled: false,
      },
    };

    const result = await hydratePage(page, { data: hydrationData });

    expect(result.overallSuccess).toBe(true);
    expect(result.sections.userProfile.success).toBe(true);
    expect(result.sections.settings.success).toBe(true);

    // Also verify the UI reflects the changes
    await expect(page.getByTestId('user-name-value')).toHaveText('John Doe');
    await expect(page.getByTestId('theme-value')).toHaveText('dark');
    await expect(page.locator('.app')).toHaveClass(/dark/);
  });

  test('should show validation errors for invalid data', async ({ page }) => {
    const hydrationData = {
      userProfile: {
        name: '', // Empty name
        email: 'invalid-email',
        age: 150, // Age > 120
      },
      settings: {
        theme: 'invalid-theme' as any,
        notificationsEnabled: 'not-a-boolean' as any,
      },
    };

    // hydratePage should throw because getHydrationResult now throws on failure
    let error: any;
    try {
      await hydratePage(page, { data: hydrationData });
      // If we get here, the test should fail
      expect(true).toBe(false); // Force failure if no error thrown
    } catch (e) {
      error = e;
    }

    expect(error).toBeDefined();
    expect(error.message).toContain('Hydration failed with the following errors:');
    expect(error.message).toContain('userProfile:');
    expect(error.message).toContain('settings:');
    
    // Access the attached hydration result for detailed assertions
    const result = error.hydrationResult;
    expect(result.overallSuccess).toBe(false);
    expect(result.sections.userProfile.success).toBe(false);
    expect(result.sections.userProfile.error).toContain('Invalid');
    expect(result.sections.settings.success).toBe(false);
    expect(result.sections.settings.error).toContain('Invalid');

    // Also verify the UI reflects the error state
    await expect(page.locator('.hydration-status')).toHaveClass(/error/);
    await expect(page.locator('.hydration-status')).toContainText(
      'Hydration errors:',
    );
  });

  test('should verify persisted data survives reload', async ({ page }) => {
    const hydrationData = {
      userProfile: {
        name: 'Jane Smith',
        email: 'jane@example.com',
        age: 25,
      },
      settings: {
        theme: 'dark',
        notificationsEnabled: false,
      },
    };

    // First, hydrate the page
    await hydratePage(page, { data: hydrationData });

    // Verify data is loaded
    await expect(page.getByTestId('user-name-value')).toHaveText('Jane Smith');
    await expect(page.getByTestId('user-email-value')).toHaveText('jane@example.com');
    await expect(page.getByTestId('user-age-value')).toHaveText('25');
    await expect(page.getByTestId('theme-value')).toHaveText('dark');
    await expect(page.getByTestId('notifications-value')).toHaveText('Disabled');
    
    // Reload the page - blob should be cleared so no re-hydration occurs
    await page.reload();
    await page.waitForSelector('.app');

    // Persisted data (userProfile) should still be there
    await expect(page.getByTestId('user-name-value')).toHaveText('Jane Smith');
    await expect(page.getByTestId('user-email-value')).toHaveText('jane@example.com');
    await expect(page.getByTestId('user-age-value')).toHaveText('25');
    
    // Ephemeral data (settings) should be reset to defaults
    await expect(page.getByTestId('theme-value')).toHaveText('light'); // default
    await expect(page.getByTestId('notifications-value')).toHaveText('Enabled'); // default is true
  });

  test('should handle partial hydration', async ({ page }) => {
    const hydrationData = {
      userProfile: {
        name: 'Bob Johnson',
        email: 'bob@example.com',
        age: 40,
      },
    };

    const result = await hydratePage(page, { data: hydrationData });

    expect(result.overallSuccess).toBe(true);
    expect(result.sections.userProfile.success).toBe(true);
    // The settings section was not in the data, so it won't be in the result
    expect(result.sections.settings).toBeUndefined();

    // User profile should be hydrated
    await expect(page.getByTestId('user-name-value')).toHaveText('Bob Johnson');
    // Settings should have default values
    await expect(page.getByTestId('theme-value')).toHaveText('light');
  });

  test('should allow interaction after hydration', async ({ page }) => {
    const hydrationData = {
      userProfile: { 
        name: 'Initial Name',
        email: 'initial@example.com',
        age: 30
      },
      settings: { 
        theme: 'light',
        notificationsEnabled: true
      },
    };

    const result = await hydratePage(page, { data: hydrationData });
    expect(result.overallSuccess).toBe(true);

    // Verify initial data
    await expect(page.getByTestId('user-name-value')).toHaveText('Initial Name');

    // Interact with the form
    await page.getByTestId('user-name-input').fill('Updated Name');
    await page.getByTestId('theme-select').selectOption('dark');

    // Verify updates
    await expect(page.getByTestId('user-name-value')).toHaveText('Updated Name');
    await expect(page.getByTestId('theme-value')).toHaveText('dark');
  });

  test('should handle empty hydration data gracefully', async ({ page }) => {
    const result = await hydratePage(page, { data: {} });

    // The result is successful because no sections failed, there were just no sections to process.
    expect(result.overallSuccess).toBe(true);
    expect(Object.keys(result.sections).length).toBe(0);

    // App should load with default values
    await expect(page.getByTestId('user-name-value')).toHaveText('');
    await expect(page.getByTestId('theme-value')).toHaveText('light');
  });

  test('should hydrate from URL parameter if used manually', async ({ page }) => {
    const hydrationData = {
      userProfile: { 
        name: 'URL Param User',
        email: 'url@example.com',
        age: 40
      },
    };
    // Note: We don't use the helper here to specifically test the URL param functionality
    const blob = createHydrationBlob(hydrationData);

    await page.goto(`/?hydrate=${blob}`);

    // We can still use the result helper
    const result = await getHydrationResult(page);
    expect(result.overallSuccess).toBe(true);
    expect(result.sections.userProfile.success).toBe(true);

    await expect(page.getByTestId('user-name-value')).toHaveText(
      'URL Param User',
    );
  });

  test('should throw detailed error when hydration fails', async ({ page }) => {
    const hydrationData = {
      userProfile: {
        name: 'Test User',
        // Missing required fields: email and age
      },
      settings: {
        theme: 'light',
        // Missing required field: notificationsEnabled
      },
    };

    // Prepare the page with incomplete data
    await preparePageForHydration(page, hydrationData);
    await page.goto('/');

    // getHydrationResult should throw with detailed error info
    let error: any;
    try {
      await getHydrationResult(page);
      expect(true).toBe(false); // Should not reach here
    } catch (e) {
      error = e;
    }

    // Verify the error message contains helpful details
    expect(error).toBeDefined();
    expect(error.message).toContain('Hydration failed with the following errors:');
    expect(error.message).toContain('userProfile:');
    expect(error.message).toContain('email: Invalid input');
    expect(error.message).toContain('age: Invalid input');
    expect(error.message).toContain('settings:');
    expect(error.message).toContain('notificationsEnabled: Invalid input');

    // Verify the full result is attached
    expect(error.hydrationResult).toBeDefined();
    expect(error.hydrationResult.overallSuccess).toBe(false);
  });
});
