#!/usr/bin/env node
// Entry shim for the published `oh-my-memories` npm package.
//
// Two runtime modes:
//   1. Published / installed via npm: `dist/cli.cjs` exists (the bundled output
//      of `bun build --target=node`). We require it and call `main()`.
//   2. Local development: `dist/cli.cjs` does not exist yet (no build run). We
//      fall back to the TypeScript source via Bun if the runtime is Bun, or
//      print a helpful message.
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const bundlePath = path.join(__dirname, '..', 'dist', 'cli.cjs');

function fail(message) {
  process.stderr.write(`omem: ${message}\n`);
  process.exit(1);
}

function describeError(err) {
  if (err && typeof err === 'object' && 'stack' in err && err.stack) return err.stack;
  return String(err);
}

if (fs.existsSync(bundlePath)) {
  const mod = require(bundlePath);
  const main = mod.main || mod.default?.main;
  if (typeof main !== 'function') {
    fail("internal error: bundled CLI does not export a 'main' function");
  }
  Promise.resolve(main(process.argv.slice(2)))
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((err) => {
      process.stderr.write(`omem: unhandled error: ${describeError(err)}\n`);
      process.exit(1);
    });
} else if (typeof process.versions.bun === 'string') {
  // Local dev under Bun — wrap import() in Function() so plain Node never sees
  // import() as syntax (avoids parse errors in older Node when bundle exists).
  const dynamicImport = new Function('p', 'return import(p)');
  dynamicImport('../src/index.ts')
    .then((m) => m.main(process.argv.slice(2)))
    .then((code) => process.exit(typeof code === 'number' ? code : 0))
    .catch((err) => {
      process.stderr.write(`omem: unhandled error: ${describeError(err)}\n`);
      process.exit(1);
    });
} else {
  fail(
    "missing dist/cli.cjs. Run 'bun run build' from packages/cli, or install the published package.",
  );
}
