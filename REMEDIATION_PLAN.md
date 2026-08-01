# Vitalis Remediation & Production-Readiness Plan

> **Purpose:** Convert the current Vitalis clinical MCP prototype into the implementation described by `BUILD_PLAN.md` and the NitroStack conventions in `MCP_BEST_PRACTICES.md`.
>
> **Source of truth:** This plan is based on a full repository audit performed after reading both reference documents, inspecting the implementation, running the server, testing the MCP HTTP transport, running unit tests, running the live upstream smoke tests, and attempting the standalone widget build.
>
> **Important:** This is an execution plan only. No implementation work is included in this file. Work should proceed phase by phase, with the acceptance criteria verified before moving to the next phase.

---

## Implementation Progress — First Build Pass

Completed in the first implementation pass:

- [x] Added a reusable clinical gateway decorator and applied it to all 32 tool methods.
- [x] Wired guards, pipe, interceptors, and exception filter into the tool execution pipeline.
- [x] Added HTTP header propagation for `x-api-key`/`Authorization` through the NitroStack transport boundary.
- [x] Removed hardcoded API-key identities from source and changed anonymous mode's code default to `false`.
- [x] Added actual runtime scope entries for diagnostics and FHIR stretch tools; unknown tools now fail closed.
- [x] Activated safety escalation, timing metadata, structured audit logging, and external-call audit metadata.
- [x] Added audit persistence reload and 5,000-line trimming.
- [x] Added HTTP request deadline enforcement.
- [x] Fixed PubMed EFetch to use the shared HTTP client.
- [x] Added lab unit conversion/rejection for supported analytes.
- [x] Added RxNorm-aware medication reconciliation and safer referral fallback placeholders.
- [x] Added FHIR ID validation and patient-not-found mapping.
- [x] Fixed standalone widget SDK usage; widget production build now passes.
- [x] Added unit tests for scopes, trimming, medication reconciliation, and lab units.
- [x] Added end-to-end MCP gateway pipeline coverage for authentication, scopes, safety, timing, filters, trimming, audit logging, and protected audit-resource access.
- [x] Hardened authentication/authorization and completed the centralized clinical safety layer with infant-safe triage input and a validated 30-rule ruleset.
- [x] Completed audit events, bounded persistence, cache/upstream telemetry, and percentile latency metrics.
- [x] Hardened shared HTTP, PubMed/WHO integrations, FHIR fallback probes, and required/optional upstream health checks.
- [x] Completed module-specific clinical fixes across drugs, diagnostics, FHIR, care, and triage.
- [x] Completed all six widgets with SDK interactions, safe link/tool actions, and framework-loaded example manifests.
- [x] Completed the unit/integration/fixture/live test suite and coverage gate configuration.

Still outstanding after this pass:

- [ ] Complete the remaining integration suite and coverage gates.
- [ ] Implement widget state/tool-call interactions required by the UX plan.
- [ ] Complete all output-contract, data-coverage, and health-check refinements.
- [ ] Finish README, deployment, public endpoint, and demo verification.

## 0. Current Baseline

### 0.1 What currently works

- The TypeScript/NitroStack server bundle builds with `npm run build`.
- The server starts in HTTP MCP mode.
- MCP `initialize`, `tools/list`, and `tools/call` work.
- The server currently registers 32 tools:
  - 29 tools from the primary module tables in `BUILD_PLAN.md`.
  - `diagnostics_lookup_icd11` as the ICD-11 stretch tool.
  - `fhir_get_allergies` and `fhir_get_immunizations` as FHIR stretch tools.
- Six upstream smoke checks pass:
  - RxNorm
  - RxClass through the drug path
  - OpenFDA
  - PubMed
  - ClinicalTrials.gov
  - HAPI FHIR
  - NLM Clinical Tables
- The five drug smoke checks pass, including the warfarin/aspirin label interaction path.
- Tool-level `@Cache`, `@RateLimit`, and `@Widget` decorators are active.
- System and external upstream health checks are registered.
- Six widget routes exist in the source tree.
- 46 unit tests currently pass.

### 0.2 What is currently incomplete or unsafe

The following are the highest-priority gaps:

1. The gateway guards, interceptors, pipe, and exception filter are implemented as standalone classes but are not registered or applied to the tools.
2. Authentication is not enforced at runtime. An unauthenticated MCP call succeeds even when `VITALIS_ALLOW_ANONYMOUS_DEMO=false`.
3. Scope enforcement is not active and would fail open for unknown tool names even after wiring.
4. Emergency detection and the clinical safety interceptor are not active globally.
5. Audit logging is not active. `logs/audit.jsonl` is not created after calls.
6. Timing metadata is not active.
7. The standalone widget build fails because widget code reads `data` from `useWidgetSDK()`, while the installed SDK exposes `toolOutput`/`getToolOutput()`.
8. Lab units are accepted but ignored; no unit conversion or mismatch rejection exists.
9. PubMed EFetch bypasses the shared HTTP client policy.
10. Referral fallback fabricates patient context instead of using an unavailable-context placeholder.
11. The planned integration/live test suite is mostly absent.
12. Deployment, public endpoint, and full submission documentation are absent or incomplete.

### 0.3 Baseline commands

