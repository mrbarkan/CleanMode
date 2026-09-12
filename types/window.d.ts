export {};

export type Permissions = {
  accessibility: boolean;
  inputMonitoring: boolean;
};

export type EnterCleaningModeResult =
  | { ok: true }
  | { ok: false; error: 'permissions-denied'; permissions: Permissions }
  | { ok: false; error: 'tap-failed' };

declare global {
  interface Window {
    electron?: {
      enterCleaningMode:     (opts: { tips: string; lang: string; theme: string }) => Promise<EnterCleaningModeResult>;
      exitCleaningMode:      (keystrokes: number) => void;
      onCleaningEnded:       (cb: (keystrokes: number) => void) => () => void;
      checkPermissions:      () => Promise<Permissions>;
      promptAccessibility:   () => Promise<boolean>;
      promptInputMonitoring: () => Promise<boolean>;
      onNativeInput:         (cb: (kind: 'combo' | 'key') => void) => () => void;
    };
  }
}
