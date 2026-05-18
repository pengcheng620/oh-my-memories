import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * VS Code stores data in platform-specific locations.
 * Returns the root path for both Stable and Insiders editions.
 */
export function resolveVscodeDataDirs(home?: string): string[] {
  const h = home ?? homedir();
  const platform = process.platform;
  const dirs: string[] = [];

  if (platform === 'darwin') {
    dirs.push(join(h, 'Library', 'Application Support', 'Code', 'User'));
    dirs.push(join(h, 'Library', 'Application Support', 'Code - Insiders', 'User'));
  } else if (platform === 'win32') {
    const appData = process.env.APPDATA ?? join(h, 'AppData', 'Roaming');
    dirs.push(join(appData, 'Code', 'User'));
    dirs.push(join(appData, 'Code - Insiders', 'User'));
  } else {
    dirs.push(join(h, '.config', 'Code', 'User'));
    dirs.push(join(h, '.config', 'Code - Insiders', 'User'));
  }

  return dirs;
}
