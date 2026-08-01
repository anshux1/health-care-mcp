/**
 * DiagnosticsService — Diagnostics support module logic (BUILD_PLAN.md §2.3).
 * Interacts with ClinicalTablesService for ICD-10-CM and embedded lab reference ranges.
 */
import { Injectable } from '@nitrostack/core';
import { ClinicalTablesService } from '../../integrations/clinicaltables.service.js';
import { loadDataJson } from '../../data/load-json.js';

const labRangesData = loadDataJson('lab-reference-ranges.json');
const labExplanationsData = loadDataJson('lab-explanations.json');

export type LabFlag = 'low' | 'normal' | 'high' | 'critical_low' | 'critical_high' | 'unknown';

type UnitConversion = {
  value: number;
  unit: string;
  converted: boolean;
};

function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\s+/g, '')
    .replace(/per/g, '/');
}

/** Converts supported alternate units into the embedded table's canonical unit. */
function convertToCanonicalUnit(
  analyte: string,
  value: number,
  unit: string,
  canonicalUnit: string,
): UnitConversion {
  const input = normalizeUnit(unit);
  if (input === normalizeUnit(canonicalUnit)) {
    return { value, unit: canonicalUnit, converted: false };
  }

  const factorByAnalyte: Record<string, Record<string, number>> = {
    glucose: { 'mmol/l': 18.0182 },
    creatinine: { 'umol/l': 1 / 88.4 },
    total_cholesterol: { 'mmol/l': 38.67 },
    ldl: { 'mmol/l': 38.67 },
    hdl: { 'mmol/l': 38.67 },
    triglycerides: { 'mmol/l': 88.57 },
  };

  const factor = factorByAnalyte[analyte]?.[input];
  if (factor === undefined) {
    throw new Error(
      `VALIDATION_ERROR: Unsupported unit "${unit}" for ${analyte}. Expected ${canonicalUnit}`,
    );
  }

  return {
    value: value * factor,
    unit: canonicalUnit,
    converted: true,
  };
}

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

    const conversion = convertToCanonicalUnit(key, value, unit, rangeObj.canonical_unit);
    const canonicalValue = conversion.value;
    const canonicalUnit = conversion.unit;

    let flag: LabFlag = 'normal';
    let possibleCauses: string[] = [];

    if (rangeObj.critical_low !== undefined && canonicalValue <= rangeObj.critical_low) {
      flag = 'critical_low';
      possibleCauses = rangeObj.possible_causes_low;
    } else if (rangeObj.critical_high !== undefined && canonicalValue >= rangeObj.critical_high) {
      flag = 'critical_high';
      possibleCauses = rangeObj.possible_causes_high;
    } else if (canonicalValue < rangeObj.low) {
      flag = 'low';
      possibleCauses = rangeObj.possible_causes_low;
    } else if (canonicalValue > rangeObj.high) {
      flag = 'high';
      possibleCauses = rangeObj.possible_causes_high;
    } else {
      flag = 'normal';
      possibleCauses = ['Within normal reference range.'];
    }

    return {
      analyte: rangeObj.name,
      value: canonicalValue,
      unit: canonicalUnit,
      original_value: value,
      original_unit: unit,
      flag,
      reference_range: {
        low: rangeObj.low,
        high: rangeObj.high,
        unit: rangeObj.canonical_unit,
      },
      possible_causes: possibleCauses,
      caveats:
        'Reference ranges vary slightly by laboratory, method, age, and sex. ' +
        'Results should always be interpreted by the ordering physician in clinical context.' +
        (conversion.converted ? ` Value converted from ${unit} to ${rangeObj.canonical_unit}.` : ''),
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
