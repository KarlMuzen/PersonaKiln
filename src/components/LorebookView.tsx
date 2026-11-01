import React, { useState, useEffect, useMemo } from 'react';
import { useCardStore } from '../store/useCardStore';
import { useDialogStore } from '../store/useDialogStore';
import { useToastStore } from '../store/useToastStore';
import { extractDecorators, resolveMacros } from '../utils/macroParser';
import { countTokens, countTokensAsync } from '../utils/tokenizer';
import type { LorebookEntry, Lorebook } from '../schemas/cardSchema';
import type { StoredLorebook } from '../db';
import {
  analyzeLorebookConflicts,
  mergeLorebookLayers,
  type LorebookLayer,
} from '../utils/lorebookConflict';
import {
  Plus,
  Trash2,
  Download,
  Upload,
  BookOpen,
  Eye,
  CheckCircle2,
  XCircle,
  ArrowUp,
  ArrowDown,
  Copy,
  Search,
  Layers,
  ShieldAlert,
  AlertTriangle,
  Zap,
  Wand2,
  Database,
} from 'lucide-react';
import { exportStandaloneLorebook, importCardData } from '../io';

function generateLayerId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export const LorebookView: React.FC = () => {
  const {
    activeCard,
    updateActiveCardData,
    saveActiveCard,
    profiles,
    activeProfileUuid,
    lorebooks: dbLorebooks,
    loadLorebooksFromDb,
  } = useCardStore();
  const activeProfile = profiles.find((p) => p.uuid === activeProfileUuid);
  const provider = activeProfile?.provider;

  const [mode, setMode] = useState<'single' | 'composer'>('single');
  const [isSavedMenuOpen, setIsSavedMenuOpen] = useState(false);
  const savedMenuRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSavedMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!savedMenuRef.current?.contains(event.target as Node)) {
        setIsSavedMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsSavedMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSavedMenuOpen]);
  const [selectedEntryIndex, setSelectedEntryIndex] = useState<number | null>(0);
  const [previewUserName, setPreviewUserName] = useState('Traveler');
  const [searchFilter, setSearchFilter] = useState('');
  const [entryExactTokens, setEntryExactTokens] = useState<number | null>(null);

  // Multi-Lorebook Composer state
  const [sampleTestText, setSampleTestText] = useState('When the Traveler visited Eldoria and wielded Excalibur...');
  const [composerSubTab, setComposerSubTab] = useState<'collisions' | 'shadowed' | 'simulation'>('collisions');

  const primaryLorebook: Lorebook = activeCard?.data.character_book || {
    name: `${activeCard?.data.name || 'Character'} Lorebook`,
    description: '',
    scan_depth: 5,
    token_budget: 1000,
    recursive_scanning: true,
    extensions: {},
    entries: [],
  };

  const [layers, setLayers] = useState<LorebookLayer[]>(() => {
    if (!activeCard) return [];
    return [{
      id: 'primary_card_book',
      name: `[Card] ${activeCard.data.name || 'Character'} Book`,
      color: 'maroon',
      enabled: true,
      isPrimaryCardBook: true,
      lorebook: primaryLorebook,
    }];
  });

  const [prevCardUuid, setPrevCardUuid] = useState(activeCard?.uuid);
  if (activeCard?.uuid !== prevCardUuid) {
    setPrevCardUuid(activeCard?.uuid);
    setLayers((prevLayers) => {
      const secondary = prevLayers.filter((l) => !l.isPrimaryCardBook);
      const primary: LorebookLayer = {
        id: 'primary_card_book',
        name: `[Card] ${activeCard?.data.name || 'Character'} Book`,
        color: 'maroon',
        enabled: true,
        isPrimaryCardBook: true,
        lorebook: primaryLorebook,
      };
      return [primary, ...secondary];
    });
  }

  // Load saved lorebooks through the shared store.
  useEffect(() => {
    loadLorebooksFromDb();
  }, [loadLorebooksFromDb]);

  const entries = primaryLorebook.entries || [];
  const selectedEntry = selectedEntryIndex !== null ? entries[selectedEntryIndex] : null;
  const selectedContent = selectedEntry?.content || '';

  React.useEffect(() => {
    if (!selectedContent) return;
    let isCancelled = false;
    countTokensAsync(selectedContent, true, activeProfile).then((cnt) => {
      if (!isCancelled) {
        setEntryExactTokens(cnt);
      }
    });
    return () => {
      isCancelled = true;
    };
  }, [selectedContent, activeProfile]);

  const updateLorebook = (updater: (prevLb: Lorebook) => Lorebook) => {
    updateActiveCardData((card) => ({
      ...card,
      data: {
        ...card.data,
        character_book: updater(card.data.character_book || primaryLorebook),
      },
    }));
  };

  const handleAddEntry = () => {
    const newEntry: LorebookEntry = {
      keys: ['new_key'],
      content: '@@depth 4\nLore content goes here...',
      extensions: {},
      enabled: true,
      insertion_order: (entries.length + 1) * 10,
      use_regex: false,
      constant: false,
    };

    updateLorebook((lb) => ({
      ...lb,
      entries: [...lb.entries, newEntry],
    }));
    setSelectedEntryIndex(entries.length);
  };

  const handleDeleteEntry = (idx: number) => {
    updateLorebook((lb) => ({
      ...lb,
      entries: lb.entries.filter((_, i) => i !== idx),
    }));
    if (selectedEntryIndex === idx) {
      setSelectedEntryIndex(null);
    } else if (selectedEntryIndex !== null && selectedEntryIndex > idx) {
      setSelectedEntryIndex(selectedEntryIndex - 1);
    }
  };

  const handleDuplicateEntry = (idx: number) => {
    const target = entries[idx];
    if (!target) return;
    const copy: LorebookEntry = {
      ...JSON.parse(JSON.stringify(target)),
      keys: [...(target.keys || []).map((k) => `${k}_copy`)],
    };
    updateLorebook((lb) => ({
      ...lb,
      entries: [...lb.entries.slice(0, idx + 1), copy, ...lb.entries.slice(idx + 1)],
    }));
    setSelectedEntryIndex(idx + 1);
  };

  const handleExportLorebook = () => {
    const jsonStr = exportStandaloneLorebook(primaryLorebook);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `${(primaryLorebook.name || 'lorebook').replace(/[^a-z0-9_-]/gi, '_')}.json`;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    useToastStore.getState().showToast({
      title: 'Export Successful',
      message: `Exported lorebook "${primaryLorebook.name || 'Lorebook'}" as JSON (${fileName}).`,
      type: 'success',
    });
  };

  const handleImportLorebook = async (file: File) => {
    try {
      const text = await file.text();
      const result = await importCardData(text, file.name);
      if (!result.lorebook) {
        useDialogStore.getState().showAlert(
          'No lorebook found in this file. A lorebook file has an "entries" list.',
          'Nothing imported',
          'warning'
        );
        return;
      }
      updateLorebook(() => result.lorebook!);
      await saveActiveCard();
      useDialogStore.getState().showAlert('Lorebook imported cleanly into character card.', 'Lorebook Imported', 'info');
    } catch (error) {
      useDialogStore.getState().showAlert(
        error instanceof Error ? error.message : String(error),
        'Nothing imported',
        'warning'
      );
    }
  };

  // Composer Layer Actions
  const handleAddImportedLayer = async (file: File) => {
    try {
      const text = await file.text();
      const result = await importCardData(text, file.name);
      if (!result.lorebook) {
        useDialogStore.getState().showAlert(
          'No lorebook found in this file. A lorebook file has an "entries" list.',
          'Nothing imported',
          'warning'
        );
        return;
      }
      const newLayer: LorebookLayer = {
        id: generateLayerId('layer'),
        name: result.lorebook.name || file.name,
        color: 'amber',
        enabled: true,
        source: 'imported',
        lorebook: result.lorebook,
      };
      setLayers((prev) => [...prev, newLayer]);
    } catch (error) {
      useDialogStore.getState().showAlert(
        error instanceof Error ? error.message : String(error),
        'Nothing imported',
        'warning'
      );
    }
  };
  const handleAddDbLayer = (storedLb: StoredLorebook) => {
    const newLayer: LorebookLayer = {
      id: generateLayerId(`db_layer_${storedLb.id}`),
      name: `[DB] ${storedLb.name}`,
      color: 'cyan',
      enabled: true,
      source: 'standalone',
      lorebook: storedLb.lorebook,
    };
    setLayers((prev) => [...prev, newLayer]);
  };

  const handleMoveLayer = (idx: number, direction: 'up' | 'down') => {
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === layers.length - 1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const copy = [...layers];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, moved);
    setLayers(copy);
  };

  const handleDeleteLayer = (id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id || l.isPrimaryCardBook));
  };

  const conflictAnalysis = useMemo(() => {
    return analyzeLorebookConflicts(layers, primaryLorebook.token_budget || 1000, sampleTestText);
  }, [layers, primaryLorebook.token_budget, sampleTestText]);

  const handleMergeStackToCard = async () => {
    const merged = mergeLorebookLayers(layers, `${activeCard?.data.name || 'Character'} Composed Lorebook`);
    updateLorebook(() => merged);
    await saveActiveCard();
    useDialogStore.getState().showAlert(`Merged ${layers.filter((l) => l.enabled).length} layers into character card lorebook!`, 'Stack Merged', 'info');
  };

  if (!activeCard) {
    return (
      <div className="p-8 text-center text-knight-400">
        <p className="text-sm">Please select a character card to view or edit its lorebook.</p>
      </div>
    );
  }

  return (
    <div className="subview-container p-4 md:p-6 max-w-6xl mx-auto space-y-6 pb-24 min-w-0 overflow-x-hidden">
      {/* Header Bar with Sub-Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-void-900 border border-knight-700/40 p-4 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-base font-semibold text-mist-100 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-maroon-400" />
              {primaryLorebook.name || 'Character Lorebook'}
            </h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-void-800 text-knight-300 border border-knight-700">
              {entries.length} entry(ies)
            </span>
          </div>
          <p className="text-xs text-knight-400">
            {mode === 'single'
              ? 'Edit single character lorebook entries, trigger keys, and depth decorators'
              : 'Multi-Lorebook Stack Composer & Real-time Conflict Resolution Engine'}
          </p>
        </div>

        {/* Mode Selector Pill */}
        <div className="flex items-center gap-1.5 p-1 bg-void-950 rounded-xl border border-knight-800">
          <button
            onClick={() => setMode('single')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'single'
                ? 'bg-maroon-600 text-white shadow-sm'
                : 'text-knight-400 hover:text-mist-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Single Book Editor
          </button>
          <button
            onClick={() => setMode('composer')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'composer'
                ? 'bg-maroon-600 text-white shadow-sm'
                : 'text-knight-400 hover:text-mist-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            Multi-Lorebook Composer
            {conflictAnalysis.collisions.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>
      </div>

      {mode === 'single' ? (
        /* SINGLE LOREBOOK EDITOR MODE */
        <div className="space-y-6">
          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-void-900 border border-knight-700/40 p-3 rounded-xl">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-maroon-400" />
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => e.target.files?.[0] && handleImportLorebook(e.target.files[0])}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleExportLorebook}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5 text-maroon-400" />
                Export Lorebook
              </button>
            </div>

            <button
              onClick={handleAddEntry}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-maroon-600 to-maroon-800 hover:from-maroon-500 hover:to-maroon-700 text-white rounded-xl text-xs font-semibold shadow-md"
            >
              <Plus className="w-4 h-4" />
              Add Lorebook Entry
            </button>
          </div>

          {/* Master-Detail Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 min-w-0">
            {/* Sidebar List */}
            <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-knight-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter entries..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs focus:outline-none focus:ring-1 focus:ring-maroon-400"
                />
              </div>

              <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                {entries.length === 0 ? (
                  <p className="text-xs text-knight-500 p-4 text-center">No lorebook entries yet.</p>
                ) : (
                  entries
                    .map((entry, idx) => ({ entry, idx }))
                    .filter(({ entry }) => {
                      if (!searchFilter) return true;
                      const q = searchFilter.toLowerCase();
                      return (
                        (entry.keys || []).some((k) => String(k).toLowerCase().includes(q)) ||
                        (entry.content || '').toLowerCase().includes(q)
                      );
                    })
                    .map(({ entry, idx }) => {
                      const isSelected = selectedEntryIndex === idx;
                      const decorators = extractDecorators(entry.content || '').decorators;

                      return (
                        <div
                          key={idx}
                          onClick={() => setSelectedEntryIndex(idx)}
                          className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-maroon-950/40 border-maroon-600/80 text-mist-100'
                              : 'bg-void-950/60 border-knight-800 hover:border-knight-700 text-knight-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-mono font-bold text-maroon-400">#{idx + 1}</span>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicateEntry(idx);
                                }}
                                title="Duplicate Entry"
                                aria-label="Duplicate Entry"
                                className="p-2 min-w-8 min-h-8 flex items-center justify-center text-knight-400 hover:text-mist-100 rounded touch-fast active:scale-95"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteEntry(idx);
                                }}
                                title="Delete Entry"
                                aria-label="Delete Entry"
                                className="p-2 min-w-8 min-h-8 flex items-center justify-center text-knight-400 hover:text-red-400 rounded touch-fast active:scale-95"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="font-semibold text-mist-100 truncate mb-1">
                            {(entry.keys || []).join(', ') || 'No trigger keys'}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.enabled !== false ? (
                              <span className="px-1.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[10px] rounded font-mono flex items-center gap-1">
                                <CheckCircle2 className="w-2.5 h-2.5" /> ON
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 bg-red-950/80 text-red-300 border border-red-800/80 text-[10px] rounded font-mono flex items-center gap-1">
                                <XCircle className="w-2.5 h-2.5" /> OFF
                              </span>
                            )}

                            {decorators.map((d, dIdx) => (
                              <span
                                key={dIdx}
                                className="px-1.5 py-0.5 bg-maroon-950/80 text-maroon-300 border border-maroon-800/80 text-[10px] rounded font-mono"
                              >
                                @{d.name} {d.args.join(',')}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>

            {/* Selected Entry Editor Column */}
            {selectedEntry && selectedEntryIndex !== null ? (
              <div className="md:col-span-2 bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm min-w-0">
                <h3 className="text-sm font-semibold text-mist-100 border-b border-knight-700/40 pb-2 flex items-center justify-between">
                  <span>Editing Entry #{selectedEntryIndex + 1}</span>
                  <span className="text-xs text-knight-400 font-mono">
                    {entryExactTokens !== null ? entryExactTokens : countTokens(selectedEntry.content, true, provider)} tokens
                  </span>
                </h3>

                {/* Keys & Secondary Keys */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-knight-400 mb-1">Trigger Keys (comma-separated)</label>
                    <input
                      type="text"
                      value={(selectedEntry.keys || []).join(', ')}
                      onChange={(e) => {
                        const keysArr = e.target.value
                          .split(',')
                          .map((k) => k.trim())
                          .filter(Boolean);
                        const updatedEntries = [...entries];
                        updatedEntries[selectedEntryIndex] = { ...selectedEntry, keys: keysArr };
                        updateLorebook((lb) => ({ ...lb, entries: updatedEntries }));
                      }}
                      className="w-full px-3.5 py-2 bg-void-800/80 border border-knight-700/80 rounded-xl text-mist-100 text-sm focus:outline-none focus:ring-1 focus:ring-maroon-400"
                    />
                  </div>

                  {/* Toggles */}
                  <div className="flex flex-wrap gap-4 pt-1">
                    <label className="flex items-center gap-2 text-xs text-knight-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedEntry.enabled}
                        onChange={(e) => {
                          const updatedEntries = [...entries];
                          updatedEntries[selectedEntryIndex] = {
                            ...selectedEntry,
                            enabled: e.target.checked,
                          };
                          updateLorebook((lb) => ({ ...lb, entries: updatedEntries }));
                        }}
                        className="rounded text-maroon-500"
                      />
                      Enabled
                    </label>

                    <label className="flex items-center gap-2 text-xs text-knight-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedEntry.constant || false}
                        onChange={(e) => {
                          const updatedEntries = [...entries];
                          updatedEntries[selectedEntryIndex] = {
                            ...selectedEntry,
                            constant: e.target.checked,
                          };
                          updateLorebook((lb) => ({ ...lb, entries: updatedEntries }));
                        }}
                        className="rounded text-maroon-500"
                      />
                      Constant Always Active
                    </label>

                    <label className="flex items-center gap-2 text-xs text-knight-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={selectedEntry.use_regex || false}
                        onChange={(e) => {
                          const updatedEntries = [...entries];
                          updatedEntries[selectedEntryIndex] = {
                            ...selectedEntry,
                            use_regex: e.target.checked,
                          };
                          updateLorebook((lb) => ({ ...lb, entries: updatedEntries }));
                        }}
                        className="rounded text-maroon-500"
                      />
                      Use Regex Matching
                    </label>
                  </div>
                </div>

                {/* Entry Content */}
                <div>
                  <label className="block text-xs font-medium text-knight-400 mb-1">
                    Content (Includes @@decorators)
                  </label>
                  <textarea
                    rows={6}
                    value={selectedEntry.content || ''}
                    onChange={(e) => {
                      const updatedEntries = [...entries];
                      updatedEntries[selectedEntryIndex] = { ...selectedEntry, content: e.target.value };
                      updateLorebook((lb) => ({ ...lb, entries: updatedEntries }));
                    }}
                    placeholder="@@depth 4&#10;Entry content text..."
                    className="w-full px-3.5 py-2.5 bg-void-800/80 border border-knight-700/80 rounded-xl text-mist-100 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-maroon-400 resize-y"
                  />
                </div>

                {/* Macro Preview */}
                <div className="p-3.5 bg-void-950/60 border border-knight-700/40 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-knight-300 flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-maroon-400" />
                      Resolved Macro Preview
                    </span>
                    <input
                      type="text"
                      value={previewUserName}
                      onChange={(e) => setPreviewUserName(e.target.value)}
                      placeholder="User Name"
                      className="px-2 py-0.5 bg-void-800 border border-knight-700 text-mist-100 text-xs rounded"
                    />
                  </div>

                  <p className="text-xs text-knight-300 font-mono whitespace-pre-wrap">
                    {resolveMacros(extractDecorators(selectedEntry.content).cleanContent, {
                      charName: activeCard.data.nickname || activeCard.data.name,
                      userName: previewUserName,
                    })}
                  </p>
                </div>
              </div>
            ) : (
              <div className="md:col-span-2 p-8 text-center bg-void-900 border border-knight-700/40 rounded-2xl text-knight-500">
                Select or create a lorebook entry to edit.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* MULTI-LOREBOOK COMPOSER & CONFLICT MATRIX MODE */
        <div className="space-y-6">
          {/* Layer Stack Manager Header */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-knight-700/40 pb-3">
              <div>
                <h3 className="text-sm font-bold text-mist-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  Active Layered Lorebook Stack ({layers.length} Layers)
                </h3>
                <p className="text-xs text-knight-400">
                  Compose character lore, world settings, and faction codices simultaneously
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-amber-400" />
                  + Import Layer
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => e.target.files?.[0] && handleAddImportedLayer(e.target.files[0])}
                    className="hidden"
                  />
                </label>

                {dbLorebooks.length > 0 && (
                  <div className="relative group" ref={savedMenuRef}>
                    <button
                      onClick={() => setIsSavedMenuOpen((open) => !open)}
                      aria-expanded={isSavedMenuOpen}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium"
                    >
                      <Database className="w-3.5 h-3.5 text-cyan-400" />
                      + Saved Lorebook
                    </button>
                    {isSavedMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 bg-void-900 border border-knight-700 rounded-xl shadow-xl p-2 z-20 min-w-[200px] space-y-1">
                        {dbLorebooks.map((lb) => (
                          <button
                            key={lb.id}
                            onClick={() => {
                              handleAddDbLayer(lb);
                              setIsSavedMenuOpen(false);
                            }}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-knight-300 hover:text-mist-100 hover:bg-void-800 rounded-lg truncate"
                          >
                            {lb.name} ({lb.lorebook.entries.length} entries)
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleMergeStackToCard}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-600 to-amber-800 hover:from-amber-500 hover:to-amber-700 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  Merge Stack to Card
                </button>
              </div>
            </div>

            {/* Layer Item Cards */}
            <div className="space-y-2">
              {layers.map((layer, idx) => (
                <div
                  key={layer.id}
                  className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-all ${
                    layer.enabled
                      ? 'bg-void-950/80 border-knight-700'
                      : 'bg-void-950/30 border-knight-800/60 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={layer.enabled}
                      onChange={(e) => {
                        const copy = [...layers];
                        copy[idx] = { ...layer, enabled: e.target.checked };
                        setLayers(copy);
                      }}
                      className="rounded text-amber-500"
                    />

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-mist-100">{layer.name}</span>
                        {layer.isPrimaryCardBook ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-maroon-950 text-maroon-300 border border-maroon-800">
                            Primary Card Book
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800 capitalize">
                            {layer.source || 'Secondary Layer'}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-knight-400">
                        {layer.lorebook?.entries?.length || 0} entry(ies) • Budget: {layer.lorebook?.token_budget || 1000} tokens
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleMoveLayer(idx, 'up')}
                      disabled={idx === 0}
                      aria-label="Move layer up"
                      className="p-2 min-w-9 min-h-9 flex items-center justify-center text-knight-400 hover:text-mist-100 disabled:opacity-30 rounded-lg touch-fast active:scale-95"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveLayer(idx, 'down')}
                      disabled={idx === layers.length - 1}
                      aria-label="Move layer down"
                      className="p-2 min-w-9 min-h-9 flex items-center justify-center text-knight-400 hover:text-mist-100 disabled:opacity-30 rounded-lg touch-fast active:scale-95"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    {!layer.isPrimaryCardBook && (
                      <button
                        onClick={() => handleDeleteLayer(layer.id)}
                        aria-label="Delete layer"
                        className="p-2 min-w-9 min-h-9 flex items-center justify-center text-knight-400 hover:text-red-400 rounded-lg touch-fast active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conflict Analysis & Simulation Dashboard */}
          <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
            {/* Conflict Stats Header Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-void-950/80 border border-knight-800 rounded-xl">
                <span className="text-[10px] font-mono uppercase text-knight-400 block">Total Stack Entries</span>
                <span className="text-xl font-black text-mist-100">{conflictAnalysis.totalEntriesCount}</span>
              </div>
              <div className="p-3 bg-void-950/80 border border-amber-900/50 rounded-xl">
                <span className="text-[10px] font-mono uppercase text-amber-400 block">Key Collisions</span>
                <span className="text-xl font-black text-amber-300">{conflictAnalysis.collisions.length}</span>
              </div>
              <div className="p-3 bg-void-950/80 border border-red-900/50 rounded-xl">
                <span className="text-[10px] font-mono uppercase text-red-400 block">Shadowed / Dropped</span>
                <span className="text-xl font-black text-red-300">{conflictAnalysis.shadowedEntries.length}</span>
              </div>
              <div className="p-3 bg-void-950/80 border border-emerald-900/50 rounded-xl">
                <span className="text-[10px] font-mono uppercase text-emerald-400 block">Stack Tokens</span>
                <span className="text-xl font-black text-emerald-300">{conflictAnalysis.totalTokensCount}</span>
              </div>
            </div>

            {/* Sub-Tab Navigation */}
            <div className="flex border-b border-knight-700/40 gap-4 overflow-x-auto custom-scrollbar pb-1">
              <button
                onClick={() => setComposerSubTab('collisions')}
                className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  composerSubTab === 'collisions'
                    ? 'border-amber-400 text-amber-400'
                    : 'border-transparent text-knight-400 hover:text-mist-200'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                Keyword Collisions ({conflictAnalysis.collisions.length})
              </button>
              <button
                onClick={() => setComposerSubTab('shadowed')}
                className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  composerSubTab === 'shadowed'
                    ? 'border-red-400 text-red-400'
                    : 'border-transparent text-knight-400 hover:text-mist-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Unreachable / Shadowed ({conflictAnalysis.shadowedEntries.length})
              </button>
              <button
                onClick={() => setComposerSubTab('simulation')}
                className={`pb-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all ${
                  composerSubTab === 'simulation'
                    ? 'border-cyan-400 text-cyan-400'
                    : 'border-transparent text-knight-400 hover:text-mist-200'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                Live Stack Simulator
              </button>
            </div>

            {/* Sub-Tab 1: Collisions */}
            {composerSubTab === 'collisions' && (
              <div className="space-y-3">
                {conflictAnalysis.collisions.length === 0 ? (
                  <div className="p-8 text-center text-knight-400 space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
                    <p className="text-xs font-semibold text-mist-100">No Keyword Collisions Detected!</p>
                    <p className="text-[11px]">All active lorebook layers listen on unique trigger key domains.</p>
                  </div>
                ) : (
                  conflictAnalysis.collisions.map((col, idx) => (
                    <div key={idx} className="p-4 bg-void-950/80 border border-amber-900/50 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-300 font-mono">
                          Trigger Key Collision: "{col.key}"
                        </span>
                        <span className="text-[10px] text-knight-400 font-mono">
                          Matches {col.entries.length} entries across stack
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {col.entries.map((entryMatch, eIdx) => (
                          <div
                            key={eIdx}
                            className={`p-2.5 rounded-lg border text-xs ${
                              eIdx === 0
                                ? 'bg-amber-950/30 border-amber-800/80 text-amber-200'
                                : 'bg-void-900 border-knight-800 text-knight-300 opacity-80'
                            }`}
                          >
                            <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                              <span className="font-bold text-mist-100">{entryMatch.layerName}</span>
                              {eIdx === 0 ? (
                                <span className="text-emerald-400 font-bold">Takes Precedence</span>
                              ) : (
                                <span className="text-knight-400">Lower Weight</span>
                              )}
                            </div>
                            <p className="text-[11px] truncate">{(entryMatch.entry.content || '').slice(0, 80)}...</p>
                            <div className="text-[10px] text-knight-400 mt-1">
                              Weight: {entryMatch.weight} • Depth: {entryMatch.depth}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Sub-Tab 2: Shadowed & Unreachable */}
            {composerSubTab === 'shadowed' && (
              <div className="space-y-3">
                {conflictAnalysis.shadowedEntries.length === 0 ? (
                  <div className="p-8 text-center text-knight-400 space-y-1">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
                    <p className="text-xs font-semibold text-mist-100">Zero Shadowed Entries!</p>
                    <p className="text-[11px]">All entries across all active layers are reachable within token budget.</p>
                  </div>
                ) : (
                  conflictAnalysis.shadowedEntries.map((sh, idx) => (
                    <div key={idx} className="p-3.5 bg-void-950/80 border border-red-900/50 rounded-xl space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-red-300 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Unreachable Entry in '{sh.layerName}'
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950 text-red-300 border border-red-800 capitalize">
                          Reason: {sh.reason.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-xs text-knight-300 leading-relaxed">{sh.details}</p>
                      <div className="text-[10px] font-mono text-knight-400 bg-void-900 p-1.5 rounded truncate">
                        Keys: {(sh.entry.keys || []).join(', ') || 'None'} • Content: "{(sh.entry.content || '').slice(0, 80)}"
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Sub-Tab 3: Live Simulator */}
            {composerSubTab === 'simulation' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-knight-400 mb-1">
                    Sample Chat / Trigger Test Input
                  </label>
                  <textarea
                    rows={3}
                    value={sampleTestText}
                    onChange={(e) => setSampleTestText(e.target.value)}
                    placeholder="Type or paste sample roleplay chat text..."
                    className="w-full px-3.5 py-2 bg-void-800 border border-knight-700 rounded-xl text-mist-100 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
                  />
                </div>

                <div className="p-3 bg-void-950/80 border border-knight-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-mist-100 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" />
                      Composite Layer Fire Results
                    </span>
                    <span className="text-knight-400 font-mono text-[11px]">
                      {conflictAnalysis.activeEntriesCount} / {conflictAnalysis.totalEntriesCount} active entries fire
                    </span>
                  </div>

                  <div className="w-full bg-void-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full transition-all"
                      style={{
                        width: `${Math.min(
                          100,
                          (conflictAnalysis.totalTokensCount / (primaryLorebook.token_budget || 1000)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-[10px] text-knight-400 text-right font-mono">
                    {conflictAnalysis.totalTokensCount} / {primaryLorebook.token_budget || 1000} token budget
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
