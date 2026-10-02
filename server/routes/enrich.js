import express from 'express';
import { int } from '../lib/validate.js';

// Streams NDJSON — one `{ i, title, bpm, key, duration? }` line per track as
// soon as that track finishes.
export function enrichRoutes({ enrich }) {
  const r = express.Router();

  r.post('/api/enrich', async (req, res, next) => {
    let releaseId;
    try {
      releaseId = int(req.body?.discogsReleaseId, 'Release id');
    } catch (e) {
      return next(e);
    }

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
    };

    try {
      await enrich.enrichRelease(releaseId, result => {
        start();
        res.write(JSON.stringify(result) + '\n');
      });
      start();
      res.end();
    } catch (e) {
      // Before streaming starts (e.g. release lookup failed) send a normal
      // JSON error; afterwards just end the stream.
      if (!started) return next(e);
      res.end();
    }
  });

  return r;
}
