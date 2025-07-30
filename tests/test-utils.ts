import { atom, type Atom, type WritableAtom } from 'jotai';

// Mock atom store to track set operations
export class MockAtomStore {
  private values = new Map<Atom<any>, any>();
  private setOperations: Array<{ atom: Atom<any>; value: any }> = [];

  get = (anAtom: Atom<any>) => {
    return this.values.get(anAtom);
  };

  set = (anAtom: WritableAtom<any, any[], any>, value: any) => {
    this.values.set(anAtom, value);
    this.setOperations.push({ atom: anAtom, value });
  };

  getSetOperations() {
    return this.setOperations;
  }

  clear() {
    this.values.clear();
    this.setOperations = [];
  }
}

// Create a mock writable atom with tracking
export function createMockAtom<T>(initialValue: T): WritableAtom<T, [T], void> {
  return atom(initialValue);
}

// Helper to create a set of atoms for testing
export function createTestAtoms() {
  return {
    nameAtom: createMockAtom<string>(''),
    ageAtom: createMockAtom<number>(0),
    activeAtom: createMockAtom<boolean>(false),
    themeAtom: createMockAtom<string>('light'),
    notificationsAtom: createMockAtom<boolean>(true),
    localeAtom: createMockAtom<string>('en'),
    countAtom: createMockAtom<number>(0),
    itemsAtom: createMockAtom<string[]>([]),
    configAtom: createMockAtom<{ debug: boolean; verbose: boolean }>({ debug: false, verbose: false }),
    fontSizeAtom: createMockAtom<number>(14),
    idAtom: createMockAtom<string>(''),
    emailAtom: createMockAtom<string>(''),
    preferencesAtom: createMockAtom<{ notifications: boolean }>({ notifications: false }),
    autoSaveAtom: createMockAtom<boolean>(true),
    // Object-storing atoms
    relationshipStateAtom: createMockAtom<{
      relationships: Array<{ id: string; name: string; type: 'friend' | 'family' | 'colleague' }>;
      currentId: string | null;
    }>({
      relationships: [],
      currentId: null,
    }),
    userProfileAtom: createMockAtom<{
      personal: { firstName: string; lastName: string; email: string };
      preferences: { theme: 'light' | 'dark' | 'auto'; language: string; notifications: boolean };
      metadata: { createdAt: string; lastLoginAt: string | null };
    }>({
      personal: { firstName: '', lastName: '', email: '' },
      preferences: { theme: 'light', language: 'en', notifications: false },
      metadata: { createdAt: '', lastLoginAt: null },
    }),
    appStateAtom: createMockAtom<{
      settings: { theme: string; fontSize: number };
      flags: { betaFeatures: boolean; analytics: boolean };
    }>({
      settings: { theme: 'light', fontSize: 14 },
      flags: { betaFeatures: false, analytics: true },
    }),
  };
}

// Create a mock logger that captures calls
export class MockLogger {
  public infoCalls: unknown[][] = [];
  public warnCalls: unknown[][] = [];
  public errorCalls: unknown[][] = [];

  info = (...args: unknown[]) => {
    this.infoCalls.push(args);
  };

  warn = (...args: unknown[]) => {
    this.warnCalls.push(args);
  };

  error = (...args: unknown[]) => {
    this.errorCalls.push(args);
  };

  clear() {
    this.infoCalls = [];
    this.warnCalls = [];
    this.errorCalls = [];
  }
}