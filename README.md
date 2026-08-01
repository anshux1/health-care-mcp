# Vitalis — Clinical Intelligence MCP Server

[![CI](https://github.com/anshux1/health-care-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/anshux1/health-care-mcp/actions/workflows/ci.yml) [![Node](https://img.shields.io/badge/node-%3E%3D18-339933)](https://nodejs.org/) [![MCP](https://img.shields.io/badge/MCP-compatible-6f42c1)](https://modelcontextprotocol.io/)

> **Safe clinical intelligence infrastructure for MCP clients.** Vitalis gives LLM clients authenticated, scoped, auditable access to triage, drug safety, diagnostics, research, synthetic FHIR records, and care coordination.

> **Responsible use:** Vitalis is a clinical decision-support research and demonstration server. It is not a medical device and must not replace a licensed clinician, emergency services, or local clinical policy.

## 1. 30-second pitch

Vitalis is different from a prompt-only symptom checker because safety is enforced in the runtime gateway:

- `EmergencyDetectionGuard` detects red-flag terms without blocking emergency-information requests.
- `ApiKeyGuard`/JWT validation and `ScopeGuard` enforce identity and least-privilege access.
- `ClinicalSafetyInterceptor` rewrites diagnostic overreach, adds disclaimers, escalates urgency, and labels synthetic FHIR/care data.
- `AuditLogInterceptor` records bounded, redacted JSONL audit events with canonical input hashes.
- Shared HTTP policies provide deadlines, retries, response caps, concurrency limits, and upstream metadata.
- Six interactive widgets display tool output and can call tools, change display mode, filter data, and send follow-up messages.

The project uses live public upstreams where available and HAPI FHIR/Synthea synthetic patient data only. No real PHI is included in the repository.

## 2. Demo and endpoint status

No public endpoint is claimed by this repository until it has passed the authenticated verification checklist in `docs/deployment.md`. After deployment, publish the value as:

```text
https://<your-deployment-domain>/mcp
```

For a safe local demo, configure locally generated keys in `.env` and use the read-only key for normal calls. Never copy the placeholder values from `.env.example` into a public deployment.

## 3. Tools and public API

The runtime currently registers 29 core tools with the following controller-prefixed names.

### Triage (`triage:read`)

- `triage_assess_symptoms`
- `triage_check_red_flags`
- `triage_get_care_options`

### Drugs (`drugs:read`)

- `drugs_search`
- `drugs_get_label_info`
- `drugs_check_interactions`
- `drugs_get_adverse_events`
- `drugs_get_recalls`

### Diagnostics (`dx:read`)

- `diagnostics_lookup_condition`
- `diagnostics_interpret_lab_value`
- `diagnostics_explain_lab_test`
- `diagnostics_symptom_to_codes`

### Research (`research:read`)

- `research_search_pubmed`
- `research_get_article`
- `research_search_trials`
- `research_get_trial_details`
- `research_summarize_evidence`

### FHIR (`fhir:read`)

- `fhir_search_patients`
- `fhir_get_patient`
- `fhir_get_conditions`
- `fhir_get_medications`
- `fhir_get_observations`
- `fhir_get_encounters`
- `fhir_get_patient_summary`

### Care (`care:read` / `care:write`)

- `care_generate_handoff` (`care:read`)
- `care_reconcile_medications` (`care:write`)
- `care_draft_referral` (`care:write`)
- `care_find_guidelines` (`care:read`)
- `care_appointment_prep` (`care:read`)

### Clearly labeled stretch tools

- `diagnostics_lookup_icd11`
- `fhir_get_allergies`
- `fhir_get_immunizations`

### Resources

- `vitalis://safety-policy` — public safety policy
- `vitalis://data-sources` — public upstream registry
- `vitalis://audit/recent` — admin-only latest 50 audit entries
- `vitalis://metrics` — admin-only telemetry
- `health://checks` — framework health-check resource
- `widget://examples` — framework-loaded widget examples

## 4. Example MCP calls

The HTTP MCP endpoint is `/mcp`. Headers are shown for API-key authentication; MCP clients may also pass `_meta.x-api-key` where supported.

```json
{
  "method": "tools/call",
  "params": {
    "name": "triage_assess_symptoms",
    "arguments": {
      "symptoms": ["chest pain", "shortness of breath"],
      "age": 55,
      "sex": "male",
      "_meta": { "x-api-key": "<read-write-key>" }
    }
  }
}
```

```json
{
  "method": "tools/call",
  "params": {
    "name": "drug_check_interactions",
    "arguments": {
      "drugs": ["warfarin", "aspirin"],
      "_meta": { "x-api-key": "<read-only-key>" }
    }
  }
}
```

Successful clinical results include `_safety` and `_meta.durationMs`. FHIR and care results identify synthetic data. Errors use stable codes such as `AUTH_DENIED`, `SCOPE_DENIED`, `PATIENT_NOT_FOUND`, and `UPSTREAM_UNAVAILABLE`.

## 5. Architecture

```text
MCP client / NitroStudio / Claude Desktop
                 │
                 ▼
      NitroStack MCP transport (/mcp)
                 │
 Emergency guard → API/JWT auth → scope guard
                 │
       trim pipe → tool handler → safety
                 │
       audit event → timing/metrics → client
                 │
  Triage · Drugs · Diagnostics · Research · FHIR · Care
                 │
 RxNorm · RxClass · OpenFDA · PubMed · Trials · FHIR · Clinical Tables
```

The six widget routes are connected to their tools with `@Widget` and are bundled by NitroStack from `src/widgets/`.

## 6. Authentication, scopes, and rate limits

Configure credentials through environment variables only:

```env
API_KEY_CLINICIAN=<random-key-with-read-write-care-scopes>
API_KEY_READONLY=<random-key-with-read-scopes>
API_KEY_ADMIN=<random-key-with-admin-scope>
VITALIS_ALLOW_ANONYMOUS_DEMO=false
# Optional HS256 JWT support:
# JWT_SECRET=<random-secret-at-least-16-bytes>
```

- `API_KEY_READONLY`: triage, drugs, diagnostics, research, and FHIR read scopes.
- `API_KEY_CLINICIAN`: read scopes plus `care:read` and `care:write`.
- `API_KEY_ADMIN`: explicit admin identity, wildcard tool access, and `admin:audit`.
- Anonymous mode is disabled by default, must be explicitly enabled, and never receives care-write or admin scopes.
- Unknown tools fail closed.
- `vitalis://audit/recent` and `vitalis://metrics` require the configured admin identity.
- If `JWT_SECRET` is set, bearer JWTs are validated as HS256 tokens with strict claims; JWTs do not inherit the API-key admin wildcard.

Default tool limits are configured per module: research and heavy drug operations are limited to 10 requests/minute, FHIR to 20/minute, local triage/diagnostics to 120/minute, and care operations according to their tool cost. These limits are per authenticated subject.

## 7. Clinical safety design

Every clinical tool uses the shared gateway. The safety layer:

1. scans nested input for emergency terms using escaped, case-insensitive word-boundary matching;
2. never blocks a request merely because emergency terms are present;
3. rewrites banned overreach such as “you have”/“diagnosis confirmed” and prescriptive dosing language;
4. adds a disclaimer, urgency tier, and red-flag metadata;
5. prepends emergency guidance when a red flag is detected;
6. marks FHIR and care output as synthetic data.

The embedded triage ruleset contains 30 validated rules. Missing or malformed safety data refuses startup. `VITALIS_SAFETY_LAYER=off` is test-only; outside `NODE_ENV=test` it is ignored and logged loudly.

## 8. Data sources and terms

| Source | Use | Policy |
|---|---|---|
| NLM RxNorm/RxClass | Drug names, RxCUI, classes | Public API; concurrency capped |
| OpenFDA | Labels, FAERS, recalls | FDA terms and reporting-bias caveats apply |
| NCBI PubMed | Search, citations, XML abstracts | NCBI `tool`/`email` etiquette required |
| ClinicalTrials.gov v2 | Trial search/details | Public API; bounded requests |
| HAPI FHIR R4 / SMART fallback | Synthetic FHIR records | Synthetic/Synthea data only |
| NLM Clinical Tables | ICD-10-CM lookup | Public documentation-support service |
| WHO ICD-11 (optional) | Optional classification lookup | Requires configured OAuth credentials; embedded fallback is labeled reference data |

Respect each provider’s current terms, rate limits, attribution requirements, and availability. Upstream content is not a clinical recommendation.

## 9. Local setup

### Prerequisites

- Node.js 18 or newer
- npm

```bash
git clone https://github.com/anshux1/health-care-mcp.git
cd health-care-mcp
npm ci
npm --prefix src/widgets ci
cp .env.example .env
# Replace every credential placeholder with local values
```

Development defaults to stdio. HTTP mode can be selected explicitly:

```env
NODE_ENV=development
MCP_TRANSPORT_TYPE=http
HOST=127.0.0.1
PORT=3000
```

Commands:

```bash
npm run dev             # NitroStack development server
npm run typecheck       # TypeScript check
npm test                # Unit + integration tests
npm run test:coverage   # Coverage gate and HTML/JSON reports
npm run widget:build    # Standalone Next.js widget build
npm run build           # Server + widget production bundle
npm run verify          # All default non-live gates
```

Live upstream tests are opt-in:

```bash
npm run test:live       # Requires network; sets LIVE_API_TESTS=true
npm run fixtures:record # Explicitly capture sanitized public fixtures
```

## 10. Deployment

The primary documented target is Railway. See [`docs/deployment.md`](docs/deployment.md) for build/start commands, environment configuration, MCP endpoint setup, verification, audit storage, rollback, and the local stdio fallback.

At minimum, production must set `NODE_ENV=production`, `MCP_TRANSPORT_TYPE=http`, `HOST=0.0.0.0`, `PORT` from the platform, `CONTACT_EMAIL`, `NCBI_EMAIL`, and at least one API key or JWT secret. Do not put secrets in Git or `.env.example`.

## 11. Limitations and responsible use

- Vitalis does not diagnose, prescribe, or replace a clinician.
- Emergency guidance is generic; users should contact local emergency services.
- FHIR data is synthetic and must never be interpreted as real PHI.
- FDA interaction detection is evidence cross-scanning, not a complete interaction database.
- FAERS counts are voluntary reports, not incidence rates or proof of causation.
- Public upstreams can be incomplete, rate-limited, or unavailable; partial/fallback status is surfaced.
- JWT support is optional HS256 infrastructure, not a hosted identity provider.

## 12. Roadmap and release status

Completed remediation phases: gateway pipeline, authentication, safety, audit/metrics, shared HTTP, clinical modules, widgets, tests/coverage, and CI/configuration hardening.

Remaining release work is operational: choose and configure a deployment, verify the public HTTPS endpoint with real deployment credentials, rehearse the demo, and run the final release gate. See `REMEDIATION_PLAN.md` Phases 11–12.

## 13. Team, license, acknowledgements

Vitalis is maintained as an open-source clinical MCP demonstration project by the repository team. Contributions should preserve the safety, audit, authentication, and synthetic-data guarantees.

License: see the repository license file when published.

Built with [NitroStack](https://nitrostack.ai), the [Model Context Protocol](https://modelcontextprotocol.io/), NLM services, OpenFDA, NCBI, ClinicalTrials.gov, HAPI FHIR, and the broader public clinical-data ecosystem.
