# Porting conventions

How Java code from [Columnal](https://github.com/neilccbrown/columnal) is translated to TypeScript in this
project. The overall plan is in [PLAN.md](PLAN.md). Progress is in [PORT-STATUS.md](PORT-STATUS.md), which is
regenerated with `npm run port-status`.

The guiding rule: **port the engine faithfully, rebuild the GUI.** Engine code (and the logic pulled
out of the GUI modules) is translated class by class, keeping names and structure so that it can be
reviewed side by side with the Java. Refactoring comes after a module works and its tests pass.

## Layout

| Java | TypeScript |
|---|---|
| `<module>/src/main/java/xyz/columnal/<path>/X.java` (engine modules) | `src/engine/<module>/<path>/X.ts` |
| `<module>/src/main/java/xyz/columnal/<path>/X.java` (GUI modules: logic only) | `src/gui-logic/<module>/<path>/X.ts` |
| Vue GUI (rebuilt, not ported) | `src/gui/` |
| `parsers/src/main/antlr/X.g4` | `src/engine/parsers/antlr/X.g4` (generated output: `src/engine/parsers/generated/`, not committed) |
| `tests-x/src/test/java/test/<path>/X.java` (`tests-basic`, `tests-functions`, `tests-tables`) | `test/engine/tests-x/<path>/X.test.ts` |
| `tests-x/src/test/java/test/<path>/X.java` (`tests-gui-*`) | `test/gui/tests-x/<path>/X.spec.ts` |
| `tests-x/src/testFixtures/java/(test\|xyz/columnal)/<path>/X.java` | `test/(engine\|gui)/tests-x/fixtures/<path>/X.ts` |
| Resources (`*.properties`, `builtin_units.txt`, funcdoc and help XML) | `resources/` (see [resources/ORIGIN.md](../resources/ORIGIN.md)) |

- One class per file, with the file named after the class, as in Java.
- New tests with no Java counterpart go in `test/engine/<src-module>/` (for example `test/engine/java/`).
  Directories named `tests-*` contain only ported tests.
- `src/engine/java/` is a TypeScript-only module of Java standard library equivalents (`JavaRandom`,
  `javaTrim`, `javaParseInt`, `Character` classification, enum helpers). Any module may use it.
- `npm run depcheck` enforces the layering: the engine never imports `src/gui` or `src/gui-logic`,
  nothing below `src/gui` imports Vue, and each engine module only imports the modules its Gradle
  module depended on. GUI dependencies of Java engine modules (for example `transformations` on
  `utility-gui`) are dropped, and whatever the engine used from them moves into the engine.
- Imports are relative and use the `.js` extension (`import { X } from "./X.js"`), as ES modules
  require. Type-only imports use `import type` (enforced by `verbatimModuleSyntax`).
- Resources are imported as text with Vite's `?raw` suffix through the `@resources` alias:
  `import units from "@resources/data/builtin_units.txt?raw"`. This works in Vite and in Vitest.
- Keep the Java formatting style (Allman braces, 4-space indent) in ported code, so that it diffs
  cleanly against the original. Keep the original comments, including `Created by neil on ...`.

## Intentional differences: `PORT-NOTE`

Whenever ported code deliberately behaves differently from the Java, or a Java bug is preserved,
mark it with a `// PORT-NOTE:` comment explaining why, so differences can be found with `grep`.
Whether bugs are preserved or fixed is still an open decision (PLAN.md §6). Until then, preserve
them and mark them.

## Java to TypeScript mappings

### Primitive types and strings

| Java | TypeScript | Notes |
|---|---|---|
| `int`, `short`, `byte` | `number` | Java int arithmetic wraps on overflow and JavaScript's doesn't. Where the Java relies on wrapping (hash codes, random numbers), use `\| 0` and `Math.imul`. |
| `long` | `bigint` | Use `number` only for values that are clearly within ±2^53, such as counts and indices, and say so in a comment. `BigInt.asIntN(64, x)` gives Java's wrapping. |
| `double` | `number` | |
| `float` | `number` | Use `Math.fround` where float rounding matters. |
| `char` | `string` of length 1 | A UTF-16 code unit, exactly like Java. A code point (`int`) is a `number`. |
| `boolean` | `boolean` | |
| `String` | `string` | Both are UTF-16, so `length`, `charAt`, `substring` and `indexOf` behave the same. |
| `BigDecimal`, Columnal's `@Value Number` | Decided in Phase 1 (decimal.js-based) | |

`java.lang.String` methods that behave differently from their JavaScript namesakes:

- `trim()`: Java removes only characters ≤ U+0020; use `javaTrim` (`src/engine/java/JavaString.ts`).
- `equals` becomes `===`. `compareTo` becomes `<`/`>`, which also compare UTF-16 code units.
- `replace(CharSequence, CharSequence)` replaces every occurrence, so use `replaceAll`.
- `Integer.parseInt` is stricter than `parseInt`: use `javaParseInt`.
- `toLowerCase()`/`toUpperCase()`: JavaScript's versions are locale-independent, like Java's with
  `Locale.ROOT`.
- `Character.isLetter`/`isDigit`/`isAlphabetic`/`isLetterOrDigit`: use `src/engine/java/JavaCharacter.ts`.
  `codePoints()` and `new String(int[], ...)` are there too.
- Regular expressions: Java and JavaScript syntax differ. Always use the `u` flag, and translate
  character classes carefully. For example, Java's `(?U)\s` is `\p{White_Space}`, not `\s`.

The JVM and the browser may use different Unicode versions. This only matters for recently assigned
characters, so it is accepted as a difference.

### Nulls, optionals and collections

- `null` stays `null`; use `T | null` for `@Nullable`, never `undefined`. `Optional<T>` becomes `T | null`,
  unless `null` is itself a valid value.
- `List`/`ImmutableList` become `T[]`/`readonly T[]`. Maps and sets keyed by Columnal values or
  identifiers need value equality: use the `equals`/`hashCode` protocol and `HashMap` from Phase 1, never
  a plain `Map`/`Set`, which compare objects by identity.
- Classes that override `equals`/`hashCode` in Java keep `equals(other: unknown): boolean` and
  `hashCode(): number` methods, with `hashCode` returning a Java int (using `| 0` and `Math.imul`).

### Classes, interfaces and enums

- **Overloaded methods** become one TypeScript method with overload signatures, dispatching on argument
  count or type (see `JavaRandom.nextInt`). If the dispatch would be ambiguous, use distinct names and
  put the Java signature in a comment.
- **Static nested classes** go in a namespace merged with the outer class, so `Outer.Inner` still works.
  Inner (non-static) classes are the same, but take the outer instance as a constructor argument.
  Anonymous classes become object literals or local classes.
- **Functional interfaces** become function types. Other interfaces stay interfaces. Default methods
  move into an abstract base class or helper functions.
- **Enums**: a numeric TypeScript `enum`, so values keep their declaration order and ordinals. Static
  methods go in a merged `namespace`. Instance methods become namespace functions that take the value
  as their first argument. `values()` and `name()` become `javaEnumValues(E)` and `javaEnumName(E, v)`
  (`src/engine/java/JavaEnum.ts`). An enum that has per-constant fields or behaviour may instead become
  a class with `static readonly` instances; decide case by case. See `parsers/grammar/Versions.ts`.
- **Switch statements** over enums or strings must end with an exhaustiveness check (`const _: never = x`),
  wherever the Java relied on covering every case.

### Exceptions

- Java exceptions become `Error` subclasses with the same names (`UserException` and
  `InternalException` in Phase 1, and `NumberFormatException` in `src/engine/java/JavaString.ts`).
- TypeScript `catch` catches everything, so a ported `catch (SomeException e)` must re-throw anything
  else: `catch (e) { if (!(e instanceof SomeException)) throw e; ... }`.
- `IllegalArgumentException` from Java's built-in classes usually becomes a `RangeError` or `TypeError`
  from the JavaScript equivalent. Tests should expect that.

### Annotations

- `@OnThread(...)` is dropped, unless it says something important about threading (then keep it as a comment).
- `@Nullable` becomes `| null`. `@Value`, `@ImmediateValue` and the other Checker Framework value
  annotations become branded types (Phase 2).

## Grammars

The ANTLR grammars are copied from the Java original, with these changes, each noted at the top of
the affected grammar file:

- Embedded actions and predicates are translated to TypeScript, for example `getText()` becomes
  `this.text` and `_input.LT(1)` becomes `this.tokenStream.LT(1)`, and Java's `trim()` becomes `javaTrim`.
- In `ExpressionParser` and `ExpressionParser2`, the rules `match` and `terminal` are renamed to
  `matchExpression` and `terminalExpression`, so the generated names are `MatchExpressionContext`,
  `visitMatchExpression` and so on. TypeScript cannot have both a `match` rule method and
  `Parser.match`, or a `visitTerminal(TerminalContext)` alongside `ParseTreeVisitor.visitTerminal`. In
  `ExpressionParser` (v1), `constructor` is renamed to `constructorExpression`, because antlr-ng does not
  escape the child accessor it generates for that name.
- `\p{Alpha}` and `\p{Digit}` become `\p{Alphabetic}` and `\p{Nd}`. Java ANTLR resolves the aliases
  to exactly those sets; antlr-ng doesn't recognise the aliases.
- A `@header` in an imported grammar (`StringLexerShared`) is inherited by every grammar that imports
  it, so those grammars must not declare the same import again.

The parsers are regenerated (in under a second) by `npm run gen:parsers`. That also runs automatically on
install and before `dev`, `build`, `test` and `typecheck`.

## Tests

- Keep each Java test method's name as the test name: `test("testFoo", ...)` or
  `propertyTest("testFoo", ...)`. `npm run port-status` matches test methods by name.
- JUnit assertions come from `test/support/junit.ts`. `assertEquals` uses Java `equals` semantics
  (`javaEquals`), not Vitest's deep equality. Hamcrest matchers are in `test/support/hamcrest.ts`.
- junit-quickcheck is replaced by `test/support/quickcheck.ts`, built on fast-check:
  - `@Property(trials = N)` with `@From(Gen.class)` parameters becomes
    `propertyTest(name, [new Gen()], (x) => ..., { trials: N })`.
  - `@When(seed = N)` becomes `{ seed: N }`. It fixes the seed for the whole run, not for a single parameter.
  - Generators extend `Generator<T>` and implement `generate(SourceOfRandomness, GenerationStatus)`.
    A `doShrink` override is used for shrinking, as in junit-quickcheck.
  - **Pitfall:** `SourceOfRandomness.nextInt(min, max)` includes `max`, while
    `JavaRandom.nextInt(origin, bound)` (java.util.Random) excludes `bound`. The Java tests use both forms.
  - `Assume.*` inside a property discards the trial (`fc.pre`).
- `java.util.Random` is `JavaRandom`, which is bit-for-bit compatible. So tests with fixed seeds generate
  the same data as on the JVM.
- **Golden values:** where Java behaviour is subtle, generate expected values from the real JVM rather
  than reasoning about it. See `scripts/golden/`, which uses `reference/columnal` from
  `npm run fetch-reference`, and `test/engine/parsers/GrammarUtility.test.ts`.
- GUI tests (Playwright) are ported per test method, at the level of behaviour (PLAN.md §3b).

## GUI (from Phase 7)

- Vue 3 with `<script setup lang="ts">`.
- Engine objects must never be made reactive. Don't wrap them in `reactive()` or a deep `ref()`; use
  `markRaw`/`shallowRef`. The UI tracks engine changes through version counters (PLAN.md §2b).
