import { describe, it, expect } from 'vitest';
import { DiagnosticsService } from '../../src/modules/diagnostics/diagnostics.service.js';

describe('DiagnosticsService Lab Interpreter Tests (Safety Critical)', () => {
  const service = new DiagnosticsService(null as any);

  it('interprets normal HbA1c correctly', () => {
    const res = service.interpretLabValue('hba1c', 5.2, '%');
    expect(res.flag).toBe('normal');
    expect(res.reference_range?.low).toBe(4.0);
  });

  it('interprets high HbA1c correctly', () => {
    const res = service.interpretLabValue('hba1c', 8.2, '%');
    expect(res.flag).toBe('high');
    expect(res.possible_causes).toContain('Diabetes mellitus (>=6.5%)');
  });

  it('detects critical high glucose threshold', () => {
    const res = service.interpretLabValue('glucose', 450, 'mg/dL');
    expect(res.flag).toBe('critical_high');
  });

  it('detects critical low potassium threshold', () => {
    const res = service.interpretLabValue('potassium', 2.2, 'mEq/L');
    expect(res.flag).toBe('critical_low');
  });

  it('handles unknown analyte gracefully', () => {
    const res = service.interpretLabValue('unknown_compound', 10, 'mg/dL');
    expect(res.flag).toBe('unknown');
    expect(res.caveats).toContain('not in reference range table');
  });
});
