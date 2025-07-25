import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// User profile atoms (persisted)
export const userNameAtom = atomWithStorage('userName', '')
export const userEmailAtom = atomWithStorage('userEmail', '')
export const userAgeAtom = atomWithStorage('userAge', 0)

// Settings atoms (ephemeral)
export const themeAtom = atom<'light' | 'dark'>('light')
export const notificationsEnabledAtom = atom(true)

// Hydration status atom
export const hydrationStatusAtom = atom<{
  success: boolean
  errors: string[]
} | null>(null)