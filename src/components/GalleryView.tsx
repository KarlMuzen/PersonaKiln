import React, { useRef, useState, useEffect } from 'react';
import { useCardStore } from '../store/useCardStore';
import { useToastStore } from '../store/useToastStore';
import { importCardData, exportCardData, importChubCard } from '../io';
import { prepareCoverForPng } from '../utils/coverToPng';
import type { StoredCard } from '../db';
import JSZip from 'jszip';
import { findDuplicateCard, type DuplicateMatchKind } from '../utils/contentHash';
import { uniqueZipFileName } from '../utils/zipFileNames';
import { useModalA11y } from '../hooks/useModalA11y';

import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import { GalleryToolbar } from './gallery/GalleryToolbar';
import { GalleryImportStatus } from './gallery/GalleryImportStatus';
import { GalleryFilterBar } from './gallery/GalleryFilterBar';
import { GalleryCardsGrid } from './gallery/GalleryCardsGrid';
import { PasteImportModal } from './gallery/PasteImportModal';
import type { CharacterCardV3 } from '../schemas/cardSchema';
import { getCardCoverUrl, type DuplicateChoice } from './gallery/galleryUtils';

export { getCardCoverUrl };

export const GalleryView: React.FC = () => {
  const {
    cards,
    isLoadingCards,
    loadCardsFromDb,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    selectedCardUuids,
    toggleSelectCardUuid,
    clearCardSelections,
    bulkDeleteCards,
    reorderCards,
    selectCardForEditing,
    createNewCard,
    setActiveTab,
    importCardRecord,
  } = useCardStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);

  const importDropdownRef = useModalA11y(isImportDropdownOpen, () => setIsImportDropdownOpen(false)) as React.RefObject<HTMLDivElement>;
  const exportDropdownRef = useModalA11y(isExportDropdownOpen, () => setIsExportDropdownOpen(false)) as React.RefObject<HTMLDivElement>;

  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Chub.ai direct import modal state
  const [isChubModalOpen, setIsChubModalOpen] = useState(false);
  const [chubUrlInput, setChubUrlInput] = useState('');
  const [isChubImporting, setIsChubImporting] = useState(false);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);

  // Import duplicate-detection modal state
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    fileName: string;
    existingName: string;
    kind: DuplicateMatchKind;
  } | null>(null);
  const duplicateResolverRef = useRef<((choice: DuplicateChoice) => void) | null>(null);
  const applyDuplicateChoiceToAllRef = useRef<DuplicateChoice | null>(null);

  const askDuplicateChoice = (
    fileName: string,
    existingName: string,
    kind: DuplicateMatchKind
  ): Promise<DuplicateChoice> => {
    if (applyDuplicateChoiceToAllRef.current) {
      return Promise.resolve(applyDuplicateChoiceToAllRef.current);
    }
    return new Promise((resolve) => {
      duplicateResolverRef.current = resolve;
      setDuplicatePrompt({ fileName, existingName, kind });
    });
  };

  const handleDuplicateChoice = (choice: DuplicateChoice, applyToAll: boolean) => {
    if (applyToAll) applyDuplicateChoiceToAllRef.current = choice;
    setDuplicatePrompt(null);
    duplicateResolverRef.current?.(choice);
    duplicateResolverRef.current = null;
  };

  const duplicateModalRef = useModalA11y(!!duplicatePrompt, () => {
    handleDuplicateChoice('cancel', false);
  }) as React.RefObject<HTMLDivElement>;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const [activeId, setActiveId] = useState<string | null>(null);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (over && active.id !== over.id) {
      const currentList = [...cards];
      const oldIndex = currentList.findIndex((c) => c.uuid === active.id);
      const newIndex = currentList.findIndex((c) => c.uuid === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const [movedCard] = currentList.splice(oldIndex, 1);
        currentList.splice(newIndex, 0, movedCard);
        reorderCards(currentList);
      }
    }
  };

  useEffect(() => {
    loadCardsFromDb();
  }, [loadCardsFromDb]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setIsImportDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(e.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [importDropdownRef, exportDropdownRef]);

  const handleChubImport = async () => {
    if (!chubUrlInput.trim()) return;
    setIsChubImporting(true);
    setImportError(null);
    setImportSuccessMessage(null);

    try {
      const result = await importChubCard(chubUrlInput);
      if (result.card) {
        await importCardRecord(result.card, result.embeddedAssets);
        setImportSuccessMessage(`Successfully imported "${result.card.data.name || 'Chub Card'}" from Chub.ai!`);
        setIsChubModalOpen(false);
        setChubUrlInput('');
      } else {
        throw new Error('No valid character card returned from Chub.ai.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Chub import error:', err);
      setImportError(message || 'Failed to import card from Chub.ai.');
    } finally {
      setIsChubImporting(false);
    }
  };

  const handleCreateFromPaste = async (
    card: CharacterCardV3,
    embeddedAssets?: Record<string, Uint8Array>
  ): Promise<boolean> => {
    setImportError(null);
    setImportWarning(null);
    setImportSuccessMessage(null);
    applyDuplicateChoiceToAllRef.current = null;

    const match = findDuplicateCard(cards, card);
    let overwriteUuid: string | undefined;
    if (match) {
      const choice = await askDuplicateChoice('Pasted text', match.existing.name, match.kind);
      if (choice === 'cancel') return false;
      if (choice === 'overwrite') overwriteUuid = match.existing.uuid;
    }

    await importCardRecord(card, embeddedAssets, overwriteUuid);
    setImportSuccessMessage(`Successfully imported "${card.data.name}" from pasted text!`);
    setIsPasteModalOpen(false);
    return true;
  };

  // Unique tags across all cards
  const allTags = Array.from(new Set(cards.flatMap((c) => c.tags || [])));

  // Filter cards by search query and tag
  const filteredCards = cards.filter((card) => {
    const matchesSearch =
      !searchQuery ||
      card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.creator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesTag = !selectedTag || card.tags.includes(selectedTag);

    return matchesSearch && matchesTag;
  });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportWarning(null);
    setImportSuccessMessage(null);

    try {
      const collectedWarnings: string[] = [];
      let importedCount = 0;
      let skippedCount = 0;

      const warnLorebookFile = (fileName: string) => {
        collectedWarnings.push(`${fileName}: This file is a lorebook, not a character card. Open a card and import it in the Lorebook tab.`);
      };

      // Track cards already present + cards added earlier in this same batch
      const sessionCards: StoredCard[] = [...cards];
      applyDuplicateChoiceToAllRef.current = null;

      const importOne = async (
        card: NonNullable<Awaited<ReturnType<typeof importCardData>>['card']>,
        embeddedAssets: Record<string, Uint8Array> | undefined,
        fileLabel: string
      ) => {
        const match = findDuplicateCard(sessionCards, card);

        let overwriteUuid: string | undefined;
        if (match) {
          const choice = await askDuplicateChoice(fileLabel, match.existing.name, match.kind);
          if (choice === 'cancel') {
            skippedCount++;
            return;
          }
          if (choice === 'overwrite') {
            overwriteUuid = match.existing.uuid;
          }
        }

        const uuid = await importCardRecord(card, embeddedAssets, overwriteUuid);
        importedCount++;

        const sessionRecord: StoredCard = {
          uuid,
          name: card.data.name || 'Imported Card',
          creator: card.data.creator || '',
          tags: card.data.tags || [],
          cardData: card,
        };
        if (overwriteUuid) {
          const idx = sessionCards.findIndex((c) => c.uuid === overwriteUuid);
          if (idx !== -1) sessionCards[idx] = sessionRecord;
        } else {
          sessionCards.push(sessionRecord);
        }
      };

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {

          if (file.size > 50 * 1024 * 1024) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            const errMsg = `File "${file.name}" exceeds the maximum allowed size of 50MB (${sizeMB}MB).`;
            collectedWarnings.push(errMsg);
            if (files.length === 1) {
              throw new Error(errMsg);
            }
            continue;
          }

          const fileNameLower = file.name.toLowerCase();
          const isZip =
            fileNameLower.endsWith('.zip') ||
            file.type === 'application/zip' ||
            file.type === 'application/x-zip-compressed';

          if (isZip) {
            const buffer = new Uint8Array(await file.arrayBuffer());
            let importedAsCharx = false;

            // 1. Try single CHARX card import first. Only the read is inside
            // the swallowing try; importing the card happens after it, so a
            // save failure is reported instead of falling through to bulk
            // extraction as if the file were not a single CHARX.
            let singleResult: Awaited<ReturnType<typeof importCardData>> | null = null;
            try {
              singleResult = await importCardData(buffer, file.name);
            } catch {
              // Not a single CHARX file, proceed to bulk zip extraction
            }
            if (singleResult?.card) {
              await importOne(singleResult.card, singleResult.embeddedAssets, file.name);
              importedAsCharx = true;
              if (singleResult.warnings && singleResult.warnings.length > 0) {
                collectedWarnings.push(...singleResult.warnings.map((w) => `${file.name}: ${w}`));
              }
            } else if (singleResult?.lorebook) {
              warnLorebookFile(file.name);
              importedAsCharx = true;
            }

            // 2. Extract bulk ZIP archive contents
            if (!importedAsCharx) {
              try {
                const zip = await JSZip.loadAsync(buffer);
                const entries = Object.keys(zip.files);
                let cardsFoundInZip = 0;

                for (const relativePath of entries) {
                  const zipEntry = zip.files[relativePath];
                  if (zipEntry.dir || relativePath.startsWith('__MACOSX') || relativePath.includes('/.')) continue;

                  const lower = relativePath.toLowerCase();
                  if (lower.endsWith('.png') || lower.endsWith('.json') || lower.endsWith('.charx')) {
                    try {
                      const entryBytes = await zipEntry.async('uint8array');
                      const result = await importCardData(entryBytes, relativePath);
                      if (result.card) {
                        try {
                          await importOne(result.card, result.embeddedAssets, relativePath);
                        } catch (importErr) {
                          const message = importErr instanceof Error ? importErr.message : String(importErr);
                          collectedWarnings.push(`${relativePath}: not imported: ${message || 'Import failed.'}`);
                          continue;
                        }
                        cardsFoundInZip++;
                        if (result.warnings && result.warnings.length > 0) {
                          collectedWarnings.push(...result.warnings.map((w) => `${relativePath}: ${w}`));
                        }
                      } else if (result.lorebook) {
                        warnLorebookFile(relativePath);
                      }
                    } catch (err) {
                      console.warn(`Error reading card in zip entry ${relativePath}:`, err);
                    }
                  }
                }

                if (cardsFoundInZip === 0) {
                  collectedWarnings.push(`No valid character cards found inside ZIP archive "${file.name}".`);
                }
              } catch (zipErr) {
                const zipMsg = zipErr instanceof Error ? zipErr.message : String(zipErr);
                console.error(`Failed to unpack zip ${file.name}:`, zipErr);
                throw new Error(`Failed to extract ZIP archive "${file.name}": ${zipMsg}`);
              }
            }
          } else {
            // Standard single PNG / JSON / CHARX file
            const buffer = new Uint8Array(await file.arrayBuffer());
            const result = await importCardData(buffer, file.name);

            if (result.warnings && result.warnings.length > 0) {
              collectedWarnings.push(...result.warnings.map((w) => `${file.name}: ${w}`));
            }

            if (result.card) {
              await importOne(result.card, result.embeddedAssets, file.name);
            } else if (result.lorebook) {
              warnLorebookFile(file.name);
            }
          }
        } catch (err) {
          if (files.length === 1) throw err;
          const message = err instanceof Error ? err.message : String(err);
          collectedWarnings.push(`${file.name}: not imported: ${message || 'Import failed.'}`);
        }
      }

      if (importedCount > 0) {
        setImportSuccessMessage(
          `Successfully imported ${importedCount} character card${importedCount > 1 ? 's' : ''}!` +
            (skippedCount > 0 ? ` (${skippedCount} skipped as duplicate)` : '')
        );
      } else if (skippedCount > 0) {
        setImportSuccessMessage(`No new cards imported — ${skippedCount} duplicate${skippedCount > 1 ? 's' : ''} skipped.`);
      }

      if (collectedWarnings.length > 0) {
        setImportWarning(collectedWarnings.join(' \n'));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Import error:', err);
      setImportError(message || 'Failed to import card file(s).');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (zipInputRef.current) zipInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleBulkExportAllZip = async (format: 'png' | 'json' | 'charx' = 'png') => {
    if (cards.length === 0) return;
    const zip = new JSZip();
    let omittedCoverCount = 0;
    const usedNames = new Set<string>();
    let writtenCount = 0;

    for (const cardRecord of cards) {
      let basePng: Uint8Array | undefined;
      if (format === 'png') {
        const cover = await prepareCoverForPng(cardRecord.cardData, cardRecord.embeddedAssets);
        basePng = cover.basePng;
        if (cover.note) omittedCoverCount++;
      }
      const bytes = await exportCardData(cardRecord.cardData, format, {
        ...(basePng ? { basePng } : {}),
        embeddedAssets: cardRecord.embeddedAssets,
        backfillV2: true,
      });
      const ext = format === 'charx' ? 'charx' : format === 'json' ? 'json' : 'png';
      const filename = uniqueZipFileName(cardRecord.name, ext, usedNames);
      zip.file(filename, bytes);
      writtenCount++;
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleplay_forge_cards_all_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    useToastStore.getState().showToast({
      title: 'Export Successful',
      message: `Exported all ${writtenCount} card${writtenCount > 1 ? 's' : ''} to ZIP archive (${format.toUpperCase()}).`,
      type: 'success',
    });
    if (omittedCoverCount > 0) {
      useToastStore.getState().showToast({
        title: 'Some covers were omitted',
        message: `${omittedCoverCount} cards were exported without a picture (cover could not be converted).`,
        type: 'warning',
      });
    }
  };

  const handleBulkExportSelectedZip = async (format: 'png' | 'json' | 'charx' = 'png') => {
    const targetUuids = selectedCardUuids.length > 0 ? selectedCardUuids : cards.map((c) => c.uuid);
    if (targetUuids.length === 0) return;
    const zip = new JSZip();
    let omittedCoverCount = 0;
    const usedNames = new Set<string>();
    let writtenCount = 0;

    for (const uuid of targetUuids) {
      const cardRecord = cards.find((c) => c.uuid === uuid);
      if (cardRecord) {
        let basePng: Uint8Array | undefined;
        if (format === 'png') {
          const cover = await prepareCoverForPng(cardRecord.cardData, cardRecord.embeddedAssets);
          basePng = cover.basePng;
          if (cover.note) omittedCoverCount++;
        }
        const bytes = await exportCardData(cardRecord.cardData, format, {
          ...(basePng ? { basePng } : {}),
          embeddedAssets: cardRecord.embeddedAssets,
          backfillV2: true,
      });
        const ext = format === 'charx' ? 'charx' : format === 'json' ? 'json' : 'png';
        const filename = uniqueZipFileName(cardRecord.name, ext, usedNames);
        zip.file(filename, bytes);
        writtenCount++;
      }
    }

    const zipContent = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleplay_forge_cards_export_${Date.now()}.zip`;
    a.click();
    URL.revokeObjectURL(url);

    useToastStore.getState().showToast({
      title: 'Export Successful',
      message: `Exported ${writtenCount} selected card${writtenCount > 1 ? 's' : ''} to ZIP archive (${format.toUpperCase()}).`,
      type: 'success',
    });
    if (omittedCoverCount > 0) {
      useToastStore.getState().showToast({
        title: 'Some covers were omitted',
        message: `${omittedCoverCount} cards were exported without a picture (cover could not be converted).`,
        type: 'warning',
      });
    }
  };

  const handleExportAllJsonBundle = () => {
    if (cards.length === 0) return;
    const allData = cards.map((c) => c.cardData);
    const jsonStr = JSON.stringify(allData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roleplay_forge_cards_bundle_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    useToastStore.getState().showToast({
      title: 'Export Successful',
      message: `Exported ${cards.length} card${cards.length > 1 ? 's' : ''} as JSON bundle.`,
      type: 'success',
    });
  };

  const handleCardClick = async (uuid: string) => {
    await selectCardForEditing(uuid);
    setActiveTab('editor');
  };

  return (
    <div className="subview-container p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Search & Action Bar */}
      <GalleryToolbar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        isImporting={isImporting}
        cardsCount={cards.length}
        selectedCount={selectedCardUuids.length}
        fileInputRef={fileInputRef}
        zipInputRef={zipInputRef}
        folderInputRef={folderInputRef}
        isImportDropdownOpen={isImportDropdownOpen}
        setIsImportDropdownOpen={setIsImportDropdownOpen}
        importDropdownRef={importDropdownRef}
        isExportDropdownOpen={isExportDropdownOpen}
        setIsExportDropdownOpen={setIsExportDropdownOpen}
        exportDropdownRef={exportDropdownRef}
        onOpenChubModal={() => setIsChubModalOpen(true)}
        onOpenPasteModal={() => setIsPasteModalOpen(true)}
        onBulkExportAllZip={handleBulkExportAllZip}
        onBulkExportSelectedZip={handleBulkExportSelectedZip}
        onExportAllJsonBundle={handleExportAllJsonBundle}
        onFileUpload={handleFileUpload}
        onCreateCard={async () => {
          await createNewCard('New Character');
          setActiveTab('editor');
        }}
      />

      {isPasteModalOpen && (
        <PasteImportModal
          isOpen={isPasteModalOpen}
          onClose={() => setIsPasteModalOpen(false)}
          onCreateCard={handleCreateFromPaste}
        />
      )}

      {/* Import Status & Modals */}
      <GalleryImportStatus
        dragOver={dragOver}
        setDragOver={setDragOver}
        onFileUpload={handleFileUpload}
        fileInputRef={fileInputRef}
        importSuccessMessage={importSuccessMessage}
        setImportSuccessMessage={setImportSuccessMessage}
        importError={importError}
        setImportError={setImportError}
        importWarning={importWarning}
        setImportWarning={setImportWarning}
        duplicatePrompt={duplicatePrompt}
        duplicateModalRef={duplicateModalRef}
        handleDuplicateChoice={handleDuplicateChoice}
        isChubModalOpen={isChubModalOpen}
        setIsChubModalOpen={setIsChubModalOpen}
        chubUrlInput={chubUrlInput}
        setChubUrlInput={setChubUrlInput}
        isChubImporting={isChubImporting}
        handleChubImport={handleChubImport}
      />

      {/* Tag Filter Bar */}
      <GalleryFilterBar
        allTags={allTags}
        selectedTag={selectedTag}
        setSelectedTag={setSelectedTag}
      />

      {/* Cards Grid & Bulk Actions */}
      <GalleryCardsGrid
        isLoadingCards={isLoadingCards}
        filteredCards={filteredCards}
        allCards={cards}
        selectedCardUuids={selectedCardUuids}
        toggleSelectCardUuid={toggleSelectCardUuid}
        clearCardSelections={clearCardSelections}
        bulkDeleteCards={bulkDeleteCards}
        handleBulkExportSelectedZip={handleBulkExportSelectedZip}
        handleCardClick={handleCardClick}
        sensors={sensors}
        activeId={activeId}
        handleDragStart={handleDragStart}
        handleDragEnd={handleDragEnd}
        fileInputRef={fileInputRef}
        createNewCard={createNewCard}
        setActiveTab={setActiveTab}
        hasActiveFilters={Boolean(searchQuery.trim() || selectedTag)}
        onClearFilters={() => {
          setSearchQuery('');
          setSelectedTag(null);
        }}
      />
    </div>
  );
};
