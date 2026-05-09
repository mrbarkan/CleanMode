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
      enterCleaningMode:     () => Promise<EnterCleaningModeResult>;
      exitCleaningMode:      () => void;
      checkPermissions:      () => Promise<Permissions>;
      promptAccessibility:   () => Promise<boolean>;
      promptInputMonitoring: () => Promise<boolean>;
    };
  }
}
