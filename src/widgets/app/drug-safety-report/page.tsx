'use client';

import React, { useState } from 'react';
import { useWidgetSDK, useTheme } from '@nitrostack/widgets';

export default function DrugSafetyReportWidget() {
  const { data } = useWidgetSDK();
  const theme = useTheme();
  const isDark = theme === 'dark';
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const bg = isDark ? '#111827' : '#ffffff';
  const cardBg = isDark ? '#1f2937' : '#f9fafb';
  const textColor = isDark ? '#f9fafb' : '#111827';
  const mutedText = isDark ? '#9ca3af' : '#4b5563';
  const borderColor = isDark ? '#374151' : '#e5e7eb';

  const report = data ?? {
    interactions: [
      {
        pair: ['warfarin', 'aspirin'],
        severity_band: 'major',
        evidence_excerpt:
          'Aspirin may increase the anticoagulant effect of warfarin. Concomitant use of aspirin and warfarin increases the risk of severe upper gastrointestinal bleeding.',
        source: 'fda_label',
      },
    ],
    drugs_without_labels: [],
    methodology_note: 'Cross-scanned FDA drug label interaction text.',
  };

  const severityBadge: Record<string, { bg: string; color: string }> = {
    contraindicated: { bg: '#dc2626', color: '#ffffff' },
    major: { bg: '#ef4444', color: '#ffffff' },
    moderate: { bg: '#f59e0b', color: '#ffffff' },
    minor: { bg: '#10b981', color: '#ffffff' },
    unknown: { bg: '#6b7280', color: '#ffffff' },
  };

  return (
    <div style={{ backgroundColor: bg, color: textColor, fontFamily: 'system-ui, sans-serif', padding: '16px', borderRadius: '12px', border: `1px solid ${borderColor}`, maxWidth: '640px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '18px', fontWeight: 'bold' }}>FDA Drug Interaction Analysis</h3>

      {/* Interactions List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {report.interactions?.map((item: any, idx: number) => {
          const badge = severityBadge[item.severity_band] ?? severityBadge.unknown;
          const isExpanded = expandedIndex === idx;

          return (
            <div key={idx} style={{ backgroundColor: cardBg, borderRadius: '8px', border: `1px solid ${borderColor}`, overflow: 'hidden' }}>
              <div
                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
              >
                <div>
                  <strong style={{ fontSize: '14px' }}>{item.pair?.[0]} ↔ {item.pair?.[1]}</strong>
                  <div style={{ fontSize: '11px', color: mutedText, marginTop: '2px' }}>Source: FDA Drug Label Text</div>
                </div>
                <span style={{ backgroundColor: badge.bg, color: badge.color, padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {item.severity_band}
                </span>
              </div>

              {isExpanded && (
                <div style={{ padding: '12px', borderTop: `1px solid ${borderColor}`, backgroundColor: isDark ? '#111827' : '#ffffff', fontSize: '12px', lineHeight: '1.5' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px', color: mutedText }}>FDA LABEL EVIDENCE EXCERPT:</div>
                  <div style={{ fontStyle: 'italic', color: textColor }}>"{item.evidence_excerpt}"</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Missing Labels Note */}
      {report.drugs_without_labels && report.drugs_without_labels.length > 0 && (
        <div style={{ fontSize: '12px', color: mutedText, backgroundColor: cardBg, padding: '8px 12px', borderRadius: '6px', border: `1px solid ${borderColor}` }}>
          ℹ️ No official FDA labels found for: {report.drugs_without_labels.join(', ')}
        </div>
      )}
    </div>
  );
}
