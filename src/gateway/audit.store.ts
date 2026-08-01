/**
 * AuditStore — JSONL log writer and in-memory ring buffer for audit entries (BUILD_PLAN.md §5.3).
 * Ring buffer keeps last 50 entries for admin inspection via vitalis://audit/recent.
 */
import { Injectable } from '@nitrostack/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { env } from '../config/env.js';

export interface AuditEntry {
  ts: string;
  request_id: string;
  tool: string;
  subject: string;
  scopes: string[];
  input_summary: Record<string, any>;
  input_hash: string;
  emergency_detected: boolean;
  urgency_tier: string;
  cache_hit: boolean;
  external_calls: Array<{ api: string; path: string; status: number; latency_ms: number }>;
  latency_ms: number;
  status: 'ok' | 'error';
  error_code?: string | null;
}

@Injectable()
export class AuditStore {
  private readonly ringBuffer: AuditEntry[] = [];
  private readonly maxRingSize = 50;
  private readonly maxPersistentLines = 5_000;
  private readonly logPath: string;

  constructor() {
    this.logPath = path.resolve(process.cwd(), env.AUDIT_LOG_PATH ?? 'logs/audit.jsonl');
    this.ensureLogDir();
    this.loadRecentEntries();
  }

  private ensureLogDir() {
    try {
      const dir = path.dirname(this.logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch {
      // Ignore directory creation errors in restricted envs
    }
  }

  addEntry(entry: AuditEntry) {
    // 1. Append to ring buffer
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > this.maxRingSize) {
      this.ringBuffer.shift();
    }

    // 2. Append JSONL to disk
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logPath, line, 'utf-8');
      this.trimPersistentLog();
    } catch {
      // Audit failures must not break clinical tool execution. The in-memory
      // ring remains available even when persistent storage is unavailable.
    }
  }

  private loadRecentEntries(): void {
    try {
      if (!fs.existsSync(this.logPath)) return;
      const lines = fs
        .readFileSync(this.logPath, 'utf-8')
        .split('\n')
        .filter(Boolean)
        .slice(-this.maxRingSize);
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as AuditEntry;
          this.ringBuffer.push(entry);
        } catch {
          // Ignore malformed historical lines and continue loading newer entries.
        }
      }
    } catch {
      // Continue with an empty in-memory ring when the log cannot be read.
    }
  }

  private trimPersistentLog(): void {
    try {
      const lines = fs.readFileSync(this.logPath, 'utf-8').split('\n').filter(Boolean);
      if (lines.length > this.maxPersistentLines) {
        fs.writeFileSync(
          this.logPath,
          `${lines.slice(-this.maxPersistentLines).join('\n')}\n`,
          'utf-8',
        );
      }
    } catch {
      // Persistence is best effort; do not fail the request.
    }
  }

  getRecentEntries(): AuditEntry[] {
    return [...this.ringBuffer].reverse();
  }
}
