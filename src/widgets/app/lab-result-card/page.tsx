'use client';

import React from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

export default function LabResultCardWidget() {
  const { getToolOutput } = useWidgetSDK();
  const data = getToolOutput<any>();
  const theme = useTheme();
  const isDark = theme === 'dark';

  const bg = isDark ? '#111827' : '#ffffff';
  const cardBg = isDark ? '#1f2937' : '#f9fafb';
  const textColor = isDark ? '#f9fafb' : '#111827';
  const mutedText = isDark ? '#9ca3af' : '#4b5563';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const lab = data ?? {
    analyte: 'Glycated Hemoglobin (HbA1c)',
    value: 8.2,
    unit: '%',
    flag: 'high',
    reference_range: { low: 4.0, high: 5.6, unit: '%' },
    possible_causes: ['Diabetes mellitus (>=6.5%)', 'Uncontrolled hyperglycemia'],
    caveats: 'Reference ranges vary by laboratory method.',
  };

  const flagColors: Record<string, string> = {
    critical_high: '#ef4444',
    high: '#f97316',
    normal: '#10b981',
    low: '#3b82f6',
    critical_low: '#ef4444',
    unknown: '#6b7280',
  };

  const flagColor = flagColors[lab.flag] ?? '#6b7280';

  return (
    <div style={{ backgroundColor: bg, color: textColor, fontFamily: 'system-ui, sans-serif', padding: '16px', borderRadius: '12px', border: `1px solid ${borderColor}`, maxWidth: '640px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>{lab.analyte}</h3>
        <span style={{ backgroundColor: `${flagColor}20`, color: flagColor, padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
          {lab.flag}
        </span>
      </div>

      {/* Primary Value Display */}
      <div style={{ backgroundColor: cardBg, padding: '16px', borderRadius: '8px', border: `1px solid ${borderColor}`, textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '32px', fontWeight: 'bold', color: flagColor }}>
          {lab.value} <span style={{ fontSize: '16px', fontWeight: 'normal', color: textColor }}>{lab.unit}</span>
        </div>
        {lab.reference_range && (
          <div style={{ fontSize: '12px', color: mutedText, marginTop: '4px' }}>
            Reference Range: {lab.reference_range.low} – {lab.reference_range.high} {lab.reference_range.unit}
          </div>
        )}
      </div>

      {/* Possible Associated Causes */}
      {lab.possible_causes && lab.possible_causes.length > 0 && (
        <div style={{ backgroundColor: cardBg, padding: '12px', borderRadius: '8px', border: `1px solid ${borderColor}` }}>
          <div style={{ fontSize: '12px', fontWeight: 'bold', color: mutedText, marginBottom: '6px' }}>POSSIBLE ASSOCIATED CLINICAL CAUSES:</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', lineHeight: '1.5' }}>
            {lab.possible_causes.map((cause: string, idx: number) => (
              <li key={idx}>{cause}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
