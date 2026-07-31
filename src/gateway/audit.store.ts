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
  private readonly logPath: string;

  constructor() {
    this.logPath = path.resolve(process.cwd(), env.AUDIT_LOG_PATH ?? 'logs/audit.jsonl');
    this.ensureLogDir();
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
    } catch {
      // Ignore file append errors gracefully
    }
  }

  getRecentEntries(): AuditEntry[] {
    return [...this.ringBuffer].reverse();
  }
}