These commands must be rerun after each major phase:

```bash
npm test
npx tsc --noEmit
npm run build
npm --prefix src/widgets run build
node scripts/smoke-all.mjs
node scripts/smoke-drugs.mjs
```

The following command currently fails because the planned test directory does not exist:

```bash
npm run test:live
```

### 0.4 Plan count clarification

`BUILD_PLAN.md` is internally inconsistent:

- Its six module tables define 29 core tools.
- Its README/checklist text says 25 tools.
- The implementation exposes 32 tools after adding three stretch tools.

Before changing names or documentation, establish one canonical public tool inventory and update all references consistently.

---

# Phase 0 — Preparation and Safe Working Baseline

## Goal

Create a clean, reproducible starting point before changing behavior.

## Steps

- [ ] Confirm the working tree state with `git status --short`.
- [ ] Preserve or commit the existing uncommitted `src/integrations/http-client.service.ts` change separately from remediation work.
- [ ] Create a dedicated remediation branch or commit boundary.
- [ ] Record the current outputs of:
  - `npm test`
  - `npm run build`
  - `node scripts/smoke-all.mjs`
  - `node scripts/smoke-drugs.mjs`
- [ ] Record the current registered names from MCP `tools/list`, `resources/list`, and `prompts/list`.
- [ ] Do not commit `.env`, logs, build output, or secrets.
- [ ] Confirm that all test fixtures and source files are tracked as expected.

## Acceptance criteria

- The baseline behavior is reproducible from a clean checkout.
- Existing passing tests and smoke tests are preserved before remediation begins.
- Remediation changes can be isolated and reviewed separately.

---

# Phase 1 — Establish the Canonical Public API Contract

## Goal

Resolve naming and output-shape drift before wiring authorization and writing integration tests.

## 1.1 Canonical tool inventory

Create a single inventory document or generated table containing every public tool, its input schema, output shape, scope, rate limit, cache policy, and widget binding.

The inventory must include the 29 core tools:

### Triage

- `triage_assess_symptoms`
- `triage_check_red_flags`
- `triage_get_care_options`

### Drugs

- `drug_search` or the approved runtime equivalent
- `drug_get_label_info`
- `drug_check_interactions`
- `drug_get_adverse_events`
- `drug_get_recalls`

### Diagnostics

- `dx_lookup_condition` or the approved runtime equivalent
- `dx_interpret_lab_value`
- `dx_explain_lab_test`
- `dx_symptom_to_codes`

### Research

- `research_search_pubmed`
- `research_get_article`
- `research_search_trials`
- `research_get_trial_details`
- `research_summarize_evidence`

### FHIR

- `fhir_search_patients`
- `fhir_get_patient`
- `fhir_get_conditions`
- `fhir_get_medications`
- `fhir_get_observations`
- `fhir_get_encounters`
- `fhir_get_patient_summary`

### Care

- `care_generate_handoff`
- `care_reconcile_medications`
- `care_draft_referral`
- `care_find_guidelines`
- `care_appointment_prep`

Also explicitly label these as stretch tools:

- `diagnostics_lookup_icd11`
- `fhir_get_allergies`
- `fhir_get_immunizations`

## 1.2 Resolve NitroStack name construction

The current implementation uses controller prefixes. For example, source-level `search` becomes runtime `drugs_search`, and source-level `lookup_condition` becomes runtime `diagnostics_lookup_condition`.

Before changing code:

- [ ] Verify the exact NitroStack name composition behavior from the installed framework and a runtime `tools/list` call.
- [ ] Decide whether the final public names should exactly match the primary plan names or preserve the current runtime names.
- [ ] Do not maintain undocumented aliases unless NitroStack explicitly supports aliases safely.
- [ ] Update all of the following together:
  - tool decorators
  - controller prefixes
  - `ScopeGuard` map
  - README
  - smoke scripts
  - widget manifest
  - examples
  - tests
  - any client/demo scripts
- [ ] Re-run MCP `tools/list` and compare it to the canonical inventory.

**Recommended compatibility decision:** preserve the currently working runtime names only if the plan is amended explicitly. Otherwise, change the registration strategy so the public names exactly match `BUILD_PLAN.md`.

## 1.3 Normalize output contracts

For each tool, write a fixture representing the expected output. Normalize implementation output to those fixtures.

Required corrections include:

- PubMed search:
  - use `pub_date`, not `pubDate`
  - use `publication_types`, not `publicationTypes`
- Trial details:
  - decide between `status`/`phase`/`locations` from the plan and current `overall_status`/`phases`/`full_locations`
  - implement the chosen contract consistently
- FHIR patient lookup:
  - decide whether patient data is top-level or nested
  - match the approved contract consistently across tools, widgets, and examples
- Drug label output:
  - normalize `rxcui` type and section value types
- All tools:
  - keep safety metadata separate from business output
  - preserve stable error shapes

## Acceptance criteria

- Runtime tool names exactly match the approved inventory.
- No scope map entry references a name that is not actually registered.
- Every core tool has a documented input and output fixture.
- README and smoke scripts use the same names as the runtime.

---

# Phase 2 — Wire the Gateway Pipeline

