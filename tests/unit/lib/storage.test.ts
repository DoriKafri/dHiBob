import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { LocalStorageProvider } from '@/lib/storage';

vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('LocalStorageProvider', () => {
  let provider: LocalStorageProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalStorageProvider();
  });

  describe('uploadFile', () => {
    it('creates a directory and writes the file', async () => {
      const file = Buffer.from('test content');
      const fileName = 'test.pdf';
      const folder = 'user-1';

      const result = await provider.uploadFile(file, fileName, folder);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining(path.join('uploads', folder)),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(path.join('uploads', folder)),
        file
      );
      expect(result).toMatch(/^user-1\/\d+-test.pdf$/);
    });

    it('sanitizes file names', async () => {
      const file = Buffer.from('test content');
      const fileName = 'un/safe name!.pdf';
      const folder = 'user-1';

      const result = await provider.uploadFile(file, fileName, folder);

      expect(result).toMatch(/^user-1\/\d+-un_safe_name_.pdf$/);
    });

    it('prevents path traversal via folder name', async () => {
      const file = Buffer.from('test content');
      const fileName = 'test.pdf';
      const folder = '../../etc';

      await expect(provider.uploadFile(file, fileName, folder)).rejects.toThrow('Path traversal attempt detected');
    });

    it('throws error for invalid filenames like . or ..', async () => {
      const file = Buffer.from('test content');
      const folder = 'user-1';

      await expect(provider.uploadFile(file, '..', folder)).rejects.toThrow('Invalid filename');
      await expect(provider.uploadFile(file, '.', folder)).rejects.toThrow('Invalid filename');
    });
  });

  describe('getDownloadUrl', () => {
    it('returns a correct download URL', async () => {
      const filePath = 'user-1/123-test.pdf';
      const result = await provider.getDownloadUrl(filePath);
      expect(result).toBe(`/api/files/download?path=${encodeURIComponent(filePath)}`);
    });
  });

  describe('deleteFile', () => {
    it('deletes the file', async () => {
      const filePath = 'user-1/123-test.pdf';
      await provider.deleteFile(filePath);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining(path.join('uploads', filePath)));
    });

    it('ignores errors if file does not exist (ENOENT)', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      (fs.unlink as any).mockRejectedValueOnce(error);
      const filePath = 'user-1/non-existent.pdf';
      await expect(provider.deleteFile(filePath)).resolves.toBeUndefined();
    });

    it('throws other errors in deleteFile', async () => {
      const error = new Error('Permission denied');
      (error as any).code = 'EACCES';
      (fs.unlink as any).mockRejectedValueOnce(error);
      const filePath = 'user-1/123-test.pdf';
      await expect(provider.deleteFile(filePath)).rejects.toThrow('Permission denied');
    });

    it('prevents path traversal in deleteFile', async () => {
      const filePath = '../../etc/passwd';
      await expect(provider.deleteFile(filePath)).rejects.toThrow('Path traversal attempt detected');
    });
  });
});
