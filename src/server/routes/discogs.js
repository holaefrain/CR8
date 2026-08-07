import fetch from 'node-fetch';

export function registerDiscogsRoutes(app, env) {
  app.post('/api/discogs/verify', async (req, res) => {
    const { username, token } = req.body;
    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken || !username) return res.status(400).json({ error: 'Username and token required' });
    try {
      const r = await fetch(`https://api.discogs.com/users/${encodeURIComponent(username)}`, {
        headers: { Authorization: `Discogs token=${authToken}`, 'User-Agent': 'VinylManager/1.0' }
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.message || 'Invalid credentials' });
      }
      const d = await r.json();
      res.json({
        username: d.username,
        name: d.name || d.username,
        avatar_url: d.avatar_url || '',
        num_collection: d.num_collection || 0,
        num_wantlist: d.num_wantlist || 0
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/discogs/collection', async (req, res) => {
    const { username, token, page = 1, perPage = 25 } = req.query;
    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken || !username) return res.status(400).json({ error: 'Username and token required' });
    try {
      const r = await fetch(
        `https://api.discogs.com/users/${encodeURIComponent(username)}/collection/folders/0/releases?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`,
        { headers: { Authorization: `Discogs token=${authToken}`, 'User-Agent': 'VinylManager/1.0' } }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.message || 'Failed to fetch collection' });
      }
      const data = await r.json();
      res.json({
        items: (data.releases || []).map(w => {
          const info = w.basic_information;
          return {
            discogsId: info.id,
            artist: (info.artists || []).map(a => a.name).join(', ').replace(/\s*\(\d+\)/g, ''),
            album: info.title,
            year: info.year || '',
            genre: (info.genres || []).join(', '),
            styles: (info.styles || []).join(', '),
            label: (info.labels || []).map(l => l.name).join(', '),
            thumb: info.thumb || info.cover_image || '',
            formats: (info.formats || []).map(f => f.name).join(', '),
            discogsUrl: `https://www.discogs.com/release/${info.id}`
          };
        }),
        pagination: {
          page: data.pagination?.page || 1,
          pages: data.pagination?.pages || 1,
          items: data.pagination?.items || 0,
          perPage: data.pagination?.per_page || 25
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/discogs/wantlist', async (req, res) => {
    const { username, token, page = 1, perPage = 25 } = req.query;
    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken || !username) return res.status(400).json({ error: 'Username and token required' });
    try {
      const r = await fetch(
        `https://api.discogs.com/users/${encodeURIComponent(username)}/wants?page=${page}&per_page=${perPage}&sort=added&sort_order=desc`,
        { headers: { Authorization: `Discogs token=${authToken}`, 'User-Agent': 'VinylManager/1.0' } }
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.message || 'Failed to fetch wantlist' });
      }
      const data = await r.json();
      res.json({
        items: (data.wants || []).map(w => {
          const info = w.basic_information;
          return {
            discogsId: info.id,
            artist: (info.artists || []).map(a => a.name).join(', ').replace(/\s*\(\d+\)/g, ''),
            album: info.title,
            year: info.year || '',
            genre: (info.genres || []).join(', '),
            styles: (info.styles || []).join(', '),
            label: (info.labels || []).map(l => l.name).join(', '),
            thumb: info.thumb || info.cover_image || '',
            formats: (info.formats || []).map(f => f.name).join(', '),
            discogsUrl: `https://www.discogs.com/release/${info.id}`
          };
        }),
        pagination: {
          page: data.pagination?.page || 1,
          pages: data.pagination?.pages || 1,
          items: data.pagination?.items || 0,
          perPage: data.pagination?.per_page || 25
        }
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/discogs/release/:id', async (req, res) => {
    const { id } = req.params;
    const { token } = req.query;
    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken) return res.status(400).json({ error: 'Token required' });
    try {
      const r = await fetch(`https://api.discogs.com/releases/${id}`, {
        headers: { Authorization: `Discogs token=${authToken}`, 'User-Agent': 'VinylManager/1.0' }
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: err.message || 'Failed to fetch release' });
      }
      const detail = await r.json();
      res.json({
        tracks: (detail.tracklist || [])
          .filter(t => t.type_ === 'track')
          .map(t => ({
            title: t.title,
            artist: t.artists ? t.artists.map(a => a.name).join(', ').replace(/\s*\(\d+\)/g, '') : '',
            duration: t.duration || '',
            position: t.position || '',
            bpm: '',
            key: ''
          })),
        videos: (detail.videos || []).map(v => ({ uri: v.uri, title: v.title || '' }))
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/discogs/export', async (req, res) => {
    const { collection, username, token, mode } = req.body;
    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken) return res.status(400).json({ error: 'Discogs token required' });
    if (!username) return res.status(400).json({ error: 'Discogs username required' });

    const results = [];
    const albums = [...new Map(collection.map(t => [t.artist + t.album, t])).values()];

    for (const item of albums) {
      try {
        let releaseId = item.discogsId;

        if (!releaseId) {
          const searchRes = await fetch(
            `https://api.discogs.com/database/search?artist=${encodeURIComponent(item.artist)}&release_title=${encodeURIComponent(item.album)}&format=vinyl&per_page=1`,
            { headers: { Authorization: `Discogs token=${authToken}`, 'User-Agent': 'VinylManager/1.0' } }
          );
          const searchData = await searchRes.json();
          releaseId = searchData.results?.[0]?.id;
        }

        if (releaseId) {
          let exportRes;
          if (mode === 'collection') {
            exportRes = await fetch(
              `https://api.discogs.com/users/${username}/collection/folders/1/releases/${releaseId}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Discogs token=${authToken}`,
                  'User-Agent': 'VinylManager/1.0',
                  'Content-Type': 'application/json'
                }
              }
            );
          } else {
            exportRes = await fetch(
              `https://api.discogs.com/users/${username}/wants/${releaseId}`,
              {
                method: 'PUT',
                headers: {
                  Authorization: `Discogs token=${authToken}`,
                  'User-Agent': 'VinylManager/1.0',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ notes: 'Added via Vinyl Manager' })
              }
            );
          }
          results.push({
            album: `${item.artist} - ${item.album}`,
            status: exportRes.ok ? 'added' : 'failed',
            discogsId: releaseId
          });
        } else {
          results.push({ album: `${item.artist} - ${item.album}`, status: 'not_found' });
        }

        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        results.push({ album: `${item.artist} - ${item.album}`, status: 'error', error: e.message });
      }
    }

    res.json({ results });
  });
}