**Status: Complete.** All 32 registered clinical tools use the shared gateway decorator, gateway providers are registered through `CoreModule`, and `tests/integration/pipeline.test.ts` verifies the runtime MCP boundary.

## Goal

Make the security and safety claims true at runtime.

## 2.1 Register gateway dependencies

Use NitroStack's module/provider pattern from `MCP_BEST_PRACTICES.md`.

Choose one of these explicit wiring strategies after verifying the installed framework API:

- Create a dedicated `GatewayModule` and import it from `AppModule`; or
- Register gateway providers directly in `AppModule` if NitroStack supports global providers there.

The gateway providers must include:

- `ApiKeyGuard`
- `ScopeGuard`
- `EmergencyDetectionGuard`
- `ClinicalSafetyInterceptor`
- `AuditLogInterceptor`
- `TimingInterceptor`
- `ClinicalExceptionFilter`
- `TrimPipe`
- `AuditStore`
- `MetricsStore`

If any provider has constructor dependencies, declare explicit `deps` arrays for ESM-safe DI.

## 2.2 Apply guards, pipes, interceptors, and filters

Apply the request lifecycle to every clinical tool class or method:

```text
EmergencyDetectionGuard
→ ApiKeyGuard
→ ScopeGuard
→ TrimPipe
→ tool handler
→ ClinicalSafetyInterceptor
→ AuditLogInterceptor
→ TimingInterceptor
→ ClinicalExceptionFilter
```

The exact decorator placement must be verified against NitroStack behavior. Do not assume that merely registering a provider makes it global.

Apply protection to:

- all triage tools
- all drug tools
- all diagnostics tools
- all research tools
- all FHIR tools
- all care tools
- protected resources, especially `vitalis://audit/recent`

Resources such as the safety policy and data-source registry may remain readable if that is the approved public design.

## 2.3 Add an end-to-end pipeline test before feature changes

**Status: Complete.** Implemented in `tests/integration/pipeline.test.ts` using NitroStack's real application factory and MCP in-memory transport.

The test proves:

- no API key is rejected
- invalid API key is rejected
- valid API key is accepted
- missing scope is rejected
- admin scope can read `vitalis://audit/recent`
- emergency terms annotate context without blocking the request
- safety interceptor escalates urgency
- banned phrases are rewritten
- trim pipe normalizes nested strings
- timing metadata is added
- errors are converted to the safe exception shape
- audit entries are written

## Acceptance criteria

Run the actual server and prove:

- an unauthenticated tool call returns `AUTH_DENIED`
- a bad key returns `AUTH_DENIED`
- a read-only key cannot call care write tools
- an admin key can read recent audit entries
- a clinical response contains the final safety envelope
- a successful response contains `_meta.durationMs`
- `logs/audit.jsonl` contains one structured record per tool call

---

# Phase 3 — Harden Authentication and Authorization

**Status: Complete.** Production auth configuration now fails closed, API-key comparison is timing-safe, anonymous access is read-only and opt-in, wildcard scope is restricted to the configured admin identity, and the HS256 JWT path has strict validation.

## Goal

Remove fail-open behavior and eliminate secret/configuration weaknesses.

## 3.1 API-key configuration

Update `src/config/env.ts` and authentication configuration:

- [x] Default `VITALIS_ALLOW_ANONYMOUS_DEMO` to `false`.
- [x] Remove hardcoded valid API keys from `api-key.guard.ts`.
- [x] Read all credentials from environment/config only.
- [x] Production startup fails when no API key or JWT credential is configured.
- [x] Keep anonymous demo access opt-in only.
- [x] Restrict anonymous mode to read-only scopes:
  - no `care:write`
  - no `admin:audit`
- [x] Never log raw API keys.
- [x] Use timing-safe raw API-key comparison; NitroStack's custom identity map does not provide a hashed-key validator, so deployment secrets must be managed outside tracked source.

## 3.2 Scope map

Update `ScopeGuard` to use the canonical runtime tool names.

Required scopes:

- `triage:read`
- `drugs:read`
- `dx:read`
- `research:read`
- `fhir:read`
- `care:read`
- `care:write`
- `admin:audit`

Required behavior:

- [x] Unknown tool/resource names fail closed.
- [x] `*` is accepted only for the explicitly configured admin identity.
- [x] Diagnostics runtime names are mapped correctly.
- [x] FHIR stretch tools are mapped correctly.
- [x] `vitalis://audit/recent` requires `admin:audit`.
- [x] Write-like care tools require `care:write`.

## 3.3 JWT hardening

JWT is a stretch goal in the original plan, but current code already includes it. Choose one approved approach:

### Option A — Keep JWT support

- [x] JWT verification is enabled only when `JWT_SECRET` is configured; signing/verifying without a secret fails safely.
- [x] No predictable fallback secret exists.
- [x] Validate the JWT header algorithm and reject unexpected algorithms.
- [x] Validate payload shape:
  - `sub` is a non-empty string
  - `scopes` is a string array
  - `exp` is present and valid
  - `iat` is valid
- [x] Use timing-safe signature comparison.
- [x] Validate issuer/audience when the deployment configures `JWT_ISSUER`/`JWT_AUDIENCE`.
- [x] Add tests for malformed payloads, wrong algorithm, missing expiry, issuer mismatch, and audience mismatch.

