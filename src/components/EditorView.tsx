import React from 'react';
import { validateCardCompleteness, getCardInfoNotes } from '../utils/validation';
import { useCardStore } from '../store/useCardStore';
import { useDialogStore } from '../store/useDialogStore';
import { useToastStore } from '../store/useToastStore';
import { countTokens, countTokensAsync, getTokenSchemeName } from '../utils/tokenizer';
import { exportCardData, importCardData } from '../io';
import { prepareCoverForPng } from '../utils/coverToPng';
import { getCardCoverUrl } from './GalleryView';
import { CardAvatar } from './CardAvatar';
import type { StoredCard, CardSnapshot } from '../db';
import { exportVisualCardPng, renderVisualCardCanvasBytes } from '../utils/visualCardExporter';
import {
  Save,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Eye,
  FileImage,
  GitCompare,
  BarChart3,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { IdentitySection } from './editor/IdentitySection';
import { MetadataSection } from './editor/MetadataSection';
import { GreetingsSection } from './editor/GreetingsSection';
import { LorebookLinksSection } from './editor/LorebookLinksSection';
import { AdvancedPromptsSection } from './editor/AdvancedPromptsSection';
import { ExportVerifyModal, type VerifyReport, type VerifyDiffItem } from './editor/ExportVerifyModal';

export type { VerifyReport, VerifyDiffItem };

export const EditorView: React.FC = () => {
  const {
    activeCard,
    activeCardUuid,
    cards,
    createSnapshot,
    restoreSnapshot,
    deleteSnapshot,
    updateActiveCardData,
    saveActiveCard,
    saveState,
    setChatPreviewOpen,
    activeCardEmbeddedAssets,
    setCardCoverImage,
    removeCardCoverImage,
    createVariant,
    setActiveTab,
  } = useCardStore();
  const { profiles, activeProfileUuid } = useCardStore();
  const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);
  const provider = activeProfile?.provider;

  const coverInputRef = React.useRef<HTMLInputElement>(null);
  const [isExportingVisual, setIsExportingVisual] = React.useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = React.useState(false);
  const [previewDataUrl, setPreviewDataUrl] = React.useState<string | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = React.useState(false);
  const [diffSnapshot, setDiffSnapshot] = React.useState<CardSnapshot | null>(null);
  const [verifyReport, setVerifyReport] = React.useState<VerifyReport | null>(null);
  const [tokenBudgetLimit, setTokenBudgetLimit] = React.useState<number>(4096);

  const d = activeCard?.data;
  const storedCard = cards.find((c) => c.uuid === activeCardUuid);

  // Cover Image URL calculation
  const coverUrl = activeCard
    ? getCardCoverUrl({
        cardData: activeCard,
        embeddedAssets: activeCardEmbeddedAssets,
      } as StoredCard)
    : null;

  const [asyncFieldTokens, setAsyncFieldTokens] = React.useState<{
    desc?: number;
    greeting?: number;
    personality?: number;
    scenario?: number;
    systemPrompt?: number;
    postHistory?: number;
    mesExample?: number;
  }>({});

  React.useEffect(() => {
    if (!d) return;
    let isCancelled = false;
    Promise.all([
      countTokensAsync(d.description || '', true, activeProfile),
      countTokensAsync(d.first_mes || '', true, activeProfile),
      countTokensAsync(d.personality || '', true, activeProfile),
      countTokensAsync(d.scenario || '', true, activeProfile),
      countTokensAsync(d.system_prompt || '', true, activeProfile),
      countTokensAsync(d.post_history_instructions || '', true, activeProfile),
      countTokensAsync(d.mes_example || '', true, activeProfile),
    ]).then(
      ([desc, greeting, personality, scenario, systemPrompt, postHistory, mesExample]) => {
        if (!isCancelled) {
          setAsyncFieldTokens({
            desc,
            greeting,
            personality,
            scenario,
            systemPrompt,
            postHistory,
            mesExample,
          });
        }
      }
    );
    return () => {
      isCancelled = true;
    };
  }, [
    d?.description,
    d?.first_mes,
    d?.personality,
    d?.scenario,
    d?.system_prompt,
    d?.post_history_instructions,
    d?.mes_example,
    activeProfile,
  ]);

  const descTokens = asyncFieldTokens.desc ?? (d ? countTokens(d.description, true, provider) : 0);
  const greetingTokens = asyncFieldTokens.greeting ?? (d ? countTokens(d.first_mes, true, provider) : 0);
  const personalityTokens =
    asyncFieldTokens.personality ?? (d ? countTokens(d.personality, true, provider) : 0);
  const scenarioTokens = asyncFieldTokens.scenario ?? (d ? countTokens(d.scenario, true, provider) : 0);
  const systemPromptTokens =
    asyncFieldTokens.systemPrompt ?? (d ? countTokens(d.system_prompt, true, provider) : 0);
  const postHistoryTokens =
    asyncFieldTokens.postHistory ?? (d ? countTokens(d.post_history_instructions, true, provider) : 0);
  const mesExampleTokens =
    asyncFieldTokens.mesExample ?? (d ? countTokens(d.mes_example, true, provider) : 0);

  const totalTokens =
    descTokens +
    greetingTokens +
    personalityTokens +
    scenarioTokens +
    systemPromptTokens +
    postHistoryTokens +
    mesExampleTokens;
  const tokenPercentage = Math.min(100, Math.round((totalTokens / tokenBudgetLimit) * 100));

  const [lastExported, setLastExported] = React.useState<{
    bytes: Uint8Array;
    format: 'visual_png' | 'png' | 'json' | 'charx';
    fileName: string;
    verified?: boolean;
  } | null>(null);

  if (!activeCard || !d) {
    return (
      <div className="p-8 text-center text-knight-400">
        <p className="text-sm">No card selected for editing.</p>
      </div>
    );
  }

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    await setCardCoverImage(bytes, file.type || 'image/png');

    if (coverInputRef.current) coverInputRef.current.value = '';
  };

  const completenessWarnings = validateCardCompleteness(activeCard);
  const infoNotes = getCardInfoNotes(activeCard);
  const warnings: string[] = [...completenessWarnings];

  if (totalTokens > 4096)
    warnings.push(`High static prompt size (${totalTokens} tokens). Consider trimming for efficiency.`);

  const fullText = (d.description || '') + (d.first_mes || '') + (d.scenario || '');
  const openBraces = (fullText.match(/\{\{/g) || []).length;
  const closeBraces = (fullText.match(/\}\}/g) || []).length;
  if (openBraces !== closeBraces)
    warnings.push('Macro syntax alert: {{ open braces do not match }} closing braces.');

  const handleExport = async (format: 'visual_png' | 'png' | 'json' | 'charx') => {
    if (!activeCard) return;
    setIsExportingVisual(true);

    try {
      let bytes: Uint8Array;
      if (format === 'visual_png') {
        bytes = await exportVisualCardPng(activeCard, {
          coverUrl,
          provider,
          embeddedAssets: activeCardEmbeddedAssets,
        });
      } else {
        let basePng: Uint8Array | undefined;
        if (format === 'png') {
          const cover = await prepareCoverForPng(activeCard, activeCardEmbeddedAssets);
          basePng = cover.basePng;
          if (cover.note) {
            useToastStore.getState().showToast({
              title: 'Cover not included',
              message: cover.note,
              type: 'warning',
            });
          }
        }
        bytes = await exportCardData(activeCard, format, {
          ...(basePng ? { basePng } : {}),
          embeddedAssets: activeCardEmbeddedAssets,
          backfillV2: true,
        });
      }

      const suffix = format === 'visual_png' ? '_visual' : '';
      const ext = format === 'charx' ? 'charx' : format === 'json' ? 'json' : 'png';
      const fileName = `${(d.name || 'card').replace(/[^a-z0-9_-]/gi, '_')}${suffix}.${ext}`;

      const blob = new Blob([bytes as unknown as BlobPart], {
        type: format === 'json' ? 'application/json' : 'image/png',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);

      setLastExported({
        bytes,
        format,
        fileName,
        verified: false,
      });

      const formatNames: Record<string, string> = {
        visual_png: 'Visual Card PNG',
        png: 'Metadata PNG',
        charx: 'CHARX Archive',
        json: 'JSON Spec',
      };
      const formatLabel = formatNames[format] || format.toUpperCase();

      useToastStore.getState().showToast({
        title: 'Export Successful',
        message: `Exported "${d.name || 'Character Card'}" as ${formatLabel} (${fileName}).`,
        type: 'success',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore.getState().showAlert(`Export error: ${message}`, 'Export Error', 'danger');
    } finally {
      setIsExportingVisual(false);
    }
  };

  const handlePreviewVisualCard = async () => {
    if (!activeCard) return;
    setIsGeneratingPreview(true);
    try {
      const bytes = await renderVisualCardCanvasBytes({
        card: activeCard,
        coverUrl,
        provider,
      });
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      setPreviewDataUrl(url);
      setIsPreviewModalOpen(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore
        .getState()
        .showAlert(`Preview generation error: ${message}`, 'Preview Error', 'danger');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleVerifyExport = async () => {
    if (!lastExported || !activeCard) return;

    try {
      const result = await importCardData(lastExported.bytes, lastExported.fileName);
      if (!result.card) {
        throw new Error('Exported binary file failed to re-import.');
      }

      const reimported = result.card.data;
      const original = activeCard.data;

      const canonicalizeJson = (val: unknown): string => {
        if (val === undefined || val === null) return 'null';
        if (typeof val !== 'object') return JSON.stringify(val);
        if (Array.isArray(val)) {
          return '[' + val.map(canonicalizeJson).join(',') + ']';
        }
        const obj = val as Record<string, unknown>;
        const keys = Object.keys(obj).sort();
        return '{' + keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(obj[k])}`).join(',') + '}';
      };

      const formatValue = (val: unknown): string => {
        if (val === undefined || val === null) return '(Empty)';
        if (typeof val === 'string') return val.trim() === '' ? '(Empty)' : val;
        if (Array.isArray(val)) {
          if (val.length === 0) return '(Empty list)';
          if (val.every((item) => typeof item === 'string')) return val.join(', ');
          return JSON.stringify(val, null, 2);
        }
        if (typeof val === 'object') {
          if (Object.keys(val).length === 0) return '(Empty object)';
          return JSON.stringify(val, null, 2);
        }
        return String(val);
      };

      const diffs: VerifyDiffItem[] = [];

      // 1. Core Metadata / Text Fields
      const textFields: { key: keyof typeof original; label: string }[] = [
        { key: 'name', label: 'Character Name' },
        { key: 'nickname', label: 'Nickname' },
        { key: 'character_version', label: 'Character Version' },
        { key: 'creator', label: 'Creator / Author' },
        { key: 'description', label: 'Description' },
        { key: 'personality', label: 'Personality' },
        { key: 'scenario', label: 'Scenario' },
        { key: 'first_mes', label: 'First Message' },
        { key: 'mes_example', label: 'Example Dialogue' },
        { key: 'creator_notes', label: 'Creator Notes' },
        { key: 'system_prompt', label: 'System Prompt Override' },
        { key: 'post_history_instructions', label: 'Post-History Instructions' },
      ];

      for (const { key, label } of textFields) {
        const origVal = (original[key] as string) || '';
        const reimpVal = (reimported[key] as string) || '';
        const isMatch = origVal === reimpVal;
        diffs.push({
          key: String(key),
          label,
          category: 'Core Metadata',
          liveValue: formatValue(origVal),
          exportedValue: formatValue(reimpVal),
          isMatch,
          diffSummary: isMatch
            ? 'Exact string match'
            : `Length mismatch (${origVal.length} vs ${reimpVal.length} chars)`,
        });
      }

      // 2. Greetings & Lists
      const listFields: { key: keyof typeof original; label: string }[] = [
        { key: 'tags', label: 'Tags' },
        { key: 'alternate_greetings', label: 'Alternate Greetings' },
        { key: 'group_only_greetings', label: 'Group-Only Greetings' },
      ];

      for (const { key, label } of listFields) {
        const origArr = (original[key] as string[]) || [];
        const reimpArr = (reimported[key] as string[]) || [];
        const isMatch = canonicalizeJson(origArr) === canonicalizeJson(reimpArr);
        diffs.push({
          key: String(key),
          label,
          category: 'Greetings & Lists',
          liveValue: formatValue(origArr),
          exportedValue: formatValue(reimpArr),
          isMatch,
          diffSummary: isMatch ? 'Exact match' : `Item count: ${origArr.length} vs ${reimpArr.length}`,
        });
      }

      // 3. Lorebook
      const origBook = original.character_book;
      const reimpBook = reimported.character_book;

      diffs.push({
        key: 'lorebook_name',
        label: 'Lorebook Title',
        category: 'Lorebook',
        liveValue: formatValue(origBook?.name),
        exportedValue: formatValue(reimpBook?.name),
        isMatch: (origBook?.name || '') === (reimpBook?.name || ''),
      });

      const origEntries = origBook?.entries || [];
      const reimpEntries = reimpBook?.entries || [];
      const entriesMatch = canonicalizeJson(origEntries) === canonicalizeJson(reimpEntries);
      diffs.push({
        key: 'lorebook_entries',
        label: `Lorebook Entries Payload (${origEntries.length} entries)`,
        category: 'Lorebook',
        liveValue: formatValue(origEntries),
        exportedValue: formatValue(reimpEntries),
        isMatch: entriesMatch,
        diffSummary: entriesMatch
          ? `Exact match (${origEntries.length} entries)`
          : `Entry count: ${origEntries.length} vs ${reimpEntries.length}`,
      });

      // 4. Extensions & Assets
      const origExt = original.extensions || {};
      const reimpExt = reimported.extensions || {};
      const extMatch = canonicalizeJson(origExt) === canonicalizeJson(reimpExt);
      diffs.push({
        key: 'extensions',
        label: 'Extension Objects',
        category: 'Extensions & Assets',
        liveValue: formatValue(origExt),
        exportedValue: formatValue(reimpExt),
        isMatch: extMatch,
        diffSummary: extMatch ? 'Exact match' : 'Keys or payload mismatch',
      });

      const origNotes = original.creator_notes_multilingual || {};
      const reimpNotes = reimported.creator_notes_multilingual || {};
      const notesMatch = canonicalizeJson(origNotes) === canonicalizeJson(reimpNotes);
      diffs.push({
        key: 'creator_notes_multilingual',
        label: 'Multilingual Creator Notes',
        category: 'Extensions & Assets',
        liveValue: formatValue(origNotes),
        exportedValue: formatValue(reimpNotes),
        isMatch: notesMatch,
      });

      const origAssets = original.assets || [];
      const reimpAssets = reimported.assets || [];
      const assetsMatch = canonicalizeJson(origAssets) === canonicalizeJson(reimpAssets);
      diffs.push({
        key: 'assets',
        label: 'Embedded Assets Payload',
        category: 'Extensions & Assets',
        liveValue: formatValue(origAssets),
        exportedValue: formatValue(reimpAssets),
        isMatch: assetsMatch,
        diffSummary: assetsMatch
          ? `Exact match (${origAssets.length} assets)`
          : `Asset count: ${origAssets.length} vs ${reimpAssets.length}`,
      });

      const matchedCount = diffs.filter((d) => d.isMatch).length;
      const mismatchCount = diffs.length - matchedCount;
      const verified = mismatchCount === 0;

      setLastExported((prev) => (prev ? { ...prev, verified } : null));

      setVerifyReport({
        fileName: lastExported.fileName,
        format: lastExported.format,
        verified,
        matchedCount,
        mismatchCount,
        diffs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore
        .getState()
        .showAlert(`Verification failed: ${message}`, 'Verification Error', 'danger');
    }
  };

  return (
    <div className="subview-container p-4 md:p-6 max-w-5xl mx-auto space-y-6 pb-24 min-w-0 overflow-x-hidden">
      {/* Top Toolbar / Action Bar */}
      <div className="bg-void-900 border border-knight-700/40 p-4 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => saveActiveCard()}
            disabled={saveState === 'saved' || saveState === 'saving'}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-b from-maroon-500 to-maroon-600 hover:from-maroon-400 hover:to-maroon-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all touch-fast active:scale-95 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save Card'}</span>
          </button>

          <button
            onClick={() => createVariant(activeCardUuid!)}
            className="flex items-center gap-1.5 px-3 py-2 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700/80 rounded-xl text-xs font-medium transition-all"
            title="Create a new variant of this card"
          >
            <GitCompare className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Create Variant</span>
          </button>
        </div>


      </div>

      <details className="bg-void-900 border border-knight-700/40 rounded-2xl shadow-sm">
        <summary className="min-h-11 flex flex-nowrap items-center justify-between gap-2 px-3 cursor-pointer list-none">
          <span
            title="Estimated tokens"
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-mono font-semibold whitespace-nowrap ${
              tokenPercentage > 90
                ? 'border-red-800 bg-red-950/50 text-red-300'
                : tokenPercentage > 75
                  ? 'border-amber-800 bg-amber-950/50 text-amber-300'
                  : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
            }`}
          >
            {totalTokens}/{tokenBudgetLimit} tok
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {warnings.length === 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1 text-xs font-semibold text-emerald-300 whitespace-nowrap">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                OK
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-800/80 bg-amber-950/40 px-2.5 py-1 text-xs font-semibold text-amber-300 whitespace-nowrap">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                {warnings.length} alerts
              </span>
            )}
            <ChevronDown className="h-4 w-4 shrink-0 text-knight-400" aria-hidden="true" />
          </span>
        </summary>
        <div className="p-3.5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-mist-100">
              <BarChart3 className="w-4 h-4 text-maroon-400" />
              <span>Character Token Budget</span>
              <span className="font-mono text-knight-400">
                ({totalTokens} / {tokenBudgetLimit} {getTokenSchemeName(provider)})
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-knight-400">Context Limit:</span>
              <select aria-label="Context limit"
                value={tokenBudgetLimit}
                onChange={(e) => setTokenBudgetLimit(Number(e.target.value))}
                className="bg-void-800 border border-knight-700/80 rounded-lg px-2 py-1 text-xs text-mist-100 font-mono focus:outline-none"
              >
                <option value={2048}>2048 (Compact)</option>
                <option value={4096}>4096 (Standard)</option>
                <option value={8192}>8192 (Expanded)</option>
                <option value={16384}>16384 (Massive)</option>
              </select>
            </div>
          </div>

          {/* Density Progress Bar */}
          <div className="w-full h-2 bg-void-950 rounded-full overflow-hidden border border-knight-700/40">
            <div
              className={`h-full transition-all duration-300 ${
                tokenPercentage > 90
                  ? 'bg-red-500'
                  : tokenPercentage > 75
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${tokenPercentage}%` }}
            />
          </div>

          {/* Breakdown Chips */}
          <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] font-mono text-knight-400">
            <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
              Desc: {descTokens}
            </span>
            <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
              Greeting: {greetingTokens}
            </span>
            <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
              Personality: {personalityTokens}
            </span>
            <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
              Scenario: {scenarioTokens}
            </span>
            {systemPromptTokens > 0 && (
              <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
                System: {systemPromptTokens}
              </span>
            )}
            {postHistoryTokens > 0 && (
              <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
                Post-history: {postHistoryTokens}
              </span>
            )}
            {mesExampleTokens > 0 && (
              <span className="px-2 py-0.5 bg-void-800 rounded-md border border-knight-700/40">
                Examples: {mesExampleTokens}
              </span>
            )}
          </div>

        {/* Quality & Health Check Banner */}
        {warnings.length > 0 ? (
          <div className="bg-amber-950/40 border border-amber-800/80 p-4 rounded-2xl space-y-1 text-xs text-amber-200">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Card Health Check Alerts ({warnings.length})
            </div>
            <ul className="list-disc list-inside space-y-1 text-amber-300/80 pl-1">
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="bg-emerald-950/30 border border-emerald-800/60 p-3 rounded-2xl text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Card Health Check Passed — Spec compliant and ready for chat testing.
            </div>
            <span className="text-[10px] text-emerald-400 font-mono">100% OK</span>
          </div>
        )}
        {infoNotes.map((note, idx) => (
          <p key={idx} className="text-xs text-knight-400">
            {note}
          </p>
        ))}
        </div>
      </details>

      {/* MAIN EDITOR FORM SECTIONS */}
      <div className="space-y-6 min-w-0">
        <IdentitySection
          cardData={d}
          updateActiveCardData={updateActiveCardData}
          descTokens={descTokens}
          personalityTokens={personalityTokens}
          scenarioTokens={scenarioTokens}
        />

        <GreetingsSection
          cardData={d}
          updateActiveCardData={updateActiveCardData}
          greetingTokens={greetingTokens}
          onOpenChatPreviewWithGreeting={() => setChatPreviewOpen(true)}
        />

        <LorebookLinksSection
          cardData={d}
          onNavigateToLorebookTab={() => setActiveTab('lorebook')}
        />

        <AdvancedPromptsSection
          cardData={d}
          updateActiveCardData={updateActiveCardData}
          systemPromptTokens={systemPromptTokens}
          postHistoryTokens={postHistoryTokens}
          storedCard={storedCard}
          cards={cards}
          activeCardUuid={activeCardUuid}
          createSnapshot={createSnapshot}
          restoreSnapshot={restoreSnapshot}
          deleteSnapshot={deleteSnapshot}
          setDiffSnapshot={setDiffSnapshot}
          showConfirmDialog={async (msg, title) => {
            return await useDialogStore.getState().showConfirm(msg, title, {
              variant: 'warning',
              confirmText: 'Restore Snapshot',
            });
          }}
        />

        <MetadataSection cardData={d} updateActiveCardData={updateActiveCardData} />

        <details className="bg-void-900 border border-knight-700/40 rounded-2xl shadow-sm">
          <summary className="min-h-11 flex items-center px-4 cursor-pointer text-sm font-semibold text-mist-100">
            Cover art and export
          </summary>
          <div className="p-4">
          {/* Export & Verify Menu */}
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Export card as"
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'visual_png' || val === 'png' || val === 'json' || val === 'charx') {
                  handleExport(val);
                  e.target.value = '';
                }
              }}
              defaultValue=""
              className="px-3 py-2 bg-void-800 border border-knight-700 text-mist-100 text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-maroon-400"
            >
              <option value="" disabled hidden>
                Export Card As...
              </option>
              <option value="png">SillyTavern PNG (Embedded V3)</option>
              <option value="json">V3 JSON Specification</option>
              <option value="charx">CHARX Archive</option>
              <option value="visual_png">Visual Card Poster PNG</option>
            </select>

            {lastExported && (
              <button
                onClick={handleVerifyExport}
                className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium border transition-all ${
                  lastExported.verified
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-void-800 text-maroon-300 border-maroon-900/60 hover:bg-void-700'
                }`}
                title="Perform a bit-exact roundtrip import check on the exported file"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{lastExported.verified ? 'Verified' : 'Verify Export'}</span>
              </button>
            )}
          </div>
          </div>
        {/* COVER / AVATAR CARD HEADER */}
        <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-5 flex flex-col sm:flex-row items-center gap-4 shadow-sm min-w-0">
          <div className="relative w-24 h-32 sm:w-28 sm:h-36 shrink-0 rounded-xl overflow-hidden bg-void-950 border border-knight-700/40 flex items-center justify-center group shadow-inner">
            <CardAvatar
              src={coverUrl}
              name={d?.name || ''}
              alt={d?.name || 'Character Cover'}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
              fallbackClassName="text-3xl"
              fallbackIconClassName="w-8 h-8 mb-1 opacity-60"
              emptyLabel="No Cover"
            />
          </div>

          <div className="flex-1 space-y-2.5 text-center sm:text-left">
            <div>
              <p className="text-xs text-knight-400 mt-0.5 leading-relaxed">
                Upload custom artwork, or export a high-res visual card poster PNG
                directly with embedded CCv3 specification metadata.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleCoverUpload}
                className="hidden"
              />

              <button
                onClick={() => coverInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Image
              </button>

              {/* Direct Visual Card Export & Preview Buttons */}
              <button
                onClick={() => handleExport('visual_png')}
                disabled={isExportingVisual}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-b from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white border border-maroon-500/60 rounded-xl text-xs font-semibold shadow-md transition-all touch-fast active:scale-95 disabled:opacity-50"
                title="Export visual character card poster as spec-compliant PNG image"
              >
                <FileImage className="w-3.5 h-3.5 text-maroon-300 shrink-0" />
                <span>{isExportingVisual ? 'Exporting Visual...' : 'Export Visual PNG'}</span>
              </button>

              <button
                onClick={handlePreviewVisualCard}
                disabled={isGeneratingPreview}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-maroon-300 border border-knight-700/80 rounded-xl text-xs font-medium transition-all touch-fast active:scale-95 disabled:opacity-50"
                title="Preview the rendered visual card image poster"
              >
                {isGeneratingPreview ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-maroon-400" />
                ) : (
                  <Eye className="w-3.5 h-3.5 text-maroon-400 shrink-0" />
                )}
                <span>Preview poster</span>
              </button>

              {coverUrl && (
                <button
                  onClick={removeCardCoverImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-red-950/70 text-knight-300 hover:text-red-300 border border-knight-700/80 rounded-xl text-xs font-medium transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove Cover
                </button>
              )}
            </div>
          </div>
        </div>
        </details>
      </div>

      <ExportVerifyModal
        cardData={d}
        isPreviewModalOpen={isPreviewModalOpen}
        setIsPreviewModalOpen={setIsPreviewModalOpen}
        previewDataUrl={previewDataUrl}
        handleExport={handleExport}
        diffSnapshot={diffSnapshot}
        setDiffSnapshot={setDiffSnapshot}
        restoreSnapshot={restoreSnapshot}
        showConfirmDialog={async (msg, title) => {
          return await useDialogStore.getState().showConfirm(msg, title, {
            variant: 'warning',
            confirmText: 'Restore Snapshot',
          });
        }}
        verifyReport={verifyReport}
        setVerifyReport={setVerifyReport}
      />
    </div>
  );
};
