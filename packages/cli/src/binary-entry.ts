// Entry point for `bun build --compile` standalone binaries.
//
// `src/index.ts` only EXPORTS `main`; it does not call it (the npm bundle is
// imported by `bin/omem.cjs` and the dev-mode bun shim does the same). When
// `bun build --compile` is given a source file, the resulting binary just runs
// that file — so we need an entry that actually invokes `main` for the binary
// build target.
import { main } from './index';

main(process.argv.slice(2))
  .then((code) => process.exit(typeof code === 'number' ? code : 0))
  .catch((err) => {
    process.stderr.write(
      `omem: unhandled error: ${err instanceof Error ? err.stack : String(err)}\n`,
    );
    process.exit(1);
  });
