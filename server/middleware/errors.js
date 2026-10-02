import { ErrorCodes } from '../../shared/errorCodes.js';

// An error that is safe to show to the user. Anything else that reaches the
// error handler is logged in full and answered with a generic message.
export class AppError extends Error {
  constructor(code, status, message, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export const isAppError = e => e instanceof AppError;

export function createErrorHandler(log = console) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    if (err?.type === 'entity.too.large') {
      err = new AppError(ErrorCodes.VALIDATION, 413, 'Request is too large.');
    } else if (err?.type === 'entity.parse.failed') {
      err = new AppError(ErrorCodes.VALIDATION, 400, 'Request body is not valid JSON.');
    }

    if (isAppError(err)) {
      if (res.headersSent) return res.end();
      return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
    }

    log.error?.(`[${req.method} ${req.path}]`, err);
    if (res.headersSent) return res.end();
    res.status(500).json({ error: 'Something went wrong. Please try again.', code: ErrorCodes.INTERNAL });
  };
}
