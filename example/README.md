# Hydration Test Utils Example

This example demonstrates how to use the hydration-test-utils library with a React + Jotai application.

## Running the Example

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to http://localhost:5173

## Testing Hydration

### Option 1: Using Window Blob
1. Use the `index-with-hydration.html` file which includes a pre-defined hydration blob
2. Or open the dev tools console and set a hydration blob before the page loads:
   ```javascript
   window.__HYDRATION_BLOB__ = 'your-base64-encoded-data';
   ```

### Option 2: Using URL Parameter
Add a `hydrate` query parameter to the URL:
```
http://localhost:5173/?hydrate=eyJ1c2VyUHJvZmlsZSI6eyJuYW1lIjoiSmFuZSBTbWl0aCIsImVtYWlsIjoiamFuZUBleGFtcGxlLmNvbSIsImFnZSI6MjV9fQ
```

This example blob contains:
```json
{
  "userProfile": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "age": 25
  }
}
```

## How It Works

1. **Bootstrap**: Before React renders, `bootstrapHydration` is called
2. **Discovery**: The bootstrap function looks for hydration data in:
   - `window.__HYDRATION_BLOB__`
   - URL parameter `hydrate`
3. **Wait**: It waits for any persisted atoms to load from storage
4. **Hydrate**: The data is validated and applied to the atoms
5. **Result**: The result is exposed on `window.__HYDRATION_RESULT__`

## Key Files

- `src/hydration-setup.ts` - Defines the hydration registry
- `src/main.tsx` - Bootstraps hydration before React renders
- `src/App.tsx` - Displays the hydrated state and status
- `src/atoms.ts` - Defines the Jotai atoms

## Creating Test Blobs

You can create hydration blobs using the library's API:

```javascript
import { createHydrationBlob } from '@your-org/hydration-test-utils';

const blob = await createHydrationBlob({
  userProfile: {
    name: "Test User",
    email: "test@example.com",
    age: 28
  },
  settings: {
    theme: "light",
    notificationsEnabled: false
  }
});
console.log('Hydration blob:', blob);
```