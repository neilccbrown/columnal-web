# Columnal for the web

A client-side TypeScript web version of [Columnal](https://github.com/neilccbrown/columnal), the
JavaFX desktop application for safer, smoother data table processing. The aim is to keep the same
semantics and behaviour as the original, and to port all of its tests.

This is a work in progress. See [docs/PLAN.md](docs/PLAN.md) for the plan,
[docs/PORT-STATUS.md](docs/PORT-STATUS.md) for progress, and [docs/CONVENTIONS.md](docs/CONVENTIONS.md)
for how Java code is translated.

## Development

Requires Node 24 or later.

```sh
npm install                 # also generates the ANTLR parsers
npm run dev                 # start the app at http://localhost:5173
npm test                    # engine tests (Vitest)
npm run test:gui            # GUI tests (Playwright; first run `npx playwright install chromium`)
npm run typecheck           # type-check everything (vue-tsc)
npm run lint                # ESLint
npm run depcheck            # module layering rules (dependency-cruiser)
npm run build               # production build into dist/
```

Porting tools:

```sh
npm run fetch-reference     # check out the Java original (pinned commit) into reference/columnal
npm run port-status         # regenerate docs/PORT-STATUS.md
npm run gen:parsers         # regenerate the parsers after editing a grammar
```

`scripts/golden/` contains scripts that generate expected test values by running the Java code on
the JVM (requires Java 17+).

## Licence

GPLv3 or later, like the original. See [LICENSE.txt](LICENSE.txt).
