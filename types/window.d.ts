export {};

declare global {
  interface Window {
    electron?: {
      setCleaningMode: (isActive: boolean) => void;
    };
  }
}