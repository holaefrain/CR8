import crypto from 'crypto';
import { ErrorCodes } from '../../shared/errorCodes.js';

export const SECRET_HEADER = 'x-cr8-secret';

// The local server listens on 127.0.0.1, which any website open in the user's
// browser can also reach. Only the CR8 window can send the per-launch secret
// (Electron injects it into requests to this origin), and the Host/Origin
// checks stop DNS-rebinding and cross-site requests.
export function createLocalGuard({ secret, getPort }) {
  const expected = Buffer.from(secret);

  return (req, res, next) => {
    const port = getPort();
    const origin = `http://127.0.0.1:${port}`;
    const given = Buffer.from(String(req.get(SECRET_HEADER) || ''));
    const secretOk = given.length === expected.length && crypto.timingSafeEqual(given, expected);
    const hostOk = req.get('host') === `127.0.0.1:${port}`;
    const originHeader = req.get('origin');
    const originOk = !originHeader || originHeader === origin;

    if (secretOk && hostOk && originOk) return next();
    res.status(403).json({ error: 'Forbidden', code: ErrorCodes.FORBIDDEN });
  };
}

// Response headers for every page and API response.
export function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: https://i.discogs.com https://st.discogs.com",
      "connect-src 'self' http://127.0.0.1:41951",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
}
