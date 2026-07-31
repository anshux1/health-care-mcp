# Vitalis — Clinical Intelligence MCP Server
## Production-Ready Build Plan (2-Day Hackathon Master Checklist)

> **How to use this document:** Work top to bottom. Every section is written so nothing
> needs to be re-derived later — tool names, Zod schemas, endpoints, env vars, and schedule
> blocks are all final. Check items off as you complete them.
>
> **Verification status of external APIs (checked live on build-plan date):**
> ✅ RxNorm core (`/rxcui`, `/drugs`, `/approximateTerm`), ✅ RxClass, ✅ OpenFDA
> (`drug/label`, `drug/event`, `drug/enforcement`), ✅ PubMed E-utilities, ✅ ClinicalTrials.gov
> API v2, ✅ HAPI FHIR R4 public server.
> ⚠️ **NLM retired the RxNorm drug-interaction endpoints** (`/REST/interaction/*` returns
> "Not found") → the Drug Safety module implements interaction checking by cross-scanning
> OpenFDA label `drug_interactions` text (see §2.2 and §4).
> ⚠️ WHO ICD-11 requires free OAuth2 client registration → plan uses NLM Clinical Table
> Search Service (no auth) as primary for ICD-10-CM, WHO ICD-11 as optional upgrade.

---

## 1. Product Framing

| Field | Value |
|---|---|
| **Name** | **Vitalis** — Clinical Intelligence MCP Server |
| **One-line pitch** | "A production-grade MCP gateway that gives any LLM client safe, authenticated, auditable access to six clinical intelligence capabilities — triage, drug safety, diagnostics support, medical research, FHIR patient records, and care coordination — powered entirely by live public health data, with zero PHI." |
| **Tagline for judges** | "Not another symptom checker. Developer infrastructure for safe clinical AI." |

### Judging angle — what we win on

Generic symptom-checker submissions all do the same thing: user describes symptoms → LLM
free-styles an answer → a disclaimer is bolted on at the end. Vitalis wins by being
**infrastructure, not a chatbot**:

1. **Safety is enforced by the framework, not the prompt.** A `ClinicalSafetyInterceptor`
   and `EmergencyDetectionGuard` sit in the NitroStack middleware pipeline and
   programmatically prevent diagnostic overreach, stamp urgency tiers, and append
   disclaimers on *every* clinical tool — it is impossible for a tool to forget. Judges
   can be shown a tool output with the safety layer disabled vs enabled.
2. **Six real, live federal/clinical data sources** (NLM RxNorm, FDA openFDA, NCBI PubMed,
   ClinicalTrials.gov, HAPI FHIR R4 with Synthea synthetic patients, NLM Clinical Tables)
   — not mock JSON, not a single API.
3. **Production concerns visible in the demo**: API-key auth with scopes, per-tool rate
   limiting, structured audit log of every call, health checks, caching, graceful
   degradation when an upstream API fails, and a public deployed endpoint.
4. **FHIR competence** — the industry interoperability standard — demonstrated end-to-end
   (search patient → conditions → medications → vitals → handoff summary), which almost no
   hackathon team attempts.

### Differentiation summary (say this to judges)

| Symptom-checker submissions | Vitalis |
|---|---|
| One LLM prompt, no data grounding | 6 modules backed by 6 live authoritative APIs |
| Disclaimer as an afterthought | Safety enforced by middleware on every response |
| No auth, no logging | API-key auth + scopes + full audit trail |
| Demo-only | Deployed public MCP endpoint, health checks, rate limits, CI |
| Ignores interoperability | Speaks FHIR R4, the actual healthcare data standard |

---

## 2. Full Feature List Per Module

Conventions used below:
- **Zod schemas are final** — copy them into the implementation.
- All clinical tools return a `_safety` envelope injected by the safety interceptor
  (see §6); it is listed once here and not repeated per tool:

```json
"_safety": {
  "disclaimer": "For informational purposes only. Not medical advice, diagnosis, or treatment.",
  "urgency_tier": "emergency | urgent | routine | self_care | not_applicable",
  "red_flags_detected": ["..."],
  "synthetic_data": true
}
```

### 2.1 Module: Triage (`triage`) — `src/modules/triage/`

