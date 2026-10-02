import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ROOT } from './helpers.js';

// Enforces the dependency rules from the architecture plan by scanning imports.
function filesUnder(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { recursive: true })
    .filter(f => /\.(m?js|cjs)$/.test(f))
    .map(f => path.join(dir, f));
}

function importsOf(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...src.matchAll(/(?:import\s[^'"]*?from\s*|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);
}

const resolveRel = (file, spec) =>
  spec.startsWith('.') ? path.normalize(path.join(path.dirname(file), spec)) : spec;

test('server/ never imports electron or electron/', () => {
  for (const file of filesUnder('server')) {
    for (const spec of importsOf(file)) {
      const target = resolveRel(file, spec);
      assert.notEqual(spec, 'electron', `${file} imports electron`);
      assert.ok(!target.startsWith('electron' + path.sep), `${file} imports ${spec}`);
    }
  }
});

test('electron/ imports only server/ports.js from the server', () => {
  for (const file of filesUnder('electron')) {
    for (const spec of importsOf(file)) {
      const target = resolveRel(file, spec);
      if (target.startsWith('server' + path.sep)) {
        assert.equal(target, path.join('server', 'ports.js'), `${file} imports ${spec}`);
      }
    }
  }
});

test('shared/ imports nothing from server/, electron/ or public/', () => {
  for (const file of filesUnder('shared')) {
    for (const spec of importsOf(file)) {
      const target = resolveRel(file, spec);
      assert.ok(!/^(server|electron|public)[\\/]/.test(target), `${file} imports ${spec}`);
    }
  }
});

test('public/ talks to the server only through api.js', () => {
  for (const file of filesUnder('public/js')) {
    if (file.endsWith(path.join('js', 'api.js'))) continue;
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.ok(!/fetch\(\s*['"`]\/api\//.test(src), `${file} calls /api directly`);
  }
});

test('no inline event handlers in pages (CSP has no unsafe-inline scripts)', () => {
  for (const page of ['public/app.html', 'public/onboarding.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.ok(!/\son[a-z]+\s*=/.test(html), `${page} has an inline handler`);
    assert.ok(!/<script(?![^>]*\ssrc=)[^>]*>/.test(html), `${page} has an inline script`);
  }
});
