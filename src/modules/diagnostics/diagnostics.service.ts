/**
 * DiagnosticsService — Diagnostics support module logic (BUILD_PLAN.md §2.3).
 * Interacts with ClinicalTablesService for ICD-10-CM and embedded lab reference ranges.
 */
import { Injectable } from '@nitrostack/core';
import { ClinicalTablesService } from '../../integrations/clinicaltables.service.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const labRangesData = require('../../data/lab-reference-ranges.json');
const labExplanationsData = require('../../data/lab-explanations.json');

export type LabFlag = 'low' | 'normal' | 'high' | 'critical_low' | 'critical_high' | 'unknown';

@Injectable({ deps: [ClinicalTablesService] })
export class DiagnosticsService {
  private readonly labRanges: Record<
    string,
    {
      name: string;
      canonical_unit: string;
      low: number;
      high: number;
      critical_low?: number;
      critical_high?: number;
      possible_causes_low: string[];
      possible_causes_high: string[];
    }
  > = labRangesData.analytes;

  private readonly labExplanations: Record<
    string,
    {
      test_name: string;
      what_it_measures: string;
      why_ordered: string;
      preparation: string[];
    }
  > = labExplanationsData.explanations;

  constructor(private readonly clinicalTables: ClinicalTablesService) {}

  /** Lookup ICD-10-CM code for condition name. */
  async lookupCondition(query: string, maxResults: number = 10) {
    const results = await this.clinicalTables.searchIcd10(query, maxResults);
    return { results };
  }

  /** Rule-based interpretation of lab value against reference ranges. */
  interpretLabValue(analyte: string, value: number, unit: string) {
    const key = analyte.toLowerCase().trim();
    const rangeObj = this.labRanges[key];

    if (!rangeObj) {
      return {
        analyte,
        value,
        unit,
        flag: 'unknown' as LabFlag,
        reference_range: null,
        possible_causes: [],
        caveats: `Analyte "${analyte}" not in reference range table. Supported analytes: ${Object.keys(this.labRanges).join(', ')}.`,
      };
    }

    let flag: LabFlag = 'normal';
    let possibleCauses: string[] = [];

    if (rangeObj.critical_low !== undefined && value <= rangeObj.critical_low) {
      flag = 'critical_low';
      possibleCauses = rangeObj.possible_causes_low;
    } else if (rangeObj.critical_high !== undefined && value >= rangeObj.critical_high) {
      flag = 'critical_high';
      possibleCauses = rangeObj.possible_causes_high;
    } else if (value < rangeObj.low) {
      flag = 'low';
      possibleCauses = rangeObj.possible_causes_low;
    } else if (value > rangeObj.high) {
      flag = 'high';
      possibleCauses = rangeObj.possible_causes_high;
    } else {
      flag = 'normal';
      possibleCauses = ['Within normal reference range.'];
    }

    return {
      analyte: rangeObj.name,
      value,
      unit,
      flag,
      reference_range: {
        low: rangeObj.low,
        high: rangeObj.high,
        unit: rangeObj.canonical_unit,
      },
      possible_causes: possibleCauses,
      caveats:
        'Reference ranges vary slightly by laboratory, method, age, and sex. ' +
        'Results should always be interpreted by the ordering physician in clinical context.',
    };
  }

  /** Patient-friendly lab test explanation. */
  explainLabTest(testName: string) {
    const key = testName.toLowerCase().trim();
    const explanation = this.labExplanations[key];

    if (!explanation) {
      return {
        test_name: testName,
        what_it_measures: `General laboratory test: ${testName}.`,
        why_ordered: 'Ordered to assess organ function, metabolic state, or screen for disease.',
        preparation: ['Follow instructions provided by your healthcare team or testing lab.'],
        reading_level: 'grade6',
      };
    }

    return {
      ...explanation,
      reading_level: 'grade6',
    };
  }

  /** Symptom text to candidate ICD-10-CM codes for documentation support. */
  async symptomToCodes(symptom: string) {
    const results = await this.clinicalTables.searchIcd10(symptom, 10);
    return {
      symptom,
      candidate_codes: results,
      usage_note:
        'ICD-10-CM candidate codes are provided for clinical documentation assistance only, NOT automated diagnosis.',
    };
  }
}
