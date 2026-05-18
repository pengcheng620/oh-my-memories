import { homedir } from 'node:os';

// Aider stores .aider.chat.history.md in each project directory where it runs.
// Unlike global-storage adapters, we scan from the user's home directory to
// find all project history files. The default scan root is $HOME.
export function resolveDefaultScanRoot(): string {
  return homedir();
}
