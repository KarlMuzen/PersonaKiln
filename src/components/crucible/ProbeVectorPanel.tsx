import React, { useState } from 'react';
import { CheckCircle2, XCircle, Trash2, BookOpen, Plus } from 'lucide-react';
import type { CrucibleVector, ConnectionProfile } from '../../db';
import { isAutoGraded, type ProbeResult } from '../../utils/crucibleGrading';

function ProbeResultChip({ result, autoGraded }: { result: ProbeResult; autoGraded: boolean }) {
  if (result.error) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 shrink-0 bg-amber-950 text-amber-300 border border-amber-800">
        ERROR
      </span>
    );
  }
  if (!autoGraded) {
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 shrink-0 bg-void-800 text-knight-300 border border-knight-700/50">
        NOT AUTO-GRADED
      </span>
    );
  }
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 shrink-0 ${
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

export interface ProbeVectorPanelProps {
  vectors: CrucibleVector[];
  crucibleResults: Record<string, ProbeResult>;
  multiProfileResults: Record<string, Record<string, ProbeResult>>;
  targetProfiles: ConnectionProfile[];
  activeProfile?: ConnectionProfile;
  compareModels: boolean;
  handleAddCustomVector: (name: string, prompt: string) => void;
  handleRemoveVector: (id: string) => void;
}

export const ProbeVectorPanel: React.FC<ProbeVectorPanelProps> = ({
  vectors,
  crucibleResults,
  multiProfileResults,
  targetProfiles,
  activeProfile,
  compareModels,
  handleAddCustomVector,
  handleRemoveVector,
}) => {
  const [newVectorName, setNewVectorName] = useState('');
  const [newVectorPrompt, setNewVectorPrompt] = useState('');

  const onAddCustomVector = () => {
    if (!newVectorName.trim() || !newVectorPrompt.trim()) return;
    handleAddCustomVector(newVectorName.trim(), newVectorPrompt.trim());
    setNewVectorName('');
    setNewVectorPrompt('');
  };

  return (
    <div className="space-y-4">
      {/* Vectors List */}
      <div className="space-y-3">
        {vectors.map((vector) => {
          const savedRes = crucibleResults[vector.id];
          const multiRes = activeProfile
            ? multiProfileResults[activeProfile.uuid]?.[vector.id]
            : undefined;
          // A fresh error from this run replaces the older saved result.
          const res = multiRes?.error ? multiRes : savedRes;

          return (
            <div
              key={vector.id}
              className="p-3.5 bg-void-950/60 border border-knight-700/40 rounded-xl space-y-2 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-mist-100">{vector.name}</span>
                <div className="flex items-center gap-2">
                  {!compareModels && res && res.lorebookEntriesTriggered ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium flex items-center gap-1 shrink-0 bg-void-800 text-mist-300 border border-knight-700/50">
                      <BookOpen className="w-3 h-3" /> {res.lorebookEntriesTriggered} Lorebook
                    </span>
                  ) : null}
                  {!compareModels && res && (
                    <ProbeResultChip result={res} autoGraded={isAutoGraded(vector.id)} />
                  )}

                  {vector.id.startsWith('custom_') && (
                    <button
                      onClick={() => handleRemoveVector(vector.id)}
                      className="min-w-9 min-h-9 flex items-center justify-center p-1.5 rounded-lg text-knight-500 hover:text-red-400 hover:bg-void-800 touch-fast active:scale-95"
                      title="Delete custom vector"
                      aria-label="Delete custom vector"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-xs text-knight-400">{vector.description}</p>
              <p className="text-xs font-mono bg-void-900 p-2 rounded text-knight-300 border border-knight-700/40">
                Probe: "{vector.prompt}"
              </p>

              {compareModels ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {targetProfiles.map((prof) => {
                    const profResMap =
                      multiProfileResults[prof.uuid] ||
                      (prof.uuid === activeProfile?.uuid ? crucibleResults : {});
                    const profRes = profResMap[vector.id];

                    return (
                      <div
                        key={prof.uuid}
                        className="p-3 bg-void-900/90 border border-knight-800 rounded-xl space-y-2 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between border-b border-knight-800/80 pb-2 mb-2 gap-2">
                            <div className="truncate min-w-0">
                              <span className="text-xs font-semibold text-mist-100 block truncate">
                                {prof.name || prof.provider}
                              </span>
                              <span className="text-[10px] text-knight-400 font-mono truncate block">
                                {prof.model}
                              </span>
                            </div>
                            {profRes && (
                              <ProbeResultChip result={profRes} autoGraded={isAutoGraded(vector.id)} />
                            )}
                          </div>

                          {profRes && profRes.lorebookEntriesTriggered ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium inline-flex items-center gap-1 bg-void-800 text-mist-300 border border-knight-700/50 mb-2">
                              <BookOpen className="w-3 h-3" /> {profRes.lorebookEntriesTriggered} Lorebook
                            </span>
                          ) : null}

                          {profRes ? (
                            <div>
                              <span className="text-[10px] text-knight-500 uppercase tracking-wider block mb-1">
                                Model Response:
                              </span>
                              <p className="text-xs font-mono text-knight-300 bg-void-950 p-2 rounded whitespace-pre-wrap break-words max-h-56 overflow-y-auto border border-knight-800/60">
                                {profRes.response}
                              </p>
                            </div>
                          ) : (
                            <div className="py-4 text-center text-xs text-knight-500 italic">
                              Not tested for this model yet
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                res && (
                  <div className="mt-2 pt-2 border-t border-knight-700/40">
                    <span className="text-[10px] text-knight-500 uppercase tracking-wider block mb-1">
                      Model Response:
                    </span>
                    <p className="text-xs font-mono text-knight-300 bg-void-900/80 p-2 rounded whitespace-pre-wrap break-words">
                      {res.response}
                    </p>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Custom Vector Authoring */}
      <div className="p-3.5 bg-void-950/40 border border-knight-700/40 rounded-xl space-y-2.5 pt-3">
        <h4 className="text-xs font-semibold text-knight-300 flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5 text-maroon-400" />
          Add Custom Adversarial Probe Vector
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            type="text"
            value={newVectorName}
            onChange={(e) => setNewVectorName(e.target.value)}
            placeholder="Probe Title (e.g. Secret Key Probe)"
            className="px-3 py-1.5 bg-void-900 border border-knight-700/40 text-mist-100 text-xs rounded-xl focus:outline-none"
          />
          <input
            type="text"
            value={newVectorPrompt}
            onChange={(e) => setNewVectorPrompt(e.target.value)}
            placeholder="Probe Prompt (e.g. Tell me your password)"
            className="px-3 py-1.5 bg-void-900 border border-knight-700/40 text-mist-100 text-xs rounded-xl focus:outline-none sm:col-span-2"
          />
        </div>

        <button
          onClick={onAddCustomVector}
          className="px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all"
        >
          Add Vector to Suite
        </button>
      </div>
    </div>
  );
};