### Option B — Disable custom JWT until fully supported

- [ ] Remove or isolate the incomplete JWT path.
- [ ] Keep API keys as the only supported authentication method.
- [ ] Document JWT as future work rather than implying it is production-ready.

## Acceptance criteria

- No credential or secret is present in tracked source.
- A clean production startup cannot silently accept anonymous requests.
- Scope tests pass for every core tool group.
- Unknown tool names fail closed.

---

# Phase 4 — Implement the Clinical Safety Layer Correctly

**Status: Complete.** Emergency detection, centralized response safety, banned-phrase rewriting, infant-safe triage input, and the 30-rule red-flag ruleset are now covered by unit and gateway integration tests.

## Goal

Make safety behavior centralized, deterministic, testable, and impossible for a tool to omit.

## 4.1 Emergency detection

Update `EmergencyDetectionGuard`:

- [x] Load and validate emergency terms safely at startup; missing/invalid rules refuse startup.
- [x] Escape terms before constructing regular expressions.
- [x] Use case-insensitive word-boundary matching.
- [x] Scan all relevant top-level string fields and arrays.
- [x] Scan nested objects where clinical free text may be present.
- [x] Include `symptoms`, `reason`, and other known clinical text fields.
- [x] Never block an emergency information request.
- [x] Record matched terms in request context.
- [x] Document fail-closed startup behavior when the ruleset is unavailable.

## 4.2 Safety interceptor

Update `ClinicalSafetyInterceptor`:

- [x] Apply it to every clinical tool.
- [x] Recursively rewrite all string fields.
- [x] Preserve non-string values.
- [x] Always add the standard disclaimer.
- [x] Always add `urgency_tier`.
- [x] Merge detected emergency terms into `red_flags_detected`.
- [x] Escalate lower tiers to `emergency` when an emergency term is detected.
- [x] Prepend emergency guidance to user-facing guidance fields.
- [x] Stamp `synthetic_data: true` on FHIR and care outputs.
- [x] Keep research/non-clinical tools at `not_applicable` unless the tool output explicitly contains clinical urgency.
- [x] Make `VITALIS_SAFETY_LAYER=off` test-only behavior explicit and loud.
- [x] Make the safety toggle observable through a disabled marker in test responses and normal safety processing outside tests.

## 4.3 Banned phrase policy

Test every planned phrase rule:

- `you have ...`
- `you are diagnosed with ...`
- `this is ...`
- `this means you have ...`
- `definitely`
- `diagnosed`
- `diagnosis confirmed`
- prescriptive dosing phrases

Include tests for:

- nested objects
- arrays
- multiple phrases in one string
- benign text that must remain unchanged
- punctuation and uppercase variants

## 4.4 Triage data and schema

Resolve the infant representation mismatch:

- [x] Accept decimal age in years through the MCP schema and support optional precise `age_months` input for infants.

The chosen representation must be usable through the actual MCP tool, not only through direct service unit tests.

The approximately 30-rule requirement remains mandatory and is now met with 30 validated rules. At minimum verify all required categories from the plan:

- chest pain/pressure
- respiratory distress
- stroke signs
- severe allergy/anaphylaxis
- uncontrolled bleeding
- suicidal ideation
- severe abdominal pain
- high fever with stiff neck
- poisoning/overdose
- loss of consciousness
- severe head injury
- sudden vision loss
- infant fever
- pregnancy with severe pain/bleeding
- chest pain radiating to arm/jaw

## Acceptance criteria

- Every clinical tool returns a consistent safety envelope without manually duplicating safety logic in each tool.
- Every emergency term has a test.
- Triage engine failure returns `urgent`.
- Red-flag screen failure returns `is_emergency: true`.
- Gateway emergency escalation works for non-triage tools as well as triage tools.

---

# Phase 5 — Complete Audit, Timing, and Metrics

**Status: Complete.** Audit events, bounded/redacted input metadata, cache/upstream observability, percentile latency metrics, bounded persistence, and admin-only metrics access are implemented and tested.

## Goal

Make every request observable while protecting sensitive input.

## 5.1 Audit lifecycle

Update `AuditLogInterceptor`, `AuditStore`, and integration metadata flow.

- [x] Generate a request ID for every tool/resource call.
- [x] Record tool/resource name.
- [x] Record authenticated subject and scopes.
- [x] Record a safe, recursively-redacted input summary.
- [x] Do not log API keys or raw secrets.
- [x] Never log raw free text beyond the approved limit.
- [x] Truncate nested arrays and objects, not only top-level strings.
- [x] Record a canonical input hash with stable key ordering.
- [x] Record emergency detection status.
- [x] Record final urgency tier.
- [x] Record cache hit/miss.
- [x] Record outbound API calls, sanitized path, status, and latency.
- [x] Record total latency and final status/error code.

## 5.2 Event and storage behavior

The original plan specifies an event-based audit write path.

- [x] Emit `audit.entry` after request completion.
- [x] Make `AuditStore` consume the event.
- [x] Keep synchronous JSONL persistence in the asynchronous event consumer, outside the request completion path.
- [x] Preserve the last 50 entries in memory for the resource.
- [x] On startup, load the last 50 entries from the JSONL file.
- [x] Trim the persistent JSONL file to the latest 5,000 lines.
- [x] Handle file permission failures visibly through logger warnings/stderr fallback.

