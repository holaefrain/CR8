import fetch from 'node-fetch';

export function registerSearchRoute(app, env) {
  app.post('/api/search', async (req, res) => {
    const { query, token, filters = {}, perPage = 10 } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required' });

    const authToken = token || env.DISCOGS_TOKEN;
    if (!authToken) return res.status(400).json({ error: 'Discogs token required. Add it to .env or enter it in the Discogs tab.' });

    try {
      const params = new URLSearchParams({
        q: query,
        type: 'release',
        format: 'vinyl',
        per_page: Math.min(Math.max(parseInt(perPage) || 10, 1), 25)
      });
      if (filters.artist) params.set('artist', filters.artist);
      if (filters.label) params.set('label', filters.label);
      if (filters.country) params.set('country', filters.country);
      if (filters.year) params.set('year', filters.year);
      if (filters.genre) params.set('genre', filters.genre);

      const searchUrl = `https://api.discogs.com/database/search?${params}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          Authorization: `Discogs token=${authToken}`,
          'User-Agent': 'VinylManager/1.0'
        }
      });

      if (!searchRes.ok) {
        const err = await searchRes.json();
        return res.status(searchRes.status).json({ error: err.message || 'Discogs search failed' });
      }

      const searchData = await searchRes.json();
      const releases = searchData.results || [];

      if (!releases.length) return res.json([]);

      const results = await Promise.all(
        releases.map(async (release) => {
          try {
            const detailRes = await fetch(`https://api.discogs.com/releases/${release.id}`, {
              headers: {
                Authorization: `Discogs token=${authToken}`,
                'User-Agent': 'ProjectPosterity/1.0'
              }
            });
            const detail = await detailRes.json();

            const tracks = (detail.tracklist || [])
              .filter(t => t.type_ === 'track')
              .map(t => ({
                title: t.title,
                artist: t.artists ? t.artists.map(a => a.name).join(', ').replace(/\s*\(\d+\)/g, '') : '',
                duration: t.duration || '',
                position: t.position || '',
                bpm: '',
                key: ''
              }));

            const artistName = (detail.artists || release.title?.split(' - ') || [])
              .map(a => a.name || a)
              .join(', ')
              .replace(/\s*\(\d+\)$/g, '');

            const album = detail.title || release.title || '';
            const year = detail.year || release.year || '';
            const genres = (detail.genres || release.genre || []).join(', ');
            const styles = (detail.styles || release.style || []).join(', ');
            const label = (detail.labels || []).map(l => l.name).join(', ') || '';
            const discogsUrl = `https://www.discogs.com/release/${release.id}`;
            const thumb = release.thumb || '';

            return {
              artist: artistName,
              album,
              year,
              genre: styles || genres,
              label,
              tracks,
              discogsId: release.id,
              discogsUrl,
              thumb,
              videos: (detail.videos || []).map(v => ({ uri: v.uri, title: v.title || '' }))
            };
          } catch {
            return {
              artist: release.title?.split(' - ')[0] || '',
              album: release.title?.split(' - ').slice(1).join(' - ') || release.title || '',
              year: release.year || '',
              genre: (release.genre || []).join(', '),
              label: '',
              tracks: [],
              discogsId: release.id,
              discogsUrl: `https://www.discogs.com/release/${release.id}`,
              thumb: release.thumb || ''
            };
          }
        })
      );

      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
}
