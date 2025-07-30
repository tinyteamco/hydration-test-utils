import type { HydrationRegistry } from '@tinyteamco/hydration-test-utils'
import { z } from 'zod'
import {
  userNameAtom,
  userEmailAtom,
  userAgeAtom,
  themeAtom,
  notificationsEnabledAtom,
  appStateAtom
} from './atoms'

// Define schemas for our data sections
const userProfileSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().min(0).max(120)
})

const settingsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  notificationsEnabled: z.boolean()
})

// Schema for object-storing atom
const appStateSchema = z.object({
  navigation: z.object({
    currentPage: z.string(),
    history: z.array(z.string())
  }),
  features: z.object({
    darkModeEnabled: z.boolean(),
    betaFeaturesEnabled: z.boolean(),
    analyticsEnabled: z.boolean()
  })
})

// Define static hydration registry
export const hydrationRegistry: HydrationRegistry = {
  userProfile: {
    schema: userProfileSchema,
    atoms: {
      name: userNameAtom,
      email: userEmailAtom,
      age: userAgeAtom
    },
    persisted: ['name', 'email', 'age'] // All user profile atoms are persisted
  },
  settings: {
    schema: settingsSchema,
    atoms: {
      theme: themeAtom,
      notificationsEnabled: notificationsEnabledAtom
    },
    persisted: [] // Settings atoms are not persisted
  },
  // Object-storing atom pattern: single atom stores entire object
  appState: {
    schema: appStateSchema,
    atoms: {
      appState: appStateAtom // Single atom matches section name
    },
    persisted: ['appState'] // The object-storing atom is persisted
  }
}