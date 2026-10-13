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
- `src/engine/java/` is a TypeScript-only module of Java standard library equivalents, and of the
  small third-party Java classes Columnal used (`Rational` from javaSMT, `Damerau` from
  java-string-similarity). Any module may use it. It contains `JavaObject` (equals/hashCode/compareTo),
  `HashMap`/`HashSet`, `JavaBigDecimal` (numbers), `JavaString`, `JavaDouble`, `JavaCharacter`,
  `JavaRandom`, `JavaCollections`, `JavaProperties`, `JavaEnum` and `JavaExceptions`.
- `src/engine/anns/` holds type aliases for the Java Checker Framework qualifiers
  (`ExpressionIdentifier`, `TableDataRowIndex`, ...), which document ported signatures.
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

## Intentional differences: `PORT-NOTE` and `PORT-DEFERRED`

Whenever ported code deliberately behaves differently from the Java, or a Java bug is preserved,
mark it with a `// PORT-NOTE:` comment explaining why, so differences can be found with `grep`.
Whether bugs are preserved or fixed is still an open decision (PLAN.md §6). Until then, preserve
them and mark them.

Members of a ported class that can't be ported yet (usually because they need a later phase) are
listed in a `// PORT-DEFERRED:` comment. `npm run port-status` reports files containing one as
"parts deferred". Java files that are deliberately not ported at all are listed in
`scripts/port-status.ts`, with the reason.

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
| `Long`/`BigDecimal` as a Columnal number (`@Value Number`) | `Decimal` from `src/engine/java/JavaBigDecimal.ts` | See "Numbers" below. |

`java.lang.String` methods that behave differently from their JavaScript namesakes:

- `trim()`: Java removes only characters ≤ U+0020; use `javaTrim` (`src/engine/java/JavaString.ts`).
- `equals` becomes `===`. `compareTo` becomes `<`/`>`, which also compare UTF-16 code units.
- `replace(CharSequence, CharSequence)`: use `javaReplace`. It replaces every occurrence literally,
  whereas JavaScript's `replaceAll` interprets `$&`, `$1` etc. in a replacement string.
- `split(regex)`: use `javaSplit`, which drops trailing empty strings as Java does.
- `Integer.parseInt`, `Long.parseLong`, `Double.parseDouble`: use `javaParseInt`, `javaParseLong`
  and `javaParseDouble`. Java's rules differ from JavaScript's in many details. For example, Java
  accepts non-ASCII digits and a `1.5f` suffix, and rejects things `Number()` accepts.
- `toLowerCase()`/`toUpperCase()`: JavaScript's versions are locale-independent, like Java's with
  `Locale.ROOT`.
- `Character.isLetter`/`isDigit`/`isAlphabetic`/`isLetterOrDigit`/`isWhitespace`/`toUpperCase`/
  `toLowerCase`: use `src/engine/java/JavaCharacter.ts`. `codePoints()` and `new String(int[], ...)` are
  there too. Java's `isWhitespace` is neither JavaScript's `\s` nor Unicode `White_Space`, and Java's
  char case mappings are one-to-one, unlike JavaScript's `toUpperCase`.
- Regular expressions: Java and JavaScript syntax differ. Always use the `u` flag, and translate
  character classes carefully. For example, Java's `(?U)\s` is `\p{White_Space}`, not `\s`.

The JVM and the browser may use different Unicode versions (Java 21 has Unicode 15). This only affects
recently assigned characters and a few property changes, so it is accepted as a difference. The golden
tests in `test/engine/java/JavaLang.test.ts` list exactly which characters are affected.

### Numbers

Columnal numbers are **canonical decimals**: `Decimal` (a decimal.js type configured as Java's
`MathContext.DECIMAL128`: 34 significant digits, round half even), always in canonical form, where
trailing zeros are not significant (2.5 and 2.50 are the same value) and there is no -0.

- In Java a number was a `Long` or a `BigDecimal`, and a `BigDecimal` kept its scale. The scale only
  showed in how some *computed* results were displayed (`1.25 * 2` showed as `2.50`, and `round(3.0001, 2)`
  as `3.00`, but `round(3, 2)` as `3`). Equality, ordering, grouping and parsing all ignored it.
  Here those displays show without trailing zeros. Everything else matches Java.
- There is one representation: a whole number is a `Decimal` too. Java's `long` fast path never
  changes a value, as `DECIMAL128` holds any `long` exactly. `Utility.withNumber` passes whole numbers
  within long range to the "long" callback.
