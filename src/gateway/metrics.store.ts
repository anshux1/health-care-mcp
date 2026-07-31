/**
 * MetricsStore — In-memory server performance & telemetry store (BUILD_PLAN.md §13-S8).
 * Tracks request counts, error rates, average latency, and memory usage.
 */
import { Injectable } from '@nitrostack/core';

export interface TelemetryMetrics {
  total_requests: number;
  total_errors: number;
  avg_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  uptime_seconds: number;
  requests_by_tool: Record<string, number>;
  errors_by_tool: Record<string, number>;
  memory_usage: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
  };
}

@Injectable()
export class MetricsStore {
  private totalRequests = 0;
  private totalErrors = 0;
  private latencySum = 0;
  private minLatency = Infinity;
  private maxLatency = 0;
  private requestsByTool: Record<string, number> = {};
  private errorsByTool: Record<string, number> = {};

  recordRequest(toolName: string, latencyMs: number, isError: boolean = false) {
    this.totalRequests++;
    this.latencySum += latencyMs;

    if (latencyMs < this.minLatency) this.minLatency = latencyMs;
    if (latencyMs > this.maxLatency) this.maxLatency = latencyMs;

    this.requestsByTool[toolName] = (this.requestsByTool[toolName] ?? 0) + 1;

    if (isError) {
      this.totalErrors++;
      this.errorsByTool[toolName] = (this.errorsByTool[toolName] ?? 0) + 1;
    }
  }

  getMetrics(): TelemetryMetrics {
    const mem = process.memoryUsage();
    return {
      total_requests: this.totalRequests,
      total_errors: this.totalErrors,
      avg_latency_ms: this.totalRequests > 0 ? Math.round(this.latencySum / this.totalRequests) : 0,
      min_latency_ms: this.minLatency === Infinity ? 0 : this.minLatency,
      max_latency_ms: this.maxLatency,
      uptime_seconds: Math.round(process.uptime()),
      requests_by_tool: { ...this.requestsByTool },
      errors_by_tool: { ...this.errorsByTool },
      memory_usage: {
        rss_mb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
        heap_used_mb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
        heap_total_mb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      },
    };
  }
}
