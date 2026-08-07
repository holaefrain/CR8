export function registerConfigRoutes(app, env) {
  app.get('/api/config', (_req, res) => {
    res.json({
      hasDiscogsToken: !!env.DISCOGS_TOKEN,
      discogsUsername: env.DISCOGS_USERNAME || ''
    });
  });
}