- Never import `decimal.js` directly (`npm run depcheck` enforces this): its default precision is
  different. Use the helpers in `JavaBigDecimal.ts`: `parseBigDecimal` (Java's `new BigDecimal(String)`
  syntax, including non-ASCII digits), `powDecimal128` (Java's `pow` algorithm, which is not correctly
  rounded), `decimalFromDouble` (`BigDecimal.valueOf(double)`), `decimalFromDoubleExact`
  (`new BigDecimal(double)`), `toPlainString`, `toJavaString` (the Java `toString` of a number),
  `longValue`/`intValue`/`doubleValue`, and `canonical` for any result that could be -0.
- Use `javaDoubleToString` for a double in a user-visible message (Java prints `2.0`, JavaScript `2`).

### Nulls, optionals and collections

- `null` stays `null`; use `T | null` for `@Nullable`, never `undefined`. `Optional<T>` becomes `T | null`,
  unless `null` is itself a valid value.
- `List`/`ImmutableList` become `T[]`/`readonly T[]`. Java `Stream`s become arrays (use a generator
  only where laziness matters), and `Optional<T>`/`OptionalInt` become `T | null`.
- Maps and sets: use JavaScript `Map`/`Set` for string, number or boolean keys, and `HashMap`/`HashSet`
  (`src/engine/java/HashMap.ts`) for object keys (ids, values, Pairs, ...), which compare keys with
  `equals`/`hashCode`. A plain `Map` would compare objects by identity. `ReadonlyMapLike` accepts either.
- **Iteration order:** `HashMap`/`HashSet` iterate in insertion order, like `LinkedHashMap` and Guava's
  `ImmutableMap`, *not* in Java `HashMap`'s hash order. When porting code that iterates a Java
  `HashMap`/`HashSet`, check whether the order is observable (in output, files or behaviour). If it is,
  sort explicitly or otherwise reproduce it, and say what you did in a `PORT-NOTE`.
- Classes that override `equals`/`hashCode` in Java keep `equals(other: unknown): boolean` and
  `hashCode(): number` methods, with `hashCode` returning a Java int (using `| 0` and `Math.imul`).
  `javaEquals`, `javaHashCode` and `javaCompare` (`JavaObject.ts`) extend the protocol to strings,
  numbers, booleans, `Decimal`s, arrays and JS `Map`/`Set`. Objects without `equals` compare by
  identity, as in Java.

### Values

A Columnal value (Java `@Value Object`) is the `Value` type in `src/engine/utility/utility/Value.ts`:
`Decimal | boolean | string | TemporalAccessor | TaggedValue | ListEx | Record`. The java.time types
arrive in Phase 2.

### Classes, interfaces and enums

- **Overloaded methods** become one TypeScript method with overload signatures, dispatching on argument
  count or type (see `JavaRandom.nextInt`). If the dispatch would be ambiguous, use distinct names and
  put the Java signature in a comment.
- **Functional interfaces** (`ExFunction`, `SimulationSupplier`, ...) become function types, so calls
  change from `f.apply(x)` to `f(x)`. Variants that only differ in the checked exceptions they declare
  (`either`/`eitherInt`/`eitherEx`, `mapListEx`, ...) are kept, for porting convenience, but are the same.
- **Static nested classes** go in a namespace merged with the outer class, so `Outer.Inner` still works.
  Inner (non-static) classes are the same, but take the outer instance as a constructor argument.
  Anonymous classes become object literals or local classes. Nested classes that Java code imports
  directly (`import ...Utility.ListEx`) are exported at the top level instead, as `Utility.ts` does for
  `ListEx`, `Record` and `EpsilonType`.
- Other interfaces stay interfaces. Default methods move into an abstract base class or helper functions.
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
  than reasoning about it. Scripts in `scripts/golden/` run Java code and write the expected results
  to `test/.../golden/` files, which the tests replay. Where possible a harness runs the *original*
  Columnal methods: `extract-java-methods.py` copies them out of `reference/columnal` (from
  `npm run fetch-reference`) into a single-file Java program. Examples: `numbers.sh` (the number
  utilities, 4,000 cases), `java-lang.sh` and `grammar-utility.sh`. Known, deliberate differences are
  listed explicitly in the test, with their `PORT-NOTE`.
- New TS-only tests (for code with no Java test) go in `test/engine/<module>/`.
- GUI tests (Playwright) are ported per test method, at the level of behaviour (PLAN.md §3b).

## GUI (from Phase 7)

- Vue 3 with `<script setup lang="ts">`.
- Engine objects must never be made reactive. Don't wrap them in `reactive()` or a deep `ref()`; use
  `markRaw`/`shallowRef`. The UI tracks engine changes through version counters (PLAN.md §2b).
