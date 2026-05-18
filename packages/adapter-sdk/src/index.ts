export type AdapterCategory = 'ide' | 'mcp' | 'saas';

export type MemoryRole = 'user' | 'assistant' | 'system' | 'tool';

export interface MemoryRecord {
  id: string;
  source: string;
  sessionId?: string;
  timestamp: Date;
  role?: MemoryRole;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface DetectResult {
  present: boolean;
  storageRoot?: string;
  notes?: string;
}

export interface ScanOptions {
  since?: Date;
  limit?: number;
  signal?: AbortSignal;
  /** Free-text search hint (Cat C / SaaS adapters may use this for remote pre-filtering). */
  query?: string;
}

/**
 * Summary statistics returned by an adapter's scan pass.
 * Adapters may emit this as a final entry or via a side-channel;
 * it is NOT part of the scan() AsyncIterable contract.
 */
export interface ScanResult {
  recordCount: number;
  corruptLines: number;
  filesScanned: number;
  filesSkipped: number;
  durationMs: number;
}

export interface IBaseAdapter {
  readonly id: string;
  readonly category: AdapterCategory;
  readonly displayName: string;
  /**
   * Semver of this adapter implementation (e.g. "0.1.0").
   * Optional; defaults to "0.0.0" when not supplied.
   * Used by `omem adapter list` to display the installed version.
   */
  readonly version?: string;

  detect(): Promise<DetectResult>;
  scan(opts?: ScanOptions): AsyncIterable<MemoryRecord>;
}

export interface IIdeAdapter extends IBaseAdapter {
  readonly category: 'ide';
  storageRoot(): string;
}

export interface IMcpAdapter extends IBaseAdapter {
  readonly category: 'mcp';
  storageRoot(): string;
}

export interface ISaasAdapter extends IBaseAdapter {
  readonly category: 'saas';
  /**
   * @deprecated Use `scan(opts)` with `opts.query` instead.
   * `fetchRecords` will be removed in adapter-sdk@2.0.0.
   */
  fetchRecords?(query?: string): AsyncIterable<MemoryRecord>;
}

export type AnyAdapter = IIdeAdapter | IMcpAdapter | ISaasAdapter;

export * from './write';

export class AdapterError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AdapterError';
  }
}

export class AdapterDetectError extends AdapterError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ADAPTER_DETECT_FAILED', message, details);
    this.name = 'AdapterDetectError';
  }
}

export class CorruptRecordError extends AdapterError {
  constructor(
    message: string,
    public readonly file: string,
    public readonly line: number,
  ) {
    super('CORRUPT_RECORD', message, { file, line });
    this.name = 'CorruptRecordError';
  }
}
