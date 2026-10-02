import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// A small JSON file in the app's data directory, written atomically.
export function createJsonFile(file, fallback) {
  return {
    async read() {
      try {
        return JSON.parse(await fs.readFile(file, 'utf8'));
      } catch (e) {
        if (e.code === 'ENOENT' || e instanceof SyntaxError) return fallback;
        throw e;
      }
    },
    async write(value) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
      await fs.rename(tmp, file);
    },
  };
}

export const appError = (code, message, status = 400) =>
  Object.assign(new Error(message), { cr8Code: code, status });
