import React from 'react';
import {
  ShieldCheck,
  History,
  Check,
  Copy,
  Download,
  Play,
} from 'lucide-react';
import type { StoredCard, CrucibleVector, ConnectionProfile } from '../../db';
import type { CrucibleTrustReportData } from '../../utils/crucibleBadgeExporter';
import { getResilienceTier } from '../../utils/crucibleTiers';
import { summarizeProbeScore, type ProbeResult } from '../../utils/crucibleGrading';

export interface TrustScoreReportPanelProps {
  compareVariants: boolean;
  hasVariantFamily: boolean;
  familyCards: StoredCard[];
  rootUuid?: string;
  variantCardAUuid: string;
  variantCardBUuid: string;
  setSelectedVariantAUuid: (uuid: string) => void;
  setSelectedVariantBUuid: (uuid: string) => void;
  isRunningVariantComparison: boolean;
  handleRunVariantComparison: () => void;
  compareModels: boolean;
  profiles: ConnectionProfile[];
  selectedProfileUuids: string[];
  setSelectedProfileUuids: React.Dispatch<React.SetStateAction<string[]>>;
  targetProfiles: ConnectionProfile[];
  activeProfile?: ConnectionProfile;
  multiProfileResults: Record<string, Record<string, ProbeResult>>;
  crucibleResults: Record<string, ProbeResult>;
  vectors: CrucibleVector[];
  passRate: number | null;
  totalPassed: number;
  totalTested: number;
  lastRunTimestamp: number | null;
  isModifiedSinceLastRun: boolean;
  trustReportData: CrucibleTrustReportData;
  copiedReport: boolean;
  isExportingBadge: boolean;
  handleCopyReport: () => void;
  handleDownloadBadge: () => void;
}

