import React from 'react'
import ReactDOM from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { bootstrapHydration } from '@tinyteamco/hydration-test-utils'
import App from './App'
import { hydrationRegistry } from './hydration-setup'
import { hydrationStatusAtom } from './atoms'

// Bootstrap hydration before React initialization
async function initializeApp() {
  const store = createStore()
  
  try {
    // Bootstrap hydration - this will:
    // 1. Look for __HYDRATION_BLOB__ on window or 'hydrate' URL param
    // 2. Wait for persisted atoms to load
    // 3. Hydrate the registry with blob data
    // 4. Expose result on window.__HYDRATION_RESULT__
    const result = await bootstrapHydration(hydrationRegistry, {
      // Only override logger if one is provided for testing
      logger: (window as any).__HYDRATION_LOGGER__,
      _testStore: store as any
    })
    
    if (result) {
      const errors: string[] = []
      
      // Collect validation errors
      Object.entries(result.sections).forEach(([section, sectionResult]) => {
        if (!sectionResult.success && sectionResult.error) {
          errors.push(`${section}: ${sectionResult.error}`)
        }
        if (sectionResult.warnings) {
          sectionResult.warnings.forEach(warning => {
            errors.push(`${section} (warning): ${warning}`)
          })
        }
      })
      
      store.set(hydrationStatusAtom, {
        success: result.overallSuccess,
        errors
      })
    }
  } catch (error) {
    console.error('Failed to bootstrap hydration:', error)
    store.set(hydrationStatusAtom, {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error']
    })
  }

  // Render the app after hydration is complete
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>
  )
}

// Initialize the app
initializeApp()