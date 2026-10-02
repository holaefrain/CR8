import path from 'path';
import { createJsonFile, appError } from './jsonFile.js';
import { DEFAULT_SETTINGS } from '../../server/ports.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

export function createSettingsStore(dataDir) {
  const file = createJsonFile(path.join(dataDir, 'settings.json'), DEFAULT_SETTINGS);
  return {
    async get() {
      return { ...DEFAULT_SETTINGS, ...(await file.read()) };
    },
    async set(s) {
      if (typeof s?.beatport !== 'boolean' || typeof s?.youtube !== 'boolean') {
        throw appError(ErrorCodes.VALIDATION, 'Invalid settings');
      }
      await file.write({ beatport: s.beatport, youtube: s.youtube });
    },
  };
}
