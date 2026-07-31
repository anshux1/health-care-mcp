/**
 * CareService — Care Coordination module logic (BUILD_PLAN.md §2.6).
 * Handles SBAR clinical handoffs, medication reconciliation, referral drafting, guidelines, and visit prep.
 */
import { Injectable } from '@nitrostack/core';
import { FhirService } from '../../integrations/fhir.service.js';
import { PubMedService } from '../../integrations/pubmed.service.js';
import { RxNormService } from '../../integrations/rxnorm.service.js';
import { loadDataJson } from '../../data/load-json.js';

const apptPrepData = loadDataJson('appointment-prep.json');

@Injectable({ deps: [FhirService, PubMedService, RxNormService] })
export class CareService {
  private readonly apptChecklists: Record<
    string,
    {
      checklist: Array<{ item: string; category: string; why: string }>;
      bring_list: string[];
    }
  > = apptPrepData.checklists;

  constructor(
    private readonly fhir: FhirService,
    private readonly pubmed: PubMedService,
    private readonly rxnorm: RxNormService,
  ) {}

  /** Generate SBAR or Narrative clinical handoff from FHIR data. */
  async generateHandoff(patientId: string, format: 'sbar' | 'narrative' = 'sbar') {
    let summary;
    try {
      summary = await this.fhir.getPatientSummary(patientId);
    } catch {
      summary = null;
    }

    const patientName = summary?.patient?.name ?? 'Unknown Patient';
    const age = summary?.patient?.age ?? 'Unknown';
    const gender = summary?.patient?.gender ?? 'Unknown';

    const conditions = summary?.active_conditions.map((c) => c.display).join(', ') || '[No active conditions recorded]';
    const medications = summary?.active_medications.map((m) => m.name).join(', ') || '[No active medications recorded]';
    const vitals =
      summary?.recent_vitals.map((v) => `${v.display}: ${v.value} ${v.unit ?? ''}`).join('; ') ||
      '[No recent vitals recorded]';
    const encounters =
      summary?.recent_encounters.map((e) => `${e.type} (${e.period_start ?? 'recent'})`).join('; ') ||
      '[No recent encounters recorded]';

    const situation = `Patient ${patientName} (${age}y ${gender}) presenting for clinical handoff/transfer. Active problems: ${conditions}.`;
    const background = `Past encounters: ${encounters}. Current active regimen: ${medications}.`;
    const assessment = `Recent vital signs: ${vitals}. Allergy status: ${summary?.allergy_note ?? 'Unconfirmed'}.`;
    const recommendation =
      `1. Re-evaluate active conditions (${conditions}).\n` +
      `2. Verify medication adherence and reconcile reported drugs against ${medications}.\n` +
      `3. Monitor vital signs trend and complete clinical handover.`;

    if (format === 'narrative') {
      return {
        patient_id: patientId,
        narrative: `${situation} ${background} ${assessment} ${recommendation}`,
        source_data_window: 'FHIR R4 Active Summary',
        synthetic_data: true,
      };
    }

    return {
      patient_id: patientId,
      sbar: {
        situation,
        background,
        assessment,
        recommendation,
      },
      source_data_window: 'FHIR R4 Active Summary',
      synthetic_data: true,
    };
  }

