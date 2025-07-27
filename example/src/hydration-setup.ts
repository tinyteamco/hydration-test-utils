import type { HydrationRegistry } from '@tinyteamco/hydration-test-utils'
import { z } from 'zod'
import {
  userNameAtom,
  userEmailAtom,
  userAgeAtom,
  themeAtom,
  notificationsEnabledAtom
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
  }
}