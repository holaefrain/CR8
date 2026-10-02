// Forwards rejected promises from async handlers to the error middleware.
export const asyncRoute = fn => (req, res, next) => fn(req, res, next).catch(next);