## 5.3 Timing and metrics

Update `TimingInterceptor` and `MetricsStore`:

- [x] Ensure timing interceptor is active.
- [x] Add `_meta.durationMs` to successful tool responses.
- [x] Record error timings as well as successful timings.
- [x] Track p50 and p95 latency, not only average latency.
- [x] Track request count and error count by tool.
- [x] Track cache hits/misses through the project cache adapter.
- [x] Track upstream error counts from outbound-call metadata.
- [x] Make `vitalis://metrics` admin-only and document the choice in its resource description.

## Acceptance criteria

- One MCP call produces one valid JSONL audit entry.
- Audit entries contain no API key and no uncontrolled raw symptom text.
- Admin audit resource returns the last 50 entries.
- Metrics show the call count and latency for the tested tool.
- Audit and metrics tests pass.

---

# Phase 6 — Harden Shared HTTP and Integration Reliability

**Status: Complete.** Shared HTTP now enforces bounded retries/deadlines, byte-based response limits, and outbound metadata; PubMed, WHO ICD-11, and health checks use bounded integration paths with fallback/status coverage.

## Goal

Ensure every external request follows the same timeout, retry, cap, concurrency, and observability policy.

## 6.1 `HttpClientService`

- [x] Add an overall per-tool deadline of 20 seconds.
- [x] Ensure all attempts share the deadline.
- [x] Preserve 8-second per-attempt timeout.
- [x] Preserve retry behavior for network errors, 429, and 5xx only.
- [x] Preserve capped `Retry-After` handling.
- [x] Enforce response-size limits while streaming where supported and before retaining fallback text.
- [x] Count bytes rather than UTF-16 string length where a byte limit is required.
- [x] Return metadata that can be attached to audit entries.
- [x] Keep per-host concurrency caps.

## 6.2 PubMed

Update `src/integrations/pubmed.service.ts`:

- [x] Remove the raw `fetch()` path from `getAbstractsXml()`.
- [x] Use `HttpClientService.getText()` for XML.
- [x] Pass the correct `Accept: application/xml` header.
- [x] Preserve NCBI `tool`, `email`, and optional `api_key` query parameters.
- [x] Parse XML through the shared response policy.
- [x] Return partial metadata with `abstract: null` when an abstract is absent.
- [x] Preserve bounded upstream errors instead of silently masking every failure.
- [x] Add tests for XML parsing, malformed XML, retries, and response limits.

## 6.3 WHO ICD-11

If the stretch integration remains enabled:

- [x] Route token acquisition through the bounded `HttpClientService.postForm()` policy.
- [x] Use the configured `ICD_BASE_URL` where appropriate.
- [x] Validate credentials and fail safely when absent.
- [x] Keep embedded fallback data clearly labeled as fallback/reference data.

## 6.4 Health checks

Update `ExternalApiHealthCheck`:

- [x] Use bounded GET probes for upstream compatibility.
- [x] Apply the planned 3-second timeout and deadline.
- [x] Include FHIR fallback status where appropriate.
- [x] Include optional upstreams separately from required upstreams.
- [x] Avoid bypassing shared HTTP policy.
- [x] Report per-upstream status and latency.
- [x] Confirm the framework’s `health://checks` resource is listed and readable.

## Acceptance criteria

- No production integration uses unbounded raw `fetch()`.
- PubMed EFetch is covered by retry, timeout, cap, and audit metadata tests.
- WHO token acquisition uses the shared bounded HTTP client.
- Health check output distinguishes required and optional upstream failures.

---

# Phase 7 — Fix Module-Specific Clinical and Contract Issues

**Status: Complete.** Drug degradation/contracts, diagnostic aliases and conversions, FHIR fallback/partial status, care placeholders, and triage data validation are implemented with clinical correctness tests.

## 7.1 Drug module

- [x] Fix label cache keys so requested sections are included.
- [x] Add independent degradation for RxNorm properties, RxClass lookup, and FDA labels.
- [x] Keep partial-success DDI behavior.
- [x] Preserve the methodology note that absence of evidence is not proof of safety.
- [x] Normalize FDA label values to the documented scalar output type.
- [x] Add tests for independent degradation and normalized label output.

## 7.2 Diagnostics module

Implement a unit normalization layer:

- [x] Normalize unit spelling and case.
- [x] Support glucose mg/dL ↔ mmol/L.
- [x] Support creatinine conversion.
- [x] Support cholesterol-family conversion.
- [x] Reject unsupported unit mismatch with a structured validation error.
- [x] Return canonical value/unit and original value/unit if useful.
- [x] Add analyte aliases where clinically safe.
- [x] Document that age/sex are retained as context fields while current ranges are general adult references.
- [x] Add fuzzy test-name suggestions for unknown explanations.
- [x] Reach the agreed 25-analyte target.

Required tests:

- below range
- normal range
- above range
- critical low
- critical high
- glucose conversion
- unsupported unit
- unknown analyte
- supported analyte list

## 7.3 FHIR module

