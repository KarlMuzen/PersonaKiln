import React from 'react';
import {
  FileImage,
  X,
  Download,
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  Check,
  RotateCcw,
} from 'lucide-react';
import type { CharacterCardV3 } from '../../schemas/cardSchema';
import type { CardSnapshot } from '../../db';
import { useModalA11y } from '../../hooks/useModalA11y';

export interface VerifyDiffItem {
  key: string;
  label: string;
  category: string;
  liveValue: string;
  exportedValue: string;
  isMatch: boolean;
  diffSummary?: string;
}

export interface VerifyReport {
  fileName: string;
  format: string;
  verified: boolean;
  matchedCount: number;
  mismatchCount: number;
  diffs: VerifyDiffItem[];
}

export interface ExportVerifyModalProps {
  cardData: CharacterCardV3['data'];
  isPreviewModalOpen: boolean;
  setIsPreviewModalOpen: (open: boolean) => void;
  previewDataUrl: string | null;
  handleExport: (format: 'visual_png' | 'png' | 'json' | 'charx') => Promise<void>;
  diffSnapshot: CardSnapshot | null;
  setDiffSnapshot: (snap: CardSnapshot | null) => void;
  restoreSnapshot: (id: string) => Promise<void>;
  showConfirmDialog: (message: string, title: string) => Promise<boolean>;
  verifyReport: VerifyReport | null;
  setVerifyReport: (report: VerifyReport | null) => void;
}

