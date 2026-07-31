'use client';

import React from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

export default function TriageResultWidget() {
  const { data } = useWidgetSDK();
  const theme = useTheme();
  const isDark = theme === 'dark';

  const bg = isDark ? '#111827' : '#ffffff';
  const cardBg = isDark ? '#1f2937' : '#f9fafb';
  const textColor = isDark ? '#f9fafb' : '#111827';
  const mutedText = isDark ? '#9ca3af' : '#4b5563';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const triage = data ?? {
    urgency_tier: 'emergency',
    red_flags: [{ flag: 'Chest Pain / Pressure', reason: 'Possible acute coronary syndrome.' }],
    possible_conditions: [
      { name: 'Acute Coronary Syndrome', likelihood_band: 'common', icd10: 'I24.9' },
      { name: 'Gastroesophageal Reflux', likelihood_band: 'possible', icd10: 'K21.9' },
    ],
    guidance: '⚠️ EMERGENCY GUIDANCE: Severe symptom keywords detected. Call 911 immediately.',
    follow_up_questions: [
      'Are you currently accompanied by someone who can assist you?',
      'Has your breathing changed in the last 10 minutes?',
    ],
    recommended_timeframe: 'Immediate (Call 911 / 112 / 108)',
  };

  const tierColors: Record<string, { bg: string; color: string }> = {
    emergency: { bg: '#ef4444', color: '#ffffff' },
    urgent: { bg: '#f97316', color: '#ffffff' },
    routine: { bg: '#eab308', color: '#111827' },
    self_care: { bg: '#10b981', color: '#ffffff' },
  };

  const badgeStyle = tierColors[triage.urgency_tier] ?? tierColors.routine;

  return (
    <div style={{ backgroundColor: bg, color: textColor, fontFamily: 'system-ui, sans-serif', padding: '16px', borderRadius: '12px', border: `1px solid ${borderColor}`, maxWidth: '640px' }}>
      {/* Header with Urgency Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Triage Assessment Result</h3>
        <span style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.color, padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {triage.urgency_tier}
        </span>
      </div>

      {/* Red Flag Chips if present */}
      {triage.red_flags && triage.red_flags.length > 0 && (
        <div style={{ backgroundColor: '#ef444415', border: '1px solid #ef444440', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
          <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '13px', marginBottom: '6px' }}>🚨 Red Flag Criteria Matched:</div>
          {triage.red_flags.map((rf: any, i: number) => (
            <div key={i} style={{ fontSize: '12px', color: textColor, marginTop: '4px' }}>
              <strong>• {rf.flag}:</strong> {rf.reason}
            </div>
          ))}
        </div>
      )}

      {/* Guidance Card */}
      <div style={{ backgroundColor: cardBg, padding: '14px', borderRadius: '8px', border: `1px solid ${borderColor}`, marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', color: mutedText, fontWeight: '600', marginBottom: '4px' }}>RECOMMENDED ACTION TIMEFRAME</div>
        <div style={{ fontSize: '15px', fontWeight: 'bold', color: badgeStyle.bg, marginBottom: '8px' }}>{triage.recommended_timeframe}</div>
        <div style={{ fontSize: '13px', lineHeight: '1.5' }}>{triage.guidance}</div>
      </div>

      {/* Possible Candidate Conditions */}
      {triage.possible_conditions && triage.possible_conditions.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>Possible Associated Conditions</h4>
          <div style={{ backgroundColor: cardBg, borderRadius: '8px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${borderColor}`, textAlign: 'left', color: mutedText }}>
                  <th style={{ padding: '8px 12px' }}>Condition</th>
                  <th style={{ padding: '8px 12px' }}>Likelihood</th>
                  <th style={{ padding: '8px 12px' }}>ICD-10</th>
                </tr>
              </thead>
              <tbody>
                {triage.possible_conditions.map((c: any, i: number) => (
                  <tr key={i} style={{ borderBottom: i < triage.possible_conditions.length - 1 ? `1px solid ${borderColor}` : 'none' }}>
                    <td style={{ padding: '8px 12px', fontWeight: '600' }}>{c.name}</td>
                    <td style={{ padding: '8px 12px', textTransform: 'capitalize' }}>{c.likelihood_band}</td>
                    <td style={{ padding: '8px 12px', color: mutedText }}>{c.icd10 ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Follow-up Questions */}
      {triage.follow_up_questions && triage.follow_up_questions.length > 0 && (
        <div style={{ backgroundColor: cardBg, padding: '12px', borderRadius: '8px', border: `1px solid ${borderColor}` }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: mutedText, marginBottom: '6px' }}>RECOMMENDED CLINICAL FOLLOW-UP QUESTIONS:</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', lineHeight: '1.6' }}>
            {triage.follow_up_questions.map((q: string, i: number) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