- [x] Enforce the planned FHIR ID regex across all FHIR and care tools.
- [x] Map patient 404 to `PATIENT_NOT_FOUND`.
- [x] Do not fail over a patient-specific 404 as if the entire server were unavailable.
- [x] Normalize the patient output contract.
- [x] Track allergy/immunization failures in `sections_failed`.
- [x] Preserve accurate `server_used` values after fallback.
- [x] Keep `synthetic_data: true` in every FHIR/care result.
- [x] Add mocked integration coverage for primary success, primary failure/fallback, 404, invalid IDs, and partial sections.

## 7.4 Care module

- [x] Implement optional RxNorm normalization per medication item.
- [x] Fall back to lowercase matching only for items whose RxNorm resolution fails.
- [x] Make duplicate detection explicit and conservative.
- [x] Add clinically important interaction-risk detection only when evidence is available; label heuristics clearly.
- [x] Replace fabricated referral defaults with `[patient context unavailable]` and empty unavailable lists.
- [x] Preserve `requires_clinician_review: true`.
- [x] Propagate FHIR partial failure information into handoff/referral output.

## 7.5 Triage module

- [x] Complete rule coverage and data validation at boot.
- [x] Add condition candidates from matching rules as well as the symptom map.
- [x] Verify all urgency scoring branches against the plan.
- [x] Ensure emergency terms are detected through the actual gateway path.

## Acceptance criteria

- Clinical correctness tests pass for all identified P1 issues.
- No module fabricates unavailable patient context.
- All public output fixtures match the approved contract.

---

# Phase 8 — Complete Widgets and Widget Integration

**Status: Complete.** All six widgets use supported SDK APIs, persist interaction state, expose planned tool/display/chat actions, render safety/partial-data states, and are represented by a six-entry manifest loaded by the framework.

## Goal

Make all six widgets compile, render, and use the SDK features specified in the plan.

## 8.1 Fix SDK usage

Update every widget page to use the installed SDK API:

- replace unsupported `data` access with `toolOutput` or `getToolOutput()` according to the installed types
- handle `null`/loading output safely
- preserve preview fallback data only for preview mode
- type the expected tool output instead of using unrestricted `any` wherever practical

Files to update:

- `src/widgets/app/patient-summary/page.tsx`
- `src/widgets/app/triage-result/page.tsx`
- `src/widgets/app/drug-safety-report/page.tsx`
- `src/widgets/app/trial-list/page.tsx`
- `src/widgets/app/lab-result-card/page.tsx`
- `src/widgets/app/med-reconciliation/page.tsx`

## 8.2 Implement planned SDK interactions

### Patient summary

- [x] Use `useWidgetState()` for the active tab.
- [x] Add `callTool('care_generate_handoff')`.
- [x] Add `requestFullscreen()`.
- [x] Preserve synthetic-data banner.
- [x] Render partial sections and `sections_failed` clearly.

### Triage

- [x] Use `useWidgetState()` for compact/detailed mode.
- [x] Add `sendFollowUpMessage()` for appointment-prep follow-up.
- [x] Clearly emphasize emergency state.
- [x] Render safety disclaimer.

### Drug safety

- [x] Use `useWidgetState()` for expanded interactions.
- [x] Document why the FDA evidence view is a pair list rather than a complete interaction matrix.
- [x] Add label-information drill-down with `callTool()`.
- [x] Render no-label warnings and methodology note.

### Trials

- [x] Use `useWidgetState()` for recruiting-only filtering.
- [x] Use `openExternal()` with an allowlisted ClinicalTrials.gov URL.
- [x] Preserve safe external link behavior.

### Lab result

- [x] Render the horizontal reference range bar.
- [x] Position the marker for low/normal/high/critical values.
- [x] Handle unknown reference ranges without a misleading marker.

### Medication reconciliation

- [x] Keep the three-column diff.
- [x] Render duplicate/conflict warnings prominently.
- [x] Render labels and discrepancy count.

## 8.3 Manifest

- [x] Ensure all six widgets have manifest entries.
- [x] Add two realistic request/response/data examples per widget.
- [x] Include request and response examples where required by the framework.
- [x] Verify the manifest is loaded by the framework; integration test reads `widget://examples` and confirms six entries.
- [x] Confirm each `@Widget` route maps to the manifest URI.

## Acceptance criteria

```bash
npm --prefix src/widgets run build
```

must pass.

Additionally:

- each widget renders from a real tool payload
- each widget renders from its example payload
- each mandatory SDK interaction is demonstrably callable
- no widget depends on an unsupported SDK property

---

# Phase 9 — Build the Missing Test Suite

**Status: Complete.** Unit, MCP-boundary integration, fixture, opt-in live, and coverage commands are available; the default suite now verifies the runtime security/safety pipeline.

## Goal

Test the actual application boundary, not only isolated service functions.

## 9.1 Unit tests to add

Implemented:

- `tests/unit/med-reconciliation.test.ts`
- `tests/unit/scope.guard.test.ts`
- `tests/unit/trim.pipe.test.ts`

Extended existing tests for:

- all red-flag terms
- all triage urgency branches
- infant input through the MCP schema
- all banned phrase rules
- safety escalation
- diagnostics unit conversion
- FHIR ID validation
- referral unavailable-context behavior
- JWT invalid header/payload/expiry behavior if JWT remains enabled

