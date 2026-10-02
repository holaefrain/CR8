import {
  mapSearchResult, mapSearchHitOnly, mapBasicInformation, mapPagination, mapRelease, mapProfile,
} from './mappers.js';
import { isAppError } from '../middleware/errors.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

const FOLDERS = {
  collection: { path: u => `/users/${u}/collection/folders/0/releases`, items: 'releases' },
  wants: { path: u => `/users/${u}/wants`, items: 'wants' },
};

export function createDiscogsService({ client, getUsername }) {
  async function username() {
    return encodeURIComponent(await getUsername());
  }

  async function search(query, filters, perPage) {
    const data = await client.get('/database/search', {
      q: query, type: 'release', format: 'vinyl', per_page: perPage,
      artist: filters.artist, label: filters.label, country: filters.country,
      year: filters.year, genre: filters.genre,
    });
    const hits = data?.results || [];
    return Promise.all(hits.map(async hit => {
      try {
        return mapSearchResult(hit, await client.get(`/releases/${hit.id}`));
      } catch (e) {
        if (isAppError(e) && e.code === ErrorCodes.DISCOGS_TOKEN_INVALID) throw e;
        return mapSearchHitOnly(hit);
      }
    }));
  }

  async function getRelease(id) {
    return mapRelease(await client.get(`/releases/${id}`));
  }

  async function listFolder(kind, page, perPage) {
    const folder = FOLDERS[kind];
    const data = await client.get(folder.path(await username()), {
      page, per_page: perPage, sort: 'added', sort_order: 'desc',
    });
    return {
      items: (data?.[folder.items] || []).map(w => mapBasicInformation(w.basic_information)),
      pagination: mapPagination(data?.pagination),
    };
  }

  async function getProfile() {
    return mapProfile(await client.get(`/users/${await username()}`));
  }

  // Pacing between albums is handled by the client's throttle.
  async function exportReleases(mode, albums) {
    const u = await username();
    const results = [];
    for (const item of albums) {
      const album = `${item.artist} - ${item.album}`;
      try {
        let releaseId = item.discogsId;
        if (!releaseId) {
          const found = await client.get('/database/search', {
            artist: item.artist, release_title: item.album, format: 'vinyl', per_page: 1,
          });
          releaseId = found?.results?.[0]?.id;
        }
        if (!releaseId) { results.push({ album, status: 'not_found' }); continue; }

        if (mode === 'collection') {
          await client.post(`/users/${u}/collection/folders/1/releases/${releaseId}`);
        } else {
          await client.put(`/users/${u}/wants/${releaseId}`, { notes: 'Added via CR8' });
        }
        results.push({ album, status: 'added', discogsId: releaseId });
      } catch (e) {
        // A bad token or throttling affects every remaining album — stop early.
        if (isAppError(e) && [ErrorCodes.DISCOGS_TOKEN_INVALID, ErrorCodes.DISCOGS_THROTTLED].includes(e.code)) throw e;
        results.push({ album, status: 'failed' });
      }
    }
    return results;
  }

  // Public profile lookup — no token needed. Used to catch username typos.
  async function userExists(name) {
    try {
      await client.get(`/users/${encodeURIComponent(name)}`, undefined, { auth: false });
      return true;
    } catch (e) {
      if (isAppError(e) && e.code === ErrorCodes.NOT_FOUND) return false;
      throw e;
    }
  }

  // Which Discogs account a (not yet saved) token belongs to.
  async function identity(token) {
    const d = await client.withToken(token).get('/oauth/identity');
    return { username: d?.username || '' };
  }

  return { search, getRelease, listFolder, getProfile, exportReleases, userExists, identity };
}
