/**
 * ScopeGuard — Authorizes incoming tool execution against required scope matrix (BUILD_PLAN.md §5.2).
 */
import { Guard, ExecutionContext, Injectable } from '@nitrostack/core';
import { AuthContext } from './api-key.guard.js';

const TOOL_SCOPE_MAP: Record<string, string> = {
  // Triage module
  triage_assess_symptoms: 'triage:read',
  triage_check_red_flags: 'triage:read',
  triage_get_care_options: 'triage:read',

  // Drugs module
  drug_search: 'drugs:read',
  drugs_search: 'drugs:read',
  drug_get_label_info: 'drugs:read',
  drugs_get_label_info: 'drugs:read',
  drug_check_interactions: 'drugs:read',
  drugs_check_interactions: 'drugs:read',
  drug_get_adverse_events: 'drugs:read',
  drugs_get_adverse_events: 'drugs:read',
  drug_get_recalls: 'drugs:read',
  drugs_get_recalls: 'drugs:read',

  // Diagnostics module
  dx_lookup_condition: 'dx:read',
  dx_interpret_lab_value: 'dx:read',
  dx_explain_lab_test: 'dx:read',
  dx_symptom_to_codes: 'dx:read',

  // Research module
  research_search_pubmed: 'research:read',
  research_get_article: 'research:read',
  research_search_trials: 'research:read',
  research_get_trial_details: 'research:read',
  research_summarize_evidence: 'research:read',

  // FHIR module
  fhir_search_patients: 'fhir:read',
  fhir_get_patient: 'fhir:read',
  fhir_get_conditions: 'fhir:read',
  fhir_get_medications: 'fhir:read',
  fhir_get_observations: 'fhir:read',
  fhir_get_encounters: 'fhir:read',
  fhir_get_patient_summary: 'fhir:read',

  // Care Coordination module
  care_generate_handoff: 'care:read',
  care_find_guidelines: 'care:read',
  care_appointment_prep: 'care:read',
  care_reconcile_medications: 'care:write',
  care_draft_referral: 'care:write',
};

@Injectable()
export class ScopeGuard implements Guard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const auth: AuthContext | undefined = (context as any).auth;
    if (!auth) {
      throw new Error('AUTH_DENIED: Unauthenticated context.');
    }

    if (auth.scopes.includes('*')) {
      return true;
    }

    const toolName = context.toolName;
    if (!toolName) {
      return true;
    }

    const requiredScope = TOOL_SCOPE_MAP[toolName];
    if (!requiredScope) {
      return true;
    }

    if (!auth.scopes.includes(requiredScope)) {
      throw new Error(`SCOPE_DENIED: Accessing tool '${toolName}' requires scope '${requiredScope}'.`);
    }

    return true;
  }
}