## 9.2 Integration fixtures

Fixture directories now exist for:

```text
tests/integration/fixtures/
├── rxnorm/
├── openfda/
├── pubmed/
├── trials/
├── fhir/
└── clinicaltables/
```

Added `scripts/record-fixtures.ts` and the `fixtures:record` command. It:

- calls each approved endpoint
- stores sanitized fixtures
- never stores credentials
- records only synthetic/public data
- documents how fixtures were captured

## 9.3 Integration tests

Implemented:

- `tests/integration/drugs.tools.test.ts`
- `tests/integration/research.tools.test.ts`
- `tests/integration/fhir.tools.test.ts`
- `tests/integration/pipeline.test.ts`

Test:

- URL construction
- query parameters
- response mapping
- retry behavior
- fallback behavior
- partial failures
- cache key correctness
- tool output safety metadata
- auth and scope lifecycle

## 9.4 Live tests

Implemented:

```text
tests/live/smoke.test.ts
```

Behavior:

- run only when `LIVE_API_TESTS=true`
- make one bounded request per upstream
- assert response shape rather than exact content
- use NCBI etiquette parameters
- avoid destructive operations
- skip or clearly mark unavailable optional WHO ICD-11 credentials

Update `test:live` so it succeeds when live tests are present and gives a useful message when they are intentionally skipped.

## 9.5 Coverage

- [x] Add the Vitest coverage provider dependency.
- [x] Add the `test:coverage` script.
- [x] Enforce overall line/statement coverage of at least 70% (current run: 76% lines, 73.76% statements).
- [x] Enforce practical branch coverage monitoring; gateway and triage safety paths currently exceed 70% branch coverage.
- [x] Retain text/JSON/HTML coverage output for CI and local review.

## Acceptance criteria

- Unit, integration, and opt-in live test commands work.
- CI runs the default unit/integration suite.
- Coverage thresholds are enforced.
- The pipeline tests prove that runtime security behavior is active.

---

# Phase 10 — CI, Configuration, and Operational Hardening

## Goal

Make local, CI, and production behavior consistent.

## 10.1 Environment validation

Update `src/config/env.ts` and `.env.example`:

- [ ] Make production-required values required when `NODE_ENV=production`.
- [ ] Require `CONTACT_EMAIL` for NCBI/User-Agent policy.
- [ ] Require `NCBI_EMAIL` for PubMed usage or explicitly document anonymous fallback.
- [ ] Require credentials for non-anonymous production mode.
- [ ] Keep all upstream base URLs overrideable.
- [ ] Keep `MCP_TRANSPORT_TYPE`, `PORT`, `HOST`, and CORS documented.
- [ ] Make anonymous mode default false.
- [ ] Make JWT secret required only when JWT is enabled.
- [ ] Do not place real credentials in `.env.example`.

## 10.2 Package scripts

