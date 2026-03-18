import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type TelemetryTags = Record<string, string | number | boolean | null | undefined>;

@Injectable()
export class CacheTelemetryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheTelemetry');
  private readonly enabled: boolean;
  private readonly flushIntervalMs: number;
  private readonly counters = new Map<string, number>();
  private windowStartedAtMs = Date.now();
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {
    // Telemetry for cache is disabled by default; keep implementation for potential future use.
    void this.config;
    this.enabled = false;
    this.flushIntervalMs = 60000;
  }

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    this.windowStartedAtMs = Date.now();
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    this.flushTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    this.flush();
  }

  increment(metric: string, tags?: TelemetryTags, value = 1): void {
    if (!this.enabled) {
      return;
    }

    const normalizedMetric = this.normalizeToken(metric);
    if (!normalizedMetric) {
      return;
    }

    const incrementValue = Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
    const counterKey = this.buildCounterKey(normalizedMetric, tags);
    const current = this.counters.get(counterKey) ?? 0;
    this.counters.set(counterKey, current + incrementValue);
  }

  flush(): void {
    if (!this.enabled) {
      return;
    }

    const windowEndedAtMs = Date.now();
    const windowMs = Math.max(0, windowEndedAtMs - this.windowStartedAtMs);
    const entries = Array.from(this.counters.entries()).sort(([left], [right]) => left.localeCompare(right));

    if (entries.length < 1) {
      this.windowStartedAtMs = windowEndedAtMs;
      return;
    }

    const counters = entries.reduce<Record<string, number>>((acc, [key, count]) => {
      acc[key] = count;
      return acc;
    }, {});

    this.logger.log(JSON.stringify({
      event: 'cache_telemetry_rollup',
      window_ms: windowMs,
      window_started_at: new Date(this.windowStartedAtMs).toISOString(),
      window_ended_at: new Date(windowEndedAtMs).toISOString(),
      counters,
    }));

    this.counters.clear();
    this.windowStartedAtMs = windowEndedAtMs;
  }

  private buildCounterKey(metric: string, tags?: TelemetryTags): string {
    if (!tags || typeof tags !== 'object') {
      return metric;
    }

    const pairs = Object.entries(tags)
      .map(([key, value]) => {
        const normalizedKey = this.normalizeToken(key);
        if (!normalizedKey) {
          return null;
        }

        const normalizedValue = this.normalizeToken(value);
        if (!normalizedValue) {
          return null;
        }

        return `${normalizedKey}=${normalizedValue}`;
      })
      .filter((item): item is string => !!item)
      .sort((left, right) => left.localeCompare(right));

    if (pairs.length < 1) {
      return metric;
    }

    return `${metric}|${pairs.join('|')}`;
  }

  private normalizeToken(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return null;
    }

    const raw = String(value).trim().toLowerCase();
    if (raw.length < 1) {
      return null;
    }

    const normalized = raw.replace(/[^a-z0-9._:-]+/g, '_');
    return normalized.length > 0 ? normalized : null;
  }
}
