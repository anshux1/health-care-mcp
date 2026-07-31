/**
 * ExternalApiHealthCheck — Pings all 6 external APIs to monitor upstream reachability (BUILD_PLAN.md §9.4).
 */
import { HealthCheck, HealthCheckInterface, HealthCheckResult, Injectable } from '@nitrostack/core';
import { env } from '../config/env.js';

@HealthCheck({
  name: 'upstreams',
  description: 'Monitors reachability of external clinical data APIs',
  interval: 60,
})
@Injectable()
export class ExternalApiHealthCheck implements HealthCheckInterface {
  async check(): Promise<HealthCheckResult> {
    const apis = [
      { name: 'rxnorm', url: `${env.RXNORM_BASE_URL}/rxcui.json?name=aspirin` },
      { name: 'openfda', url: `${env.OPENFDA_BASE_URL}/drug/label.json?limit=1` },
      { name: 'pubmed', url: `${env.NCBI_BASE_URL}/esearch.fcgi?db=pubmed&term=test&retmode=json&retmax=1` },
      { name: 'clinicaltrials', url: `${env.TRIALS_BASE_URL}/studies?pageSize=1` },
      { name: 'clinicaltables', url: `${env.CLINTABLES_BASE_URL}/icd10cm/v3/search?terms=test&maxList=1` },
      { name: 'fhir', url: `${env.FHIR_BASE_URL}/metadata` },
    ];

    const results = await Promise.all(
      apis.map(async (api) => {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(api.url, { signal: controller.signal });
          clearTimeout(timer);
          return {
            name: api.name,
            up: res.ok || res.status === 400 || res.status === 404,
            latency_ms: Date.now() - start,
          };
        } catch {
          return {
            name: api.name,
            up: false,
            latency_ms: Date.now() - start,
          };
        }
      }),
    );

    const downCount = results.filter((r) => !r.up).length;
    let status: 'up' | 'degraded' | 'down' = 'up';

    if (downCount >= 3) {
      status = 'down';
    } else if (downCount > 0) {
      status = 'degraded';
    }

    return {
      status,
      message: `Upstreams health: ${apis.length - downCount}/${apis.length} online`,
      details: {
        up_count: apis.length - downCount,
        down_count: downCount,
        upstreams: results,
      },
    };
  }
}
