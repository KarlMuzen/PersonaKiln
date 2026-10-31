import React, { useState, useMemo } from 'react';
import { Sparkles, ShieldAlert, ArrowRight, Wand2, History, Activity, Bot, Copy, Check, Zap, AlertCircle } from 'lucide-react';
import { useCardStore } from '../store/useCardStore';
import { useDialogStore } from '../store/useDialogStore';
import { useToastStore } from '../store/useToastStore';
import { sendLLMRequest } from '../services/llmAdapter';
import { cardPatchSchema, cardPatchJsonSchema, type CardPatch } from '../schemas/patchSchema';
import { applyCardPatch } from '../utils/applyCardPatch';
import { PatchPreviewPanel } from './PatchPreviewPanel';

interface RunDataScore {
  agendaHeld: boolean;
  tellConsistency: number;
  openerQuality: number;
  loreDelivery: number;
  driftOnsetTurn: number | null;
  reasoning: string;
}

interface RunDataTranscriptItem {
  role: string;
  text: string;
}

interface ScenarioRunData {
  transcript?: RunDataTranscriptItem[];
  scores?: RunDataScore;
  error?: string;
  timestamp?: number;
}

interface CrucibleScenarioItem {
  id: string;
  name: string;
  persona: string;
  lastRunResult?: Record<string, ScenarioRunData>;
}

interface RunItem {
  scenarioId: string;
  scenarioName: string;
  persona: string;
  profileId: string;
  runData: ScenarioRunData;
  timestamp: number;
}

export const EnhancerView: React.FC = () => {
  const { activeCard, activeCardRecord, profiles, activeProfileUuid, setActiveTab, setPreFlightAuditOpen } = useCardStore();
  const [selectedScenarioRun, setSelectedScenarioRun] = useState<{ scenarioId: string; profileId: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [enhancerRationale, setEnhancerRationale] = useState<string>('');
  const [generatedPatches, setGeneratedPatches] = useState<CardPatch[] | null>(null);
  const [parseNotice, setParseNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const scenarios = useMemo(() => {
    return ((activeCardRecord?.scenarios as CrucibleScenarioItem[]) || []).filter(
      (s) => s.id !== 'scripted_template' && s.lastRunResult
    );
  }, [activeCardRecord?.scenarios]);

  const allRuns = useMemo(() => {
    const runs: RunItem[] = [];
    scenarios.forEach((s) => {
      if (s.lastRunResult) {
        Object.entries(s.lastRunResult).forEach(([profileId, runData]) => {
          if (runData && runData.scores) {
            runs.push({
              scenarioId: s.id,
              scenarioName: s.name,
              persona: s.persona,
              profileId,
              runData,
              timestamp: runData.timestamp || 0
            });
          }
        });
      }
    });
    return runs.sort((a, b) => b.timestamp - a.timestamp);
  }, [scenarios]);

  const handleGenerateEnhancements = async () => {
    if (!selectedScenarioRun || !activeCard) return;
    const run = allRuns.find(r => r.scenarioId === selectedScenarioRun.scenarioId && r.profileId === selectedScenarioRun.profileId);
    if (!run) return;
    
    const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);

    if (!activeProfile) {
       useDialogStore.getState().showAlert("Please select an active connection profile in Settings to use AI features.", "No Profile", "warning");
       return;
    }

    setIsGenerating(true);
    setEnhancerRationale('');
    setGeneratedPatches(null);
    setParseNotice(null);

    try {
      const transcriptStr = (run.runData.transcript || []).map((m) => `${m.role === 'user' ? 'User' : (activeCard?.data?.name || 'Char')}: ${m.text}`).join('\n\n');
      const scoreStr = JSON.stringify(run.runData.scores, null, 2);

      const prompt = `You are an expert character card enhancer. Analyze the following roleplay transcript and its diagnostic scores, then propose concrete structured card patches to fix the observed issues.

Diagnostic Scores:
${scoreStr}

Transcript:
${transcriptStr}

Current Card state:
${JSON.stringify({
  name: activeCard?.data.name,
  description: activeCard?.data.description,
  personality: activeCard?.data.personality,
  first_mes: activeCard?.data.first_mes,
  system_prompt: activeCard?.data.system_prompt,
  lorebook_entries: activeCard?.data.character_book?.entries?.map((e, idx) => ({
    lorebookEntryIndex: idx,
    name: e.name || e.comment || `Entry #${idx + 1}`,
    content: e.content,
  })) || [],
}, null, 2)}

