import { AppError } from '../middleware/errors.js';
import { ErrorCodes } from '../../shared/errorCodes.js';

const fail = message => { throw new AppError(ErrorCodes.VALIDATION, 400, message); };

export function str(value, name, { max = 200, required = false, pattern } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${name} is required.`);
    return '';
  }
  if (typeof value !== 'string' && typeof value !== 'number') fail(`${name} must be text.`);
  const s = String(value).trim();
  if (required && !s) fail(`${name} is required.`);
  if (s.length > max) fail(`${name} must be at most ${max} characters.`);
  if (pattern && s && !pattern.test(s)) fail(`${name} is not valid.`);
  return s;
}

export function int(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER, fallback } = {}) {
  if ((value === undefined || value === '') && fallback !== undefined) return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) fail(`${name} must be a whole number.`);
  if (n < min || n > max) fail(`${name} must be between ${min} and ${max}.`);
  return n;
}

export function clampInt(value, { min, max, fallback }) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function arr(value, name, { max, required = false } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) fail(`${name} must be a list.`);
  if (max !== undefined && value.length > max) fail(`${name} can have at most ${max} items.`);
  return value;
}

export function bool(value, name) {
  if (typeof value !== 'boolean') fail(`${name} must be true or false.`);
  return value;
}
