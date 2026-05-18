import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveDefaultStorageRoot(): string {
  if (process.platform === 'win32') {
    return join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'opencode');
  }
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'opencode');
}
