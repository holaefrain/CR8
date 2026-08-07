import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerConfigRoutes } from './routes/config.js';
import { registerSearchRoute } from './routes/search.js';
import { registerEnrichRoute } from './routes/enrich.js';
import { registerDiscogsRoutes } from './routes/discogs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  const env = {
    DISCOGS_TOKEN: process.env.DISCOGS_TOKEN,
    DISCOGS_USERNAME: process.env.DISCOGS_USERNAME || ''
  };

  registerConfigRoutes(app, env);
  registerSearchRoute(app, env);
  registerEnrichRoute(app);
  registerDiscogsRoutes(app, env);

  return app;
}

export function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  return app.listen(port, () => console.log(`\n CR8 running at http://localhost:${port}\n`));
}
