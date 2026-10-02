import path from 'path';
import { createJsonFile, appError } from './jsonFile.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

const text = (v, max) => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length > max) throw appError(ErrorCodes.VALIDATION, 'Invalid profile');
  return v;
};

export function createProfileStore(dataDir) {
  const file = createJsonFile(path.join(dataDir, 'profile.json'), null);
  return {
    get: () => file.read(),
    async set(p) {
      if (!p || typeof p !== 'object') throw appError(ErrorCodes.VALIDATION, 'Invalid profile');
      await file.write({
        firstName: text(p.firstName, 60) ?? '',
        discogsUsername: text(p.discogsUsername, 64) ?? '',
        onboardedAt: text(p.onboardedAt, 40),
        tokenVerifiedAt: text(p.tokenVerifiedAt, 40),
      });
    },
  };
}
