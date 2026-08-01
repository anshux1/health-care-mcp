import { describe, expect, it } from 'vitest';

const liveEnabled = process.env.LIVE_API_TESTS === 'true';
const liveIt = liveEnabled ? it : it.skip;
const ncbiEmail = process.env.NCBI_EMAIL ?? 'vitalis-test@example.com';

async function getJson(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'vitalis-mcp/1.0 (live smoke test)' },
      signal: controller.signal,
    });
    expect(response.ok, `${response.status} from ${url}`).toBe(true);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

describe('Live upstream smoke tests', () => {
  liveIt('responds with the expected shape from all required upstreams', async () => {
    const rxnorm = await getJson(
      'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=metformin',
    );
    expect(rxnorm.idGroup?.rxnormId?.length).toBeGreaterThan(0);

    const openFda = await getJson(
      'https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22warfarin%22&limit=1',
    );
    expect(openFda.results?.[0]?.openfda).toBeDefined();

    const pubmed = await getJson(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=diabetes&retmode=json&retmax=1&tool=vitalis&email=${encodeURIComponent(ncbiEmail)}`,
    );
    expect(Number(pubmed.esearchresult?.count)).toBeGreaterThan(0);

    const trials = await getJson(
      'https://clinicaltrials.gov/api/v2/studies?query.cond=diabetes&pageSize=1',
    );
    expect(trials.studies?.length).toBeGreaterThan(0);

    const fhir = await getJson('https://hapi.fhir.org/baseR4/Patient?_count=1');
    expect(fhir.resourceType).toBe('Bundle');

    const clinicalTables = await getJson(
      'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=diabetes&sf=code,name&df=code,name&maxList=1',
    );
    expect(Array.isArray(clinicalTables)).toBe(true);
    expect(clinicalTables[0]).toBeGreaterThan(0);
  });
});
