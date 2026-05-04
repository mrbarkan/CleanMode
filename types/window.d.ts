export {};

export type EnterCleaningModeResult =
  | { ok: true }
  | { ok: false; error: 'accessibility-denied' | 'tap-failed' };

declare global {
  interface Window {
    electron?: {
      enterCleaningMode:   () => Promise<EnterCleaningModeResult>;
      exitCleaningMode:    () => void;
      checkAccessibility:  () => Promise<boolean>;
      promptAccessibility: () => Promise<boolean>;
    };
  }
}