export const ExportVerifyModal: React.FC<ExportVerifyModalProps> = ({
  cardData: d,
  isPreviewModalOpen,
  setIsPreviewModalOpen,
  previewDataUrl,
  handleExport,
  diffSnapshot,
  setDiffSnapshot,
  restoreSnapshot,
  showConfirmDialog,
  verifyReport,
  setVerifyReport,
}) => {
  const [verifyCategoryFilter, setVerifyCategoryFilter] = React.useState<string>('all');
  const [verifyShowMismatchesOnly, setVerifyShowMismatchesOnly] = React.useState<boolean>(false);

  const previewModalRef = useModalA11y(
    isPreviewModalOpen && !!previewDataUrl,
    () => setIsPreviewModalOpen(false)
  ) as React.RefObject<HTMLDivElement>;

  const diffModalRef = useModalA11y(
    !!diffSnapshot,
    () => setDiffSnapshot(null)
  ) as React.RefObject<HTMLDivElement>;

  const verifyModalRef = useModalA11y(
    !!verifyReport,
    () => setVerifyReport(null)
  ) as React.RefObject<HTMLDivElement>;

  return (
    <>
      {/* 1. VISUAL CARD POSTER PREVIEW MODAL */}
      {isPreviewModalOpen && previewDataUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div
            ref={previewModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-modal-title"
            className="bg-void-900 border border-knight-700/60 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-knight-700/40 flex items-center justify-between bg-void-950">
              <div className="flex items-center gap-2">
                <FileImage className="w-5 h-5 text-maroon-400" />
                <div>
                  <h3 id="preview-modal-title" className="text-sm font-bold text-mist-100">
                    Visual Character Card Poster
                  </h3>
                  <p className="text-[11px] text-knight-400">
                    Rendered canvas image with embedded CCv3 specification metadata
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPreviewModalOpen(false)}
                aria-label="Close poster preview"
                className="p-2 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-100 hover:bg-void-800 rounded-lg transition-colors touch-fast active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Image Preview */}
            <div className="p-4 flex-1 overflow-y-auto flex items-center justify-center bg-void-950/60">
              <div className="relative max-w-full max-h-[60vh] rounded-xl overflow-hidden border border-knight-700/60 shadow-2xl">
                <img
                  src={previewDataUrl}
                  alt={d.name || 'Visual Card Preview'}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] w-auto object-contain mx-auto"
                />
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-knight-700/40 bg-void-900 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-knight-400">
                <span className="text-maroon-400 font-semibold">Visual PNG:</span> the card data is embedded in the image file.
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsPreviewModalOpen(false);
                    handleExport('visual_png');
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all touch-fast active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Visual PNG</span>
                </button>

                <button
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="px-3.5 py-2 bg-void-800 hover:bg-knight-700 text-mist-100 rounded-xl text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. SNAPSHOT DIFF MODAL */}
      {diffSnapshot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div
            ref={diffModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="diff-modal-title"
            className="bg-void-900 border border-knight-700/60 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-knight-700/40 flex items-center justify-between bg-void-950">
              <div className="flex items-center gap-2">
                <GitCompare className="w-5 h-5 text-maroon-400" />
                <div>
                  <h3 id="diff-modal-title" className="text-sm font-bold text-mist-100">
                    Snapshot Comparison Diff
                  </h3>
                  <p className="text-[11px] text-knight-400">
                    Comparing "{diffSnapshot.name}" ({new Date(diffSnapshot.createdAt).toLocaleString()})
                    with active editor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDiffSnapshot(null)}
                aria-label="Close diff modal"
                className="p-2 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-100 hover:bg-void-800 rounded-lg transition-colors touch-fast active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4 font-mono text-xs">
              {(
                [
                  { label: 'Name', key: 'name' },
                  { label: 'Description', key: 'description' },
                  { label: 'First Message', key: 'first_mes' },
                  { label: 'Personality', key: 'personality' },
                  { label: 'Scenario', key: 'scenario' },
                  { label: 'System Prompt', key: 'system_prompt' },
                  { label: 'Post History Instructions', key: 'post_history_instructions' },
                  { label: 'Example Messages', key: 'mes_example' },
                ] as const
              ).map(({ label, key }) => {
                const snapVal = (diffSnapshot.cardData?.data?.[key] as string | undefined) || '';
                const currentVal = (d[key] as string | undefined) || '';
                const isDifferent = snapVal !== currentVal;

                return (
                  <div key={key} className="border border-knight-700/50 rounded-xl p-3 bg-void-950/60 font-sans">
                    <div className="flex items-center justify-between font-semibold text-mist-100 mb-2">
                      <span>{label}</span>
                      {isDifferent ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                          Modified
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-void-800 text-knight-500">
                          Unchanged
                        </span>
                      )}
                    </div>
                    {isDifferent ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-red-950/30 border border-red-900/40 text-red-200 whitespace-pre-wrap break-words font-mono">
                          <div className="text-[10px] text-red-400 font-sans font-bold uppercase mb-1">
                            Snapshot Version
                          </div>
                          {snapVal || <span className="italic opacity-50">(Empty)</span>}
                        </div>
                        <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-900/40 text-emerald-200 whitespace-pre-wrap break-words font-mono">
                          <div className="text-[10px] text-emerald-400 font-sans font-bold uppercase mb-1">
                            Current Active Version
                          </div>
                          {currentVal || <span className="italic opacity-50">(Empty)</span>}
                        </div>
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-void-900/80 text-knight-400 whitespace-pre-wrap truncate max-h-20 font-mono">
                        {currentVal || <span className="italic opacity-50">(Empty)</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-knight-700/40 bg-void-900 flex justify-end gap-2">
              <button
                onClick={async () => {
                  const confirmed = await showConfirmDialog(
                    `Restore snapshot "${diffSnapshot.name}"?`,
                    'Restore Snapshot'
                  );
                  if (confirmed) {
                    await restoreSnapshot(diffSnapshot.id);
                    setDiffSnapshot(null);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-maroon-500 to-maroon-600 text-white rounded-xl text-xs font-semibold"
              >
                <RotateCcw className="w-4 h-4" />
                Restore Snapshot Version
              </button>
              <button
                onClick={() => setDiffSnapshot(null)}
                className="px-4 py-2 bg-void-800 hover:bg-knight-700 text-mist-100 rounded-xl text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. EXPORT VERIFICATION SIDE-BY-SIDE VISUAL DIFF MODAL */}
      {verifyReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 md:p-6 animate-fadeIn">
          <div
            ref={verifyModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="verify-modal-title"
            className="bg-void-900 border border-knight-700/60 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          >
            {/* Modal Header */}
            <div className="p-4 md:p-5 border-b border-knight-700/40 bg-void-950 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                    verifyReport.verified
                      ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400'
                      : 'bg-amber-950/80 border-amber-800 text-amber-400'
                  }`}
                >
                  <GitCompare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="verify-modal-title" className="text-sm md:text-base font-bold text-mist-100">
                      Export Verification Visual Diff
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-void-800 border border-knight-700 text-cyan-300 font-semibold uppercase">
                      {verifyReport.format}
                    </span>
                  </div>
                  <p className="text-xs text-knight-400 font-mono mt-0.5">
                    Target File: <span className="text-mist-200">{verifyReport.fileName}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setVerifyReport(null)}
                aria-label="Close Verification Modal"
                className="p-2 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-100 hover:bg-void-800 rounded-xl transition-colors touch-fast active:scale-95"
                title="Close Verification Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Verification Status Banner */}
            <div
              className={`px-5 py-3 border-b flex items-center justify-between gap-3 ${
                verifyReport.verified
                  ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                  : 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              }`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold">
                {verifyReport.verified ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Round-trip check passed. This app read the exported file back and every compared field matches the live card.
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Verification Discrepancies Found — {verifyReport.mismatchCount} field(s) differ between live
                      card and exported binary.
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 text-xs">
                <span className="px-2 py-0.5 rounded-md bg-emerald-950 text-emerald-300 border border-emerald-800/80 font-mono text-[11px]">
                  {verifyReport.matchedCount} Matched
                </span>
                {verifyReport.mismatchCount > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-red-950 text-red-300 border border-red-800/80 font-mono text-[11px]">
                    {verifyReport.mismatchCount} Discrepancy(ies)
                  </span>
                )}
              </div>
            </div>

            {/* Filters & Options */}
            <div className="p-3 md:p-4 bg-void-950/60 border-b border-knight-700/40 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                {['all', 'Core Metadata', 'Greetings & Lists', 'Lorebook', 'Extensions & Assets'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setVerifyCategoryFilter(cat)}
                    className={`px-3 py-1 rounded-lg transition-all text-xs font-medium ${
                      verifyCategoryFilter === cat
                        ? 'bg-maroon-950 border border-maroon-800 text-maroon-300 font-semibold'
                        : 'bg-void-900 border border-knight-800 text-knight-400 hover:text-mist-100 hover:bg-void-800'
                    }`}
                  >
                    {cat === 'all' ? 'All Categories' : cat}
                  </button>
                ))}
              </div>

              {verifyReport.mismatchCount > 0 && (
                <label className="flex items-center gap-2 cursor-pointer text-knight-300 hover:text-mist-100 select-none">
                  <input
                    type="checkbox"
                    checked={verifyShowMismatchesOnly}
                    onChange={(e) => setVerifyShowMismatchesOnly(e.target.checked)}
                    className="rounded border-knight-700 bg-void-900 text-maroon-500 focus:ring-maroon-500"
                  />
                  <span className="text-xs font-medium">
                    Show Mismatches Only ({verifyReport.mismatchCount})
                  </span>
                </label>
              )}
            </div>

            {/* Column Titles */}
            <div className="grid grid-cols-2 bg-void-950 border-b border-knight-700/40 px-4 py-2 text-xs font-bold text-knight-400 uppercase tracking-wider">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>Live Card (Current Active Editor)</span>
              </div>
              <div className="flex items-center gap-2 border-l border-knight-700/40 pl-4">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span>Exported File (Re-imported Binary)</span>
              </div>
            </div>

            {/* Side-by-Side Diff Field Rows */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {verifyReport.diffs
                .filter((d) => verifyCategoryFilter === 'all' || d.category === verifyCategoryFilter)
                .filter((d) => !verifyShowMismatchesOnly || !d.isMatch)
                .map((diff) => (
                  <div
                    key={diff.key}
                    className={`border rounded-xl p-3.5 space-y-2 font-sans transition-all ${
                      diff.isMatch
                        ? 'bg-void-950/40 border-knight-800/80'
                        : 'bg-amber-950/20 border-amber-800/80 shadow-md'
                    }`}
                  >
                    {/* Field Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-knight-800/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-mist-100">{diff.label}</span>
                        <span className="text-[10px] text-knight-400 bg-void-800 border border-knight-700 px-2 py-0.5 rounded-full font-mono">
                          {diff.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {diff.diffSummary && (
                          <span className="text-[11px] text-knight-400 font-mono hidden sm:inline">
                            {diff.diffSummary}
                          </span>
                        )}
                        {diff.isMatch ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/80 flex items-center gap-1">
                            <Check className="w-3 h-3" /> Match
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800/80 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Discrepancy
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Side-by-side values */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Live Card Box */}
                      <div
                        className={`p-3 rounded-xl border whitespace-pre-wrap break-words font-mono max-h-52 overflow-y-auto ${
                          diff.isMatch
                            ? 'bg-void-950/80 border-knight-800 text-mist-200'
                            : 'bg-red-950/20 border-red-900/60 text-red-200'
                        }`}
                      >
                        <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-emerald-400 mb-1 flex items-center justify-between">
                          <span>Live Editor State</span>
                          <span className="text-[10px] font-mono text-knight-500 font-normal">
                            {diff.liveValue.length} chars
                          </span>
                        </div>
                        {diff.liveValue}
                      </div>

                      {/* Exported Box */}
                      <div
                        className={`p-3 rounded-xl border whitespace-pre-wrap break-words font-mono max-h-52 overflow-y-auto ${
                          diff.isMatch
                            ? 'bg-void-950/80 border-knight-800 text-mist-200'
                            : 'bg-cyan-950/20 border-cyan-900/60 text-cyan-200'
                        }`}
                      >
                        <div className="text-[10px] font-sans font-bold uppercase tracking-wider text-cyan-400 mb-1 flex items-center justify-between">
                          <span>Exported & Re-parsed File</span>
                          <span className="text-[10px] font-mono text-knight-500 font-normal">
                            {diff.exportedValue.length} chars
                          </span>
                        </div>
                        {diff.exportedValue}
                      </div>
                    </div>
                  </div>
                ))}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-knight-700/40 bg-void-950 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-knight-400">
                {verifyReport.verified ? (
                  <span className="text-emerald-400">
                    This check only shows that this app can read its own export back. It does not test other apps, including SillyTavern.
                  </span>
                ) : (
                  <span className="text-amber-400">
                    Review discrepancies above. Some formats (e.g. CCv2 or Chub JSON) intentionally fold or omit
                    advanced fields.
                  </span>
                )}
              </div>

              <button
                onClick={() => setVerifyReport(null)}
                className="px-4 py-2 bg-void-800 hover:bg-knight-700 text-mist-100 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Verification Diff
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
