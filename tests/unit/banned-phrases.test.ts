import { describe, it, expect } from 'vitest';
import { rewriteBannedPhrases } from '../../src/gateway/banned-phrases.js';

describe('ClinicalSafetyInterceptor Banned Phrase Rewriter Tests', () => {
  it('rewrites "you have [condition]" phrasing', () => {
    const text = 'Based on symptoms, you have hypertension.';
    const rewritten = rewriteBannedPhrases(text);
    expect(rewritten).not.toContain('you have hypertension');
    expect(rewritten).toContain('your symptoms may be associated with hypertension');
  });

  it('rewrites "you are diagnosed with" phrasing', () => {
    const text = 'you are diagnosed with type 2 diabetes.';
    const rewritten = rewriteBannedPhrases(text);
    expect(rewritten).not.toContain('you are diagnosed with');
    expect(rewritten).toContain('discuss the possibility of');
  });

  it('rewrites prescriptive dosing language', () => {
    const text = 'you should take 500 mg of metformin daily.';
    const rewritten = rewriteBannedPhrases(text);
    expect(rewritten).toContain('dosing must be confirmed by a clinician or pharmacist');
  });

  it('handles nested objects and arrays recursively', () => {
    const obj = {
      title: 'Assessment',
      details: ['you have asthma.', 'this means you have bronchitis.'],
    };
    const rewritten = rewriteBannedPhrases(obj);
    expect(rewritten.details[0]).toContain('your symptoms may be associated with asthma');
    expect(rewritten.details[1]).toContain('this could indicate');
  });
});
