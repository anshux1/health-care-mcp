# Vitalis — Clinical Intelligence MCP Server

> **One-line pitch:** A production-grade MCP gateway that gives any LLM client safe, authenticated, auditable access to six clinical intelligence capabilities — triage, drug safety, diagnostics support, medical research, FHIR patient records, and care coordination — powered entirely by live public health data, with zero PHI.

---

## 1. Overview & Differentiation

Generic symptom-checker LLM applications typically bolt a static disclaimer onto free-form text. **Vitalis is developer infrastructure**:

1. **Safety is enforced by framework middleware**, not prompt engineering:
   - `EmergencyDetectionGuard` scans inputs for red flags before execution.
   - `ClinicalSafetyInterceptor` rewrites overreach language (e.g., "you are diagnosed with"), stamps urgency tiers, and forces clinical disclaimers automatically.
2. **Six Real, Live Federal & Clinical APIs**:
   - NLM RxNorm & RxClass
   - OpenFDA (Labels, FAERS Adverse Events, Enforcement/Recalls)
   - NCBI PubMed (E-utilities with XML abstract parsing)
   - ClinicalTrials.gov API v2
   - HAPI FHIR R4 (with Synthea synthetic patient sandbox + SMART Health IT failover)
   - NLM Clinical Table Search Service (ICD-10-CM)
3. **Enterprise Gateway Layer**: API-key auth with scopes, per-tool sliding window rate limits, structured JSONL audit logs with input hashing, and health checks.
4. **Interactive Next.js Widgets**: 6 custom UI widgets (including the flagship patient summary card) linked via `@Widget` decorators.

---

## 2. Capability & Module Architecture

Vitalis exposes 29 core clinical tools across 6 modules, plus 3 clearly-labeled stretch tools, core resources, and prompts:

### 🏥 Module 1: Triage (`triage`)
- `triage_assess_symptoms`: Full triage assessment yielding urgency tier (`emergency`, `urgent`, `routine`, `self_care`), red-flag matches, candidate conditions, and guidance.
- `triage_check_red_flags`: Fast emergency-only screening for critical red-flag terms.
- `triage_get_care_options`: Maps urgency tier to concrete clinical care pathways.

### 💊 Module 2: Drug Safety (`drugs`)
- `drugs_search`: Resolves free-text drug names to RxCUI identifiers, synonyms, and drug classes.
- `drugs_get_label_info`: Official FDA drug label sections (boxed warnings, contraindications, interactions, etc.).
- `drugs_check_interactions`: Pairwise drug interaction cross-scanning over official FDA drug labels with evidence excerpts.
- `drugs_get_adverse_events`: Top reported adverse reactions from FDA FAERS.
- `drugs_get_recalls`: FDA enforcement and recall actions.

### 🔬 Module 3: Diagnostics Support (`diagnostics`)
- `diagnostics_lookup_condition`: Condition name lookup to ICD-10-CM codes.
- `diagnostics_interpret_lab_value`: Rule-based interpretation of lab values against ~25 analyte reference ranges.
- `diagnostics_explain_lab_test`: Patient-friendly explanations of lab tests (grade 6 reading level).
- `diagnostics_symptom_to_codes`: Symptom text to candidate ICD-10-CM documentation codes.

### 📚 Module 4: Medical Research (`research`)
- `research_search_pubmed`: PubMed literature search with publication type filters.
- `research_get_article`: Citation details, DOI, MeSH terms, and parsed XML abstract for a PMID.
- `research_search_trials`: ClinicalTrials.gov search with status and phase filters.
- `research_get_trial_details`: Detailed trial protocol and eligibility criteria for an NCT ID.
- `research_summarize_evidence`: Evidence digest batch for LLM summarization.

### 📋 Module 5: FHIR Patient Records (`fhir`)
- `fhir_search_patients`: Search synthetic FHIR R4 patients.
- `fhir_get_patient`: Patient demographics and MRN.
- `fhir_get_conditions`: Active problem list.
- `fhir_get_medications`: Active medication requests.
- `fhir_get_observations`: Vital signs and lab history.
- `fhir_get_encounters`: Visit timeline.
- `fhir_get_patient_summary`: Aggregated clinical summary bundle (feeds the `patient-summary` widget).

### 🤝 Module 6: Care Coordination (`care`)
- `care_generate_handoff`: Standardized SBAR or narrative clinical handoff summary.
- `care_reconcile_medications`: 3-column medication reconciliation diff identifying added, removed, and duplicate-risk drugs.
- `care_draft_referral`: Specialist referral consultation request note.
- `care_find_guidelines`: PubMed clinical practice guidelines.
- `care_appointment_prep`: Patient visit preparation checklists.

---

## 3. System Architecture & Gateway Layer

```
┌──────────────────────────────────────────────────────────────────────────┐
│ MCP CLIENTS                      (NitroStudio / Claude Desktop / curl)    │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │  STDIO (dev) · HTTP+SSE (prod)
┌──────────────────────────────────────▼───────────────────────────────────┐
│ GATEWAY LAYER                                                            │
│   EmergencyDetectionGuard -> ApiKeyGuard -> ScopeGuard                   │
│   -> @RateLimit -> TrimPipe -> TOOL HANDLER                              │
│   -> ClinicalSafetyInterceptor -> AuditLogInterceptor -> TimingInterceptor │
│   -> ClinicalExceptionFilter                                             │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────┐
│ FEATURE MODULES                                                          │
│   triage · drugs · diagnostics · research · fhir · care · core           │
└──────────────────────────────────────┬───────────────────────────────────┘
                                       │ HTTPS
┌──────────────────────────────────────▼───────────────────────────────────┐
│ LIVE UPSTREAM APIS                                                       │
│   RxNorm · openFDA · PubMed · ClinicalTrials.gov · HAPI FHIR · ClinTables    │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 4. UI Widgets

Vitalis includes 6 Next.js frontend widgets registered in `src/widgets/widget-manifest.json`:
1. `patient-summary` (W5 ⭐ flagship): Aggregated patient EHR dashboard.
2. `triage-result` (W1): Urgency tier badges and red-flag chips.
3. `drug-safety-report` (W2): Severity-banded interaction grid and FDA evidence excerpts.
4. `trial-list` (W4): Clinical trial cards with status chips.
5. `lab-result-card` (W3): Quantitative reference-range card.
6. `med-reconciliation` (W6): 3-column medication diff view.

---

## 5. Getting Started & Setup

### Prerequisites
- Node.js >= 18.0.0
- npm / npx

### Installation & Environment
```bash
git clone https://github.com/anshu/my-mcp-server.git
cd my-mcp-server
npm install
```

Configure `.env` environment variables (see `.env.example`):
```env
API_KEY_CLINICIAN=vk_live_clinician_demo_key_01
API_KEY_READONLY=vk_live_readonly_demo_key_02
API_KEY_ADMIN=vk_live_admin_demo_key_03
VITALIS_ALLOW_ANONYMOUS_DEMO=false
```

### Running Locally
```bash
# Development mode
npm run dev

# Build production bundle
npm run build

# Start production server
npm start
```

### Testing
```bash
# Run unit & integration test suite
npm test
```

---

## 6. Responsible-Use & Clinical Disclaimer

> **IMPORTANT DISCLAIMER**: Vitalis is developer infrastructure designed for clinical decision support research and hackathon demonstration purposes only. It is **not** a licensed medical device and is **not** intended for primary medical diagnosis, treatment, or acute care triage without human physician oversight. All FHIR patient records provided by the server are 100% synthetic (Synthea generator) and contain zero protected health information (PHI). Always consult a qualified healthcare professional in medical emergencies.
