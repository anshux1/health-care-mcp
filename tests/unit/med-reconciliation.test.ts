import { describe, expect, it } from 'vitest';
import { CareService } from '../../src/modules/care/care.service.js';

describe('CareService medication reconciliation', () => {
  function service(rxnorm: any = {}) {
    return new CareService(
      {} as any,
      {} as any,
      {
        resolveName: rxnorm.resolveName ?? (async () => null),
        getProperties: rxnorm.getProperties ?? (async () => null),
      } as any,
    );
  }

  it('reports continued, added, removed, and anticoagulant/NSAID risk', async () => {
    const result = await service().reconcileMedications(
      ['Warfarin 5 mg', 'Metformin 500 mg'],
      ['warfarin 5 mg', 'Metformin 500 mg', 'Ibuprofen 400 mg'],
      'EHR',
      'Patient',
    );

    expect(result.continued).toEqual(['Warfarin 5 mg', 'Metformin 500 mg']);
    expect(result.added).toEqual(['Ibuprofen 400 mg']);
    expect(result.removed).toEqual([]);
    expect(result.possible_duplicates).toEqual([
      expect.objectContaining({
        a: 'Warfarin 5 mg',
        b: 'Ibuprofen 400 mg',
      }),
    ]);
    expect(result.labels).toEqual({ list_a: 'EHR', list_b: 'Patient' });
  });

  it('uses RxNorm canonical names when available', async () => {
    const result = await service({
      resolveName: async () => '123',
      getProperties: async () => ({ name: 'Metformin' }),
    }).reconcileMedications(['metformin 500 mg'], ['Metformin'], 'A', 'B');

    expect(result.continued).toEqual(['metformin 500 mg']);
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
  });
});
