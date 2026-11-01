import React, { useState, useEffect } from 'react';
import { useCardStore } from '../store/useCardStore';
import { useDialogStore } from '../store/useDialogStore';
import { useToastStore } from '../store/useToastStore';
import { countTokens, countTokensAsync } from '../utils/tokenizer';
import { scanLorebook } from '../utils/lorebookScan';
import { renderTrustBadgeCanvasBytes } from '../utils/crucibleBadgeExporter';
import { summarizeProbeScore, type ProbeResult } from '../utils/crucibleGrading';

import {
  FlaskConical,
  ShieldAlert,
  Play,
  Zap,
  Columns,
  GitCompare,
} from 'lucide-react';
import { type CrucibleVector, DEFAULT_CRUCIBLE_VECTORS } from '../db';
import { useCrucibleRun } from './crucible/useCrucibleRun';
import {
  DiagnosticScorePanel,
  renderPlainLanguageScoreSummary,
  safeExtractAndParseJSON,
  executeCrucibleVectorsOnCard,
} from './crucible/DiagnosticScorePanel';
import { ScenarioPicker } from './crucible/ScenarioPicker';
import { TranscriptViewer } from './crucible/TranscriptViewer';
import { ProbeVectorPanel } from './crucible/ProbeVectorPanel';
import { TokenBudgetPanel } from './crucible/TokenBudgetPanel';
import { TrustScoreReportPanel } from './crucible/TrustScoreReportPanel';
import { VariantComparisonPanel } from './crucible/VariantComparisonPanel';
import { ScenarioAutoRunnerPanel } from './crucible/ScenarioAutoRunnerPanel';
import { LorebookSimulatorPanel } from './crucible/LorebookSimulatorPanel';

export {
  safeExtractAndParseJSON,
  renderPlainLanguageScoreSummary,
  executeCrucibleVectorsOnCard,
  DiagnosticScorePanel,
  ScenarioPicker,
  TranscriptViewer,
  ProbeVectorPanel,
  TokenBudgetPanel,
  TrustScoreReportPanel,
  VariantComparisonPanel,
  ScenarioAutoRunnerPanel,
  LorebookSimulatorPanel,
};

