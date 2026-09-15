/**
 * Mobile backup file adapter.
 *
 * The runtime already owns the logical backup format (`MobileLogicalExportV1`).
 * This module only moves those bytes across the iOS document boundary:
 *
 *   exportData() -> a `.json` file in the app cache -> system share sheet
 *   document picker -> read the selected file -> runtime.restoreData()
 *
 * Keeping this separate from `MobileRuntime` means Core semantics and the
 * backup schema stay unchanged; the platform modules are isolated here and the
 * UI never sees them directly.
 *
 * DEGRADED MODE
 * A cancelled picker is not an error. A missing or unreadable file is reported
 * as a failure message rather than thrown into the app root, because backup is
 * a convenience and must never make Record / Understanding / Exploration
 * unusable.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type BackupResult =
  | { readonly ok: true; readonly uri?: string }
  | { readonly ok: false; readonly message: string };

export interface MobileBackupAdapter {
  exportToFile(serialized: string): Promise<BackupResult>;
  pickAndRead(): Promise<
    | { readonly ok: true; readonly serialized: string; readonly name: string }
    | { readonly ok: false; readonly message: string; readonly cancelled?: boolean }
  >;
}

const backupFileName = (now: Date = new Date()): string => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `jianyuan-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
};

/**
 * Write the logical export to the app cache directory, then open the system
 * share sheet so the user can save it to Files, iCloud Drive, or another app.
 *
 * `expo-file-system` changed its API in SDK 57: the modern object API is the
 * supported one, and the legacy `writeAsStringAsync` helpers are deprecated.
 * Using the current API avoids a silent no-op on a future upgrade.
 */
export const createMobileBackupAdapter = (): MobileBackupAdapter => ({
  async exportToFile(serialized: string): Promise<BackupResult> {
    try {
      const file = new FileSystem.File(
        FileSystem.Paths.cache,
        backupFileName(),
      );
      file.create({ overwrite: true });
      file.write(serialized);

      if (!(await Sharing.isAvailableAsync())) {
        return {
          ok: false,
          message: '当前设备无法打开系统分享面板，备份文件已生成但没有发送。',
        };
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: '保存见渊备份',
        UTI: 'public.json',
      });
      return { ok: true, uri: file.uri };
    } catch (error) {
      return {
        ok: false,
        message: `备份文件生成失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async pickAndRead() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        return { ok: false, cancelled: true, message: '没有选择文件。' };
      }
      const asset = result.assets[0];
      if (asset === undefined) {
        return { ok: false, message: '没有读取到所选文件。' };
      }
      const file = new FileSystem.File(asset.uri);
      const serialized = file.textSync();
      return { ok: true, serialized, name: asset.name };
    } catch (error) {
      return {
        ok: false,
        message: `恢复文件读取失败：${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
