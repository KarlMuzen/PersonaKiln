import React, { useState } from 'react';
import type { ConnectionProfile } from '../../db';
import { createFullBackupJson, createFullBackupZip, restoreFullBackup } from '../../io/backup';
import { useToastStore } from '../../store/useToastStore';
import { useCardStore } from '../../store/useCardStore';
import { useDialogStore } from '../../store/useDialogStore';
import { useModalA11y } from '../../hooks/useModalA11y';
import {
  Database,
  Download,
  Upload,
  X,
  AlertTriangle,
  Lock,
} from 'lucide-react';

export interface BackupRestoreSectionProps {
  profiles: ConnectionProfile[];
  loadCardsFromDb: () => Promise<void>;
  loadProfilesFromDb: () => Promise<void>;
}

export function buildRestoreMessage(res: Awaited<ReturnType<typeof restoreFullBackup>>): string {
  let msg = `Database restored! Restored ${res.cardsCount} cards, ${res.lorebooksCount} lorebooks, and ${res.profilesCount} profiles.`;
  const keptParts: string[] = [];
  if (res.cardsKept > 0) keptParts.push(`${res.cardsKept} cards`);
  if (res.lorebooksKept > 0) keptParts.push(`${res.lorebooksKept} lorebooks`);
  if (res.settingsKept > 0) keptParts.push(`${res.settingsKept} settings`);
  if (keptParts.length > 0) {
    msg += `\nKept on this device (same or newer): ${keptParts.join(', ')}.`;
  }
  const skippedParts: string[] = [];
  if (res.cardsSkipped > 0) skippedParts.push(`${res.cardsSkipped} cards`);
  if (res.lorebooksSkipped > 0) skippedParts.push(`${res.lorebooksSkipped} lorebooks`);
  if (skippedParts.length > 0) {
    msg += `\nSkipped: ${skippedParts.join(', ')} (no ID, or could not be saved).`;
  }
  if (res.errors && res.errors.length > 0) {
    msg += `\n\nNotes / Warnings:\n${res.errors.join('\n')}`;
  }
  return msg;
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({
  profiles,
  loadCardsFromDb,
  loadProfilesFromDb,
}) => {
  const isPasskeyOnly = useCardStore((state) => state.isPasskeyOnly);
  const [exportModalState, setExportModalState] = useState<{
    isOpen: boolean;
    format: 'json' | 'zip';
    hasPlaintext: boolean;
    includeKeys: boolean;
  }>({ isOpen: false, format: 'json', hasPlaintext: false, includeKeys: true });

  const closeExportModal = () => setExportModalState(prev => ({ ...prev, isOpen: false }));
  const exportModalRef = useModalA11y(exportModalState.isOpen, closeExportModal) as React.RefObject<HTMLDivElement>;

  const handleFullBackupExport = async (format: 'json' | 'zip' = 'json') => {
    const hasPlaintext = profiles.some(p => p.apiKey && !p.apiKey.startsWith('enc.v1.'));
    setExportModalState({ isOpen: true, format, hasPlaintext, includeKeys: !isPasskeyOnly });
  };

  const confirmExport = async () => {
    const { format, includeKeys } = exportModalState;
    setExportModalState(prev => ({ ...prev, isOpen: false }));

    try {
      if (format === 'json') {
        const jsonStr = await createFullBackupJson(includeKeys);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = `personakiln_full_backup_${Date.now()}.json`;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        useToastStore.getState().showToast({
          title: 'Export Successful',
          message: `Full database backup exported as JSON (${fileName}).${includeKeys ? '' : ' API keys were left out.'}`,
          type: 'success',
        });
      } else {
        const zipBytes = await createFullBackupZip(includeKeys);
        const blob = new Blob([zipBytes], { type: 'application/zip' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = `personakiln_full_backup_${Date.now()}.zip`;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);

        useToastStore.getState().showToast({
          title: 'Export Successful',
          message: `Full database backup exported as ZIP archive (${fileName}).${includeKeys ? '' : ' API keys were left out.'}`,
          type: 'success',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore.getState().showAlert(`Export failed: ${message}`, 'Export Failed', 'danger');
    }
  };

  const handleFullBackupRestore = async (file: File) => {
    try {
      const isZip = file.name.endsWith('.zip');
      const input = isZip
        ? new Uint8Array(await file.arrayBuffer())
        : await file.text();
      const res = await useCardStore.getState().runDbCardWrite(() => restoreFullBackup(input, 'merge'));

      await loadCardsFromDb();
      await loadProfilesFromDb();
      const msg = buildRestoreMessage(res);
      await useDialogStore.getState().showAlert(msg, 'Restore Successful', 'info');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await useDialogStore.getState().showAlert(`Restore failed: ${message}`, 'Restore Failed', 'danger');
    }
  };

  return (
    <>
      <div className="bg-void-900 border border-knight-700/40 rounded-2xl p-4 md:p-6 space-y-4 shadow-sm">
        <h3 className="text-sm font-semibold text-mist-100 border-b border-knight-700/40 pb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-maroon-400" />
          IndexedDB Storage & Full Backup
        </h3>

        <p className="text-xs text-knight-400">
          All character cards, lorebooks, and connection profile settings are stored locally in your browser's IndexedDB.
        </p>

        <div className="flex items-center gap-2 pt-1 pb-2">
          <p className="text-xs text-maroon-400 font-medium bg-maroon-500/10 px-3 py-1.5 rounded-lg border border-maroon-500/20">
            Note: Backups can include your saved API keys. You can leave them out when you export.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleFullBackupExport('json')}
            className="flex items-center gap-2 px-4 py-2.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all"
          >
            <Download className="w-4 h-4 text-maroon-400" />
            Export Backup (JSON)
          </button>

          <button
            onClick={() => handleFullBackupExport('zip')}
            className="flex items-center gap-2 px-4 py-2.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Export Full Archive (ZIP)
          </button>

          <label className="flex items-center gap-2 px-4 py-2.5 bg-void-800 hover:bg-knight-700 text-mist-100 border border-knight-700 rounded-xl text-xs font-medium transition-all cursor-pointer">
            <Upload className="w-4 h-4 text-maroon-400" />
            Restore Database (JSON / ZIP)
            <input
              type="file"
              accept=".json,.zip"
              onChange={(e) => e.target.files?.[0] && handleFullBackupRestore(e.target.files[0])}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Export Confirmation Modal */}
      <div
        ref={exportModalRef}
        role="dialog"
        aria-modal="true"
        aria-label="Export Backup Warning"
        tabIndex={-1}
        className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-opacity duration-300 ${
          exportModalState.isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="absolute inset-0 bg-void-950/80 backdrop-blur-sm" onClick={closeExportModal} />
        
        <div className={`relative bg-void-900 border border-knight-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl transition-transform duration-300 transform ${exportModalState.isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}>
          <button
            onClick={closeExportModal}
            aria-label="Close dialog"
            className="absolute top-3 right-3 min-w-10 min-h-10 flex items-center justify-center text-knight-400 hover:text-mist-200 hover:bg-void-800 rounded-lg transition-colors touch-fast active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${exportModalState.hasPlaintext ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
              {exportModalState.hasPlaintext ? <AlertTriangle className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-mist-100">
                {!exportModalState.includeKeys
                  ? 'Export Backup (no API keys)'
                  : exportModalState.hasPlaintext ? 'Export Plaintext Keys' : 'Export Encrypted Backup'}
              </h2>
            </div>
          </div>
          
          <div className="space-y-4 text-sm text-knight-300">
            <div className="space-y-2">
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-mist-100 cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportModalState.includeKeys}
                  onChange={(e) => setExportModalState(prev => ({ ...prev, includeKeys: e.target.checked }))}
                  className="w-4 h-4 accent-maroon-500"
                />
                <span>Include API keys in this backup</span>
              </label>
              {exportModalState.includeKeys && isPasskeyOnly ? (
                <p className="text-xs leading-relaxed text-amber-300">
                  Your keys are locked to a passkey. A device without the same passkey may not be able to open them. Leave keys out and enter them again on the new device, or keep this file only for this device.
                </p>
              ) : !exportModalState.includeKeys ? (
                <p className="text-xs leading-relaxed text-knight-300">
                  API keys and key-protection settings are left out. After restoring, enter your keys again.
                </p>
              ) : null}
            </div>
            {exportModalState.includeKeys && (
              exportModalState.hasPlaintext ? (
                <p>
                  This backup file will contain <strong className="text-amber-400">unencrypted API keys</strong> because some of your profiles are not encrypted. You should store and share this file with the same care as a password.
                </p>
              ) : (
                <p>
                  This backup contains your <strong className="text-blue-400">encrypted API keys</strong> plus the salt and verifier needed to decrypt them offline. If your passphrase is weak, this file should still be treated as sensitive.
                </p>
              )
            )}
          </div>
          
          <div className="flex gap-3 justify-end pt-6">
            <button
              onClick={closeExportModal}
              className="px-4 py-2 rounded-xl text-sm font-medium text-knight-300 hover:text-mist-200 hover:bg-void-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmExport}
              className={`px-5 py-2 rounded-xl text-sm font-medium text-white transition-colors shadow-sm flex items-center gap-2 ${exportModalState.hasPlaintext ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}`}
            >
              Export {exportModalState.format === 'json' ? 'JSON' : 'ZIP'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