export const TrustScoreReportPanel: React.FC<TrustScoreReportPanelProps> = ({
  compareVariants,
  hasVariantFamily,
  familyCards,
  rootUuid,
  variantCardAUuid,
  variantCardBUuid,
  setSelectedVariantAUuid,
  setSelectedVariantBUuid,
  isRunningVariantComparison,
  handleRunVariantComparison,
  compareModels,
  profiles,
  selectedProfileUuids,
  setSelectedProfileUuids,
  targetProfiles,
  activeProfile,
  multiProfileResults,
  crucibleResults,
  vectors,
  passRate,
  totalPassed,
  totalTested,
  lastRunTimestamp,
  isModifiedSinceLastRun,
  trustReportData: _trustReportData,
  copiedReport,
  isExportingBadge,
  handleCopyReport,
  handleDownloadBadge,
}) => {
  return (
    <>
      {/* Variant Comparison Selector Bar */}
      {compareVariants && hasVariantFamily && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-void-950/90 border border-purple-900/60 rounded-xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-300">Card A:</span>
              <select aria-label="Card A"
                value={variantCardAUuid}
                onChange={(e) => setSelectedVariantAUuid(e.target.value)}
                className="bg-void-900 border border-knight-700 text-xs text-mist-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
              >
                {familyCards.map((c) => (
                  <option key={c.uuid} value={c.uuid}>
                    {c.name}{' '}
                    {c.variantLabel
                      ? `(${c.variantLabel})`
                      : c.uuid === rootUuid
                      ? '(Root / Original)'
                      : '(Variant)'}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs text-knight-500 font-bold">vs</span>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-purple-300">Card B:</span>
              <select aria-label="Card B"
                value={variantCardBUuid}
                onChange={(e) => setSelectedVariantBUuid(e.target.value)}
                className="bg-void-900 border border-knight-700 text-xs text-mist-100 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-500"
              >
                {familyCards.map((c) => (
                  <option key={c.uuid} value={c.uuid}>
                    {c.name}{' '}
                    {c.variantLabel
                      ? `(${c.variantLabel})`
                      : c.uuid === rootUuid
                      ? '(Root / Original)'
                      : '(Variant)'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={handleRunVariantComparison}
            disabled={
              isRunningVariantComparison ||
              !variantCardAUuid ||
              !variantCardBUuid ||
              variantCardAUuid === variantCardBUuid
            }
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-purple-600 to-purple-800 hover:from-purple-500 hover:to-purple-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {isRunningVariantComparison ? 'Testing Both Variants...' : 'Run Variant Probes'}
          </button>
        </div>
      )}

      {/* Multi-Profile Selector Bar when Compare Models is enabled */}
      {compareModels && (
        <div className="flex flex-wrap items-center gap-2 p-3 bg-void-950/80 border border-knight-800 rounded-xl">
          <span className="text-xs font-medium text-knight-300 mr-1">Models to Compare:</span>
          {profiles.map((p) => {
            const isSelected = selectedProfileUuids.includes(p.uuid);
            return (
              <button
                key={p.uuid}
                type="button"
                onClick={() => {
                  if (isSelected) {
                    setSelectedProfileUuids((prev) => prev.filter((id) => id !== p.uuid));
                  } else {
                    setSelectedProfileUuids((prev) => [...prev, p.uuid]);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-maroon-900/60 text-maroon-200 border-maroon-700/80'
                    : 'bg-void-900 text-knight-400 border-knight-800 hover:border-knight-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-maroon-400' : 'bg-knight-600'}`} />
                <span>{p.name || p.provider}</span>
                <span className="text-[10px] text-knight-400 font-mono">({p.model || p.provider})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Model Comparison Overview Cards */}
      {compareModels && targetProfiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {targetProfiles.map((prof) => {
            const profResMap =
              multiProfileResults[prof.uuid] || (prof.uuid === activeProfile?.uuid ? crucibleResults : {});
            const { passed: totalP, graded: totalT, rate } = summarizeProbeScore(vectors, profResMap);
            const tier = getResilienceTier(rate);

            return (
              <div key={prof.uuid} className="bg-void-950 border border-knight-800 p-3 rounded-xl space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-mist-100">{prof.name || prof.provider}</span>
                  <span className="text-[10px] font-mono text-knight-400">{prof.model}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-knight-300">Resilience:</span>
                  <span className={`text-xs font-bold font-mono ${tier.tailwindTextClass}`}>
                    {rate !== null ? `${rate}% PASS (${totalP}/${totalT})` : 'Unrated'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Single Profile Trust Score Badge Report */}
      {!compareModels && !compareVariants && passRate !== null && (() => {
        const singleTier = getResilienceTier(passRate);
        return (
          <div className="bg-void-950 border border-maroon-900/80 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-maroon-500/30 text-maroon-400 border border-maroon-400/40 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-maroon-400 tracking-wider flex flex-wrap items-center gap-2">
                  Crucible Trust Badge • <span className={singleTier.tailwindTextClass}>{singleTier.label}</span>
                  {isModifiedSinceLastRun && (
                    <span
                      className="text-[9px] bg-amber-900/60 text-amber-300 px-1.5 py-0.5 rounded flex items-center gap-1 border border-amber-700/40 normal-case tracking-normal"
                      title="Character card was edited after this test run. Re-run to update resilience rating."
                    >
                      <History className="w-2.5 h-2.5" />
                      Card edited since test — re-run to verify
                    </span>
                  )}
                </span>
                <span className="text-sm font-bold text-mist-100 flex flex-wrap items-center gap-2 mt-0.5">
                  Resilience Rating: <span className={singleTier.tailwindTextClass}>{passRate}% PASS</span>
                  <span className="text-xs font-normal text-knight-400">
                    ({totalPassed} / {totalTested} graded probes passed)
                  </span>
                  {lastRunTimestamp && (
                    <span className="text-[11px] font-mono font-normal text-knight-500">
                      • Tested{' '}
                      {new Date(lastRunTimestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center flex-wrap shrink-0">
              <button
                onClick={handleCopyReport}
                className="flex items-center gap-1.5 px-3.5 py-2 min-h-10 bg-void-850 hover:bg-void-800 border border-knight-700 hover:border-knight-600 text-mist-100 rounded-xl text-xs font-medium shadow-sm transition-all whitespace-nowrap touch-fast active:scale-95"
                title="Copy plain-text trust report"
              >
                {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-knight-400" />}
                {copiedReport ? 'Report Copied!' : 'Copy Report'}
              </button>

              <button
                onClick={handleDownloadBadge}
                disabled={isExportingBadge}
                className="flex items-center gap-1.5 px-3.5 py-2 min-h-10 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium shadow-sm transition-all whitespace-nowrap touch-fast active:scale-95"
                title="Export or share visual Trust Badge image"
              >
                <Download className="w-3.5 h-3.5" />
                {isExportingBadge ? 'Exporting...' : 'Download Badge'}
              </button>
            </div>
          </div>
        );
      })()}
    </>
  );
};