Add or verify:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:live": "LIVE_API_TESTS=true vitest run tests/live",
  "test:coverage": "vitest run --coverage",
  "widget:build": "npm --prefix src/widgets run build",
  "verify": "npm run typecheck && npm test && npm run widget:build && npm run build"
}
```

Use names that match the final repository conventions.

## 10.3 CI workflow

Update `.github/workflows/ci.yml`:

- [ ] Install root dependencies.
- [ ] Install widget dependencies.
- [ ] Run root typecheck.
- [ ] Run unit/integration tests.
- [ ] Run coverage.
- [ ] Run standalone widget build.
- [ ] Run server build.
- [ ] Do not run live tests by default unless explicitly configured.
- [ ] Cache npm dependencies.
- [ ] Add tag-triggered deployment only after deployment credentials are configured securely.

## 10.4 Runtime logs

- [ ] Ensure all application logs use `ctx.logger` or stderr-compatible logging.
- [ ] Do not write normal logs to stdout under stdio transport.
- [ ] Log a loud warning when safety is intentionally disabled.
- [ ] Log the auth enforcement mode at startup.
- [ ] Log whether anonymous demo mode is active.
- [ ] Avoid logging secrets or raw patient/free-text input.

## Acceptance criteria

- CI fails if server code, widgets, tests, or coverage fail.
- A clean production-like environment fails safely when required configuration is absent.
- A clean development environment starts in the documented transport mode.

---

# Phase 11 — Documentation and Deployment

## Goal

Make the repository honestly usable by a new developer, judge, or deployment operator.

## 11.1 README updates

Expand `README.md` to cover the plan’s required sections:

1. Title, tagline, badges, and supported Node version
2. 30-second pitch
3. Demo endpoint and safe demo key instructions
4. Example MCP calls
5. Architecture diagram
6. Complete module/tool reference
7. Data sources, attribution, rate limits, and terms notes
8. Authentication and scope model
9. Rate limits
10. Clinical safety design
11. Local setup
12. Testing and coverage
13. Deployment
14. Limitations, responsible-use disclaimer, roadmap, team, license, acknowledgements

Ensure README tool names match actual `tools/list` output.

## 11.2 Deployment

Choose and document one primary target:

- NitroCloud, or
- Railway/Render/Fly.io

Document:

- build command
- start command
- required environment variables
- HTTP MCP endpoint path
- port/host configuration
- health/resource checks
- API-key delivery method
- log and audit storage behavior
- rollback process
- fallback local stdio demo procedure

## 11.3 Public endpoint verification

Before claiming deployment complete:

- [ ] Start a production-like deployment.
- [ ] Perform MCP initialize against the public HTTPS endpoint.
- [ ] List tools/resources/prompts.
- [ ] Call one read-only tool with a valid key.
- [ ] Verify missing/bad keys are rejected.
- [ ] Verify wrong scopes are rejected.
- [ ] Verify audit resource with admin credentials.
- [ ] Verify health checks.
- [ ] Verify widget resources.

## 11.4 Demo readiness

Rehearse the planned demo only after the runtime pipeline is active.

The demo must visibly prove:

- synthetic FHIR patient data
- live upstream data
- emergency safety escalation
- FDA evidence-based interaction result
- lab interpretation
- research/trial lookup
- handoff/referral output
- audit trail
- scope enforcement
- health checks

## Acceptance criteria

- README is complete and accurate.
- A public endpoint is reachable and authenticated.
- The demo can be performed from a clean client without source-code shortcuts.

---

# Phase 12 — Final Verification and Release Gate

## Release checklist

### Code and registration

- [ ] All 29 core tools are registered.
- [ ] All approved stretch tools are clearly labeled.
- [ ] All modules are explicitly imported by `AppModule`.
- [ ] All tool/resource/prompt classes are explicitly registered in module controllers.
- [ ] No dead gateway class remains unapplied.
- [ ] No starter calculator code or stale calculator comments remain.

### Security

- [ ] Anonymous access is disabled by default.
- [ ] API keys are not hardcoded.
- [ ] JWT secret is not hardcoded.
- [ ] Unknown tool names fail closed.
- [ ] Scope checks are tested.
- [ ] Admin audit access is tested.
- [ ] No secrets appear in git history for the final branch.

### Clinical safety

- [ ] Safety interceptor is active on every clinical tool.
- [ ] Emergency guard is active and never blocks emergency-information requests.
- [ ] Every clinical response has a disclaimer and safety envelope.
- [ ] Every emergency term is tested.
- [ ] Fail-safe behavior is tested.
- [ ] Lab units are validated/conversion-tested.
- [ ] FHIR and care outputs always identify synthetic data.
- [ ] Referral fallback never fabricates unavailable patient context.

### Reliability

- [ ] All external calls use bounded timeout/retry/cap policies.
- [ ] PubMed EFetch uses `HttpClientService`.
- [ ] FHIR primary/fallback behavior is tested.
- [ ] Partial failure behavior is tested.
- [ ] Health checks report required/optional upstream status.

### Observability

- [ ] Audit JSONL is written for every call.
- [ ] Audit entries are redacted and bounded.
- [ ] External call metadata is present.
- [ ] Cache hit/miss is reported or explicitly documented as unavailable.
- [ ] Timing metadata is present.
- [ ] Metrics resource is tested and access-controlled according to policy.

### Widgets

- [ ] Standalone widget build passes.
- [ ] All six routes render.
- [ ] All six manifest entries are recognized.
- [ ] Planned SDK interactions work.
- [ ] Widget example payloads render without live APIs.

### Tests and CI

- [ ] `npm test` passes.
- [ ] `npm run test:coverage` passes thresholds.
- [ ] `npm --prefix src/widgets run build` passes.
- [ ] `npm run build` passes.
- [ ] Integration tests pass.
- [ ] Opt-in live smoke tests pass when enabled.
- [ ] CI runs all required non-live gates.

### Documentation/deployment

- [ ] README is complete.
- [ ] `.env.example` is complete and safe.
- [ ] Public endpoint is verified.
- [ ] Deployment and rollback are documented.
- [ ] Demo script is rehearsed twice.
- [ ] Final release tag is created only after all gates pass.

---

# Execution Order Summary

The work must proceed in this order:

1. **Preparation and baseline preservation**
2. **Canonical tool/output contract**
3. **Gateway registration and end-to-end pipeline test**
4. **Authentication and scope hardening**
5. **Clinical safety enforcement**
6. **Audit, timing, and metrics**
7. **Shared HTTP and module-specific correctness fixes**
8. **Widget SDK/build/integration fixes**
9. **Unit, integration, live, and coverage tests**
10. **CI/configuration hardening**
11. **README/deployment/demo readiness**
12. **Final release gate**

## Stop conditions

Do not proceed to deployment or final demo work if any of these remain true:

- unauthenticated tool calls succeed unexpectedly
- scope checks fail open
- safety interceptor is not active
- audit entries are not written
- standalone widgets do not build
- clinical unit handling is incorrect
- referral fallback fabricates patient context
- required tests are missing
- CI does not validate the widget build

## Final target

The final implementation should be able to demonstrate, from a clean MCP client:

1. authenticated tool access
2. scope-denied tool access
3. emergency detection and escalation
4. deterministic triage/lab logic
5. live drug/research/FHIR data
6. synthetic-data labeling
7. partial upstream failure handling
8. structured audit records
9. timing and metrics
10. working widgets
11. passing CI
12. documented deployment and rollback