export const CrucibleView: React.FC = () => {
  const {
    activeCard,
    activeCardRecord,
    activeCardUuid,
    cards,
    updateActiveCardTestSuites,
    profiles,
    activeProfileUuid,
    setPreFlightAuditOpen,
  } = useCardStore();
  const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);

  const provider = activeProfile?.provider;
  const [isRunningCrucible, setIsRunningCrucible] = useState(false);

  // Variant family calculation
  const rootUuid = activeCardRecord?.variantOf || activeCardRecord?.uuid;
  const familyCards = React.useMemo(() => {
    if (!rootUuid) return [];
    return cards.filter((c) => c.uuid === rootUuid || c.variantOf === rootUuid);
  }, [cards, rootUuid]);
  const hasVariantFamily = familyCards.length >= 2;

  const [compareVariants, setCompareVariants] = useState<boolean>(false);
  const [selectedVariantAUuid, setSelectedVariantAUuid] = useState<string>('');
  const [selectedVariantBUuid, setSelectedVariantBUuid] = useState<string>('');
  const [isRunningVariantComparison, setIsRunningVariantComparison] = useState<boolean>(false);
  const [variantResultsA, setVariantResultsA] = useState<Record<string, ProbeResult>>({});
  const [variantResultsB, setVariantResultsB] = useState<Record<string, ProbeResult>>({});

  const variantCardAUuid =
    selectedVariantAUuid && familyCards.some((c) => c.uuid === selectedVariantAUuid)
      ? selectedVariantAUuid
      : familyCards.find((c) => c.uuid === rootUuid)?.uuid || familyCards[0]?.uuid || '';

  const variantCardBUuid =
    selectedVariantBUuid && familyCards.some((c) => c.uuid === selectedVariantBUuid && c.uuid !== variantCardAUuid)
      ? selectedVariantBUuid
      : familyCards.find((c) => c.uuid !== variantCardAUuid)?.uuid || familyCards[1]?.uuid || '';

  const cardTestSuites =
    activeCardRecord?.testSuites && activeCardRecord.testSuites.length > 0
      ? activeCardRecord.testSuites
      : DEFAULT_CRUCIBLE_VECTORS;

  const vectors = cardTestSuites;

  const crucibleResults = React.useMemo(() => {
    const res: Record<string, ProbeResult> = {};
    for (const v of vectors) {
      if (v.lastRunResult) {
        res[v.id] = {
          pass: v.lastRunResult.passed,
          passes: v.lastRunResult.passes,
          runs: v.lastRunResult.runs,
          response: v.lastRunResult.response || '',
          lorebookEntriesTriggered: v.lastRunResult.lorebookEntriesTriggered,
          timestamp: v.lastRunResult.timestamp,
        };
      }
    }
    return res;
  }, [vectors]);

  const [compareModels, setCompareModels] = useState<boolean>(false);
  const [selectedProfileUuids, setSelectedProfileUuids] = useState<string[]>([]);
  const [multiProfileResults, setMultiProfileResults] = useState<
    Record<string, Record<string, ProbeResult>>
  >({});

  // Initialize selected profile UUIDs with all profiles when profiles load
  const [hasInitializedProfiles, setHasInitializedProfiles] = useState(false);
  if (!hasInitializedProfiles && profiles.length > 0) {
    setHasInitializedProfiles(true);
    setSelectedProfileUuids(profiles.map((p) => p.uuid));
  }

  const targetProfiles = !compareModels
    ? activeProfile
      ? [activeProfile]
      : []
    : (() => {
        const selected = profiles.filter((p) => selectedProfileUuids.includes(p.uuid));
        return selected.length > 0 ? selected : activeProfile ? [activeProfile] : profiles;
      })();

  const [copiedReport, setCopiedReport] = useState(false);
  const [isExportingBadge, setIsExportingBadge] = useState(false);
  const [actualPromptTokens, setActualPromptTokens] = useState<number | null>(null);

  // Lorebook simulator state
  const [simulatorInput, setSimulatorInput] = useState('');

  const d = activeCard?.data;

  // Async token state for real provider counts
  const [asyncTokenCounts, setAsyncTokenCounts] = useState<{
    desc?: number;
    personality?: number;
    scenario?: number;
    firstMes?: number;
    systemPrompt?: number;
    postHistory?: number;
    lorebook?: number;
  }>({});

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(async () => {
      if (!d) return;
      const [desc, personality, scenario, firstMes, systemPrompt, postHistory] = await Promise.all([
        countTokensAsync(d.description, true, activeProfile),
        countTokensAsync(d.personality, true, activeProfile),
        countTokensAsync(d.scenario, true, activeProfile),
        countTokensAsync(d.first_mes, true, activeProfile),
        countTokensAsync(d.system_prompt, true, activeProfile),
        countTokensAsync(d.post_history_instructions, true, activeProfile),
      ]);
      const entries = d.character_book?.entries || [];
      const entryCounts = await Promise.all(
        entries.map((entry) => countTokensAsync(entry.content, true, activeProfile))
      );
      const lorebook = entryCounts.reduce((a, b) => a + b, 0);

      if (isMounted) {
        setAsyncTokenCounts({
          desc,
          personality,
          scenario,
          firstMes,
          systemPrompt,
          postHistory,
          lorebook,
        });
      }
    }, 600);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [d, activeProfile]);

  const simulatedLorebookResults = React.useMemo(() => {
    if (!d) return [];
    return scanLorebook(d.character_book || undefined, simulatorInput).activatedEntries;
  }, [d, simulatorInput]);

  // Hook for Crucible Scenario auto-runner & simulated dialogues
  const crucibleRun = useCrucibleRun({
    compareModels,
    targetProfiles,
    activeProfile,
  });

  const lastRunTimestamp = React.useMemo(() => {
    const timestamps = Object.values(crucibleResults)
      .map((r) => r.timestamp)
      .filter((t): t is number => typeof t === 'number');
    return timestamps.length > 0 ? Math.max(...timestamps) : null;
  }, [crucibleResults]);

  const handleAddCustomVector = (name: string, prompt: string) => {
    if (!name.trim() || !prompt.trim()) return;
    const newVec: CrucibleVector = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      description: 'Custom user-authored probe vector.',
      prompt: prompt.trim(),
    };
    const updated = [...vectors, newVec];
    updateActiveCardTestSuites(updated);
  };

  const handleRemoveVector = (id: string) => {
    const updated = vectors.filter((v) => v.id !== id);
    updateActiveCardTestSuites(updated);
  };

  // Calculate field tokens (fallback to sync countTokens if async not resolved yet)
  const descTokens = asyncTokenCounts.desc ?? (d ? countTokens(d.description, true, provider) : 0);
  const personalityTokens = asyncTokenCounts.personality ?? (d ? countTokens(d.personality, true, provider) : 0);
  const scenarioTokens = asyncTokenCounts.scenario ?? (d ? countTokens(d.scenario, true, provider) : 0);
  const firstMesTokens = asyncTokenCounts.firstMes ?? (d ? countTokens(d.first_mes, true, provider) : 0);
  const systemPromptTokens = asyncTokenCounts.systemPrompt ?? (d ? countTokens(d.system_prompt, true, provider) : 0);
  const postHistoryTokens =
    asyncTokenCounts.postHistory ?? (d ? countTokens(d.post_history_instructions, true, provider) : 0);

  const lorebookEntries = d?.character_book?.entries || [];
  const lorebookTokens =
    asyncTokenCounts.lorebook ??
    lorebookEntries.reduce((acc, entry) => acc + countTokens(entry.content, true, provider), 0);

  const totalCardTokens =
    descTokens +
    personalityTokens +
    scenarioTokens +
    firstMesTokens +
    systemPromptTokens +
    postHistoryTokens +
    lorebookTokens;

  const targetBudget = 4096;
  const budgetPercentage = Math.min(Math.round((totalCardTokens / targetBudget) * 100), 100);

  // Trust score counts only auto-graded probes with a result and no error.
  const { passed: totalPassed, graded: totalTested, rate: passRate } = summarizeProbeScore(
    vectors,
    crucibleResults
  );

  const cardModSec = d?.modification_date || 0;
  const cardModMs = cardModSec * 1000;
  const isModifiedSinceLastRun = lastRunTimestamp !== null && cardModMs > lastRunTimestamp + 2000;

  const trustReportData = React.useMemo(() => {
    let maxTurnsNoDrift = 0;
    const testedModels = new Set<string>();

    if (activeCardRecord?.scenarios) {
      for (const s of activeCardRecord.scenarios) {
        if (!s.lastRunResult) continue;
        for (const [profUuid, res] of Object.entries(s.lastRunResult)) {
          const prof = profiles.find((p) => p.uuid === profUuid);
          if (prof) testedModels.add(prof.model || prof.provider);
          if (res.scores && res.scores.driftOnsetTurn === null) {
            maxTurnsNoDrift = Math.max(maxTurnsNoDrift, s.turnCount);
          }
        }
      }
    }

    // Add models tested in the jailbreak probes
    Object.keys(multiProfileResults).forEach((profUuid) => {
      const prof = profiles.find((p) => p.uuid === profUuid);
      if (prof) testedModels.add(prof.model || prof.provider);
    });

    const modelString = testedModels.size > 0 ? Array.from(testedModels).join(' + ') : 'None';
    const driftString = maxTurnsNoDrift > 0 ? `No drift in ${maxTurnsNoDrift} turns` : 'Not tested / Drift detected';

    return {
      passRate,
      totalPassed,
      totalTested,
      driftString,
      modelString,
      totalCardTokens,
      targetBudget,
      characterName: d?.name || 'Untitled',
    };
  }, [
    activeCardRecord,
    profiles,
    multiProfileResults,
    passRate,
    totalPassed,
    totalTested,
    totalCardTokens,
    targetBudget,
    d,
  ]);

  const handleCopyReport = () => {
    const {
      characterName,
      totalPassed: pPassed,
      totalTested: pTested,
      driftString,
      modelString,
      totalCardTokens: cardTokens,
      targetBudget: budget,
    } = trustReportData;

    const reportText = `🔥 **Roleplay Forge Report** 🛡️
**Character:** ${characterName}
**Leak checks passed:** ${pPassed}/${pTested} (keyword check)
**Character Consistency:** ${driftString}
**Tested On:** ${modelString}
**Token Efficiency:** ${cardTokens} / ${budget}

*Generated via Roleplay Forge Studio*`;

    navigator.clipboard.writeText(reportText);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  const handleDownloadBadge = async () => {
    if (isExportingBadge) return;
    try {
      setIsExportingBadge(true);
      const pngBytes = await renderTrustBadgeCanvasBytes(trustReportData);
      const blob = new Blob([pngBytes], { type: 'image/png' });
      const safeName = (trustReportData.characterName || 'card').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const fileName = `${safeName}_forge_test_badge.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (
        typeof navigator !== 'undefined' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] }) &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({
          title: `${trustReportData.characterName} — Crucible Trust Badge`,
          text: `Crucible Trust Badge for ${trustReportData.characterName}`,
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        useToastStore.getState().showToast({
          title: 'Badge Saved',
          message: 'Crucible Trust Badge downloaded to your device.',
          type: 'success',
        });
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        useToastStore.getState().showToast({
          title: 'Badge Export Failed',
          message: err instanceof Error ? err.message : String(err),
          type: 'error',
        });
      }
    } finally {
      setIsExportingBadge(false);
    }
  };

  if (!activeCard || !d) {
    return (
      <div className="p-8 text-center text-knight-400">
        <p className="text-sm">Please select a character card to run laboratory diagnostics and Crucible tests.</p>
      </div>
    );
  }

  const handleRunCrucible = async () => {
    if (targetProfiles.length === 0) {
      await useDialogStore.getState().showAlert(
        compareModels
          ? 'Please select at least one connection profile to compare in Crucible.'
          : 'Please configure a connection profile in Settings before running Crucible tests.',
        'Missing Configuration',
        'warning'
      );
      return;
    }

    setIsRunningCrucible(true);

    try {
      const runTimestamp = Date.now();
      const profileTasks = targetProfiles.map(async (prof) => {
        const { results: profResults, actualTokensUsed } = await executeCrucibleVectorsOnCard(
          activeCard,
          prof,
          vectors
        );
        return { profUuid: prof.uuid, profResults, actualTokensUsed };
      });

      const outputs = await Promise.all(profileTasks);

      const updatedMultiResults = { ...multiProfileResults };
      for (const out of outputs) {
        updatedMultiResults[out.profUuid] = out.profResults;
      }
      setMultiProfileResults(updatedMultiResults);

      const primaryProfUuid = activeProfile?.uuid || targetProfiles[0]?.uuid;
      const primaryResults = primaryProfUuid ? updatedMultiResults[primaryProfUuid] || {} : {};

      const updatedVectors: CrucibleVector[] = vectors.map((v) => {
        const res = primaryResults[v.id];
        if (res && !res.error) {
          return {
            ...v,
            lastRunResult: {
              passed: res.pass,
              passes: res.passes,
              runs: res.runs,
              response: res.response,
              timestamp: runTimestamp,
              lorebookEntriesTriggered: res.lorebookEntriesTriggered,
            },
          };
        }
        return v;
      });

      const primaryTokens = outputs.find((o) => o.profUuid === primaryProfUuid)?.actualTokensUsed;
      const firstTokens = outputs.find((o) => o.actualTokensUsed !== undefined)?.actualTokensUsed;
      setActualPromptTokens(primaryTokens ?? firstTokens ?? null);
      await updateActiveCardTestSuites(updatedVectors);
    } finally {
      setIsRunningCrucible(false);
    }
  };

  const handleRunVariantComparison = async () => {
    if (!activeProfile) {
      await useDialogStore.getState().showAlert(
        'Please configure a connection profile in Settings before running variant comparison tests.',
        'Missing Configuration',
        'warning'
      );
      return;
    }

    const cardA = cards.find((c) => c.uuid === variantCardAUuid);
    const cardB = cards.find((c) => c.uuid === variantCardBUuid);

    if (!cardA || !cardB) {
      await useDialogStore.getState().showAlert(
        'Please select two cards to compare.',
        'Invalid Selection',
        'warning'
      );
      return;
    }

    setIsRunningVariantComparison(true);

    try {
      const [resA, resB] = await Promise.all([
        executeCrucibleVectorsOnCard(cardA.cardData, activeProfile, vectors),
        executeCrucibleVectorsOnCard(cardB.cardData, activeProfile, vectors),
      ]);

      setVariantResultsA(resA.results);
      setVariantResultsB(resB.results);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore.getState().showAlert(`Comparison failed: ${message}`, 'Error', 'danger');
    } finally {
      setIsRunningVariantComparison(false);
    }
  };

  return (
    <div className="subview-container p-4 md:p-6 max-w-5xl mx-auto space-y-6 pb-24">
      {/* Header */}
      <div className="bg-void-900 border border-knight-700/40 p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-mist-100 flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-maroon-400" />
            Character Laboratory & Stress Testing
          </h2>
          <p className="text-xs text-knight-400">Token budget analysis and Crucible adversarial testing</p>
        </div>

        <button
          onClick={() => setPreFlightAuditOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
        >
          <Zap className="w-4 h-4 text-emerald-300" />
          Run Pre-Flight Audit (Free)
        </button>
      </div>

      {/* 1. Token Budget Breakdown */}
      <TokenBudgetPanel
        totalCardTokens={totalCardTokens}
        targetBudget={targetBudget}
        budgetPercentage={budgetPercentage}
        actualPromptTokens={actualPromptTokens}
        descTokens={descTokens}
        personalityTokens={personalityTokens}
        scenarioTokens={scenarioTokens}
        firstMesTokens={firstMesTokens}
        systemPromptTokens={systemPromptTokens}
        lorebookTokens={lorebookTokens}
      />

      {/* 2. Crucible Adversarial Stress Testing */}
      <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-knight-700/40 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-mist-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-maroon-400" />
              Crucible Adversarial Probes
            </h3>
            <p className="text-xs text-knight-400 mt-0.5">
              Stress-test whether this character holds constraints when probed with jailbreaks and gaslighting.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            {hasVariantFamily && (
              <button
                type="button"
                onClick={() => {
                  const nextVal = !compareVariants;
                  setCompareVariants(nextVal);
                  if (nextVal) {
                    setCompareModels(false);
                  }
                }}
                className={`flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-xl text-xs font-medium border transition-all touch-fast active:scale-95 ${
                  compareVariants
                    ? 'bg-purple-950/80 text-purple-300 border-purple-700/60 shadow-sm'
                    : 'bg-void-950 text-knight-300 border-knight-700/60 hover:text-mist-100 hover:bg-void-900'
                }`}
                title="Compare Crucible probe results between card variants"
              >
                <GitCompare className="w-3.5 h-3.5 text-purple-400" />
                Compare Variants
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const nextVal = !compareModels;
                setCompareModels(nextVal);
                if (nextVal) {
                  setCompareVariants(false);
                  if (selectedProfileUuids.length === 0) {
                    setSelectedProfileUuids(profiles.map((p) => p.uuid));
                  }
                }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 min-h-10 rounded-xl text-xs font-medium border transition-all touch-fast active:scale-95 ${
                compareModels
                  ? 'bg-amber-950/80 text-amber-300 border-amber-700/60 shadow-sm'
                  : 'bg-void-950 text-knight-300 border-knight-700/60 hover:text-mist-100 hover:bg-void-900'
              }`}
              title="Toggle multi-profile model comparison mode"
            >
              <Columns className="w-3.5 h-3.5 text-amber-400" />
              Compare Models
            </button>

            <button
              onClick={handleRunCrucible}
              disabled={isRunningCrucible || compareVariants}
              className="flex items-center gap-1.5 px-4 py-2 min-h-10 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-xs font-medium transition-all shadow-sm disabled:opacity-50 touch-fast active:scale-95"
              title="Re-run all saved test vectors against the active character card"
            >
              <Play className="w-3.5 h-3.5" />
              {isRunningCrucible ? 'Testing Probes...' : 'Run All'}
            </button>
          </div>
        </div>

        {/* Variant Comparison Selector & Model Comparison / Single Profile Report */}
        <TrustScoreReportPanel
          compareVariants={compareVariants}
          hasVariantFamily={hasVariantFamily}
          familyCards={familyCards}
          rootUuid={rootUuid}
          variantCardAUuid={variantCardAUuid}
          variantCardBUuid={variantCardBUuid}
          setSelectedVariantAUuid={setSelectedVariantAUuid}
          setSelectedVariantBUuid={setSelectedVariantBUuid}
          isRunningVariantComparison={isRunningVariantComparison}
          handleRunVariantComparison={handleRunVariantComparison}
          compareModels={compareModels}
          profiles={profiles}
          selectedProfileUuids={selectedProfileUuids}
          setSelectedProfileUuids={setSelectedProfileUuids}
          targetProfiles={targetProfiles}
          activeProfile={activeProfile}
          multiProfileResults={multiProfileResults}
          crucibleResults={crucibleResults}
          vectors={vectors}
          passRate={passRate}
          totalPassed={totalPassed}
          totalTested={totalTested}
          lastRunTimestamp={lastRunTimestamp}
          isModifiedSinceLastRun={isModifiedSinceLastRun}
          trustReportData={trustReportData}
          copiedReport={copiedReport}
          isExportingBadge={isExportingBadge}
          handleCopyReport={handleCopyReport}
          handleDownloadBadge={handleDownloadBadge}
        />

        {/* Probes Results: Side-by-side Variant Comparison or Standard/Multi-Model Vectors */}
        {compareVariants ? (
          <VariantComparisonPanel
            variantResultsA={variantResultsA}
            variantResultsB={variantResultsB}
            cards={cards}
            variantCardAUuid={variantCardAUuid}
            variantCardBUuid={variantCardBUuid}
            rootUuid={rootUuid}
            vectors={vectors}
          />
        ) : (
          <ProbeVectorPanel
            vectors={vectors}
            crucibleResults={crucibleResults}
            multiProfileResults={multiProfileResults}
            targetProfiles={targetProfiles}
            activeProfile={activeProfile}
            compareModels={compareModels}
            handleAddCustomVector={handleAddCustomVector}
            handleRemoveVector={handleRemoveVector}
          />
        )}
      </div>

      {/* 3. Simulated Scenario & Tester Personas Auto-Runner */}
      <ScenarioAutoRunnerPanel
        crucibleRun={crucibleRun}
        cards={cards}
        activeCardUuid={activeCardUuid}
        activeCardRecord={activeCardRecord}
        characterName={d.name || 'Character'}
        profiles={profiles}
      />

      {/* 4. Lorebook Activation Simulator */}
      <LorebookSimulatorPanel
        simulatorInput={simulatorInput}
        setSimulatorInput={setSimulatorInput}
        simulatedLorebookResults={simulatedLorebookResults}
      />
    </div>
  );
};