  /** Reconcile two medication lists to identify discrepancies and duplicate risks. */
  async reconcileMedications(
    listA: string[],
    listB: string[],
    labelA: string = 'List A',
    labelB: string = 'List B',
  ) {
    const normA = listA.map((m) => m.trim().toLowerCase());
    const normB = listB.map((m) => m.trim().toLowerCase());

    const continued: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const possibleDuplicates: Array<{ a: string; b: string; reason: string }> = [];

    // Simple string & prefix reconciliation logic
    for (let i = 0; i < listA.length; i++) {
      const origA = listA[i];
      const a = normA[i];
      const matchInB = listB.find((_, idx) => normB[idx] === a || normB[idx].includes(a) || a.includes(normB[idx]));
      if (matchInB) {
        if (!continued.includes(origA)) continued.push(origA);
      } else {
        removed.push(origA);
      }
    }

    for (let i = 0; i < listB.length; i++) {
      const origB = listB[i];
      const b = normB[i];
      const matchInA = listA.find((_, idx) => normA[idx] === b || normA[idx].includes(b) || b.includes(normA[idx]));
      if (!matchInA) {
        added.push(origB);
      }
    }

    // Check duplicate therapeutic class risks (e.g. NSAID + NSAID)
    const nsaidTerms = ['ibuprofen', 'aspirin', 'naproxen', 'advil', 'aleve', 'celebrex', 'meloxicam'];
    const nsaidsInA = listA.filter((m) => nsaidTerms.some((n) => m.toLowerCase().includes(n)));
    const nsaidsInB = listB.filter((m) => nsaidTerms.some((n) => m.toLowerCase().includes(n)));

    if (nsaidsInA.length > 0 && nsaidsInB.length > 0) {
      for (const aName of nsaidsInA) {
        for (const bName of nsaidsInB) {
          if (aName.toLowerCase() !== bName.toLowerCase()) {
            possibleDuplicates.push({
              a: aName,
              b: bName,
              reason: 'Multiple NSAID agents detected. Risk of severe GI toxicity and renal impairment.',
            });
          }
        }
      }
    }

    return {
      labels: { list_a: labelA, list_b: labelB },
      continued,
      added,
      removed,
      possible_duplicates: possibleDuplicates,
      discrepancy_count: added.length + removed.length + possibleDuplicates.length,
    };
  }

  /** Draft specialist referral note. */
  async draftReferral(
    patientId: string,
    specialty: string,
    reason: string,
    urgency: 'routine' | 'urgent' = 'routine',
  ) {
    let summary;
    try {
      summary = await this.fhir.getPatientSummary(patientId);
    } catch {
      summary = null;
    }

    const patientName = summary?.patient?.name ?? 'Alex Morgan (Synthetic)';
    const age = summary?.patient?.age ?? 46;
    const gender = summary?.patient?.gender ?? 'male';

    const conditions = summary?.active_conditions.map((c) => c.display) ?? ['Type 2 Diabetes Mellitus'];
    const medications = summary?.active_medications.map((m) => m.name) ?? ['Metformin 500 MG'];

    const draftText =
      `SPECIALIST REFERRAL CONSULTATION REQUEST\n` +
      `----------------------------------------\n` +
      `Date: ${new Date().toLocaleDateString()}\n` +
      `To: Department of ${specialty}\n` +
      `Urgency: ${urgency.toUpperCase()}\n\n` +
      `RE: ${patientName} (Age: ${age}, Gender: ${gender})\n\n` +
      `REASON FOR REFERRAL:\n${reason}\n\n` +
      `RELEVANT ACTIVE CONDITIONS:\n${conditions.map((c) => `• ${c}`).join('\n')}\n\n` +
      `CURRENT ACTIVE MEDICATIONS:\n${medications.map((m) => `• ${m}`).join('\n')}\n\n` +
      `CLINICIAN SIGN-OFF REQUIRED:\nThis draft referral was generated by Vitalis Care Coordination. A licensed clinician must review and sign prior to transmission.`;

    return {
      referral: {
        to_specialty: specialty,
        reason,
        urgency,
        patient_summary_block: `${patientName}, ${age}y ${gender}`,
        relevant_conditions: conditions,
        relevant_medications: medications,
        draft_text: draftText,
      },
      requires_clinician_review: true,
    };
  }

  /** Find clinical practice guidelines for a condition via PubMed. */
  async findGuidelines(condition: string, maxResults: number = 5) {
    const { pmids } = await this.pubmed.search(condition, maxResults, 'guideline');
    const summaries = await this.pubmed.getSummaries(pmids);

    const guidelines = summaries.map((s) => ({
      pmid: s.pmid,
      title: s.title,
      journal: s.journal,
      pub_date: s.pubDate,
      organization: s.authors[0] ?? 'Consensus Panel',
      url: `https://pubmed.ncbi.nlm.nih.gov/${s.pmid}/`,
    }));

    return {
      guidelines,
      search_strategy: `PubMed ESearch query: "${condition}" AND "guideline"[pt]`,
    };
  }

  /** Get appointment prep checklist per visit type. */
  getAppointmentPrep(
    visitType: 'new_diagnosis' | 'follow_up' | 'annual_physical' | 'specialist_referral',
    condition?: string,
  ) {
    const prep = this.apptChecklists[visitType] ?? this.apptChecklists.new_diagnosis;
    return {
      visit_type: visitType,
      condition: condition ?? null,
      checklist: prep.checklist,
      bring_list: prep.bring_list,
    };
  }
}
