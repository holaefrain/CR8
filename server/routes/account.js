import express from 'express';
import { asyncRoute } from '../lib/asyncRoute.js';
import { str, bool } from '../lib/validate.js';

export function accountRoutes({ account, discogs, settingsStore }) {
  const r = express.Router();

  r.get('/api/me', asyncRoute(async (req, res) => res.json(await account.getMe())));

  r.put('/api/account/profile', asyncRoute(async (req, res) => {
    res.json(await account.saveProfile({
      firstName: str(req.body?.firstName, 'First name', { max: 60 }),
      discogsUsername: str(req.body?.discogsUsername, 'Discogs username', { required: true, max: 64 }),
    }));
  }));

  // Live check while typing in onboarding — public Discogs lookup, no token.
  r.get('/api/account/username-check', asyncRoute(async (req, res) => {
    const name = str(req.query.u, 'Discogs username', { required: true, max: 64, pattern: /^[A-Za-z0-9._-]+$/ });
    res.json({ exists: await discogs.userExists(name) });
  }));

  r.put('/api/account/discogs-token', asyncRoute(async (req, res) => {
    res.json(await account.connectToken(str(req.body?.token, 'Token', { required: true, max: 200 })));
  }));

  r.delete('/api/account/discogs-token', asyncRoute(async (req, res) => {
    res.json(await account.removeToken());
  }));

  r.get('/api/settings', asyncRoute(async (req, res) => res.json(await settingsStore.get())));

  r.put('/api/settings', asyncRoute(async (req, res) => {
    const next = {
      beatport: bool(req.body?.beatport, 'beatport'),
      youtube: bool(req.body?.youtube, 'youtube'),
    };
    await settingsStore.set(next);
    res.json(next);
  }));

  return r;
}
