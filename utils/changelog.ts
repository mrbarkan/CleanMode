export const appVersion = "1.0.0";

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2024-05-23",
    changes: [
      "Official Launch Release",
      "Added persistence for Theme and Device Model",
      "Implemented Changelog system"
    ]
  },
  {
    version: "0.9.0",
    date: "2024-05-22",
    changes: [
      "Added Light Mode",
      "Redesigned UI with Sidebar layout",
      "Improved Gemini prompts for non-device inputs"
    ]
  },
  {
    version: "0.8.0",
    date: "2024-05-21",
    changes: [
      "Added Internationalization (7 languages)",
      "Added 'About' modal",
      "Added smart cleaning tips generation"
    ]
  },
  {
    version: "0.1.0",
    date: "2024-05-20",
    changes: [
      "Initial Beta Release",
      "Core Cleaning Mode (Input Blocking)",
      "Double-Cmd x3 Unlock Mechanism"
    ]
  }
];