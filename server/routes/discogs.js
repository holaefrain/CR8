import express from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';
import { str, int, clampInt, arr } from '../lib/validate.js';

export function discogsRoutes({ discogs }) {
  const r = express.Router();

  r.post('/api/search', asyncRoute(async (req, res) => {
    const { query, filters = {}, perPage } = req.body || {};
    const q = str(query, 'Search', { required: true, max: 200 });
    const f = {
      artist: str(filters.artist, 'Artist', { max: 100 }),
      label: str(filters.label, 'Label', { max: 100 }),
      country: str(filters.country, 'Country', { max: 100 }),
      year: str(filters.year, 'Year', { max: 100 }),
      genre: str(filters.genre, 'Genre', { max: 100 }),
    };
    res.json(await discogs.search(q, f, clampInt(perPage, { min: 1, max: 25, fallback: 10 })));
  }));

  r.get('/api/discogs/profile', asyncRoute(async (req, res) => {
    res.json(await discogs.getProfile());
  }));

  for (const [route, kind] of [['collection', 'collection'], ['wantlist', 'wants']]) {
    r.get(`/api/discogs/${route}`, asyncRoute(async (req, res) => {
      const page = clampInt(req.query.page, { min: 1, max: 10_000, fallback: 1 });
      const perPage = clampInt(req.query.perPage, { min: 1, max: 100, fallback: 25 });
      res.json(await discogs.listFolder(kind, page, perPage));
    }));
  }

  r.get('/api/discogs/release/:id', asyncRoute(async (req, res) => {
    const release = await discogs.getRelease(int(req.params.id, 'Release id'));
    res.json({ tracks: release.tracks });
  }));

  r.post('/api/discogs/export', asyncRoute(async (req, res) => {
    const mode = req.body?.mode === 'collection' ? 'collection' : 'wantlist';
    const albums = arr(req.body?.albums, 'Albums', { required: true, max: 100 }).map(a => ({
      artist: str(a?.artist, 'Artist', { max: 500 }),
      album: str(a?.album, 'Album', { max: 500 }),
      discogsId: Number.isInteger(Number(a?.discogsId)) && Number(a.discogsId) > 0 ? Number(a.discogsId) : 0,
    }));
    res.json({ results: await discogs.exportReleases(mode, albums) });
  }));

  return r;
}
