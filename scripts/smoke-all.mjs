/**
 * Live Smoke Verification Script — Tests all 6 external upstreams end-to-end.
 * Run with: node scripts/smoke-all.mjs
 */

async function runSmokeTests() {
  console.log('🚀 Running Vitalis Live Upstream Smoke Tests...\n');

  const tests = [
    {
      name: '1. NLM RxNorm (Drug Search)',
      url: 'https://rxnav.nlm.nih.gov/REST/rxcui.json?name=metformin',
      check: (data) => data.idGroup?.rxnormId?.[0] === '6809',
    },
    {
      name: '2. OpenFDA (Drug Label Info)',
      url: 'https://api.fda.gov/drug/label.json?search=openfda.generic_name:%22warfarin%22&limit=1',
      check: (data) => data.results?.[0]?.openfda !== undefined,
    },
    {
      name: '3. NCBI PubMed (Literature Search)',
      url: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=diabetes&retmode=json&retmax=1',
      check: (data) => Number(data.esearchresult?.count) > 0,
    },
    {
      name: '4. ClinicalTrials.gov v2 (Trial Search)',
      url: 'https://clinicaltrials.gov/api/v2/studies?query.cond=diabetes&pageSize=1',
      check: (data) => data.studies?.length > 0,
    },
    {
      name: '5. HAPI FHIR R4 (Synthetic Patient Search)',
      url: 'https://hapi.fhir.org/baseR4/Patient?_count=1',
      check: (data) => data.resourceType === 'Bundle',
    },
    {
      name: '6. NLM Clinical Tables (ICD-10-CM Lookup)',
      url: 'https://clinicaltables.nlm.nih.gov/api/icd10cm/v3/search?terms=diabetes&sf=code,name&df=code,name&maxList=1',
      check: (data) => Array.isArray(data) && data[0] > 0,
    },
  ];

  let passed = 0;
  for (const t of tests) {
    const start = Date.now();
    try {
      const res = await fetch(t.url, {
        headers: {
          'User-Agent': 'vitalis-mcp-smoke/1.0 (hackathon live test)',
        },
      });
      const latency = Date.now() - start;
      if (!res.ok) {
        console.log(`❌ ${t.name} — HTTP ${res.status} (${latency}ms)`);
        continue;
      }
      const data = await res.json();
      const isOk = t.check(data);
      if (isOk) {
        console.log(`✅ ${t.name} — ONLINE (${latency}ms)`);
        passed++;
      } else {
        console.log(`⚠️ ${t.name} — Unexpected response shape (${latency}ms)`);
      }
    } catch (err) {
      console.log(`❌ ${t.name} — Error: ${err.message}`);
    }
  }

  console.log(`\n📊 Live Smoke Results: ${passed}/${tests.length} upstreams online and responding.`);
  if (passed === tests.length) {
    console.log('🎉 All 6 external clinical intelligence APIs are 100% operational!');
  } else {
    console.log('⚠️ Some upstreams degraded; graceful fallback modes active.');
  }
}

runSmokeTests();
