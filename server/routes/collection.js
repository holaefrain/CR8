import express from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';
import { int, arr } from '../lib/validate.js';
import { MAX_TRACKS } from '../collection/store.js';

export function collectionRoutes({ collection }) {
  const r = express.Router();

  r.get('/api/collection', asyncRoute(async (req, res) => {
    const { revision, tracks, recovered } = await collection.load();
    res.json({ revision, tracks, recovered });
  }));

  r.put('/api/collection', express.json({ limit: '10mb' }), asyncRoute(async (req, res) => {
    const baseRevision = int(req.body?.baseRevision, 'baseRevision', { min: 0 });
    const tracks = arr(req.body?.tracks, 'Tracks', { required: true, max: MAX_TRACKS });
    res.json(await collection.save(tracks, baseRevision));
  }));

  return r;
}
