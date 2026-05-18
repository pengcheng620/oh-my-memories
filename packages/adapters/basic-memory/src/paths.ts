import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveDefaultStorageRoot(): string {
  return join(homedir(), 'basic-memory');
}
