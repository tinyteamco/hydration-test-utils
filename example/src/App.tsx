import { useAtom } from 'jotai'
import {
  userNameAtom,
  userEmailAtom,
  userAgeAtom,
  themeAtom,
  notificationsEnabledAtom,
  hydrationStatusAtom,
  appStateAtom
} from './atoms'
import './App.css'

export default function App() {
  const [userName, setUserName] = useAtom(userNameAtom)
  const [userEmail, setUserEmail] = useAtom(userEmailAtom)
  const [userAge, setUserAge] = useAtom(userAgeAtom)
  const [theme, setTheme] = useAtom(themeAtom)
  const [notificationsEnabled, setNotificationsEnabled] = useAtom(notificationsEnabledAtom)
  const [hydrationStatus] = useAtom(hydrationStatusAtom)
  const [appState, setAppState] = useAtom(appStateAtom)

  return (
    <div className={`app ${theme}`}>
      <h1>Hydration Test Utils Example</h1>
      
      {hydrationStatus && (
        <div className={`hydration-status ${hydrationStatus.success ? 'success' : 'error'}`}>
          <h3>Hydration Status</h3>
          {hydrationStatus.success ? (
            <p>✓ All data hydrated successfully</p>
          ) : (
            <>
              <p>✗ Hydration errors:</p>
              <ul>
                {hydrationStatus.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <section className="user-profile">
        <h2>User Profile (Persisted)</h2>
        <div className="form-group">
          <label htmlFor="userName">Name:</label>
          <input
            id="userName"
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            data-testid="user-name-input"
          />
          <span data-testid="user-name-value">{userName}</span>
        </div>
        
        <div className="form-group">
          <label htmlFor="userEmail">Email:</label>
          <input
            id="userEmail"
            type="email"
            value={userEmail}
            onChange={(e) => setUserEmail(e.target.value)}
            data-testid="user-email-input"
          />
          <span data-testid="user-email-value">{userEmail}</span>
        </div>
        
        <div className="form-group">
          <label htmlFor="userAge">Age:</label>
          <input
            id="userAge"
            type="number"
            value={userAge}
            onChange={(e) => setUserAge(parseInt(e.target.value) || 0)}
            data-testid="user-age-input"
          />
          <span data-testid="user-age-value">{userAge}</span>
        </div>
      </section>

      <section className="settings">
        <h2>Settings (Ephemeral)</h2>
        <div className="form-group">
          <label htmlFor="theme">Theme:</label>
          <select
            id="theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
            data-testid="theme-select"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <span data-testid="theme-value">{theme}</span>
        </div>
        
        <div className="form-group">
          <label htmlFor="notifications">
            <input
              id="notifications"
              type="checkbox"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
              data-testid="notifications-checkbox"
            />
            Enable Notifications
          </label>
          <span data-testid="notifications-value">
            {notificationsEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </section>

      <section className="app-state">
        <h2>App State (Object-Storing Atom)</h2>
        <div className="form-group">
          <label>Current Page:</label>
          <select
            value={appState.navigation.currentPage}
            onChange={(e) => setAppState({
              ...appState,
              navigation: { ...appState.navigation, currentPage: e.target.value }
            })}
            data-testid="current-page-select"
          >
            <option value="home">Home</option>
            <option value="profile">Profile</option>
            <option value="settings">Settings</option>
          </select>
          <span data-testid="current-page-value">{appState.navigation.currentPage}</span>
        </div>
        
        <div className="form-group">
          <label>Page History:</label>
          <span data-testid="page-history">{appState.navigation.history.join(' → ') || '(empty)'}</span>
        </div>

        <div className="form-group">
          <h4>Features:</h4>
          <label>
            <input
              type="checkbox"
              checked={appState.features.darkModeEnabled}
              onChange={(e) => setAppState({
                ...appState,
                features: { ...appState.features, darkModeEnabled: e.target.checked }
              })}
              data-testid="dark-mode-checkbox"
            />
            Dark Mode
          </label>
          <span data-testid="dark-mode-value">{appState.features.darkModeEnabled ? 'On' : 'Off'}</span>
          
          <label>
            <input
              type="checkbox"
              checked={appState.features.betaFeaturesEnabled}
              onChange={(e) => setAppState({
                ...appState,
                features: { ...appState.features, betaFeaturesEnabled: e.target.checked }
              })}
              data-testid="beta-features-checkbox"
            />
            Beta Features
          </label>
          <span data-testid="beta-features-value">{appState.features.betaFeaturesEnabled ? 'On' : 'Off'}</span>
          
          <label>
            <input
              type="checkbox"
              checked={appState.features.analyticsEnabled}
              onChange={(e) => setAppState({
                ...appState,
                features: { ...appState.features, analyticsEnabled: e.target.checked }
              })}
              data-testid="analytics-checkbox"
            />
            Analytics
          </label>
          <span data-testid="analytics-value">{appState.features.analyticsEnabled ? 'On' : 'Off'}</span>
        </div>
      </section>

      <section className="current-state">
        <h3>Current State Summary</h3>
        <pre data-testid="state-summary">
{JSON.stringify({
  userProfile: {
    name: userName,
    email: userEmail,
    age: userAge
  },
  settings: {
    theme,
    notificationsEnabled
  },
  appState: appState
}, null, 2)}
        </pre>
      </section>

      {/* Debug section to show window.__HYDRATION_RESULT__ */}
      {typeof window !== 'undefined' && (window as any).__HYDRATION_RESULT__ && (
        <section className="hydration-result">
          <h3>Hydration Result (window.__HYDRATION_RESULT__)</h3>
          <pre data-testid="hydration-result">
{JSON.stringify((window as any).__HYDRATION_RESULT__, null, 2)}
          </pre>
        </section>
      )}
    </div>
  )
}