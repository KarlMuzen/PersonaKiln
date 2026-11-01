import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { StoredCard, CrucibleVector } from '../../db';
import { isAutoGraded, summarizeProbeScore, type ProbeResult } from '../../utils/crucibleGrading';

function VariantResultChip({ result, autoGraded }: { result: ProbeResult; autoGraded: boolean }) {
  if (result.error) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 bg-amber-950 text-amber-300 border border-amber-800">
        ERROR
      </span>
    );
  }
  if (!autoGraded) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 bg-void-800 text-knight-300 border border-knight-700/50">
        NOT AUTO-GRADED
      </span>
    );
  }
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 ${
        result.pass
          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
          : 'bg-red-950 text-red-300 border border-red-800'
      }`}
    >
      {result.pass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {result.runs
        ? `${result.passes}/${result.runs} ${result.pass ? 'PASSED' : 'FLAGGED'}`
        : result.pass
        ? 'PASSED'
        : 'FLAGGED'}
    </span>
  );
}

export interface VariantComparisonPanelProps {
  variantResultsA: Record<string, ProbeResult>;
  variantResultsB: Record<string, ProbeResult>;
  cards: StoredCard[];
  variantCardAUuid: string;
  variantCardBUuid: string;
  rootUuid?: string;
  vectors: CrucibleVector[];
}

export const VariantComparisonPanel: React.FC<VariantComparisonPanelProps> = ({
  variantResultsA,
  variantResultsB,
  cards,
  variantCardAUuid,
  variantCardBUuid,
  rootUuid,
  vectors,
}) => {
  const cardA = cards.find((c) => c.uuid === variantCardAUuid);
  const cardB = cards.find((c) => c.uuid === variantCardBUuid);

  const { passed: passA, graded: totalA, rate: rateA } = summarizeProbeScore(vectors, variantResultsA);
  const { passed: passB, graded: totalB, rate: rateB } = summarizeProbeScore(vectors, variantResultsB);
  const hasResultsA = Object.keys(variantResultsA).length > 0;
  const hasResultsB = Object.keys(variantResultsB).length > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        {/* Column Card A */}
        <div className="bg-void-950 border border-knight-700/60 rounded-xl p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-knight-800 pb-2">
            <div className="min-w-0 pr-2">
              <h4 className="text-sm font-bold text-mist-100 truncate">{cardA?.name || 'Card A'}</h4>
              <span className="text-[10px] text-purple-300 font-mono">
                {cardA?.variantLabel || (cardA?.uuid === rootUuid ? 'Root / Base Card' : 'Variant')}
              </span>
            </div>
            <div className="text-right shrink-0">
              <span
                className={`text-xs font-bold font-mono ${
                  rateA === 100
                    ? 'text-emerald-400'
                    : rateA !== null && rateA >= 50
                    ? 'text-amber-400'
                    : rateA !== null
                    ? 'text-red-400'
                    : 'text-knight-500'
                }`}
              >
                {hasResultsA ? (rateA !== null ? `${rateA}% PASS (${passA}/${totalA})` : 'No graded probes') : 'Not Run Yet'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {vectors.map((vector) => {
              const res = variantResultsA[vector.id];
              return (
                <div
                  key={vector.id}
                  className="p-3 bg-void-900 border border-knight-800/80 rounded-lg space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-mist-200">{vector.name}</span>
                    {res ? (
                      <VariantResultChip result={res} autoGraded={isAutoGraded(vector.id)} />
                    ) : (
                      <span className="text-[10px] text-knight-500 font-mono">Pending</span>
                    )}
                  </div>
                  <p className="text-[11px] text-knight-400 italic line-clamp-2">
                    "{vector.prompt}"
                  </p>
                  {res && res.response && (
                    <div className="mt-1 p-2 bg-void-950 border border-knight-800 rounded font-mono text-[10px] text-knight-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {res.response}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Column Card B */}
        <div className="bg-void-950 border border-knight-700/60 rounded-xl p-4 space-y-3 min-w-0">
          <div className="flex items-center justify-between border-b border-knight-800 pb-2">
            <div className="min-w-0 pr-2">
              <h4 className="text-sm font-bold text-mist-100 truncate">{cardB?.name || 'Card B'}</h4>
              <span className="text-[10px] text-purple-300 font-mono">
                {cardB?.variantLabel || (cardB?.uuid === rootUuid ? 'Root / Base Card' : 'Variant')}
              </span>
            </div>
            <div className="text-right shrink-0">
              <span
                className={`text-xs font-bold font-mono ${
                  rateB === 100
                    ? 'text-emerald-400'
                    : rateB !== null && rateB >= 50
                    ? 'text-amber-400'
                    : rateB !== null
                    ? 'text-red-400'
                    : 'text-knight-500'
                }`}
              >
                {hasResultsB ? (rateB !== null ? `${rateB}% PASS (${passB}/${totalB})` : 'No graded probes') : 'Not Run Yet'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5">
            {vectors.map((vector) => {
              const res = variantResultsB[vector.id];
              return (
                <div
                  key={vector.id}
                  className="p-3 bg-void-900 border border-knight-800/80 rounded-lg space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-mist-200">{vector.name}</span>
                    {res ? (
                      <VariantResultChip result={res} autoGraded={isAutoGraded(vector.id)} />
                    ) : (
                      <span className="text-[10px] text-knight-500 font-mono">Pending</span>
                    )}
                  </div>
                  <p className="text-[11px] text-knight-400 italic line-clamp-2">
                    "{vector.prompt}"
                  </p>
                  {res && res.response && (
                    <div className="mt-1 p-2 bg-void-950 border border-knight-800 rounded font-mono text-[10px] text-knight-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {res.response}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