Propose field updates as structured patches.`;

      const response = await sendLLMRequest(activeProfile, {
        systemPrompt: "You are an expert creative writing and character card AI assistant specializing in card optimization.",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        maxTokens: 1500,
        responseSchema: {
          name: 'card_patch',
          description: 'Structured patches for character card fields and lorebook entries',
          schema: cardPatchJsonSchema,
        },
      });

      const rawText = response.text || '';
      setEnhancerRationale(rawText);

      try {
        let cleanText = rawText.trim();
        cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsedJson = JSON.parse(cleanText);
        const parseResult = cardPatchSchema.safeParse(parsedJson);

        if (parseResult.success && parseResult.data.patches.length > 0) {
          setGeneratedPatches(parseResult.data.patches);
        } else {
          setParseNotice("couldn't generate structured suggestions, showing raw output");
        }
      } catch {
        setParseNotice("couldn't generate structured suggestions, showing raw output");
      }

    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(err);
      useDialogStore.getState().showAlert(`Enhancer failed: ${errMsg}`, "Enhancer Error", "danger");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPatches = (selectedIndices: number[]) => {
    if (!generatedPatches) return;
    const patchesToApply = selectedIndices.map((i) => generatedPatches[i]);
    const store = useCardStore.getState();
    const cardUuid = store.activeCardUuid;
    if (!cardUuid || !store.activeCard) {
      useToastStore.getState().showToast({
        title: 'Could not apply suggested edits',
        message: 'No active character is available. The suggestions were kept.',
        type: 'error',
      });
      return;
    }

    const previousCardJson = JSON.stringify(store.activeCard);
    try {
      store.updateActiveCardData(
        (prev) => patchesToApply.reduce((acc, patch) => applyCardPatch(acc, patch), prev),
        { forceUndo: true }
      );
    } catch (err) {
      useToastStore.getState().showToast({
        title: 'Could not apply suggested edits',
        message: err instanceof Error ? err.message : 'One or more edits could not be applied.',
        type: 'error',
        duration: 6000,
      });
      return;
    }

    setGeneratedPatches(null);
    useToastStore.getState().showToast({
      title: `Applied ${patchesToApply.length} edits`,
      message: 'Suggested edits applied to the active character.',
      type: 'success',
      duration: 6000,
      action: {
        label: 'Undo',
        onClick: () => {
          const current = useCardStore.getState();
          const latestUndo = current.undoStack[current.undoStack.length - 1]?.cardData;
          if (current.activeCardUuid !== cardUuid || JSON.stringify(latestUndo) !== previousCardJson) {
            useToastStore.getState().showToast({
              title: 'Newer changes exist',
              message: 'Use the editor Undo control to review more recent changes first.',
              type: 'warning',
            });
            return;
          }
          current.undo();
        },
      },
    });
  };

  const handleCopySuggestions = async () => {
    if (!enhancerRationale) return;
    await navigator.clipboard.writeText(enhancerRationale);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="subview-container p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-void-900 border border-knight-700/40 rounded-2xl p-5 md:p-6">
        <div className="flex items-start gap-3.5">
          <div className="p-3 bg-maroon-500/10 border border-maroon-500/30 rounded-xl text-maroon-400 shrink-0">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-mist-100 flex items-center gap-2">
              Character Enhancer
            </h1>
            <p className="text-xs text-knight-400 mt-1 max-w-xl">
              Automated card optimization using Crucible diagnostic scores to fix lorebook leaks, formatting issues, and personality drift.
            </p>
          </div>
        </div>

        <button
          onClick={() => setPreFlightAuditOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all shrink-0"
        >
          <Zap className="w-4 h-4 text-emerald-300" />
          Pre-Flight Quality Check (Free)
        </button>
      </div>

      {allRuns.length === 0 ? (
        <div className="bg-void-900/80 border border-knight-700/40 rounded-2xl p-8 md:p-12 text-center space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-maroon-950/60 border border-maroon-800/40 flex items-center justify-center text-maroon-400 mx-auto shadow-inner">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-base font-semibold text-mist-100">
              No Diagnostic Results Available
            </h2>
            <p className="text-xs text-knight-400 leading-relaxed">
              Run Crucible on this character first — Enhancer will read the results and propose fixes.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => setActiveTab('crucible')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-maroon-600/20 hover:bg-maroon-600/30 text-maroon-200 border border-maroon-500/30 rounded-xl text-xs font-semibold transition-all touch-fast active:scale-95 shadow-sm"
            >
              <span>Open Crucible Diagnostic Suite</span>
              <ArrowRight className="w-4 h-4 text-maroon-400" />
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
           {/* Left Sidebar: Select Run */}
           <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-1.5">
                <History className="w-4 h-4 text-maroon-400" />
                Select Diagnostic Run
              </h3>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
                 {allRuns.map((run, idx) => {
                    const isSelected = selectedScenarioRun?.scenarioId === run.scenarioId && selectedScenarioRun?.profileId === run.profileId;
                    const profileName = profiles.find(p => p.uuid === run.profileId)?.name || 'Unknown Profile';
                    const score = run.runData.scores;
                    const isPoorScore = score && (score.tellConsistency < 5 || score.driftOnsetTurn !== null);

                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedScenarioRun({ scenarioId: run.scenarioId, profileId: run.profileId })}
                        className={`w-full flex flex-col text-left p-3 rounded-xl border transition-all touch-fast ${
                          isSelected ? 'bg-maroon-950/40 border-maroon-500/50' : 'bg-void-950/50 border-knight-800 hover:border-knight-700/80 hover:bg-void-800'
                        }`}
                      >
                         <div className="flex items-center justify-between gap-2 w-full">
                           <span className="text-xs font-medium text-mist-200 truncate">{run.scenarioName}</span>
                           {isPoorScore && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Poor scores detected"></span>}
                         </div>
                         <div className="text-[10px] text-knight-400 truncate flex items-center gap-1 mt-1">
                           <Bot className="w-3 h-3" /> {profileName}
                         </div>
                         <div className="text-[10px] text-knight-500 mt-1.5 font-mono bg-void-950 rounded px-1.5 py-0.5 inline-block">
                           {run.persona}
                         </div>
                      </button>
                    )
                 })}
              </div>
           </div>

           {/* Main Content Area: Run Summary & Action */}
           <div className="lg:col-span-2 space-y-4">
              {selectedScenarioRun ? (() => {
                 const run = allRuns.find(r => r.scenarioId === selectedScenarioRun.scenarioId && r.profileId === selectedScenarioRun.profileId);
                 if (!run) return null;
                 const score = run.runData.scores;

                 return (
                   <>
                     <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-knight-700/40">
                           <h2 className="text-sm font-semibold text-mist-100 flex items-center gap-1.5">
                              <Activity className="w-4 h-4 text-maroon-400" />
                              Diagnostic Summary
                           </h2>
                           <button
                               onClick={handleGenerateEnhancements}
                               disabled={isGenerating}
                               className="px-4 py-2 min-h-10 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 text-white rounded-xl text-xs font-medium shadow-sm transition-all disabled:opacity-50 touch-fast active:scale-95 flex items-center gap-1.5"
                           >
                              <Wand2 className="w-3.5 h-3.5" />
                              {isGenerating ? 'Synthesizing Patches...' : 'Generate Enhancements'}
                           </button>
                        </div>

                        {score ? (
                           <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                             <div className="p-3 bg-void-950 rounded-xl border border-knight-800">
                                <div className="text-[10px] text-knight-400 uppercase tracking-wider font-semibold mb-1">Agenda Held</div>
                                <div className={`text-sm font-bold ${score.agendaHeld ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {score.agendaHeld ? 'YES' : 'NO'}
                                </div>
                             </div>
                             <div className="p-3 bg-void-950 rounded-xl border border-knight-800">
                                <div className="text-[10px] text-knight-400 uppercase tracking-wider font-semibold mb-1">Tell Consistency</div>
                                <div className="text-sm font-bold text-mist-200">{score.tellConsistency}/10</div>
                             </div>
                             <div className="p-3 bg-void-950 rounded-xl border border-knight-800">
                                <div className="text-[10px] text-knight-400 uppercase tracking-wider font-semibold mb-1">Lore Delivery</div>
                                <div className="text-sm font-bold text-mist-200">{score.loreDelivery}/10</div>
                             </div>
                             <div className="p-3 bg-void-950 rounded-xl border border-knight-800">
                                <div className="text-[10px] text-knight-400 uppercase tracking-wider font-semibold mb-1">Drift Onset Turn</div>
                                <div className={`text-sm font-bold ${score.driftOnsetTurn ? 'text-red-400' : 'text-emerald-400'}`}>
                                  {score.driftOnsetTurn || 'None'}
                                </div>
                             </div>
                             <div className="col-span-full p-3 bg-void-950 rounded-xl border border-knight-800 space-y-1">
                                <div className="text-[10px] text-knight-400 uppercase tracking-wider font-semibold">Judge Reasoning</div>
                                <div className="text-xs text-mist-300 leading-relaxed">{score.reasoning}</div>
                             </div>
                           </div>
                        ) : (
                           <div className="text-xs text-knight-400 p-4 text-center">No scores found for this run.</div>
                        )}
                     </div>

                     {/* Parse Notice if fallback to raw occurred */}
                     {parseNotice && (
                       <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200 flex items-center gap-2">
                         <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                         <span>{parseNotice}</span>
                       </div>
                     )}

                     {/* Structured Patch Preview Panel */}
                     {generatedPatches && activeCard && (
                       <PatchPreviewPanel
                         patches={generatedPatches}
                         card={activeCard}
                         onApply={handleApplyPatches}
                         onDismiss={() => setGeneratedPatches(null)}
                       />
                     )}

                     {/* Raw output is shown only when structured patches could not be read */}
                     {enhancerRationale && parseNotice && (
                       <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-5 space-y-4 animate-fadeIn">
                          <div className="flex items-center justify-between pb-2 border-b border-knight-700/40">
                            <h3 className="text-sm font-semibold text-maroon-300 flex items-center gap-1.5">
                               <Sparkles className="w-4 h-4" />
                               Enhancer Raw Output & Recommendations
                            </h3>
                            <button
                              onClick={handleCopySuggestions}
                              className="px-3.5 py-2 min-h-10 bg-knight-800 hover:bg-knight-700 text-mist-200 rounded-xl text-xs font-medium border border-knight-700/60 transition-all flex items-center gap-1.5 touch-fast active:scale-95"
                            >
                              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-knight-300" />}
                              <span>{copied ? 'Copied' : 'Copy All'}</span>
                            </button>
                          </div>
                          <div className="text-xs text-mist-200 leading-relaxed whitespace-pre-wrap font-sans bg-void-950 p-4 rounded-xl border border-knight-800 max-h-96 overflow-y-auto custom-scrollbar">
                            {enhancerRationale}
                          </div>
                       </div>
                     )}
                   </>
                 )
              })() : (
                 <div className="bg-void-900/50 border border-knight-700/40 rounded-2xl p-12 text-center text-knight-400 text-xs">
                    Select a diagnostic run from the list to view its summary and generate enhancements.
                 </div>
              )}
           </div>
        </div>
      )}
    </div>
  );
};
