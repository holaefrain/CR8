// Single source of truth for API error codes. Imported by the server's error
// middleware and by the renderer's api.js, so the UI branches on codes —
// never on message text.
export const ErrorCodes = Object.freeze({
  VALIDATION: 'VALIDATION',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  NOT_ONBOARDED: 'NOT_ONBOARDED',
  DISCOGS_TOKEN_INVALID: 'DISCOGS_TOKEN_INVALID',
  DISCOGS_TOKEN_MISMATCH: 'DISCOGS_TOKEN_MISMATCH',
  DISCOGS_THROTTLED: 'DISCOGS_THROTTLED',
  DISCOGS_UPSTREAM: 'DISCOGS_UPSTREAM',
  ENRICH_SOURCE_DISABLED: 'ENRICH_SOURCE_DISABLED',
  COLLECTION_CONFLICT: 'COLLECTION_CONFLICT',
  INTERNAL: 'INTERNAL',
});
