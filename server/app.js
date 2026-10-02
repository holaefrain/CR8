import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLocalGuard, securityHeaders } from './middleware/localGuard.js';
import { createErrorHandler, AppError } from './middleware/errors.js';
import { ErrorCodes } from '../shared/errorCodes.js';
import { createLimiter } from './lib/limiter.js';
import { createDiscogsClient } from './discogs/client.js';
import { createDiscogsService } from './discogs/service.js';
import { createAccountService, requireUsername } from './account/service.js';
import { createBeatportSource } from './enrich/beatport.js';
import { createYouTubeSource } from './enrich/youtube.js';
import { createDspPool } from './enrich/dsp/pool.js';
import { createEnrichService } from './enrich/service.js';
import { createCollectionStore } from './collection/store.js';
import { discogsRoutes } from './routes/discogs.js';
import { accountRoutes } from './routes/account.js';
import { enrichRoutes } from './routes/enrich.js';
import { collectionRoutes } from './routes/collection.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pub = p => path.join(ROOT, 'public', p);
const mod = p => path.join(ROOT, 'node_modules', p);

// Builds the services from the injected ports and starts the HTTP server on
// 127.0.0.1. No business logic lives here — only wiring.
export async function startServer({
  secret, dataDir, userAgent, binaries,
  secretStore, profileStore, settingsStore, pageFetcher,
  port = 0, fetch = globalThis.fetch, log = console, services = {},
}) {
  if (!secret || secret.length < 32) throw new Error('startServer: a 32+ char secret is required');

  const client = createDiscogsClient({ getToken: () => secretStore.get(), userAgent, fetch });
  const discogs = services.discogs ?? createDiscogsService({ client, getUsername: () => requireUsername(profileStore) });
  const account = services.account ?? createAccountService({ discogs, secretStore, profileStore });
  const dsp = services.dsp ?? createDspPool();
  const enrich = services.enrich ?? createEnrichService({
    discogs,
    beatport: createBeatportSource({ pageFetcher, limiter: createLimiter(2), log }),
    youtube: createYouTubeSource({ binaries, limiter: createLimiter(2) }),
    dsp,
    settingsStore,
    log,
  });
  const collection = createCollectionStore({ dataDir, log });

  const app = express();
  app.disable('x-powered-by');
  let boundPort = port;
  app.use(createLocalGuard({ secret, getPort: () => boundPort }));
  app.use(securityHeaders);

  // Pages: first run goes to onboarding until a token is connected.
  app.get('/', (req, res, next) => {
    account.getMe()
      .then(me => res.sendFile(pub(me.onboarded ? 'app.html' : 'onboarding.html')))
      .catch(next);
  });
  app.use(express.static(path.join(ROOT, 'public'), { index: false }));
  app.use('/shared', express.static(path.join(ROOT, 'shared')));
  app.use('/vendor/anime', express.static(mod('animejs/dist/bundles')));
  app.use('/vendor/exceljs', express.static(mod('exceljs/dist')));
  app.use('/vendor/fonts/dm-mono', express.static(mod('@fontsource/dm-mono')));
  app.use('/vendor/fonts/space-grotesk', express.static(mod('@fontsource/space-grotesk')));

  // The collection route has its own (larger) body limit, so it goes first.
  app.use(collectionRoutes({ collection }));
  app.use(express.json({ limit: '1mb' }));
  app.use(accountRoutes({ account, discogs, settingsStore }));
  app.use(discogsRoutes({ discogs }));
  app.use(enrichRoutes({ enrich }));
  app.use('/api', (req, res, next) => next(new AppError(ErrorCodes.NOT_FOUND, 404, 'Unknown API route.')));
  app.use(createErrorHandler(log));

  const server = await new Promise((resolve, reject) => {
    const s = app.listen(port, '127.0.0.1', () => resolve(s));
    s.on('error', reject);
  });
  boundPort = server.address().port;
  server.headersTimeout = 15_000;
  server.requestTimeout = 0; // /api/enrich streams for minutes; per-source timeouts apply instead

  async function close() {
    await new Promise(resolve => server.close(resolve));
    await dsp.close?.();
  }

  return { port: boundPort, close };
}