Rule-based engine over an embedded clinical ruleset (`src/data/red-flag-rules.json`,
~30 rules). **No external API** — triage must never fail because the network did.

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 1.1 | `triage_assess_symptoms` | Full triage assessment → urgency tier, red flags, candidate conditions, guidance | `symptoms: z.array(z.string()).min(1).max(20)`, `age: z.number().int().min(0).max(120)`, `sex: z.enum(['male','female','other'])`, `duration_hours: z.number().int().optional()`, `severity: z.number().int().min(1).max(10).optional()` | `{ urgency_tier, red_flags: [{flag, reason}], possible_conditions: [{name, likelihood_band: 'common'|'possible'|'rare', icd10}], guidance: string, follow_up_questions: string[], recommended_timeframe }` | Embedded ruleset | None (safety-critical, must always compute fresh) | Ruleset fails to load at boot → server refuses to start (fail-closed). Runtime error → respond `urgency_tier: 'urgent'` safe fallback |
| 1.2 | `triage_check_red_flags` | Fast emergency-only screen (used by the demo's dramatic moment) | `symptoms: z.array(z.string()).min(1)` | `{ is_emergency: boolean, matched_red_flags: [{flag, reason}], recommended_action: string }` | Embedded ruleset | None | Same fail-safe posture: any engine error → `is_emergency: true`, "seek emergency care" (fail toward safety) |
| 1.3 | `triage_get_care_options` | Map urgency tier → concrete care pathway | `urgency_tier: z.enum(['emergency','urgent','routine','self_care'])`, `condition: z.string().optional()` | `{ care_options: [{type, timeframe, preparation: string[]}], escalation_criteria: string[] }` | Embedded content table | `@Cache({ ttl: 86400 })` — static content | Content table miss → return generic 4-row table |

**Red-flag ruleset coverage (must have all of these minimum):** chest pain/pressure,
difficulty breathing, stroke signs (face/arm/speech), severe allergic reaction, uncontrolled
bleeding, suicidal ideation, severe abdominal pain, high fever + stiff neck, poisoning/overdose,
loss of consciousness, severe head injury, sudden vision loss, chest pain radiating to arm/jaw,
infant fever < 3 months old, pregnancy + severe pain/bleeding.

### 2.2 Module: Drug Safety (`drugs`) — `src/modules/drugs/`

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 2.1 | `drug_search` | Resolve free-text drug name → RxCUI, brand/generic names, drug class | `name: z.string().min(2).max(100)`, `fuzzy: z.boolean().default(false)` | `{ matches: [{ rxcui, name, tty, synonyms: string[], classes: string[] }] }` | RxNorm `/rxcui.json?name=` (+ `/approximateTerm.json?term=` when fuzzy), RxClass `/rxclass/class/byRxcui.json?rxcui=` | `@Cache({ ttl: 86400, key: i => 'drug_search:' + i.name.toLowerCase() })` | RxNorm timeout → retry once with backoff, then `502`-style safe error `{ error: 'UPSTREAM_UNAVAILABLE', source: 'rxnorm' }` via exception filter |
| 2.2 | `drug_get_label_info` | FDA label sections for a drug | `drug_name: z.string().min(2)`, `sections: z.array(z.enum(['boxed_warning','indications_and_usage','contraindications','warnings_and_cautions','adverse_reactions','drug_interactions','pregnancy','overdosage'])).optional()` (default: all) | `{ drug, rxcui, brand_names, sections: { [section]: string }, source: 'openfda', label_revision_date }` | OpenFDA `/drug/label.json?search=openfda.generic_name:"X"` → fallback `openfda.brand_name:"X"` | `@Cache({ ttl: 86400 })` | No label hit on generic → auto-retry brand_name → `null` sections with `note: 'No FDA label found'` |
| 2.3 | `drug_check_interactions` | **Cross-scan interaction check** (replaces retired NLM API): resolve all drugs → fetch each FDA label's `drug_interactions` text → scan each label for mentions of the other drugs (name + synonyms) → return excerpted evidence | `drugs: z.array(z.string()).min(2).max(5)` | `{ interactions: [{ pair: [string, string], severity_band: 'contraindicated'|'major'|'moderate'|'minor'|'unknown', evidence_excerpt: string, source: 'fda_label' }], drugs_without_labels: string[], methodology_note: string }` | RxNorm (resolve) + OpenFDA labels | `@Cache({ ttl: 21600, key: i => 'ddi:' + sorted(i.drugs).join('|') })` | Partial success allowed: if 1 of 3 labels missing, return found interactions + list `drugs_without_labels`. Severity heuristic: keyword scoring on excerpt (`contraindicat*`→contraindicated, `avoid`/`serious`→major, `monitor`/`may increase`→moderate, else minor) |
| 2.4 | `drug_get_adverse_events` | Top reported adverse reactions for a drug (FAERS) | `drug_name: z.string().min(2)`, `limit: z.number().int().min(1).max(20).default(10)` | `{ drug, total_reports: number, top_reactions: [{ term, count }], reporting_caveat: string }` | OpenFDA `/drug/event.json?search=patient.drug.openfda.generic_name:"X"&count=patient.reaction.reactionmeddrapt.exact` | `@Cache({ ttl: 43200 })` | FAERS sparse for rare drugs → return `total_reports: 0` with caveat, not an error |
| 2.5 | `drug_get_recalls` | FDA enforcement/recall actions for a drug | `drug_name: z.string().min(2)` | `{ drug, recalls: [{ recall_number, reason, classification: 'I'|'II'|'III', recall_initiation_date, status }] }` | OpenFDA `/drug/enforcement.json?search=openfda.generic_name:"X"` | `@Cache({ ttl: 43200 })` | Empty result = good news, return `{ recalls: [] }` |

### 2.3 Module: Diagnostics Support (`diagnostics`) — `src/modules/diagnostics/`

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 3.1 | `dx_lookup_condition` | Condition name → ICD-10-CM code(s) + plain-language description | `query: z.string().min(2).max(200)`, `max_results: z.number().int().max(25).default(10)` | `{ results: [{ icd10_code, name, synonyms: string[] }] }` | NLM Clinical Tables `/api/icd10cm/v3/search?terms=&maxList=&df=code,name` | `@Cache({ ttl: 86400 })` | NLM tables down → optional WHO ICD-11 fallback if `ICD_CLIENT_ID` configured, else safe error |
| 3.2 | `dx_interpret_lab_value` | Rule-based lab interpretation vs reference ranges | `analyte: z.string()` (matched against `src/data/lab-reference-ranges.json`, ~25 analytes: WBC, RBC, hemoglobin, hematocrit, platelets, sodium, potassium, chloride, bicarbonate, BUN, creatinine, glucose, calcium, ALT, AST, ALP, bilirubin, albumin, total cholesterol, LDL, HDL, triglycerides, HbA1c, TSH), `value: z.number()`, `unit: z.string()`, `age: z.number().int().optional()`, `sex: z.enum(['male','female','other']).optional()` | `{ analyte, value, unit, flag: 'low'|'normal'|'high'|'critical_low'|'critical_high', reference_range: { low, high, unit }, possible_causes: string[], caveats: string }` | Embedded range table | None (pure compute) | Unknown analyte → `{ flag: 'unknown' }` + list of supported analytes. Unit mismatch → attempt canonical conversion for glucose/creatinine/cholesterol families, else reject with expected units |
| 3.3 | `dx_explain_lab_test` | Patient-friendly explanation of what a lab test measures | `test_name: z.string().min(2)` | `{ test_name, what_it_measures, why_ordered, preparation: string[], reading_level: 'grade6' }` | Embedded knowledge base (`src/data/lab-explanations.json`) | `@Cache({ ttl: 86400 })` | Unknown test → fuzzy-match suggestion list |
| 3.4 | `dx_symptom_to_codes` | Symptom text → candidate ICD-10-CM codes (documentation support, NOT diagnosis) | `symptom: z.string().min(2)` | `{ symptom, candidate_codes: [{ icd10_code, name }], usage_note: string }` | NLM Clinical Tables ICD-10-CM search | `@Cache({ ttl: 86400 })` | Same as 3.1 |

### 2.4 Module: Medical Research (`research`) — `src/modules/research/`

NCBI etiquette: ≤ 3 req/s anonymous, ≤ 10 req/s with `NCBI_API_KEY`. All requests carry
`tool=vitalis&email=${NCBI_EMAIL}` params.

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 4.1 | `research_search_pubmed` | Search PubMed → ranked article list | `query: z.string().min(2).max(300)`, `max_results: z.number().int().max(20).default(5)`, `publication_type: z.enum(['any','guideline','meta-analysis','randomized-controlled-trial','review']).default('any')`, `years_back: z.number().int().max(20).optional()` | `{ total_count, articles: [{ pmid, title, journal, pub_date, authors: string[], publication_types: string[] }] }` | E-utilities `esearch.fcgi?db=pubmed&term=&retmode=json&retmax=` then `esummary.fcgi?db=pubmed&id=&retmode=json` | `@Cache({ ttl: 21600 })` | NCBI 429 → exponential backoff (250ms, 1s, 4s) then safe error with `retry_after` hint |
| 4.2 | `research_get_article` | Full citation + abstract for one PMID | `pmid: z.string().regex(/^\d{1,9}$/)` | `{ pmid, title, abstract, authors, journal, pub_date, doi, mesh_terms: string[], pubmed_url }` | `efetch.fcgi?db=pubmed&id=&rettype=abstract&retmode=xml` (parse XML → text) + `esummary` for DOI | `@Cache({ ttl: 86400 })` | Abstract missing (some records) → return metadata with `abstract: null` + note |
| 4.3 | `research_search_trials` | ClinicalTrials.gov search with status/phase filters | `condition: z.string().min(2)`, `status: z.enum(['any','recruiting','active_not_recruiting','completed']).default('any')`, `phase: z.enum(['any','1','2','3','4']).default('any')`, `max_results: z.number().int().max(20).default(10)` | `{ total_count, trials: [{ nct_id, title, overall_status, phases: string[], conditions: string[], lead_sponsor, start_date, locations: [{city, country}] (first 3), url }] }` | ClinicalTrials.gov v2 `GET /api/v2/studies?query.cond=&filter.overallStatus=&filter.phase=&pageSize=&fields=...` | `@Cache({ ttl: 21600 })` | Empty → widen once (drop phase filter) automatically, note `widened: true` |
| 4.4 | `research_get_trial_details` | Full protocol details for one NCT ID | `nct_id: z.string().regex(/^NCT\d{8}$/)` | `{ nct_id, title, status, phase, sponsor, conditions, interventions: [{type, name}], eligibility: { criteria, sex, min_age, max_age }, primary_outcomes: string[], locations: [{facility, city, country}], contacts, url }` | `GET /api/v2/studies/{nctId}` | `@Cache({ ttl: 86400 })` | 404 → suggest `research_search_trials` |
| 4.5 | `research_summarize_evidence` | Evidence digest: PubMed top-N structured for LLM summarization | `topic: z.string().min(2)`, `max_results: z.number().int().max(10).default(5)` | `{ topic, synthesized_from: number, articles: [{ pmid, title, pub_date, publication_types, abstract }], synthesis_note: string }` | ESearch + EFetch batch (single round-trip with comma-separated PMIDs) | `@Cache({ ttl: 21600 })` | Compose of 4.1/4.2 failure modes |

### 2.5 Module: FHIR Patient Records (`fhir`) — `src/modules/fhir/`

Public HAPI FHIR R4 server (`https://hapi.fhir.org/baseR4`) pre-loaded with Synthea
synthetic patients. Every output stamps `synthetic_data: true`.

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 5.1 | `fhir_search_patients` | Find synthetic patients | `name: z.string().optional()`, `gender: z.enum(['male','female']).optional()`, `birthdate: z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/).optional()`, `max_results: z.number().int().max(25).default(10)` — at least one of name/gender/birthdate required via `.refine()` | `{ patients: [{ fhir_id, name, gender, birth_date, mrn }] }` | `GET /Patient?name=&gender=&birthdate=&_count=` | `@Cache({ ttl: 300 })` | Server down → fail over to secondary base URL (`FHIR_BASE_URL_FALLBACK`, e.g. `https://r4.smarthealthit.org`), stamp `server_used` |
| 5.2 | `fhir_get_patient` | Patient demographics | `patient_id: z.string().min(1)` | `{ fhir_id, name, gender, birth_date, age, address, telecom, mrn, synthetic_data: true }` | `GET /Patient/{id}` | `@Cache({ ttl: 600 })` | 404 → `{ error: 'PATIENT_NOT_FOUND' }` |
| 5.3 | `fhir_get_conditions` | Active problem list | `patient_id: z.string().min(1)`, `clinical_status: z.enum(['active','resolved','any']).default('active')` | `{ conditions: [{ code, display, icd10, onset_date, status, recorded_date }] }` | `GET /Condition?patient={id}&clinical-status=` | `@Cache({ ttl: 600 })` | Empty → `[]` (valid clinical state) |
| 5.4 | `fhir_get_medications` | Medication list | `patient_id: z.string().min(1)`, `status: z.enum(['active','stopped','any']).default('active')` | `{ medications: [{ name, rxcui, dosage, frequency, status, authored_on, prescriber }] }` | `GET /MedicationRequest?patient={id}&status=` | `@Cache({ ttl: 600 })` | Empty → `[]` |
| 5.5 | `fhir_get_observations` | Vitals & labs | `patient_id: z.string()`, `category: z.enum(['vital-signs','laboratory','any']).default('any')`, `code: z.string().optional()` (LOINC), `max_results: z.number().int().max(50).default(20)` | `{ observations: [{ code, display, value, unit, date, reference_range, flag }] }` | `GET /Observation?patient={id}&category=&code=&_count=&_sort=-date` | `@Cache({ ttl: 300 })` | Empty → `[]` |
| 5.6 | `fhir_get_encounters` | Visit history timeline | `patient_id: z.string()`, `max_results: z.number().int().max(25).default(10)` | `{ encounters: [{ type, status, period_start, period_end, reason, location }] }` | `GET /Encounter?patient={id}&_count=&_sort=-date` | `@Cache({ ttl: 600 })` | Empty → `[]` |
| 5.7 | `fhir_get_patient_summary` | Aggregated clinical summary bundle (feeds the flagship widget) | `patient_id: z.string()` | `{ patient, active_conditions, active_medications, recent_vitals (last 10), recent_encounters (last 5), allergy_note: 'HAPI public server does not consistently populate AllergyIntolerance', generated_at, synthetic_data: true }` | Fan-out: 5.2 + 5.3 + 5.4 + 5.5 + 5.6 in `Promise.allSettled` | `@Cache({ ttl: 300 })` | Partial failures OK — `Promise.allSettled`, include `sections_failed: string[]` |

### 2.6 Module: Care Coordination (`care`) — `src/modules/care/`

| # | Tool | Purpose | Input (Zod) | Output | API | Cache | Failure mode |
|---|---|---|---|---|---|---|---|
| 6.1 | `care_generate_handoff` | SBAR-format clinical handoff from FHIR data | `patient_id: z.string()`, `format: z.enum(['sbar','narrative']).default('sbar')` | `{ patient_id, sbar: { situation, background, assessment, recommendation }, source_data_window: string, synthetic_data: true }` | Reuses `FhirService` (5.7 summary) | `@Cache({ ttl: 300 })` | Inherits 5.7 partial-failure behavior; missing sections marked `[no data]` in SBAR |
| 6.2 | `care_reconcile_medications` | Compare two med lists → discrepancies | `list_a: z.array(z.string()).min(1).max(50)` (e.g. FHIR-active meds), `list_b: z.array(z.string()).min(1).max(50)` (e.g. patient-reported), `label_a: z.string().default('List A')`, `label_b: z.string().default('List B')` | `{ added: string[], removed: string[], continued: string[], possible_duplicates: [{a, b, reason}], discrepancy_count }` | RxNorm for name normalization (optional per item) | None | RxNorm per-item failure → fall back to lowercase-string matching for that item |
| 6.3 | `care_draft_referral` | Draft specialist referral content | `patient_id: z.string()`, `specialty: z.string()`, `reason: z.string().min(5)`, `urgency: z.enum(['routine','urgent']).default('routine')` | `{ referral: { to_specialty, reason, urgency, patient_summary_block, relevant_conditions, relevant_medications, draft_text }, requires_clinician_review: true }` | FHIR summary (context block) | None (each draft unique) | If patient fetch fails → generate draft with `[patient context unavailable]` placeholder |
| 6.4 | `care_find_guidelines` | Clinical practice guidelines for a condition | `condition: z.string().min(2)`, `max_results: z.number().int().max(10).default(5)` | `{ guidelines: [{ pmid, title, journal, pub_date, organization }], search_strategy: string }` | PubMed ESearch with `pt=guideline` filter, ESummary | `@Cache({ ttl: 43200 })` | Inherits 4.1 backoff |
| 6.5 | `care_appointment_prep` | Visit-prep checklist per condition/visit type | `visit_type: z.enum(['new_diagnosis','follow_up','annual_physical','specialist_referral'])`, `condition: z.string().optional()` | `{ checklist: [{ item, category: 'documents'|'questions'|'measurements'|'logistics', why }], bring_list: string[] }` | Embedded prep rules (`src/data/appointment-prep.json`) | `@Cache({ ttl: 86400 })` | Unknown condition → generic visit-type checklist |

### 2.7 Cross-module Resources and Prompts

**Resources** (`src/modules/core/core.resources.ts`):

| URI | Name | Content |
|---|---|---|
| `vitalis://safety-policy` | Clinical Safety Policy | Full text of safety guardrails, urgency tier definitions, disclaimer policy (what §6 encodes — exposed so judges/clients can read it) |
| `vitalis://data-sources` | Data Source Registry | All 6 external APIs: base URLs, auth needs, rate limits, terms-of-service notes |
| `vitalis://audit/recent` | Recent Audit Entries | Last 50 audit log entries (**admin scope only** — demonstrates auditability live) |

**Prompts** (`src/modules/core/core.prompts.ts`):

| Name | Arguments | Purpose |
|---|---|---|
| `clinical_handoff_prompt` | `patient_summary_json` (required) | SBAR handoff instruction template for the LLM |
| `patient_education_prompt` | `condition` (required), `reading_level` (optional, default `grade6`) | Generate patient-friendly condition explainer; instructs LLM to avoid diagnosis language |
| `research_critique_prompt` | `abstract` (required) | PICO-structured critical appraisal of a study abstract |

---

## 3. System Architecture

### 3.1 Layer diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MCP CLIENTS                    (NitroStudio / Claude Desktop / curl)      │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │  STDIO (dev) · HTTP+SSE (prod)
┌──────────────────────────────────────▼───────────────────────────────────┐
│ TRANSPORT & BOOTSTRAP        src/index.ts                                │
│   McpApplicationFactory.create(AppModule) → server.start()               │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────┐
│ GATEWAY LAYER (cross-cutting, src/gateway/)                              │
│                                                                          │
│  Request path:   EmergencyDetectionGuard → ApiKeyGuard → ScopeGuard      │
│                  → @RateLimit → @UsePipes(TrimPipe) → TOOL HANDLER       │
│  Response path:  ClinicalSafetyInterceptor → AuditLogInterceptor         │
│                  → TimingInterceptor → CLIENT                            │
│  Error path:     ClinicalExceptionFilter (maps all throws to safe JSON)  │
│                                                                          │
│  Components:                                                             │
│   • EmergencyDetectionGuard   scans input text for red-flag terms,       │
│                               sets context.emergency (never blocks care  │
│                               info; escalates output urgency)            │
│   • ApiKeyGuard               validates x-api-key via ApiKeyModule,      │
│                               populates context.auth { subject, scopes } │
│   • ScopeGuard                checks context.auth.scopes ⊇ tool scope    │
│   • RateLimitInterceptor      per-subject sliding window (or @RateLimit) │
│   • ClinicalSafetyInterceptor rewrites banned phrases, stamps _safety    │
│                               envelope, forces disclaimer                │
│   • AuditLogInterceptor       writes JSONL audit record per call         │
│   • TimingInterceptor         adds _meta.durationMs                      │
│   • ClinicalExceptionFilter   { error: true, code, safe_message }        │
│   • TrimPipe                  trims/normalizes all string inputs         │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────┐
│ MODULE LAYER (src/modules/) — thin tools classes, logic in services      │
│   triage/ · drugs/ · diagnostics/ · research/ · fhir/ · care/ · core/    │
│   Each: <name>.module.ts, <name>.tools.ts, <name>.service.ts             │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │ DI
┌──────────────────────────────────────▼───────────────────────────────────┐
│ INTEGRATION LAYER (src/integrations/)                                    │
│   HttpClientService  fetch + timeout(8s) + retry(2x, exp backoff)        │
│                      + per-host concurrency cap + response size cap      │
│   RxNormService · OpenFdaService · PubMedService · TrialsService         │
│   FhirService (failover base URLs) · ClinicalTablesService               │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │ HTTPS
┌──────────────────────────────────────▼───────────────────────────────────┐
│ EXTERNAL APIS   RxNorm · RxClass · openFDA · NCBI E-utilities            │
│                 ClinicalTrials.gov v2 · HAPI FHIR R4 · NLM ClinTables    │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│ DATA & CONFIG   src/data/*.json (rulesets) · .env (ConfigModule)         │
│ OBSERVABILITY   ctx.logger · audit.jsonl · SystemHealthCheck             │
│                 + ExternalApiHealthCheck (pings 6 upstreams)             │
│ WIDGETS         src/widgets/ (Next.js, 5 widget routes, see §7)          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Folder layout (final — create exactly this)

```text
src/
├── index.ts                        # bootstrap (exists)
├── app.module.ts                   # root @McpApp + @Module (rewrite imports)
├── config/
│   └── env.ts                      # typed env accessor (zod-validated process.env)
├── data/
│   ├── red-flag-rules.json         # triage ruleset (§2.1)
│   ├── symptom-condition-map.json  # symptom → candidate conditions
│   ├── lab-reference-ranges.json   # ~25 analytes (§2.3)
│   ├── lab-explanations.json       # patient-friendly test explanations
│   └── appointment-prep.json       # visit-prep checklists (§2.6)
├── gateway/
│   ├── index.ts                    # barrel export
│   ├── api-key.guard.ts
│   ├── scope.guard.ts
│   ├── emergency-detection.guard.ts
│   ├── clinical-safety.interceptor.ts
│   ├── audit-log.interceptor.ts
│   ├── timing.interceptor.ts
│   ├── clinical-exception.filter.ts
│   ├── trim.pipe.ts
│   ├── audit.store.ts              # JSONL writer + ring reader (last 50)
│   └── banned-phrases.ts           # overreach phrase table + replacements
├── integrations/
│   ├── http-client.service.ts
│   ├── rxnorm.service.ts
│   ├── openfda.service.ts
│   ├── pubmed.service.ts
│   ├── clinicaltrials.service.ts
│   ├── clinicaltables.service.ts
│   ├── fhir.service.ts
│   └── integrations.module.ts      # @Module({ providers, exports: all })
├── modules/
│   ├── triage/      triage.module.ts · triage.tools.ts · triage.service.ts
│   ├── drugs/       drugs.module.ts · drugs.tools.ts · drugs.service.ts
│   ├── diagnostics/ diagnostics.module.ts · diagnostics.tools.ts · diagnostics.service.ts
│   ├── research/    research.module.ts · research.tools.ts · research.service.ts
│   ├── fhir/        fhir.module.ts · fhir.tools.ts
│   ├── care/        care.module.ts · care.tools.ts · care.service.ts
│   └── core/        core.module.ts · core.resources.ts · core.prompts.ts
├── health/
│   ├── system.health.ts            # (exists)
│   └── external-api.health.ts      # pings all 6 upstreams
└── widgets/                        # (exists; add routes per §7)
    └── app/{calculator-result → keep as reference, add 5 new routes}
```

### 3.3 NitroStack decorator mapping

| Architecture piece | NitroStack construct |
|---|---|
| App bootstrap + server name/version | `@McpApp` on `AppModule` |
| Feature modules | `@Module({ controllers: [XTools], providers: [XService] })` |
| Tool definition | `@Tool({ name, description, inputSchema })` (Zod) |
| Auth | `ApiKeyModule.forRoot({ keysEnvPrefix: 'API_KEY', headerName: 'x-api-key' })` + custom `ApiKeyGuard` implements `Guard` |
| Scope authorization | `ScopeGuard` implements `Guard`, chained `@UseGuards(ApiKeyGuard, ScopeGuard)` |
| Emergency pre-check | `EmergencyDetectionGuard` — always returns `true` (never blocks), only annotates `context.emergency` |
| Safety post-processing | `ClinicalSafetyInterceptor implements InterceptorInterface` via `@UseInterceptors` |
| Audit | `AuditLogInterceptor implements InterceptorInterface` |
| Rate limiting | `@RateLimit({ requests, window, key: ctx => ctx.auth?.subject })` |
| Caching | `@Cache({ ttl, key })` per tool (values in §2) |
| Input normalization | `TrimPipe implements PipeInterface` via `@UsePipes` |
| Error mapping | `ClinicalExceptionFilter implements ExceptionFilterInterface` via `@UseFilters` |
| Health | `@HealthCheck` — `SystemHealthCheck` + `ExternalApiHealthCheck` |
| Widgets | `@Widget('route-name')` on tools listed in §7 |
| Lifecycle | `IntegrationsModule implements OnModuleInit` — warm caches, verify rulesets loaded, log upstream reachability |
| Events | `emitEvent('audit.entry', ...)` from audit interceptor; `AuditStore` `@OnEvent('audit.entry')` writes JSONL (decouples I/O from request path) |

### 3.4 Request lifecycle (one tool call, end to end)

1. Client sends `tools/call triage_assess_symptoms` with `x-api-key` header.
2. **Zod inputSchema validation** (framework) → 400-style MCP error if malformed.
3. **TrimPipe** normalizes strings.
4. **EmergencyDetectionGuard** scans `symptoms[]` joined text against red-flag term list →
   `context.emergency = { matched: [...] }` if hit. Returns `true` always.
5. **ApiKeyGuard** validates key → `context.auth = { subject, scopes }`. Rejects anonymous
   (401-style MCP error) unless `VITALIS_ALLOW_ANONYMOUS_DEMO=true` (read-scope only).
6. **ScopeGuard** verifies `triage:read` ∈ scopes.
7. **@RateLimit** sliding window per subject.
8. **Tool handler** runs; integrations layer makes any external calls (timeout + retry).
9. **ClinicalSafetyInterceptor** post-processes output: scans for banned phrases → rewrites;
   merges `context.emergency` into `_safety.red_flags_detected`; stamps urgency tier +
   disclaimer.
10. **AuditLogInterceptor** emits `audit.entry` event (async write).
11. **TimingInterceptor** adds `_meta.durationMs`.
12. Any throw anywhere → **ClinicalExceptionFilter** →
    `{ error: true, code: 'UPSTREAM_UNAVAILABLE'|'VALIDATION_ERROR'|'AUTH_DENIED'|..., message: <safe, no stack> }`.

---

## 4. Data Source Integration Plan

All endpoints below were **verified live** during planning. Base URLs and rate limits are
final; put base URLs in env vars so they can be overridden without code changes.

### 4.1 Source registry

| API | Base URL (env var) | Auth | Rate limit | Terms notes |
|---|---|---|---|---|
| **NLM RxNorm** | `https://rxnav.nlm.nih.gov/REST` (`RXNORM_BASE_URL`) | None | ~20 req/s/IP (undocumented; stay ≤ 5/s) | Free; attribute NLM |
| **NLM RxClass** | same host, `/rxclass/...` (`RXCLASS_BASE_URL`) | None | same | Free |
| **NLM Clinical Tables** | `https://clinicaltables.nlm.nih.gov/api` (`CLINTABLES_BASE_URL`) | None | Undocumented; stay ≤ 3/s | Free; ICD-10-CM search |
| **OpenFDA** | `https://api.fda.gov` (`OPENFDA_BASE_URL`) | Optional `api_key` param (`OPENFDA_API_KEY`) | **240 req/min, 120k/day with key**; 1000/day without | Get free key at open.fda.gov (5 min) |
| **NCBI E-utilities** | `https://eutils.ncbi.nlm.nih.gov/entrez/eutils` (`NCBI_BASE_URL`) | Optional `api_key` (`NCBI_API_KEY`) | **3 req/s anon, 10 req/s with key** | Must send `tool=vitalis&email=$NCBI_EMAIL` on every request |
| **ClinicalTrials.gov v2** | `https://clinicaltrials.gov/api/v2` (`TRIALS_BASE_URL`) | None | Undocumented; stay ≤ 3/s | Free |
| **HAPI FHIR R4 (primary)** | `https://hapi.fhir.org/baseR4` (`FHIR_BASE_URL`) | None | Public test server — be polite (≤ 2/s); data is periodically wiped | Synthetic Synthea patients only |
| **SMART Health IT R4 (fallback)** | `https://r4.smarthealthit.org` (`FHIR_BASE_URL_FALLBACK`) | None (open read) | Public sandbox | Synthetic patients |
| **WHO ICD-11 (optional upgrade)** | `https://id.who.int/icd` (`ICD_BASE_URL`) | **OAuth2 client credentials** — free registration at icd.who.int; token from `https://icdaccessmanagement.who.int/connect/token` | Tiered by registration | Only if registered before Day 1; otherwise skip (Clinical Tables covers ICD-10-CM) |

### 4.2 Endpoint → tool mapping (exact paths)

| Tool | HTTP call(s) |
|---|---|
| `drug_search` | `GET {RXNORM}/rxcui.json?name={q}` · fuzzy: `GET {RXNORM}/approximateTerm.json?term={q}&maxEntries=5` · classes: `GET {RXCLASS}/class/byRxcui.json?rxcui={id}` |
| `drug_get_label_info` | `GET {OPENFDA}/drug/label.json?search=openfda.generic_name:"{q}"&limit=1` → fallback `openfda.brand_name:"{q}"` |
| `drug_check_interactions` | RxNorm resolve per drug (as `drug_search`), then `drug/label.json` per drug, cross-scan `results[0].drug_interactions[]` text |
| `drug_get_adverse_events` | `GET {OPENFDA}/drug/event.json?search=patient.drug.openfda.generic_name:"{q}"&count=patient.reaction.reactionmeddrapt.exact` |
| `drug_get_recalls` | `GET {OPENFDA}/drug/enforcement.json?search=openfda.generic_name:"{q}"&limit=10` |
| `dx_lookup_condition` | `GET {CLINTABLES}/icd10cm/v3/search?terms={q}&maxList={n}&df=code,name` |
| `dx_symptom_to_codes` | same as `dx_lookup_condition` |
| `research_search_pubmed` | `GET {NCBI}/esearch.fcgi?db=pubmed&term={q}&retmode=json&retmax={n}&sort=relevance&tool=vitalis&email={e}[&api_key=]` then `GET {NCBI}/esummary.fcgi?db=pubmed&id={csv}&retmode=json&...` |
| `research_get_article` | `GET {NCBI}/efetch.fcgi?db=pubmed&id={pmid}&rettype=abstract&retmode=xml&...` + `esummary` for DOI |
| `research_summarize_evidence` | ESearch → single batched EFetch (`id=pmid1,pmid2,...`) |
| `research_search_trials` | `GET {TRIALS}/studies?query.cond={q}&filter.overallStatus={s}&filter.overallStatus=...&pageSize={n}&fields=NCTId,BriefTitle,OverallStatus,Phase,Condition,LeadSponsorName,StartDate,LocationCity,LocationCountry` |
| `research_get_trial_details` | `GET {TRIALS}/studies/{nctId}` |
| `care_find_guidelines` | ESearch with `term={q} AND "guideline"[pt]` → ESummary |
| `fhir_search_patients` | `GET {FHIR}/Patient?name={q}&gender={g}&birthdate={d}&_count={n}` |
| `fhir_get_patient` | `GET {FHIR}/Patient/{id}` |
| `fhir_get_conditions` | `GET {FHIR}/Condition?patient={id}&clinical-status={s}` |
| `fhir_get_medications` | `GET {FHIR}/MedicationRequest?patient={id}&status={s}` |
| `fhir_get_observations` | `GET {FHIR}/Observation?patient={id}&category={c}&code={loinc}&_count={n}&_sort=-date` |
| `fhir_get_encounters` | `GET {FHIR}/Encounter?patient={id}&_count={n}&_sort=-date` |

### 4.3 HttpClientService contract (all integrations inherit)

- **Timeout:** 8 s per attempt, hard cap 20 s per tool call.
- **Retry:** max 2 retries, exponential backoff 250 ms → 1 s → 4 s, only on network errors / 429 / 5xx. Never retry 4xx (except 429).
- **Concurrency cap:** per-host semaphore (RxNorm 4, OpenFDA 4, NCBI 2, Trials 2, FHIR 2).
- **Response cap:** 1 MB parsed JSON; larger → typed `UpstreamError` (amended from "truncate", see §10).
- **Headers:** `User-Agent: vitalis-mcp/1.0 (hackathon; contact: $CONTACT_EMAIL)`.
- **Cache integration:** integration services are cache-unaware; caching lives at tool layer via `@Cache` (keeps invalidation reasoning in one place).
- **Observability:** every outbound call logged `{ api, endpoint (query params redacted of free text), status, latency_ms, cache: n/a }` and attached to the audit record.

---

## 5. Security & Compliance Plan

### 5.1 Authentication

**Primary: API keys** via `ApiKeyModule.forRoot({ keysEnvPrefix: 'API_KEY', headerName: 'x-api-key', hashed: false })`.
Keys are issued as env vars with an associated scope set in a sidecar map:

```env
API_KEY_CLINICIAN=vk_live_clinician_demo_key_01   # full read/write scopes
API_KEY_READONLY=vk_live_readonly_demo_key_02     # read scopes only
API_KEY_ADMIN=vk_live_admin_demo_key_03           # all scopes + admin:audit
```

`src/config/api-keys.ts` maps `API_KEY_CLINICIAN → scopes[triage:read, drugs:read, dx:read, research:read, fhir:read, care:read, care:write]`,
`API_KEY_READONLY → [triage:read, drugs:read, dx:read, research:read, fhir:read]`,
`API_KEY_ADMIN → [*]`.

**Upgrade path: OAuth 2.1 / JWT** — `JWTModule.forRoot({ secret: process.env.JWT_SECRET })` is
registered on Day 2 if time permits; `JWTGuard` runs **before** `ApiKeyGuard` in
`@UseGuards(JWTGuard, ApiKeyGuard, ScopeGuard)` and either may satisfy auth (documented as
resource-server pattern: MCP server validates Bearer tokens issued by an external IdP).
For the hackathon this is a **stretch goal (§13)** — API keys are the demo path.

### 5.2 Authorization scopes per tool

| Scope | Tools |
|---|---|
| `triage:read` | `triage_assess_symptoms`, `triage_check_red_flags`, `triage_get_care_options` |
| `drugs:read` | `drug_search`, `drug_get_label_info`, `drug_check_interactions`, `drug_get_adverse_events`, `drug_get_recalls` |
| `dx:read` | `dx_lookup_condition`, `dx_interpret_lab_value`, `dx_explain_lab_test`, `dx_symptom_to_codes` |
| `research:read` | all 5 `research_*` |
| `fhir:read` | all 7 `fhir_*` |
| `care:read` | `care_generate_handoff`, `care_find_guidelines`, `care_appointment_prep` |
| `care:write` | `care_reconcile_medications`, `care_draft_referral` (state-changing-ish: drafts & comparisons) |
| `admin:audit` | resource `vitalis://audit/recent` |

Enforcement: `@UseGuards(ApiKeyGuard, ScopeGuard)` with required scope declared per tool as
`@SetMetadata('requiredScope', 'drugs:read')` (or a static map in `ScopeGuard` keyed by
`context.toolName` — simpler: one static `Record<string, string>` in `scope.guard.ts`).

### 5.3 Audit logging schema (`logs/audit.jsonl`, one JSON object per line)

```json
{
  "ts": "2026-07-31T12:00:00.000Z",
  "request_id": "uuidv4",
  "tool": "drug_check_interactions",
  "subject": "apikey_vk_live_cl",
  "scopes": ["drugs:read"],
  "input_summary": { "drugs": ["warfarin", "aspirin"] },
  "input_hash": "sha256(canonical-json)",
  "emergency_detected": false,
  "urgency_tier": "not_applicable",
  "cache_hit": false,
  "external_calls": [{ "api": "openfda", "path": "/drug/label.json", "status": 200, "latency_ms": 182 }],
  "latency_ms": 940,
  "status": "ok | error",
  "error_code": null
}
```

Rules: **never log raw free-text symptom descriptions verbatim beyond 80 chars**, never log
API keys, rotate by keeping last 5 000 lines (ring trim on startup). Read access only via
`vitalis://audit/recent` (admin scope).

### 5.4 Rate limiting thresholds

| Tier / tool | Limit | Key |
|---|---|---|
| Default per-key | `60 req / 1m` | `ctx.auth.subject` |
| `research_*` (upstream politeness) | `10 req / 1m` | subject |
| `drug_check_interactions` (fan-out heavy) | `10 req / 1m` | subject |
| `fhir_*` (public server politeness) | `20 req / 1m` | subject |
| `triage_*`, `dx_interpret_lab_value` (local compute) | `120 req / 1m` | subject |
| Anonymous demo mode (if enabled) | `15 req / 1m`, read scopes only | client id / IP-ish subject |

### 5.5 Input validation rules (global Zod policy)

- All free-text: `.trim()`, `.min(2)`, `.max(200)` (symptoms array items `.max(80)`); reject control chars via `.regex(/^[\x20-\x7E\u00C0-\u024F\s]*$/)`.
- All arrays capped (see schemas §2) to prevent fan-out abuse (`drugs` max 5, `symptoms` max 20, med lists max 50).
- IDs validated by regex: PMID `^\d{1,9}$`, NCT `^NCT\d{8}$`, FHIR id `^[A-Za-z0-9\-\.]{1,64}$`.
- Enums everywhere a fixed set exists (no free-form status/phase/section strings).
- Numbers: age `0–120`, severity `1–10`, limits `1–50`.
- No file-upload tools in v1 (existing `convert_temperature` from the starter is **removed**).

### 5.6 "Why this is safe without real PHI" — judge-ready explanation

> 1. **Zero PHI by construction.** The only patient data is from public Synthea-generated
>    synthetic patients on the HAPI public test server — fictional people, publicly hosted.
>    The server never accepts, stores, or transmits real patient identifiers.
> 2. **Read-only posture.** Vitalis issues no writes to any external system; all tools are
>    queries or local computations. `care_draft_referral` produces text, not a transaction.
> 3. **Defense in depth anyway:** API-key auth, per-scope authorization, rate limits, audit
>    logging, and input validation are implemented exactly as they would need to be in a
>    real deployment — demonstrating the team knows what production would require.
> 4. **Clinical safety, not just data safety:** the middleware layer prevents the *model*
>    from overreaching (§6), which is the actual risk in LLM health tools.
> 5. **Honest labeling:** every FHIR response carries `synthetic_data: true`; every clinical
>    response carries a disclaimer; upstream data-quality caveats (e.g. FAERS reporting
>    bias) are surfaced in output fields, not hidden.

---

## 6. Clinical Safety Design

### 6.1 The three-layer safety system

```
Layer 1  PRE-CHECK    EmergencyDetectionGuard (guard)
                      scans raw input for emergency terms → annotates context
Layer 2  COMPUTE      tool handlers (rule-based triage; no LLM free-style on urgency)
Layer 3  POST-CHECK   ClinicalSafetyInterceptor (interceptor)
                      rewrites overreach language, stamps _safety envelope,
                      escalates urgency if Layer 1 matched
```

### 6.2 `EmergencyDetectionGuard` logic

- Term list in `src/data/red-flag-rules.json` (`emergency_terms` array): `chest pain`,
  `crushing chest`, `can't breathe`, `cannot breathe`, `difficulty breathing`, `not breathing`,
  `stroke`, `face drooping`, `slurred speech`, `unconscious`, `unresponsive`, `seizure`,
  `overdose`, `poisoning`, `suicidal`, `want to die`, `kill myself`, `severe bleeding`,
  `coughing blood`, `vomiting blood`, `anaphylaxis`, `throat closing`, `blue lips`.
- Matching: lowercase, word-boundary regex, applied to joined symptom strings + `reason`
  fields. **Never blocks** — returns `true` and sets
  `context.emergency = { matched_terms: [...] }`.
- Rationale: a guard that *denied* emergency queries would be a safety failure itself.

### 6.3 `ClinicalSafetyInterceptor` logic

On every clinical tool output (`triage_*`, `dx_*`, `drugs_*`, `care_*`):

1. **Overreach rewrite** — `src/gateway/banned-phrases.ts` table, applied to all string
   fields recursively:

| Banned pattern (regex, case-insens.) | Replacement |
|---|---|
| `you have (\w+)` | `your symptoms may be associated with $1` |
| `you are diagnosed with` | `discuss the possibility of` |
| `this (is|means you have)` | `this could indicate` |
| `definitely|diagnosed|diagnosis confirmed` | flagged → sentence removed, replaced with "Consult a qualified clinician for evaluation." |
| `you should take (\d+\s?mg)` (prescriptive dosing) | `dosing must be confirmed by a clinician or pharmacist` |

2. **Urgency escalation** — if `context.emergency.matched_terms.length > 0` and tool tier is
   lower than `emergency`: override `_safety.urgency_tier = 'emergency'`, prepend
   `⚠️ EMERGENCY GUIDANCE` block: "If this is happening now, call emergency services
   (911/112/108) immediately."
3. **Disclaimer injection** — `_safety.disclaimer` always present; triage/dx tools get the
   long form, drugs/research get the short form.
4. **Synthetic-data stamp** on all `fhir_*` / `care_*` outputs.

### 6.4 Urgency tier system

| Tier | Definition | Timeframe guidance | Visual (widget) |
|---|---|---|---|
| `emergency` | Red-flag symptom matched | Call emergency services now | Red badge, pulsing |
| `urgent` | Needs clinician today (e.g. high fever 3+ days, worsening pain) | Same-day care / urgent care | Orange badge |
| `routine` | Should be evaluated, not time-critical | Book appointment within days | Yellow badge |
| `self_care` | Mild, self-limiting (common cold etc.) | Home care + what to watch for | Green badge |
| `not_applicable` | Non-clinical tool (research, FHIR, etc.) | — | Grey |

Triage scoring: rule weights in `red-flag-rules.json` — any `emergency` rule → emergency;
≥ 2 `moderate` rules or severity ≥ 7 or duration ≥ 72 h with moderate symptoms → urgent;
single mild rule → routine; else self_care. **Fail-safe: any ruleset error → `urgent`.**

### 6.5 Escalation logic

```
input → emergency term matched?            → YES → urgency=emergency, EMERGENCY block, disclaimer
      → triage engine tier                 → emergency|urgent|routine|self_care
      → user reports worsening in follow-up → guidance includes explicit escalation criteria
                                              ("seek urgent care if: fever > 39.4°C, ...")
```

`care_draft_referral` with `urgency: 'urgent'` adds a banner: "Marked urgent — requires
same-day clinician review."

### 6.6 Safety test hooks (for judges)

`VITALIS_SAFETY_LAYER=off` env flag disables Layer 3 (never Layer 1) so the demo can show
the same query with and without safety rewriting. Default `on`; `off` prints a loud boot
warning. (Also listed as test-only in README.)

---

## 7. Widget / UX Plan

Stack: `src/widgets/` Next.js app (already scaffolded). Widgets use
`@nitrostack/widgets` hooks: `useWidgetSDK()` → `getToolOutput`, `useTheme`,
`useWidgetState`, `callTool`, `sendFollowUpMessage`, `requestFullscreen`. All widgets:
dark/light via `useTheme`, inline styles (no CSS deps), max width ~640 px, rounded cards,
matching the existing `calculator-result` aesthetic. Register every widget in
`src/widgets/widget-manifest.json`.

| # | Route (`@Widget`) | Bound tool(s) | Visual components | SDK features used |
|---|---|---|---|---|
| W1 | `triage-result` | `triage_assess_symptoms` | Urgency badge (color-coded per tier, pulse for emergency), red-flag chips, candidate-condition table (name, likelihood band, ICD-10), guidance card, follow-up questions list | `getToolOutput`, `useTheme`, `useWidgetState` (compact/detailed toggle), `sendFollowUpMessage`("Book me a prep checklist for this") |
| W2 | `drug-safety-report` | `drug_check_interactions` | N×N interaction matrix grid, severity badges (red/amber/yellow/green), expandable evidence excerpts from FDA labels, "no FDA label" note chips | `getToolOutput`, `useWidgetState` (expanded pair), `callTool('drug_get_label_info')` drill-down button per drug |
| W3 | `lab-result-card` | `dx_interpret_lab_value` | Horizontal reference-range bar with marker positioned at value (low/normal/high zones colored), flag badge, possible-causes list | `getToolOutput`, `useTheme` |
| W4 | `trial-list` | `research_search_trials` | Trial cards: status chip (RECRUITING green), phase badge, sponsor, locations, "View on ClinicalTrials.gov" link-out | `getToolOutput`, `openExternal(nctUrl)`, `useWidgetState` (filter recruiting-only toggle) |
| W5 | `patient-summary` ⭐ flagship | `fhir_get_patient_summary` | Header card (name, age, gender, MRN + SYNTHETIC banner), active conditions table, active medications table, recent vitals mini-table with flags, encounters timeline (vertical) | `getToolOutput`, `useWidgetState` (tab: conditions/meds/vitals/encounters), `callTool('care_generate_handoff')` button, `requestFullscreen` |
| W6 | `med-reconciliation` | `care_reconcile_medications` | Three-column diff (Added / Removed / Continued) + duplicate-warning row | `getToolOutput`, `useTheme` |

**Widget build order:** W5 → W1 → W2 → W4 → W3 → W6 (flagship first; W3/W6 are 30-min
widgets if time is short). Keep `calculator-result` as reference during dev; delete before
submission.

**Manifest:** each entry gets 2–3 realistic `examples` (copy demo-script payloads from §11)
so NitroStudio previews render without a live call.

---

## 8. Testing Plan

Stack: **Vitest** (fast, native ESM, zero-config TS) + recorded fixtures. Add
`vitest` as devDependency; script: `"test": "vitest run"`, `"test:live": "LIVE_API_TESTS=true vitest run tests/live"`.

### 8.1 Test layout

```text
tests/
├── unit/
│   ├── triage.engine.test.ts          # §8.3 — safety-critical
│   ├── lab.interpreter.test.ts        # §8.3 — safety-critical
│   ├── banned-phrases.test.ts         # safety rewriter
│   ├── interaction-severity.test.ts   # DDI severity heuristic
│   ├── med-reconciliation.test.ts     # diff logic
│   ├── scope.guard.test.ts            # scope matrix enforcement
│   └── trim.pipe.test.ts
├── integration/                       # mocked fetch (recorded fixtures)
│   ├── fixtures/  rxnorm/*.json  openfda/*.json  pubmed/*.xml  trials/*.json  fhir/*.json
│   ├── drugs.tools.test.ts
│   ├── research.tools.test.ts
│   ├── fhir.tools.test.ts             # incl. failover to FHIR_BASE_URL_FALLBACK
│   └── pipeline.test.ts               # guard→tool→interceptor→filter chain, in-memory
└── live/                              # real APIs, opt-in only (LIVE_API_TESTS=true)
    └── smoke.test.ts                  # 1 call per upstream, assert shape not content
```

### 8.2 Mocking strategy for CI

- Record real responses **once** during dev (`tests/integration/fixtures/`), via a
  `scripts/record-fixtures.ts` that hits each endpoint from §4.2 and saves the payload.
- Integration tests stub `global.fetch` with a fixture router keyed on URL prefix;
  assert both correct URL construction and output mapping.
- Live tests assert *shape only* (`expect(body.idGroup.rxnormId).toBeArray()`), never
  exact values — upstream data changes. They are excluded from default `npm test`.

### 8.3 Safety-critical paths — 100% branch coverage required

| Path | Cases (all must exist) |
|---|---|
| Triage urgency | Every red-flag rule fires → `emergency`; 2 moderate rules → `urgent`; severity ≥ 7 → `urgent`; duration ≥ 72 h moderate → `urgent`; mild single → `routine`; unmatched mild → `self_care`; **engine throw → `urgent` (fail-safe)** |
| Red-flag screen | Each emergency term in §6.2 individually detected; benign input → `is_emergency: false`; **engine throw → `is_emergency: true`** |
| Emergency escalation | Interceptor overrides `routine`→`emergency` when `context.emergency` set; EMERGENCY block prepended |
| Banned-phrase rewriter | Every row of §6.3 table rewritten; benign text untouched; nested objects/arrays traversed |
| DDI severity heuristic | `contraindicated` text → contraindicated band; `avoid combining` → major; `monitor` → moderate; neutral → minor; missing label → listed in `drugs_without_labels` |
| Lab interpreter | Below/within/above range; critical thresholds (glucose < 54 or > 400, potassium < 2.5 or > 6.5, sodium < 120 or > 160); unknown analyte; unit conversion (mg/dL ↔ mmol/L glucose) |
| Auth pipeline | No key → denied; wrong scope → denied; correct scope → allowed; admin → audit resource |

### 8.4 Coverage targets & gates

- Overall ≥ 70% lines; `src/modules/triage`, `src/gateway` = 100% branches.
- `npm run build` and `npm test` must both pass before every deploy (enforced in CI §9.3).

---

## 9. Deployment Plan

### 9.1 Environment variables (complete list — `.env.example` must contain all)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | yes | `development` | `production` → dual transport |
| `MCP_TRANSPORT_TYPE` | no | stdio dev / dual prod | `stdio\|http\|dual` |
| `PORT` / `HOST` | prod | `3000` / `0.0.0.0` | HTTP transport bind |
| `NITRO_LOG_LEVEL` | no | `info` | log verbosity |
| `API_KEY_CLINICIAN` / `API_KEY_READONLY` / `API_KEY_ADMIN` | yes | — | demo keys (§5.1) |
| `VITALIS_ALLOW_ANONYMOUS_DEMO` | no | `false` | read-only anonymous access for judges |
| `JWT_SECRET` | stretch | — | OAuth 2.1/JWT upgrade |
| `RXNORM_BASE_URL` / `RXCLASS_BASE_URL` | yes | live values §4.1 | upstreams |
| `CLINTABLES_BASE_URL` | yes | §4.1 | ICD-10-CM |
| `OPENFDA_BASE_URL` / `OPENFDA_API_KEY` | yes / recommended | §4.1 | 240 req/min with key |
| `NCBI_BASE_URL` / `NCBI_API_KEY` / `NCBI_EMAIL` | yes / rec / yes | §4.1 | NCBI etiquette policy |
| `TRIALS_BASE_URL` | yes | §4.1 | ClinicalTrials.gov |
| `FHIR_BASE_URL` / `FHIR_BASE_URL_FALLBACK` | yes | §4.1 | synthetic patients |
| `ICD_CLIENT_ID` / `ICD_CLIENT_SECRET` / `ICD_BASE_URL` | optional | — | WHO ICD-11 upgrade |
| `VITALIS_SAFETY_LAYER` | no | `on` | `off` = demo comparison mode |
| `AUDIT_LOG_PATH` | no | `logs/audit.jsonl` | audit store |
| `CONTACT_EMAIL` | yes | — | User-Agent / NCBI contact |

### 9.2 Hosting target

| | Primary | Fallback |
|---|---|---|
| Host | **NitroCloud** (native NitroStack deploy) | **Railway / Render / Fly.io** — single Node service, `npm ci && npm run build && npm run start:prod` |
| Endpoint | public HTTPS URL, MCP over HTTP+SSE | same |
| Judges connect via | NitroStudio / Claude Desktop pointed at the URL + `x-api-key` header | same |

### 9.3 CI/CD (GitHub Actions, `.github/workflows/ci.yml`)

- **On every push:** install → `tsc --noEmit` typecheck → `vitest run` (unit + mocked integration) → `npm run build`.
- **On tag `v*`:** all of the above → deploy (NitroCloud CLI or platform Git integration).
- Cache `~/.npm`; fail fast on typecheck.

### 9.4 Health checks & monitoring

- `SystemHealthCheck` (exists — memory/uptime) + new `ExternalApiHealthCheck` (`@HealthCheck({ name: 'upstreams', interval: 60 })`) HEAD-pings all 6 upstreams with 3 s timeout, reports per-API up/down + latency; status `degraded` if any optional API down, `down` only if ≥ 3 down.
- In-memory metrics counters (requests, errors, cache hit ratio, per-tool latency p50/p95) exposed via `vitalis://audit/recent`-style admin resource `vitalis://metrics`.
- Logs: structured JSON via `ctx.logger`; audit trail per §5.3.

### 9.5 Rollback plan

1. Every deploy = git tag (`v1.0.0-demo`, …). Rollback = redeploy previous tag.
2. Feature flags via env (`VITALIS_SAFETY_LAYER`, anonymous mode) — no redeploy needed to soften behavior during judging.
3. If NitroCloud fails at demo time → `MCP_TRANSPORT_TYPE=stdio` local run as last resort (demo script §11 works identically).
4. Fixtures from §8.2 double as a **degraded-demo mode**: if an upstream dies mid-demo, note it and the cached/fixture responses keep tools alive (cache TTLs §2 are deliberately long).

---

## 10. Hour-by-Hour 2-Day Build Schedule

Assumes 9:00–21:00 both days with breaks. **Done = the listed checkable criterion.**
If a block overruns > 45 min, cut the block's "nice" item, never its "done" criterion.

### Day 1 — Foundation + Data Modules

| Block | Tasks | Done when |
|---|---|---|
| **09:00–10:00** Scaffold ✅ DONE (`bb05e94`) | Delete calculator/temperature starter code; create folder tree §3.2; typed env accessor with Zod; CI workflow; `.env.example` complete | `npm run build` green with empty modules; CI runs |
| **10:00–11:00** Integrations core ✅ DONE | `HttpClientService` (timeout/retry/concurrency/caps) + unit tests for retry logic | Retry/backoff test passes; service injectable |

> ✅ **Done** — 12/12 tests pass (`tests/unit/http-client.test.ts`). **Amendment to §4.3:** the 1 MB response cap throws typed `UpstreamError('RESPONSE_TOO_LARGE')` instead of truncating — truncated JSON is unparseable and would corrupt tool outputs; the typed error maps cleanly through the exception filter. Also: `Retry-After` header honored (capped 5s); backoff has ±25% jitter.
| **11:00–13:00** Drugs module ✅ DONE | `RxNormService`, `OpenFdaService`; tools 2.1–2.5; record fixtures | All 5 drug tools return live data in NitroStudio; fixtures saved |

> ✅ **Done** — 5 tools registered (`drugs_search`, `drugs_get_label_info`, `drugs_check_interactions`, `drug_get_adverse_events`→`drugs_get_adverse_events`, `drugs_get_recalls`); live smoke (`scripts/smoke-drugs.mjs`) all green; 7 fixtures recorded; 27 unit tests pass. **Amendments:** (1) DDI evidence scans `warnings`/`boxed_warning`/`contraindications`/`ask_doctor_or_pharmacist` in addition to `drug_interactions` — OTC labels have no `drug_interactions` section; (2) severity heuristic adds bleeding-risk patterns → `major`; (3) excerpts are severity-ranked before capping; (4) §2.2 cache key for 2.3 must compute sorted-join (a literal-string bug was caught by smoke DEBUG logs).
| **13:00–14:00** Lunch + API keys | Register OpenFDA key, NCBI key (async approval possible — do it now) | Keys in `.env` |
| **14:00–15:30** Research module | `PubMedService` (ESearch/ESummary/EFetch XML parse), `ClinicalTrialsService`; tools 4.1–4.5 + 6.4 | PubMed + trials tools return live data |
| **15:30–17:30** Triage engine + rulesets | `red-flag-rules.json` (30 rules), `symptom-condition-map.json`; `TriageService`; tools 1.1–1.3 | §8.3 triage unit tests pass (write tests *with* engine) |
| **17:30–19:00** Gateway safety layer | `EmergencyDetectionGuard`, `ClinicalSafetyInterceptor`, banned-phrases table, exception filter | Overreach-rewrite + escalation tests pass; toggling `VITALIS_SAFETY_LAYER` visibly changes output |
| **19:00–20:00** Auth + audit | `ApiKeyModule`, `ApiKeyGuard`, `ScopeGuard`, `AuditLogInterceptor` + store, scope matrix | Wrong-scope call denied; `audit.jsonl` records entries |
| **20:00–21:00** Day-1 integration review | Wire all modules into `AppModule`; fix DI; rate limits on; commit + tag `v0.5.0-day1` | All Day-1 tools callable with auth; tagged commit |

### Day 2 — Clinical Modules, Widgets, Ship

| Block | Tasks | Done when |
|---|---|---|
| **09:00–10:30** FHIR module | `FhirService` with failover; tools 5.1–5.7 | `fhir_get_patient_summary` returns aggregated bundle for a real Synthea patient; failover test passes |
| **10:30–11:30** Care module | Tools 6.1–6.3, 6.5 (SBAR, reconciliation, referral, prep); `appointment-prep.json` | Handoff + reconciliation work end-to-end from FHIR data |
| **11:30–12:30** Diagnostics module | Lab ranges JSON (25 analytes), explanations JSON; tools 3.1–3.4 | §8.3 lab tests pass; ICD lookup live |
| **12:30–13:30** Lunch + core resources/prompts | `vitalis://` resources (safety policy, data sources, audit), 3 prompts | Resources readable in NitroStudio |
| **13:30–15:30** Widgets W5 + W1 | `patient-summary` ⭐ then `triage-result`; manifest entries + examples | Both render in NitroStudio from real tool calls |
| **15:30–17:00** Widgets W2 + W4 | `drug-safety-report`, `trial-list` | Render + `callTool` drill-down works |
| **17:00–17:30** Widgets W3 + W6 (timeboxed) | `lab-result-card`, `med-reconciliation` — cut W6 if late | Render from example payloads |
| **17:30–18:30** Testing sweep | Fill §8.3 gaps; live smoke test; coverage check | `npm test` green; coverage ≥ targets |
| **18:30–19:30** Deploy | Prod env vars, NitroCloud deploy, verify public endpoint with NitroStudio remote; fallback platform if blocked | Public URL answers an authenticated call |
| **19:30–20:30** Demo rehearsal ×2 | Run §11 script twice, timed ≤ 8 min; fix friction; record backup video | Two clean end-to-end runs |
| **20:30–21:00** README + submission | Write README per §14 outline; final tag `v1.0.0`; submit | Submission posted with repo + URL + video |

**Hard scope fences:** OAuth 2.1/JWT (§13), WHO ICD-11, extra widgets — only after
`v1.0.0` tag. Scope creep goes to §13 list, never into in-progress blocks.

---

## 11. Demo Script — "One Patient, Six Modules" (≤ 8 minutes)

**Persona:** Dr. Rivera, a physician using NitroStudio connected to the deployed Vitalis
endpoint. **Patient:** "Alex Morgan" — a Synthea synthetic patient on the public HAPI
server (pick the actual patient ID during rehearsal; choose one with T2 diabetes,
warfarin/metformin-like meds, vitals, and encounters — verify during Day 2 09:00 block).

### Scene 1 — Hook (60 s)

> **Say:** "Most health AI demos are a chatbot with a disclaimer. Vitalis is infrastructure:
> one MCP server that gives any LLM safe, audited access to real clinical data sources.
> Everything you're about to see is live — RxNorm, the FDA, PubMed, ClinicalTrials.gov, and a
> FHIR server. And every patient is synthetic — zero PHI."

**Type (NitroStudio chat):** `Search for a patient named Alex Morgan and show me their clinical summary.`
→ `fhir_search_patients` → `fhir_get_patient_summary` → **W5 widget appears.**
> **Say:** "FHIR R4 — the actual healthcare interoperability standard — aggregated from five
> resource types into one view. Note the SYNTHETIC banner: honesty is built into the schema."

### Scene 2 — Triage with the safety moment (90 s)

**Type:** `Alex reports fatigue and occasional dizziness for the past 3 days. Assess urgency.`
→ `triage_assess_symptoms` → **W1 widget**: yellow `routine`/`urgent` badge, guidance, follow-ups.

**Type:** `Now he's having crushing chest pain radiating to his left arm.`
→ same tool → **W1 turns red**, `EMERGENCY` block on top.
> **Say:** "The model didn't decide that. A middleware guard detected the red flag, an
> interceptor escalated the output, and the disclaimer and urgency tier were stamped
> automatically. Safety is enforced by the framework — a tool can't forget it."

### Scene 3 — Drug safety (90 s)

**Type:** `Alex is on warfarin. He wants to take OTC aspirin for a headache. Check for interactions.`
→ `drug_check_interactions` → **W2 widget**: warfarin×aspirin cell red, `major`/`contraindicated`
badge, FDA-label evidence excerpt.
> **Say:** "This cross-scans real FDA drug labels — the same labels pharmacists read — because
> NLM retired its interaction API. The evidence excerpt is shown, not just a verdict."

**Type:** `What adverse events are reported for metformin?` → `drug_get_adverse_events` →
top-reactions table + FAERS reporting-bias caveat.

### Scene 4 — Diagnostics support (60 s)

**Type:** `His HbA1c came back at 8.2%. Interpret that.`
→ `dx_interpret_lab_value` → **W3 widget**: range bar, marker in red zone, `high` flag.
> **Say:** "Rule-based reference ranges — deterministic, auditable, and it will never
> hallucinate a threshold. It suggests possible causes; it never diagnoses."

### Scene 5 — Research (60 s)

**Type:** `Any recruiting clinical trials for type 2 diabetes? And recent guidelines?`
→ `research_search_trials` → **W4 cards** (RECRUITING chips, phase badges, link-outs);
→ `care_find_guidelines` → PubMed guideline list.
> **Say:** "Live ClinicalTrials.gov and PubMed. A care coordinator could act on this today."

### Scene 6 — Care coordination (60 s)

**Type:** `Reconcile his FHIR medication list against what he reports taking: metformin, warfarin, and ibuprofen.`
→ `care_reconcile_medications` → **W6 three-column diff**, ibuprofen flagged as added/duplicate-risk.

**Type:** `Draft an endocrinology referral and generate an SBAR handoff.`
→ `care_draft_referral` + `care_generate_handoff` → structured draft, `requires_clinician_review: true`.

### Scene 7 — Production proof (60 s)

- Open `vitalis://audit/recent` resource → **every call in this demo is logged** with subject,
  latency, and upstream calls.
- Call any tool with the read-only key → works; with a bad key → clean `AUTH_DENIED`.
- Health check shows system + all six upstreams.
> **Say:** "Auth, scopes, rate limits, audit trail, health checks, and a public endpoint.
> Not a toy — a pattern a hospital IT team could actually evaluate."
> **Closer:** "Vitalis: clinical intelligence with the safety rails built in, not bolted on."

**Backup plan:** pre-recorded video of this exact script (recorded Day 2 19:30 block);
if the venue network dies, play the video and narrate.

---

## 12. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Upstream API rate-limited/down during live demo | Medium | High | Long cache TTLs (§2) + recorded fixtures as degraded mode + failover FHIR URL + backup video (§11) |
| R2 | Auth complexity eats Day 1 | Medium | Medium | API keys first-class; JWT/OAuth demoted to stretch (§13); guards have unit tests from the start |
| R3 | Scope creep (6 modules × 25 tools) | High | High | Hard fences in §10; stretch list §13 is the only overflow valve; block overruns cut "nice" items, never "done" criteria |
| R4 | HAPI public server data wiped / patient missing | Medium | Medium | Re-pick demo patient each morning; `FHIR_BASE_URL_FALLBACK` configured; fixture for demo patient recorded Day 2 morning |
| R5 | Synthea patient lacks rich data (no meds/vitals) | Medium | Medium | Demo-patient selection checklist in §11 verified at 09:00 Day 2; fall back to second pre-vetted patient |
| R6 | Widget debugging burns widget block | Medium | Medium | Widgets render from manifest `examples` first (no live call needed); build order puts flagship first; W3/W6 cuttable |
| R7 | NCBI key not approved in time | Low | Low | Anonymous tier (3 req/s) + client-side rate limiting already designed for it; register Day 1 lunch |
| R8 | NitroCloud deploy friction | Medium | High | Fallback platform pre-rehearsed (Railway); stdio local mode as last resort; deploy attempt starts 18:30 sharp |
| R9 | Safety layer has a bug that shows wrong urgency in demo | Low | Critical | §8.3 100% branch coverage on triage/escalation; demo queries rehearsed twice; fail-safe defaults bias toward *more* caution |
| R10 | Time lost to environment/toolchain issues | Medium | Low | Scaffold + CI first block of Day 1; lockfile committed; no dependency additions after Day 1 lunch without team sign-off |

---

## 13. Stretch Goals (ranked — only after `v1.0.0` tag)

| Rank | Feature | Why it raises the ceiling | Cost |
|---|---|---|---|
| S1 | **OAuth 2.1 / JWT** resource-server mode (JWTModule + JWTGuard) | Real enterprise auth story for judges | 2–3 h |
| S2 | **AllergyIntolerance + Immunization FHIR tools** | Completes the clinical picture in W5 | 1 h |
| S3 | **WHO ICD-11** integration behind `ICD_CLIENT_ID` | Standards breadth (ICD-11 vs ICD-10-CM) | 1.5 h |
| S4 | **`drug_search` autocomplete resource** for client UIs | Polish; shows resource templates | 45 min |
| S5 | **Vitals sparkline charts** in W5 (observation history series) | Visual wow | 1 h |
| S6 | **Multi-language disclaimer** (EN/ES/HI) | Inclusion points | 30 min |
| S7 | **Prompt library expansion** (discharge summary, medication counseling) | Shows prompt-engineering depth | 45 min |
| S8 | **Metrics dashboard widget** (from `vitalis://metrics`) | Observability theater for judges | 1 h |

Cut from consideration entirely (out of scope): user accounts/persistence, real EHR write
back, telehealth scheduling, image/lab-file upload analysis.

---

## 14. README Outline (final submission document)

1. **Title + tagline + badges** (build passing, license, Node version).
2. **30-second pitch** — §1 one-liner + differentiation table (condensed).
3. **Demo** — public MCP endpoint URL, demo API key (read-only), link to video, 3
   copy-paste example queries.
4. **Architecture** — §3.1 diagram (as image or ASCII), folder map, decorator table.
5. **Module & API reference** — table of all 25 tools with one-line descriptions
   (generated from §2), resources, prompts.
6. **Data sources** — §4.1 table + attribution notices (NLM, FDA, NCBI, ClinicalTrials.gov,
   HAPI/Synthea) with links and ToS thanks.
7. **Security** — auth model, scopes, rate limits, audit schema (§5 condensed).
8. **Clinical safety design** — §6 three-layer diagram + urgency tiers + disclaimer policy.
9. **Setup** — prerequisites, `npm install`, `.env` table (§9.1), `npm run dev`,
   connecting from NitroStudio & Claude Desktop (config JSON snippet).
10. **Testing** — how to run unit/integration/live; coverage summary.
11. **Deployment** — how it's hosted, CI/CD, rollback.
12. **Limitations & responsible-use disclaimer** — prominent: not a medical device, not for
    diagnosis/treatment, synthetic data only, upstream data caveats (FAERS, label-text
    heuristics), emergency guidance wording.
13. **Roadmap** — §13 items as "future work".
14. **Team, license, acknowledgements.**

---

## 15. Consolidated Submission Checklist

**Code**
- [ ] 6 modules, 25 tools implemented per §2 schemas
- [ ] Gateway layer: 2 guards + safety/audit/timing interceptors + exception filter + trim pipe
- [ ] 5 integration services + HttpClientService (timeout/retry/caps)
- [ ] 3 resources + 3 prompts (§2.7)
- [ ] 6 widgets (W5, W1, W2, W4 mandatory; W3, W6 timeboxed) + manifest examples
- [ ] 2 health checks (system + upstreams)
- [ ] Calculator starter code removed

**Data & tests**
- [ ] 5 embedded rulesets (`src/data/*.json`) — 30 red-flag rules, 25 lab analytes minimum
- [ ] §8.3 safety-critical tests at 100% branch coverage; overall ≥ 70%
- [ ] Fixtures recorded for all upstreams; live smoke test passes

**Security**
- [ ] 3 API keys + scope matrix enforced and tested
- [ ] Rate limits active per §5.4
- [ ] `audit.jsonl` writing; `vitalis://audit/recent` admin-only
- [ ] `.env.example` complete (§9.1); no secrets committed

**Deploy & docs**
- [ ] Public endpoint live; judges' read-only key works from a clean client
- [ ] CI green on `main`; tags `v0.5.0-day1`, `v1.0.0`
- [ ] README per §14 (all 14 sections)
- [ ] Demo video recorded (backup) + §11 script rehearsed twice ≤ 8 min
- [ ] Submission form: repo URL, endpoint URL, video, README disclaimer screenshot

---
*Plan complete. Implementation follows this document top-to-bottom; deviations must be
recorded here as amendments.*
