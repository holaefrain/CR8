import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { safeStorage } from 'electron';
import { appError } from './jsonFile.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

// The Discogs token, encrypted with a key held by the OS (macOS Keychain,
// Windows DPAPI). Only the ciphertext touches disk.
export function createSecretStore(dataDir) {
  const file = path.join(dataDir, 'credentials.bin');

  function assertAvailable() {
    const backend = process.platform === 'linux' ? safeStorage.getSelectedStorageBackend?.() : null;
    if (!safeStorage.isEncryptionAvailable() || backend === 'basic_text') {
      throw appError(ErrorCodes.INTERNAL, 'Secure storage is not available on this system, so CR8 can\'t save your token.', 500);
    }
  }

  return {
    async get() {
      let bytes;
      try {
        bytes = await fs.readFile(file);
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
      assertAvailable();
      try {
        return safeStorage.decryptString(bytes);
      } catch {
        // Keychain item reset or file copied from another machine.
        return null;
      }
    },
    async set(token) {
      if (typeof token !== 'string' || !token || token.length > 200) throw appError(ErrorCodes.VALIDATION, 'Invalid token');
      assertAvailable();
      const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(tmp, safeStorage.encryptString(token), { mode: 0o600 });
      await fs.rename(tmp, file);
    },
    async clear() {
      await fs.rm(file, { force: true });
    },
  };
}
