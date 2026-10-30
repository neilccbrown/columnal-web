# Columnal → TypeScript/Web: overall plan

Source: https://github.com/neilccbrown/columnal (surveyed at commit `a11c9ff`).
Goal: a purely client-side TypeScript web app that has the same semantics, look and
behaviour as the JavaFX original, and includes every original test.

**Guiding principle: port the semantics, rebuild the GUI.**
- The **engine** (types, values, expressions, functions, transformations, file format,
  import/export) is ported faithfully, class by class, so it gives identical results.
- The **GUI** is rebuilt natively in HTML/CSS to the same effect: what the user sees, the
  keyboard and mouse behaviour, and the workflows. It does not copy the JavaFX code line
  by line or widget by widget. JavaFX workarounds such as VirtualGrid's custom scrolling
  and node recycling are replaced by what the browser does natively wherever possible.
- **Logic inside the GUI modules is still ported faithfully.** Examples are the
  recognisers that parse typed cell input, number display formatting, the expression
  lexers and savers, and completion ranking. That code moves into framework-free TS
  modules with Vitest tests. Only the presentation is rebuilt.

## 1. What we are porting

About 103k lines of main Java in 21 modules, plus about 35k lines of tests in 20 test
modules. Line counts include the 20-line licence header that every file has.
Build-only modules (`anns`, `checkers`, `threadchecker`, `anns-threadchecker`, `buildSrc`)
are Checker Framework plumbing and are **not ported**. TypeScript's strict mode and a few
branded types replace them.

Module layering, bottom to top, from the Gradle dependencies:

| Layer | Java modules | ~Lines | Treatment |
|---|---|---|---|
| L0 | `utility-error`, `utility-functional`, `utility-adt`, `parsers` (25 ANTLR grammars) | 2.6k + 933 grammar | Port |
| L1 | `identifiers`, `utility` | 4.6k | Port (numeric helpers, BigDecimal/Rational, strings) |
| L2 | `types` | 9.6k | Port (DataType, units, TypeExp unification, TypeManager) |
| L3 | `data` | 8.1k | Port (column storage, RecordSet, TableManager, save/load) |
| L4 | `expressions`, `functions` | 20.2k | Port (AST, type checking, evaluation, about 65 functions) |
| L5 | `transformations`, `r-interop` | 9.1k | Port (11 transformations, RDS read/write); R execution moves to webR |
| L6 | `importers`, `exporters` | 5.2k | Port the engines; rebuild the import dialogs |
| G0 | `utility-gui`, `lex-editor-completion` | 8.1k | Rebuild; port completion ranking |
| G1 | `stf` (VirtualGrid 2.5k, DocumentTextField, cell editors) | 9.4k | Rebuild; port recognisers, NumberColumnFormatter and value display rules |
| G2 | `lex-editor` | 8.2k | Rebuild the editor UI; port the lexers, savers, error recording and quick fixes |
| G3 | `table-gui`, `dialogs-non-expression` | 4.2k | Rebuild |
| G4 | `app` (MainWindow, View, TableDisplay, TableHat, dialogs) | 13.4k | Rebuild; port any embedded logic (table placement, text describing transformations, explanations) |

VirtualGrid column widths apply to the whole grid column. Tables placed in the same grid
column share widths, and the web layout must keep this.

Non-code assets:
- `xml/src/main/funcdoc/*.xml` holds the function documentation. XSLT 2.0 turns it into
  HTML help **and into tests**: 237 `<example>`s become `.test` files.
- `xml/src/main/help/*.xml` holds the dialog help.
- `app/src/main/scss/*.scss` holds the styling. It's JavaFX CSS, so it serves as a
  **visual reference and source of design tokens** (colours, fonts, spacing), not as
  something to translate rule by rule.
- `app/src/main/resources/*.properties` holds the UI strings. There are also fonts (OFL),
  preview images, and `data/src/main/resources/builtin_units.txt`.
- `book/` (AsciiDoc) and `tutorials/` are optional. Port them last.

Tests:
- Non-GUI tests are in `tests-basic`, `tests-functions` and `tests-tables`. Most are
  property-based (junit-quickcheck) with a large set of custom generators: `Gen*`,
  `Backwards*` expression makers and `GenNonsense*` transformations. These are **ported
  faithfully**.
- GUI tests are in the 16 `tests-gui-*` modules. They use testjavafx (FxRobot-style
  `clickOn`, `write`, `push(KeyCode…)` and CSS lookups) plus traits from
  `tests-gui-base`, and many inspect TableManager directly. These are **ported at the
  behaviour level**. Each Java test method gets a TS test that runs the same scenario and
  makes the same assertions. The steps are written against the new UI through page
  objects.

## 2. Key technology decisions (recommendations)

### 2a. Engine and infrastructure

| Concern | Java original | Web replacement | Notes |
|---|---|---|---|
| Build/dev | Gradle | **Vite** + npm, TypeScript `strict` | ES modules, `target: es2022` |
| Engine tests | JUnit 4 | **Vitest** (Node) | Decided. |
| Property tests | junit-quickcheck | **fast-check**, plus a `SourceOfRandomness` shim | Generators are imperative (`gen(random, status)`), so we port them almost line by line behind `fc.integer().map(seed => gen(new SourceOfRandomness(seed)))`. Shrinking is lost, which is the same as now since the custom generators don't shrink either. |
| Parsers | ANTLR 4 (Java target) | **antlr-ng** tool + **antlr4ng** runtime | Pure TypeScript, no Java needed at build time. Embedded Java actions and predicates (for example in `MainLexer2`/`MainParser2`) must be rewritten in TS. |
| Numbers | `Long` or `BigDecimal` (which keeps its scale), `MathContext.DECIMAL128` | **Canonical decimals**: one `Decimal` type (decimal.js configured as DECIMAL128), with no significant trailing zeros | Decided in Phase 1. Java's scale only showed in how some computed results displayed (`2.50`); values, equality, ordering and files are unaffected. Java's `pow` algorithm is ported exactly, as is big-math's `log` (Phase 4). See CONVENTIONS.md "Numbers". |
| Rationals | javaSMT `Rational` (only use of javaSMT) | port of that `Rational` over `bigint` | Used for unit exponents. Done in Phase 1. |
| Dates/times | `java.time` | **js-joda** (a port of java.time), wrapped in `src/engine/java/time/JavaTime.ts` | Decided in Phase 2, instead of the originally planned Temporal: js-joda has java.time's classes, `DateTimeFormatterBuilder` and parse/resolve behaviour, so the date code ports line by line. Where it differs from Java (zone-name parsing, some printing), `JavaTime.ts` corrects it using tables extracted from the JDK, checked by golden tests. |
| Immutable collections, equality | Guava `ImmutableList`/`Map`, `equals`/`hashCode` | arrays, JS `Map`/`Set` for primitive keys, and `HashMap`/`HashSet` (keyed by `equals`/`hashCode`) for object keys | JS `Map` uses identity, so any Java map keyed by values, identifiers or types needs `HashMap`. It iterates in insertion order, not Java's hash order: decided in Phase 1, with a check at each ported `HashMap` site for whether the order is observable. Where it is, `HashMap.javaOrder()` simulates Java's table to iterate in Java's order (Phase 2). |
| Threading | FX thread + Simulation thread (758 `@OnThread(Simulation)`) | Single main thread with a **serial task queue** (`Workers.onWorkerThread` → time-sliced queue) | Keep the same boundaries in the API so the engine could move to a Web Worker later. |
| Files | `java.io.File`, native dialogs, autosave | **File System Access API** (Chromium) with upload/download fallback; autosave and recent files in **OPFS/IndexedDB** | Asynchronous; kept behind a `FileService` interface. The engine stays synchronous: it reads a `JavaFile`, whose contents the GUI reads in advance (Phase 3). Charsets are the ones `TextDecoder` supports, under their Java names. |
| Clipboard | AWT/FX clipboard | async Clipboard API | Asynchronous. Copying HTML and plain text both work. |
| Excel | Apache POI | **SheetJS** (`xlsx`, Apache-2.0) | Decided in Phase 6: version 0.20.3, installed from SheetJS's own CDN, since the npm registry's copy is years out of date. The exporter reproduces POI's date arithmetic. |
| HTML import | jsoup | `DOMParser` | Decided in Phase 6: the jsoup behaviour the importer relies on (`text()`, `wholeText()`, charset detection) is in `src/engine/java/Jsoup.ts`. Node tests use jsdom's `DOMParser`. |
| R | runs the `R` executable; RDS parsing is pure Java | Pure Java RDS code is ported directly; **webR** (R compiled to WASM) runs R transformations | webR is a large download, so load it lazily. |
| Function docs/help | XSLT 2.0 (Saxon) at build time | Node build script (XML → JSON), rendered by the app; also **extracts the doc example tests** | Avoids depending on Saxon; browsers only support XSLT 1.0. |
| i18n | `.properties` + ResourceBundle | Load `.properties` at build time into typed lookups | Same keys and strings. |
| Licence | GPLv3 | GPLv3 | This is a derivative work. |

### 2b. GUI

Since we're not copying the JavaFX structure, the framework only has to be good for the
app itself. That app is a keyboard-heavy desktop-style tool: a canvas of tables, a
structured expression editor, about 20 to 30 dialogs, and many popups, menus and
completion lists.

| Concern | JavaFX original | Web replacement (recommended) | Why |
|---|---|---|---|
| UI framework | JavaFX + ControlsFX + WellBehavedFX | **Vue 3** (Composition API, `<script setup lang="ts">`) with **Reka UI** or **Ark UI** headless components | Decided. The project owner knows Vue best, which matters because they'll review all the GUI code and behaviour drift is the main GUI risk. Vue's fine-grained reactivity suits "the engine changed, so update exactly the affected cells". Reka UI and Ark UI provide accessible dialogs, menus, context menus, popovers, combo boxes and tooltips, which is most of what ControlsFX and WellBehavedFX did. Ark UI is built on Zag.js state machines, which also support React and Solid. Reka UI was chosen in Phase 7. **Fallback:** Solid, if the Phase 7 grid prototype shows Vue can't keep up with very large tables. |
| Engine → UI updates | FX properties and listeners | A small **store adapter**: engine listeners increment a per-table or per-column version held in a `shallowRef`, and components read it in a `computed` | The engine stays mutable and framework-free. **Rule:** engine objects are never made reactive (no `reactive()` or deep `ref()` around them; use `markRaw`/`shallowRef`). Vue's Proxies would break `#private` fields and change object identity. A lint rule enforces this where it can. |
| Table canvas (VirtualGrid) | Custom virtualised grid with its own scrolling and floating layers | **One native scroll container.** Tables are absolutely positioned on a shared logical grid of rows and columns (widths shared per grid column). Headers and row labels use `position: sticky`. Each table only renders the rows currently visible (TanStack Virtual or a hand-rolled version). Cells are real DOM, not canvas. | Native scrolling, sticky positioning and the browser's layout replace `SmoothScroller`, `ScrollGroup` and the floating suppliers. Real DOM cells keep accessibility and test selectors. The logical grid model (cell positions, table placement, selection) is ported as pure TS. |
| Cell editing (DocumentTextField) | Custom document and text field per cell | **One active editor overlaid on the cell being edited**, built on an `<input>` or a lightweight CodeMirror instance. It uses the **ported recognisers** for parsing and error highlighting. | Same behaviour, and far less code. |
| Expression/type/unit editor (lex-editor) | Custom token display, caret and completion | **CodeMirror 6** using the ported lexers: tokens become decorations, the completion source uses the ported ranking, savers produce diagnostics, and quick fixes become CodeMirror actions | CodeMirror already handles editing, selection, undo, IME, completion popups and tooltips. |
| Styling | JavaFX CSS from SCSS | Fresh CSS (SCSS or CSS modules), built on design tokens taken from the original SCSS | Matches the look, not the rule structure. |
| GUI tests | testjavafx (FxRobot) | **Vitest browser mode** (Chromium through Playwright) | Decided in Phase 7, after writing the same tests in Playwright Test (which needed a `window.__test` bridge for every check on the engine). Tests mount components and read the engine's objects directly, and the ported generators run in the page. Elements are found by ARIA role or `data-testid`, not by CSS classes copied from JavaFX. |

## 3. Working approach

### 3a. Engine: faithful port
1. **Keep the Java structure.** Each `Foo.java` becomes `Foo.ts` in the matching module
   directory, keeping class and method names, so review is a side-by-side diff. Refactor
   after it works, not during the port.
2. **Layout.** `src/engine/<module>/…` mirrors the Gradle modules, and
   `test/engine/<test-module>/…` mirrors the test modules, with `fixtures/` for the
   `testFixtures` code. dependency-cruiser enforces the Gradle layering, and the engine
   may never import from `src/gui`.
3. **Fixed mapping conventions,** written up in `docs/CONVENTIONS.md`:
   - checked exceptions → `UserException`/`InternalException` classes
   - `@Nullable` → `| null`
   - `Optional` → `T | null`, or an `Optional` class where null is a valid value
   - overloaded methods → distinct names or union arguments
   - Java `switch` over enums → union types with exhaustiveness checks
   - Visitor interfaces → TS interfaces, unchanged
4. **Finish each phase with its tests passing.** A phase is done when the original tests
   for those modules are ported and green. Bugs found in the Java are noted and kept,
   unless the project owner decides to fix them.

### 3b. GUI: rebuild to the same behaviour
1. **The spec is the Java app, its GUI code and its GUI tests.** Before building each GUI
   area, write a short behaviour inventory in `docs/gui-spec/<area>.md` covering:
   - what is shown, and the states it can be in
   - keyboard shortcuts and focus movement
   - mouse interactions and context menus
   - validation and error display
   - edge cases worth noting from the Java code

   Add reference screenshots taken from the Java app.
2. **Pull the logic out first.** Port any non-presentational logic from the GUI module
   into `src/gui-logic/…` (pure TS, faithful port, Vitest-tested), then build the UI in
   `src/gui/…` on top of it.
3. **Port GUI tests per test method.** Keep the Java test names, run the same scenario
   and make the same assertions. Any dropped or changed assertion is justified in
   `PORT-STATUS.md`.
4. **Track progress with a script.** `scripts/port-status.ts` writes
   `docs/PORT-STATUS.md`. It lists engine and gui-logic code per Java file, and GUI code
   per area and per Java test method.

## 4. Phases

Each phase lists what gets built and the original tests that should pass at the end of it.

### Phase 0: Project foundations (done)
- Replace the current scaffold with:
  - Vite + TS (`strict`, ES2022, `moduleResolution: bundler`)
  - Vitest (Node) for engine tests
  - Playwright Test for GUI tests, with a placeholder smoke test that loads the dev server
  - fast-check, ESLint, dependency-cruiser layer rules
  - GitHub Actions CI, including Playwright browser install
- Add an antlr-ng codegen script (`npm run gen:parsers`). Port the grammars, translating
  their Java actions to TypeScript, together with `GrammarUtility` and `Versions`, which the
  grammars need.
- Copy in the `.properties` files, `builtin_units.txt` and funcdoc/help XML, with a record of
  their origin. Fonts, images and SCSS move to Phase 7, which only needs them for the GUI.
  The fonts' OFL licence texts must be added with them.
- Add `scripts/fetch-reference.sh`, which checks out the Java original at the pinned commit
  into `reference/` (gitignored) for side-by-side work, `port-status` and golden values.
- Write `CONVENTIONS.md` and `port-status.ts`.
- Build the test shims:
  - `SourceOfRandomness`, `GenerationStatus`, the `Generator` base class (including
    `doShrink`), and a quickcheck→fast-check adapter
  - JUnit- and hamcrest-style assertions with Java `equals` semantics
  - a bit-for-bit port of `java.util.Random` (`JavaRandom`), which the main code also uses
- Add `scripts/golden/`, which generates expected test values by running Java code on the
  JVM.

**Exit:** CI runs both the Vitest suite and the Playwright smoke test, and the generated
parsers compile.

### Phase 1: Core utilities (L0–L1) (done)
- Port `utility-error`, `utility-functional`, `utility-adt`, `identifiers` and `utility`.
- Build the numeric core: canonical `Decimal` numbers with DECIMAL128 arithmetic, Java's
  `BigDecimal.pow` algorithm and parsing rules, and every `Utility` number helper.
- Write the `equals`/`hashCode`/`compareTo` protocol, `HashMap`/`HashSet`, `Rational`, `Damerau`,
  `JavaProperties` (for the translation files), and the `java.lang` helpers whose behaviour
  differs from JavaScript (strings, doubles, characters, case mapping, Unicode digits).
- Write the serial task queue that replaces `Workers`.
- Check the ports against the JVM with golden tests, including the original number methods on
  4,000 inputs (the only differences are documented `PORT-NOTE`s and Java's platform-dependent
  `Math.pow`, which differs by up to 1 ulp).
- Deferred (marked `PORT-DEFERRED`): `Utility`'s file and storage methods (Phases 6 and 9).

**Tests:** all of `tests-basic`'s test classes (`PropUtility`, `TestIdentifier`, `TestCompare`,
`TestCompleteStringPool`, `PropDAG`) and its number, string and graph generators. `GenDate`,
`GenZoneId`, `GenUnit` and the date/value parts of `TBasicUtil` move to Phase 2, which they need.

### Phase 2: Type system (L2, `types`) (done)
- Port the whole `types` module: DataType, DataTypeUtility, DataTypeValue, TypeExp/TypeCons
  unification, UnitManager/Unit/UnitExp (loading `builtin_units.txt`), TypeManager,
  TaggedTypeDefinition, JellyType/JellyUnit and OutputBuilder.
- Dates and times use js-joda (a port of java.time) through `JavaTime.ts`, which makes zone parsing
  and printing match Java's, using zone tables extracted from the JDK.
- Add `TreeMap`/`TreeSet`, and a Java-order mode for `HashMap`/`HashSet` that simulates Java's
  hash table, for the places where Java's iteration order is observable (saved units, record
  field order, type lookups).
- Build the original Java engine modules on the JVM (`scripts/golden/build-columnal-jvm.sh`) and
  check the port against them: units, unit and type inference (800 seeded cases), type parsing and
  saving, value printing, flexible date parsing and OutputBuilder (`TypesGolden.test.ts`), the date
  formatters, and Java's HashMap order.
- Deferred (marked `PORT-DEFERRED`): `TestUnit`'s `testAs`/`testAsFail` and function values in
  `GenValueBase` (Phase 4, which has `ValueFunction` and `AsUnit`). `GenValueBaseE` and
  `GenValueList` (tests-functions fixtures that need expressions) move to Phase 4.

**Tests:** `PropUnit`, `TestUnit`, `TestGenDataType`, and the type, unit and value
generators, plus the rest of `tests-basic`: `GenDate`, `GenZoneId`, `GenUnit` and the
date/value parts of `TBasicUtil`.

### Phase 3: Data model and file format (L3, `data`) (done)
- Port the column storages, Column/RecordSet/EditableRecordSet,
  Table/DataSource/ImmediateDataSource, CalculatedColumn and TableManager.
- Load and save the `.rec` format, byte for byte the same as Java. Files must
  round-trip between the Java and web versions.
- Done: the whole `data` module.
  - `NumericColumnStorage` keeps two tiers (whole numbers in a `Float64Array`, other numbers as
    decimals) instead of Java's byte/short/int/long/BigDecimal tiers, which were only a memory
    optimisation.
  - Files are in-memory `JavaFile`s (path plus contents, read in advance), and charsets decode
    with `TextDecoder` under their Java names (`JavaCharset.ts`), so the engine stays synchronous.
  - `Platform.runLater` (the FX thread) runs callbacks in a later task.
  - Fixed an antlr4ng difference from Java's ANTLR: a lexer action setting a token's text to `""`
    was ignored, so an empty string literal or a blank line in a saved file's detail block
    loaded wrongly. Every generated lexer now extends `JavaLexer`, which fixes this.
  - `GraphUtility.lineariseDAG` now uses Java's hash order, which decides the order of tables in a
    saved file.
- Cross-compatibility (`scripts/golden/data.sh`, `test/engine/data/DataGolden.test.ts`): the
  original Java `TableManager`, built on the JVM, loads 16 random files saved by the port, plus
  hand-written edge cases, and saves them again. The port saves every file byte for byte as Java did,
  reads Java's files, and fails as Java does on an invalid file.
- Deferred (marked `PORT-DEFERRED`): loading transformations in the tests' `DummyManager` (Phase 5),
  storing `TableManager`'s settings (Phase 9), and the parts of `TFunctionUtil` that need
  expressions (Phase 4).

**Tests:** `PropLoadSaveData`, `PropNumericStorage`, `TestSetValue`, `TestTextFileColumn`
and `PropFiles`, plus a cross-compatibility check that loads `.rec` files saved by the
Java app.

### Phase 4: Expressions and functions (L4), the semantic core (done)
- Port the Expression AST (about 75 classes), parser glue, the saver/loader, TypeState
  and type checking with error recording and quick-fix suggestions, evaluation, and
  ExpressionUtil.
- Port all the built-in functions.
- Write the funcdoc build script: XML → JSON for the in-app docs and completions, and the
  **example extractor that generates tests**.
- Done: the whole `expressions` and `functions` modules.
  - The expression, unit-expression and type-expression hierarchies load through barrel modules
    (`Expressions.ts`, `UnitExpressions.ts`, `type/TypeExpressions.ts`).
  - The function documentation is processed by `scripts/funcdoc/funcdoc.mjs`, a port of the two
    XSLT stylesheets the Java build ran with Saxon. It generates the function details (types,
    synonyms, parameter names) that `FunctionDefinition` loads, and extracts the example tests.
    Its output is identical to Saxon's (`scripts/golden/funcdoc.sh`, `Funcdoc.test.ts`).
  - The logarithm functions use big-math's `log`, which is not correctly rounded, so it is ported
    exactly (`src/engine/java/BigDecimalMath.ts`, MIT licence, notice in the file).
- Checked against the JVM (`scripts/golden/functions.sh`, `FunctionsGolden.test.ts`): 900
  logarithms, digit for digit, and about 600 expressions (every function, the operators, type
  errors, parse errors and random arithmetic), parsed, saved, type checked and evaluated by the
  original classes. The only differences are the bug fixes listed in the test.
- Fixed Java bugs, at the project owner's request (each marked with a `PORT-NOTE`):
  `AddSubtractExpression.constantFold` used the wrong operators and threw
  `IndexOutOfBoundsException` (so `3{m} ^ (1 + 2)` failed to type check), and
  `CallExpression.check` threw `ClassCastException` for a call target that wasn't an identifier.
  `years between` (from 29 February into a non-leap year), `time from hms`, `dateym from ym` and
  `datetimezoned from dtz` let a `DateTimeException` through for invalid input, which crashed
  the evaluation; they now give the user an error. `FunctionDefinition` ignored the type
  requirements in the function documentation (such as Comparable for `maximum`), so a list of
  functions type checked and then failed at run time; they are now applied. `round decimal`
  returned a whole number held as a Java `Long` unchanged, whatever the number of places, but
  rounded one held as a `BigDecimal`; it now rounds every number (`round decimal(15, -1)` is 20).
  Also fixed: an off-by-one condition in `StringWithinIndex`, which is not in use.
- Deferred to Phase 5: `PropRunExpression` (in `tests-tables`).

**Tests:** all of `tests-functions` (`PropTypecheck`, `PropTypecheckIndividual`, the function
tests, `TestUnit`'s `testAs`/`testAsFail`), including the `Backwards*` and `GenExpressionValue*`
generators, and `TestFromDoc` (all the funcdoc examples).

**Milestone:** the expression engine matches Java on every original property and
example test.

### Phase 5: Transformations (L5) (done)
- Port Calculate, Filter, Sort, Aggregate, Join, Concatenate, HideColumns, Check,
  ManualEdit, MultipleTableLookup and RTransformation (R execution stubbed until
  Phase 12).
- Port TransformationManager, saving/loading, and the dependency DAG and recalculation.
- Port the RDS/RData readers and writers (`RRead`, `RWrite`, `ConvertFromR`,
  `ConvertToR`).
- Done: the whole `transformations` and `r-interop` modules.
  - `RExecution` is a stub that fails with a UserException (as Java does without R installed) until
    webR in Phase 12 (`PORT-DEFERRED`).
  - Gzipped R files are decompressed with fflate (synchronous, so the engine stays synchronous).
    `RWrite.writeRData` returns the file's bytes rather than writing a file.
  - Java's `FXUtility.alertOnError_` (from the GUI module `utility-gui`) is `ErrorHandler.alertOnError_`.
  - New Java equivalents in `src/engine/java/`: `BitSet`, `DataStreams` (`DataInputStream` and
    `DataOutputStream` over byte arrays), `javaDoubleToInt`, `javaUtf8Bytes` and `immutableMapBuilderPut`.
- Checked against the JVM (`scripts/golden/transformations.sh`, `TransformationsGolden.test.ts`): the
  original `TableManager` and `TransformationManager` load 32 files generated by the port (data tables,
  then about 120 transformations of every kind, many chained, plus nonsense ones), save them, and write
  the contents of every table.  The port saves every file as Java did and computes the same values,
  errors and error messages (about 10,000 cells).  Real R (where installed) reads the files `RWrite`
  writes, and `RRead` reads R's own (gzipped) files.
- Fixed Java bug, agreed with the project owner: `Utility.compareNumbers` with `EpsilonType.RELATIVE`
  (used only by `PropRunExpression`) said every pair of numbers was equal.  With the fix,
  `PropRunExpression` passes its 2,000 trials, so the bug was not hiding any failures.
- Fixed Java bugs, agreed with the project owner (tested in `test/engine/transformations/BugFixes.test.ts`
  and `test/engine/r-interop/BugFixes.test.ts`): `Check.transformationEquals` compared only the
  expression, so Checks with different check types or source tables were equal (which weakened
  `PropLoadSaveTransformation`); `Join` saved its column names without applying
  renames (so renaming a source column broke the join), and its suggested name used the primary column
  twice; `ConvertFromR.getTaggedTypeForFactors` tried the same type name 100 times, so a factor couldn't
  be imported if that name was taken; `RUtility.dateVector` put a time before 1970 with a fraction of a
  second late by twice the fraction; `TestRLoadSave.testRoundTrip` quoted R's expression as if for a
  shell, so R never rewrote the file (it now does, and the round trip passes).
- `TestRLoadSave` (in `tests-gui-r`) doesn't use the GUI, so it is a Vitest engine test, with its fixtures
  in `test/engine/tests-gui-r/importExport/resources/`.  Its round trip through the R executable only
  runs where R is installed (`PORT-DEFERRED` until Phase 12).

**Tests:** all of `tests-tables` (`PropLoadSaveTransformation`, `PropRunTransformation`,
`PropRunExpression` and the nonsense-transformation generators), and `TestRLoadSave` (RDS parsing
against the `.rds`/`.Rdata` fixtures, and the R round trip).

Carried over from Phase 5:
- Java quirk, matched by the port: a column reference in an Aggregate or Check expression alternates
  between having its table name and not each time the file is saved and loaded.
- `TestRExecution` and the rest of `tests-gui-r` need R, in Phase 12.
- Still open from Phase 4: offers to the project owner, not yet answered: make `years between` from
  29 February into a non-leap year give an answer (treating it as 28 February) rather than the current
  error; and add the full MIT licence notice to `src/engine/java/Damerau.ts` (it only names the licence).
- Still open from Phase 4 (minor): `javaClassName` gives an empty class name for anonymous classes, so an
  internal error such as "Uncomparable types" shows `class ` where Java shows the class name.
- Still open from Phase 4: some `tests-gui-central` tests may be engine-level, like `TestFromDoc` (for
  example parts of `TestExpressionExplanation` and `TestLoadSaveExpression`). Check each when its phase
  comes; a test that doesn't use the GUI goes in `ENGINE_TESTS_IN_GUI_MODULES` in `scripts/port-status.ts`.

### Phase 6: Import/export engines and GUI logic (L6 and gui-logic) (done)
- Port GuessFormat, TextImporter, HTMLImporter (`DOMParser`), ExcelImporter (SheetJS),
  RImporter, and the CSV, HTML, Excel and R exporters.
- Port the non-presentational logic from the GUI modules into `src/gui-logic`:
  - the recognisers (cell input parsing)
  - NumberColumnFormatter and value display rules
  - the expression, type and unit lexers and savers, plus EditorLocationAndErrorRecorder
    and TextQuickFix
  - completion ranking
  - logic for the grid layout model and table placement
- Find and extract any other logic embedded in `app` while doing this.

- Done: the whole `importers` and `exporters` modules, apart from the import dialogs.
  - The importers show their dialogs through the callback interface `ImporterDialogs` (the import
    choices, picking an HTML table, R tables or an importer), which the GUI implements in Phase 11.
    `GuessFormat`'s preview GUI and `ImporterManager`'s file choosers are `PORT-DEFERRED`.
    `ImportChoicesDialog` and `ImporterGUI` are not ported (rebuilt in Phase 11).
  - The exporters return the file's bytes (`exportData(table): Uint8Array`) rather than writing a file.
  - New Java equivalents in `src/engine/java/`: `JavaFXBeans`, `Jsoup`, `StringEscapeUtils`,
    `javaSystemDefaultZone` and `javaCompareToIgnoreCase`.
- Done: the logic of the GUI modules, in `src/gui-logic` (see "GUI logic" in CONVENTIONS.md):
  - `stf`: the recognisers, documents, `NumberColumnFormatter` and `TableDisplayUtility`'s display
    rules; and the grid model: `VirtualGrid`'s layout (moving overlapping tables apart), selection,
    keyboard actions and column widths, `GridArea`, `RectangleBounds` and the cell selections.
  - `lex-editor` and `lex-editor-completion`: the expression, type and unit lexers and savers,
    `EditorLocationAndErrorRecorder`, `TextQuickFix`, `EditorContent` (text, caret, re-lexing, undo),
    the key handling and completion choosing of `EditorDisplay`, and the completion list's ranking
    and selection (`LexCompletionList`, `LexAutoCompleteWindow`, `LexAutoComplete`).
  - `app`: `AppUtility.valueToExpression`. Table placement (`TableManager.getNextInsertPosition`) was
    already in the engine. The rest of `app` is GUI, except its `UndoManager` (backups of saved files),
    which goes with the file handling in Phase 9.
  - Smaller pieces: `utility-gui`'s `Clickable`, and `table-gui`'s `EntireTableSelection`.
- Checked against the JVM (`scripts/golden/importers.sh`, `ImportersGolden.test.ts`): the original
  importers and exporters (with POI, jsoup and commons-text) run on text, HTML and Excel files and
  saved files that the port generates, and the port guesses the same formats and imports, and exports,
  the same (89 cases). Known differences: Excel date-times after 2499 (js-joda's time-zone data has no
  daylight saving after 2499), and class names in some messages (`class X` where Java has
  `class xyz.columnal...X`).
- Milestone: `npm run cli -- <file.rec> <dir>` (`scripts/cli/columnal-cli.ts`) loads a saved file in
  Node, recomputes every table and writes it saved again, the contents of every table and each table
  exported as CSV, HTML, Excel and R. `scripts/compare-with-java.sh <file.rec>...` runs it and the
  original engine (`scripts/golden/java/CliHarness.java`) on any files and compares everything they
  write. On the golden saved files, everything was the same apart from the two known differences
  listed in the script (before the bug fixes below, which add the differences the script also lists).
- New circular imports, as in Java, checked by `test/gui-logic/ModuleLoading.test.ts`: each lexer and
  its saver, and `LexAutoComplete` with `LexAutoCompleteWindow`.
- Fixed Java bugs, agreed with the project owner (tested in `test/engine/importers/BugFixes.test.ts`,
  `test/gui-logic/lex-editor/BugFixes.test.ts` and `test/gui-logic/app/BugFixes.test.ts`; the importer
  golden test lists the inputs they change, with the port's reviewed output in `golden/port-*.txt`):
  1. `Utility.countLines` counted a last line without a newline twice, so a text file that didn't end
     in a newline failed to import (silently).
  2. `TextImporter.makeRecordSet` had no case for a boolean column, so a text file with one failed to
     import (silently). The port adds `TextFileColumn.booleanColumn`.
  3. An HTML or Excel table with two columns of the same name failed to import ("Duplicate column
     names found"); now a repeated name gets a number, as in text files.
  4. `CSVExporter` tripled quotes instead of doubling them, so every text value (written in quotes)
     was read back with two quotes each side.
  5. The CSV and HTML exporters failed on a table with an invalid value; now it is exported as entered.
  6. `ExcelImporter`'s column names after Z were wrong (Z was followed by BA, and names repeated after
     676 columns); now they are Excel's.
  7. `.xls` files were offered for import but couldn't be read (an uncaught exception); SheetJS now
     reads them, and a file that isn't a spreadsheet is ignored like a broken one.
  8. `ExcelExporter` shifted date-times by the system's offset from UTC, and wrote dates before 1900
     (which Excel can't show) as -1; now they are written as they are, and dates before 1900 as text.
  9. `GuessFormat` tested `isDigit(length - 1)` where it meant the last character, so a number column
     where some values lacked the common suffix (such as `%`) was imported as text.
  10. Excel import formatted numbers with `%f`: six decimal places, losing any beyond and adding
      trailing zeros (so the column was guessed to show six). Now numbers are written in full.
  11. The expression editor's `UndoManager` kept undone states after a new edit, and counted undo and
      redo as edits, so redo after an edit brought back undone text.
  12. `AppUtility.valueToExpression` gave a tagged value of a type with type variables (such as
      Optional) "as type" with a list of its type, so unwrapping an Optional column whose inner type
      was such a type, with a default value, made a Calculate with a type error.
  13. Expression completions offered a tag name shared by an even number of types without its type
      name, where it is ambiguous; now only a tag name of one type is offered without it.
  14. Test only: `GenFormattedData` escaped U+2329 and U+232A as HTML 4's `&lang;` and `&rang;`, which
      HTML5 (and jsoup) read as other characters. With 1 and 14 fixed, `PropFormatNoGUI` runs.
  15. `GuessFormat.guessTrim`, which guesses where a text file's header is, counted "%" (and quote
      marks left on values) as punctuation, so in a number column with a "%" suffix on some values,
      or a quoted value, it took a row of data for the header: for "Amount", "5%", "6%", "7", "12%"
      it named the column `C6` and left out "Amount" and "5%". Now "%" counts as part of a number
      (as currency symbols already did) and quote marks are ignored. Of the importer golden files,
      five text files change, each now keeping all its rows and, where it has one, finding its header.

**Tests:** the non-GUI halves of the format tests (`TestFormat`, and `PropFormat` as
`PropFormatNoGUI`), and new Vitest unit tests for each gui-logic module, derived from the GUI tests
that exercise it: `TestNumberColumnDisplay`, `TestCellReadWrite` and `TestDocumentTextField` (in
`test/gui-logic/stf/`), `TestVirtualGridLayout`, `TestKeyboardMovement` and `PropGridOverlap`. These GUI
tests are ported whole, with the editor in place of the screen: all of `tests-gui-type-editor`, and
`TestExpressionEditorSyntaxError`, `…TypeError`, `…Completion` and `TestExpressionQuickFixSyntax` from
`tests-gui-expression-editor-further`. In all, 259 gui-logic tests and 118 importer and format tests.

**Milestone:** the engine is complete and headless. A Node CLI can load a `.rec` file,
recompute everything and export it, and the results can be compared against Java
outputs on real-world files.

Carried over from Phase 6:
- For the GUI phases: what `src/gui-logic` and the engine leave for the GUI to provide (see "GUI
  logic" in CONVENTIONS.md):
  - Hooks to set: `NumberColumnFormatter.measureDigitSizes` (from the real font's digit widths;
    the tests use `DigitSizes(9.6, 8, 4)`), `RecogniserDocument.showErrorAlert`, `DocWindow.setShow`,
    `EditorDisplay.setOpenFurtherDetails` and `ExpressionLexer.getStylesheet`.
  - Interfaces to implement: `VirtualGrid.Display` (Phase 8: the grid's layout, selection, keyboard
    actions and column widths are already in `stf/gui/grid/VirtualGrid.ts`) and `ImporterDialogs`
    (Phase 11: the import choices, and picking an HTML table, R tables or an importer).
  - Phase 10: the editor logic is ready for CodeMirror to sit on: `EditorContent` (text, caret,
    re-lexing, undo), `EditorDisplay.keyTyped`/`keyPressed`/`showCompletions`/`focusChanged`, and the
    completion list's model (`LexAutoComplete`, `LexAutoCompleteWindow`, `LexCompletionList`).
    `TopLevelEditor`'s caret listener (show the completions at the caret unless the move was a
    forced save; gather the errors touching the caret and their fixes) is reproduced in
    `test/gui-logic/lex-editor/EditorHarness.ts` and `typeAndApplyFix`.
  - `app`'s `UndoManager` (backups of each saved file, for undoing a save) isn't ported; it goes with
    saving files (Phase 9, in OPFS/IndexedDB).
- GUI tests already ported at the logic level (in `test/gui-logic/`): all of `tests-gui-type-editor`,
  `PropGridOverlap`, and four test classes of `tests-gui-expression-editor-further`; parts of
  `TestNumberColumnDisplay`, `TestCellReadWrite`, `TestDocumentTextField`, `TestVirtualGridLayout` and
  `TestKeyboardMovement` are in `test/gui-logic/stf/`. Their screen checks (popups, positions,
  rendering) are still to do as Playwright specs in their phases; port-status counts the four
  ported classes and `tests-gui-type-editor` as done.
- Test data for the Phase 7 grid prototype: `test/engine/transformations/golden/input-01.rec` has a
  join of 190,512 rows (`npm run cli -- --max-rows 20 <file> <dir>` loads and exports any saved file
  in Node, with `register-resources.mjs` letting Node run engine code outside Vite).
- The rest of the expression editor tests, which need typing a generated expression
  (`EnterExpressionTrait`), the clipboard or the screen, are left for Phase 10: `TestExpressionEditor`,
  `…Delete`, `…Position`, `…Resolution`, `…Invalid` and `PropExpressionEditor`. The ported editor tests
  also leave their screen checks (popups, underlines, positions) to Phase 10.
- Java order, matched where it is deterministic: Concatenate's "differing types" error lists the
  types in an order that varies between Java runs (a `HashMap` keyed by `DataType`, whose hash
  includes an enum's identity hash); the port uses the order of the golden files.
- Still open from Phase 4: the offers about `years between` from 29 February and the MIT notice in
  `Damerau.ts`; `javaClassName` for anonymous classes; and checking each remaining `tests-gui-central`
  test for engine-level parts when its phase comes.

### Phase 7: GUI foundations, grid prototype, test harness (done)
- **Grid prototype first.** This is the biggest GUI risk. Build a throwaway table canvas
  in Vue using the native-scroll design, fed with real data:
  - several tables, one with 100k+ rows
  - shared column widths and sticky headers
  - keyboard navigation between cells and between tables
  - live updates through the engine store adapter

  Measure scrolling and editing performance. If Vue can't keep up, discuss switching to
  Solid with the project owner.
- App shell: Vue 3 + Reka UI or Ark UI (pick one after building a couple of real
  components in each), the engine store adapter, i18n, fonts and design tokens,
  rendering of help and function docs.
- Copy in the fonts (with their OFL licence texts), images and the original SCSS (for
  reference), and record their origin in `resources/ORIGIN.md`.
- Shared components rebuilt for the web:
  - a dialog frame with the same look as LightDialog
  - a text field that shows errors
  - a list editor that does what FancyList did
  - help boxes, context menus and tooltips
- Test harness on Playwright Test:
  - page objects
  - the `window.__test` bridge
  - fast-check property runs driven from Node
  - behaviour-level replacements for the `tests-gui-base` traits
    (`CreateDataTableTrait`, `EnterTypeTrait`, `FocusOwnerTrait`, …)
- **Compare test approaches.** Write 2–3 representative GUI tests in both Playwright and
  Vitest browser mode, for example one cell-entry test and one property-based test that
  checks values. Compare effort and debugging experience, then confirm or revise the
  choice with the project owner.
- **Decide on browser-reserved shortcuts** (Ctrl/Cmd+N/W/T/Q cannot be captured) and
  record the remappings.

Part A (the evidence for the decisions) is done, and the project owner decided (§6): stay with Vue, use Reka
UI and Vitest browser mode, accept the proposed shortcut remappings (CONVENTIONS.md "GUI"), and look at
running the engine off the main thread soon (before the production grid in Phase 8). The GUI tests now run in
Vitest browser mode (`npm run test:gui`, `test/gui/`); Playwright's test runner and the prototype's
`window.__test` bridge were removed, and at the start of Part B so were Ark UI and the Ark half of the
component prototype. The prototypes were throwaway, in `src/gui/prototype/` (grid, components) with their
scripts in `scripts/prototype/`; they were deleted in Phase 8 step 5 (they are in git history, at
`aa26c28`, with the measuring scripts). Kept from Part A: the fonts, images and SCSS (`resources/gui/`, with
OFL licence files), the design tokens and font faces (`src/gui/styles/`), and the store adapter
(`src/gui/store/EngineStore.ts`).

Part B, in steps (each a checkpoint with the project owner):
1. Remove Ark UI (done).
2. Engine worker (done): `src/gui/engine/`, the worker that owns the TableManager (`EngineHost`), a typed
   request/reply protocol with events (`protocol.ts`; for now: load, save, length, rows, idle, and a
   "tables" event), and the GUI's client (`EngineClient`, with `EngineTablesStore` for Vue). Two transports
   with the same messages: the Web Worker, and an in-page one for GUI tests (messages still go through
   `structuredClone`), so tests can read the engine's objects directly as Java's tests did. Tested in
   `test/gui/engine/`. Left for later phases: editing (Phase 8), the copy of the type information for
   editors (Phases 8 and 10), and the HTML importer, which needs `DOMParser` (not in workers) and so must
   parse on the main thread or without the DOM (Phase 11). The prototypes keep their own engine code.
3. App shell (done): `App.vue` starts the engine (`provideEngine`; components call `useEngine()`), with
   `styles/global.css`; `i18n.ts` (`t()`, and `label()` for menu items: text, mnemonic and shortcut);
   `shortcuts.ts` (Java's accelerators through the ported `FXUtility.getStringAndShortcut`, the remappings,
   matching key events with Cmd on macOS and Ctrl elsewhere, display text, `useShortcut`). The build puts the
   OFL texts and the GPL in `dist/licences/`. Left for Phase 9: what the main window shows, and whether menus
   show mnemonics (the labels keep the index). Left for Phase 13: the main bundle and the worker's each hold
   the whole engine (about 1.3 MB gzipped each).
4. Help and function docs (done): generate the help (Java: `make-help-*.xsl`) and function-doc HTML
   (`funcdoc-*-html.xsl`) at build time, as `gen-funcdoc` does for the function details; a help box and
   a function-doc view.
   - Help (done): `scripts/funcdoc/help.mjs` ports `make-help-indiv.xsl`'s .properties output (checked
     against Saxon's by `scripts/golden/funcdoc.sh`; its HTML pages weren't used by the app), `gen-funcdoc`
     writes them to `src/gui-logic/utility-gui/generated/help/`, `Help.ts` ports `Help.java`, and
     `src/gui/components/HelpBox.vue` rebuilds `HelpBox` (`docs/gui-spec/help-box.md`).
   - Function docs (done): `scripts/funcdoc/funcdocHtml.mjs` ports `funcdoc-indiv-html.xsl` and
     `funcdoc-joined-html.xsl` (all 120 pages checked against Saxon's, ignoring whitespace that HTML
     ignores), `gen-funcdoc` writes them to `src/gui/generated/funcdoc-pages.json` (48 KB gzipped, loaded
     when first shown), and `src/gui/components/FuncdocView.vue` shows them (`docs/gui-spec/funcdoc-view.md`).
     Left for Phase 10: the completion popup and `DocWindow` that use it, and the column and table pages
     that `ExpressionLexer` makes on the fly (`htmlForColumn`, `htmlForTable`).
5. Shared components (done), each with a `docs/gui-spec/` inventory: LightDialog (with ErrorableLightDialog and
   DoubleOKLightDialog), ErrorableTextField, FancyList, context menus and tooltips, built from the Reka
   prototypes, which are then deleted.
   - Dialogs (done): `src/gui/components/dialogs/` (`LightDialog`, `ErrorableLightDialog`,
     `DoubleOKLightDialog`, `ErrorLabel`; `docs/gui-spec/light-dialog.md`).
   - ErrorableTextField (done): the conversion ported to `gui-logic/.../ErrorableTextField.ts`, the field
     in `src/gui/components/ErrorableTextField.vue`, with `StyledText.vue` for StyledStrings
     (`docs/gui-spec/errorable-text-field.md`).
   - FancyList (done): `src/gui/components/FancyList.vue` (`docs/gui-spec/fancy-list.md`), with a Java bug
     fixed (the selection was kept by position across a delete).
   - Context menus and tooltips (done): `src/gui/components/menus/` (menus as data, as `GUI.menuItem`
     etc. make them, and `ContextMenu.vue`), `HoverTooltip.vue`, `AbbrevLabel.vue`
     (`docs/gui-spec/menus-and-tooltips.md`). Left for the phases that need them: menus opened from a
     button (JavaFX `ContextMenu.show(node, …)`) and the menu bar (Phase 9).
   - The component prototypes are deleted.
6. Test helpers (done) in `test/gui/base/` for the generic traits (`FocusOwnerTrait`, `PopupTrait`,
   `TextFieldTrait`, `ListUtilTrait`, `ComboUtilTrait`, `ClipboardTrait`, `ScrollToTrait`). The traits that
   drive tables, types and expressions (`CreateDataTableTrait`, `EnterTypeTrait`, `EnterExpressionTrait`, …)
   come with the phase that builds what they drive (8–10).
   - One module per trait (`focusOwner.ts`, `popup.ts`, `textField.ts`, `listUtil.ts`, `comboUtil.ts`,
     `clipboard.ts`, `scrollTo.ts`), checked by `Helpers.test.ts` against small components. They work
     through the DOM and ARIA roles: a ListView is a `listbox` whose arrow keys move the selection
     (`aria-selected`), a ComboBox a `combobox` whose `aria-controls` list has the items, a dialog an
     element with the `dialog` role. The list and combo components of later phases should behave so.
   - Left for Phase 8: `ScrollToTrait.keyboardMoveTo`, which drives the grid (and F11, the grid's other
     copy key, which `copyToClipboard` presses by default).
   Also: the grid prototype's tests failed now and then when the test files ran in parallel (they share
   the browser's keyboard focus), so `vitest.browser.config.ts` runs them one at a time (also much faster:
   about 10 s, not 3 minutes). `propEnterNumbers` finds cells by their text with `userEvent.click`, which
   can still be ambiguous while a row is re-shown; the helpers should locate cells by their position.

- **Grid prototype** (`/src/gui/prototype/grid/` on the dev server; `?big=N` adds an N-row data table). Vue,
  one native scroll container, tables absolutely placed by the ported `VirtualGrid` (which also does the
  selection and keyboard), rows and columns windowed in blocks of 16, column names and row labels sticky
  (CSS `position: sticky`), widths shared per grid column, a cell editor using the ported recognisers, and
  edits re-running dependents (`TableManager.reRun`) through the store adapter. Measured in Chromium with
  `scripts/prototype/measure-grid.mjs` and `profile-grid.mjs`, on input-01.rec (a 190,512-row join) plus a
  200,000-row data table:
  - Scrolling at 100 px a frame: 60 fps over both tables (at 4× CPU slowdown: mean 22 ms a frame over the join).
    Flinging at 2,000 px a frame: 60 fps over the data table, mean 25 ms over the join. About 1,200 DOM nodes
    whatever the table size.
  - Where the time goes in the worst case (the join, 2,000 px a frame): engine (computing values) 2.6 s, browser
    style and layout 3.5 s, garbage collection 0.8 s, Vue (with its DOM operations) about 1 s, so Vue is about
    12%. **Vue is not the bottleneck; Solid would not help.**
  - Keyboard: 2 ms to handle a key, median 24 ms from key down to paint.
  - An edit that re-runs the join blocks the page for about 270 ms (two long frames), as the engine runs on the
    main thread (Java ran it on a worker thread).
  - Loading a 200,000-row file takes 8.7 s (Java: 1.8 s warm, 2.8 s cold). The profile shows engine costs:
    about 1.1 s constructing `NumberFormatException`s (stack traces), 2–3 s in ANTLR's lexer ATN simulation
    (suggesting its DFA cache is not reused), and about 1.2 s creating a `CharStream` per line.
  - Native scrolling is limited by the browser's maximum element height: 33.5 M px in Chromium (1.4 M rows of
    24 px); Firefox's is lower (about 17.9 M px, 745 k rows). Larger tables would need a scaled-scroll fallback.
- **Worker spike** (`/src/gui/prototype/grid/?worker`, code in `src/gui/prototype/worker/`): the same grid
  with the engine in a Web Worker, which owns the TableManager. The engine ran there unchanged (only the HTML
  importer needs the DOM: `DOMParser` doesn't exist in workers). The GUI sees tables' shapes (`TableInfo`:
  name, position, column names and types) and asks for a table's length and for blocks of 64 rows of cell
  text, which show empty until they arrive (Java showed "Loading..."); edits are sent as text and parsed in the
  worker; a replaced table gets a new version and keeps its place. The worker skips all but the newest two
  fetches per table, so a fling doesn't leave it computing rows out of view. The grid view is shared with the
  synchronous version through `GridTableModel`. Measured with `measure-grid.mjs 200000 1 worker`:
  - Every frame stays at 60 fps in every test, including flinging over the join (before: mean 25 ms) and
    edits that re-run the join (before: two frames of about 130 ms).
  - Rows arrive a mean of 35 ms after being asked for while flinging over the join (15 ms over the data table).
  - Loading the 200,000-row file takes as long (9.6 s) but the page stays responsive (longest frame 33 ms);
    it shows nothing until the whole file is loaded.
  - (Chrome's CPU slowdown applies only to the main thread, so 4× runs don't slow the worker.)
  - What it means for the GUI: every engine call from the GUI becomes a message, so the GUI code can't hold
    engine objects (tables, columns, values, types). The gui-logic that needs engine types (recognisers,
    expression lexers and completion, which use the TypeManager) would either run in the worker, behind
    messages, or keep a copy of the type information on the main thread. The GUI tests could no longer read
    the engine's objects directly, and would need queries sent to the worker.
- **Reka UI vs Ark UI** (`/src/gui/prototype/components/`, removed in Part B step 5 once the shared components
  were built; the table-picking combo box is in git history for Phase 9's PickTablePane): a LightDialog frame (modal, draggable), a column
  context menu with a submenu, a tooltip shown when a label is cut short, and a combo box for picking a table,
  in each. A script (removed with the Ark half in Part B) ran the same 11 keyboard, mouse and ARIA checks on both,
  and both pass all of them (focus trap and return, Escape, staying open on an outside click as Java's
  window-modal dialogs did, typeahead, disabled items, submenus, accent-insensitive filtering). Differences:
  Reka adds 45 KB gzipped for the four, Ark 64 KB; Reka's combo box filters by itself, Ark's needs a collection
  and filter wired up; Ark focuses and positions menus a frame or two after opening (tests must wait) and keeps
  closed submenus in the DOM; Ark needs an explicit Teleport and Positioner per popup. Ark has more components
  (date picker, tree view, splitter, floating panel). The code is the same size (191 and 205 lines).
- **Playwright vs Vitest browser mode** (Playwright's version since removed): the same three tests of the grid prototype (entering a number and
  checking the dependent Calculate, keyboard movement between tables and empty cells, and a fast-check property
  entering 20 random decimals) in `test/gui/prototype/` (Playwright, with a page object and the `window.__test`
  bridge in `src/gui/prototype/grid/testBridge.ts`) and `test/gui-vitest/prototype/` (`npm run test:gui-vitest`,
  `vitest.browser.config.ts`, `tsconfig.browser-tests.json`). Both pass reliably (3 runs each); Vitest takes
  about 4.8 s, Playwright 6 s. Vitest's tests mount the component and read the engine's objects directly (no
  bridge, values compared with `javaEquals`), but share module state (the engine's singletons) between the tests
  in a file, need their own tsconfig, and `userEvent.click(element)` turns the element into a selector by its
  text, which became ambiguous when a dependent table re-rendered the same number (the property test needed a
  wait). Playwright gives each test a fresh page and has CSS locators, but every check on the engine goes
  through the bridge as text. Both record Playwright traces. Only two test helpers use Node APIs
  (`GenFile.ts`, `test/support/charsets.ts`), so the ported generators could run in the browser.
- **Browser-reserved shortcuts.** The Java app's accelerators (`resources/i18n/main_en.properties`): New
  project Ctrl/Cmd+N, Open Ctrl/Cmd+O, Save as Ctrl/Cmd+Alt+S, Close project Ctrl/Cmd+W, Exit Ctrl/Cmd+Q, Undo
  Ctrl/Cmd+Z, Find Ctrl/Cmd+F, Task Manager Shift+Esc; and the grid copies with F11 as well as Ctrl/Cmd+C.
  A page can't capture Ctrl/Cmd+N, W, Q (or T, Tab); F11 is full screen; and Shift+Esc opens Chrome's task
  manager on Windows and Linux.

### Phase 8: Table canvas and cell editing (rebuilds `stf` and `table-gui`) (done)
- Build the production table canvas from the prototype:
  - the logical grid (from gui-logic), native scrolling, sticky headers and row labels
  - row windowing per table, and grid lines
  - table borders and the "hat" area
- Selection: single cell, rectangular, entire table and column. Keyboard navigation
  inside a table, between tables and into empty space, plus actions on empty cells.
- Cell display, using the ported NumberColumnFormatter and display rules.
- The cell editor overlay, using the ported recognisers, with the same caret, commit,
  cancel and error behaviour.

**Tests:** `tests-gui-grid`, `tests-gui-dtf`, `tests-gui-numbers` and
`tests-gui-cell-rw`.

How it fits the engine worker (Phase 7): the grid's logic (the ported `VirtualGrid`, its selection and
keyboard) and the tables' displays (`DataDisplay`, `HeadedDisplay`, `RowLabelSupplier`, `DataCellSupplier`)
run on the main thread, from the worker's "tables" event (each table's position, size, columns and
version) and the rows they ask for. The worker sends each cell as display data: numbers as their digits,
which the main thread lays out with the ported `NumberColumnFormatter` (it depends on the column's width
and the font's digit widths), and other values as their display text and styles (`TableDisplayUtility`'s
`stfStylesFor`). Editing a cell: on commit the editor sends the text, and the worker recognises it (one
source of truth), stores it, and re-runs the dependent tables. (Planned as option B, with a copy of the
column's type on the main thread so the recognisers could run as the user types; but Java's only ran when
the cell lost the focus, so no copy is needed for cells: see step 4.) An edit to a table that has changed
since (a stale version) is refused, and the editor says so.

Steps (each a checkpoint with the project owner):
1. The grid canvas (done) (`src/gui/grid/`), from the prototype: the `VirtualGrid.Display`, native scrolling with
   sticky column headers and row labels, row windowing, grid lines (`VirtualGridLineSupplier`), table
   borders, headers and the "hat" (`HeadedDisplay`: the table name, column names and types, read-only for
   now), row labels (`RowLabelSupplier`, the numbers only; their menus come in Phase 9), and column widths
   (resizing, `calcPrefColumnWidth`). Tests: `TestVirtualGridLayout`.
   - Done: `EngineGrid.vue` (a `GridTableDisplay` per table in the engine's "tables" event), `TableGrid.vue`
     (scrolling, grid lines, Java's resizable column bar with double-click fitting), `GridTable.vue`, and
     `gridWindow.ts` (which rows and columns are on the page); rows are fetched in runs of 16-row blocks and
     kept. `docs/gui-spec/grid.md`; `test/gui/grid/`. The GUI tests now load the global styles
     (`test/gui/setup.ts`). Moved: the table's "hat" and renaming to Phase 9 (they are `TableDisplay`'s, in
     `app`), and moving a table by dragging its header to step 2.
2. Selection and keyboard (done): the selection overlay (`RectangleOverlayItem`), cell, rectangle, column and
   entire-table selections, the keyboard actions (already in `VirtualGrid`), smooth scrolling into view,
   clicking and dragging to select, and actions on empty cells; `keyboardMoveTo` in `test/gui/base/`.
   Tests: `TestKeyboardMovement`.
   - Done: in `TableGrid.vue`, Java's keys, clicks (selecting on a click, as Java did, not by dragging),
     the selection outline, focus loss, and moving tables by dragging their name row (with snapping and
     nudge scrolling); a `setPosition` request tells the engine where tables are (also when the grid moves
     them apart). `keyboardMoveTo` and `keyboardMoveToTableCell` in `test/gui/base/scrollTo.ts` (its
     "Goto row" menu variant is left for Phase 9). Tests: `KeyboardMovement.test.ts` (the port) and
     `GridSelection.test.ts`. Left for Phase 9: what activating empty cells, column headers and row labels
     does (the main window's menus), and "Goto row".
3. Cell display (done): the cell protocol above, the cells (`DataCellSupplier`, the display half of
   `EditorKitCache` and `DocumentTextField`), "Loading..." and error cells, numbers through
   `NumberColumnFormatter` with the real font's digit widths (`measureDigitSizes`), and copying (F11,
   Ctrl/Cmd+C). Tests: `TestNumberColumnDisplay`.
   - Done: the engine sends each cell's text (or an invalid value's text and error position, or the error),
     and each column's editability, number-ness and style classes; `src/gui/grid/cellDisplay.ts` makes the
     cells' documents as `EditorKitCache` did and runs `NumberColumnFormatter` on number columns, with
     digit widths measured from the fonts (`measureDigitSizes`); a `copy` request gives the clipboard
     content (`src/gui/clipboard.ts` writes it). Java showed nothing while loading (its "Loading..." was
     commented out), so neither does this. Tests: `NumberColumnDisplay.test.ts` (the port, less its
     editing half, which is step 4's) and `CellDisplay.test.ts`.
4. The cell editor (done): `DocumentTextField` (caret, selection, keyboard, mouse, scrolling within the cell, the
   error state) on the ported `RecogniserDocument`, the type copy and edit messages above, commit (Enter,
   Tab, clicking away), cancel (Escape), and the dependent tables updating. Tests: `TestDocumentTextField`,
   `TestCellReadWrite`.
   - Done: `src/gui/components/DocumentTextField.vue` (a native textarea with Java's keys on top; expanded to
     350 × 110 while a cell is edited), `src/gui/grid/CellEditDocument.ts`, editing in `TableGrid.vue`, and
     the engine's `canEdit`, `edit` and `deleteCells` requests; errors show in an alert (`alerts.ts`).
     `docs/gui-spec/cell-editor.md`. No type copy after all: Java's `RecogniserDocument` only ran its
     recogniser when the cell lost the focus, so the engine recognises the text when it stores it (the
     copy of the type information moves to Phase 10, for the expression editor). Deleting cells, as in
     Java, only changes those on the page. Tests: `DocumentTextField.test.ts`, `CellReadWrite.test.ts` and
     `CellEditing.test.ts`, and the editing half of `NumberColumnDisplay.test.ts`; the typing in
     `EnterStructuredValueTrait` is shared from `test/gui-logic/stf/fixtures/textToType.ts`, and
     `keyboardMoveTo` now waits for scrolling to stop (and, for a table cell, its content). Left for Phase
     9: offering a Manual Edit when a transformation's cell is edited (the edit is cancelled meanwhile),
     the "=" guidance, the cells' menu items and hover text, and marking the file as modified.
5. Tidy up (done): delete the grid and worker prototypes (their tests become the production grid's), refresh
   PORT-STATUS, and a `docs/gui-spec/` inventory for each part.
   - Done: `src/gui/prototype/`, `scripts/prototype/` and `test/gui/prototype/` deleted (the prototype's tests
     are covered by `CellReadWrite.test.ts` and `KeyboardMovement.test.ts`), with the store adapter's
     `TableManagerStore` (only the prototype's in-page engine used it). `scripts/port-status.ts` now knows
     where the GUI tests and test helpers are (`GUI_TEST_PORTS`; Vitest `.test.ts` files, and Java method
     names given in brackets in a test's name): `tests-gui-grid`, `tests-gui-numbers`, `tests-gui-cell-rw`
     and `tests-gui-dtf` are all ported, and 8 of `tests-gui-base`'s helpers. The inventories are
     `docs/gui-spec/grid.md` (layout, scrolling, cells, column widths, selection, keys, moving tables) and
     `cell-editor.md`.

### Phase 9: Main window and tables (core of `app`)
- Main window, menus, initial screen, the project file flow (new/open/save/save-as,
  autosave, recent files), data table creation, and adding and removing rows and
  columns.
- The type and unit editors (TypesDialog/UnitsDialog equivalents), comments and table
  highlights.

**Tests:** `tests-gui-tables`, `tests-gui-side`, `tests-gui-type-editor`, and the parts
of `tests-gui-central` that do not need expressions.

Carried over from Phase 8 (each is marked `PORT-DEFERRED` or listed in `docs/gui-spec/grid.md` and
`cell-editor.md`): `TableDisplay`'s parts of the grid (the table's "hat", renaming a table from its name row,
the table and column header menus, row label menus, deleting a table, "Goto row" and flashing the header);
what activating empty cells does; offering a Manual Edit when a transformation's cell is edited; the
guidance when a data cell's text starts with "="; the cells' extra menu items and hover text for cut-off
values; and marking the file as modified after an edit.

**Milestone:** a usable data-entry app in the browser.

### Phase 10: Expression, type and unit editors
- **Start with a short CodeMirror spike** that checks it can reproduce the Columnal
  editor's distinctive behaviours:
  - automatically matched brackets
  - inline hints and prompts
  - errors that depend on where the caret is
  - completions with a documentation side panel
  - quick fixes
- Build the editors as CodeMirror extensions over the ported lexers and savers. Include
  the function documentation popups.

**Tests:** `tests-gui-expression-editor`, `…-delete`, `…-further` and `…-position`.

### Phase 11: Transformation dialogs and the rest of the app
- Rebuild the dialogs for creating and editing every transformation (calculate, sort,
  filter, aggregate/split-by, join, concatenate, hide columns, check, R), plus
  CheckDisplay, ExplanationDisplay, and the import dialogs with their live preview.
- Wire up clipboard import/export.

**Tests:** `tests-gui-transformations`, `tests-gui-transformations-create-edit`,
`tests-gui-format`, and the rest of `tests-gui-central`.

### Phase 12: R support via webR
- Lazy-load webR. Replace `RExecution` with a webR backend that uses the ported
  ConvertToR/ConvertFromR code.

**Tests:** `tests-gui-r`.

### Phase 13: Polish and release
- Performance profiling on large tables; consider moving the engine to a Web Worker.
- Accessibility audit, PWA/offline support, and cross-browser testing (Chrome, Firefox,
  Safari).
- Deploy as a static site (for example GitHub Pages).
- Optionally port the book and tutorials.

## 5. Main risks and how to handle them

1. **Numeric semantics.** Java BigDecimal has scale, and DECIMAL128 rounding plus the
   `long`/`BigDecimal` dual representation affect results and display. *Mitigation (done in
   Phase 1):* canonical decimals, and golden tests that run the original Java number methods
   on the JVM. The same was done for big-math's logarithms in Phase 4.
2. **Value equality.** JS has no `equals`/`hashCode`, so code ported naively silently
   uses identity semantics. *Mitigation:* the equality protocol and `HashMap` from
   Phase 1, plus a lint rule against `Map`/`Set` keyed by domain objects.
3. **Date/time.** `java.time`'s behaviour (formatter parsing and resolving, zone names) is
   subtle. *Mitigation (done in Phase 2):* js-joda, which mirrors java.time, corrected where
   it differs and checked against the JVM by golden tests.
4. **Sync vs async.** Files, clipboard and webR are asynchronous in the browser.
   *Mitigation:* confine async to the edges (file, clipboard and R service interfaces),
   so the engine stays synchronous like the Java.
5. **Behaviour drift in the rebuilt GUI.** Without copying the code, subtle behaviours
   (focus rules, what Enter or Tab does in each context, error display) are easy to
   lose. *Mitigation:* behaviour inventories and reference screenshots for each area,
   GUI tests ported per test method, and review of each area by the project owner
   against the Java app.
6. **Grid performance and layout.** Many tables, very large tables, and widths shared
   between tables in the same grid column. *Mitigation:* the Phase 7 prototype on real
   data before any production grid code.
7. **Matching the expression editor in CodeMirror.** Columnal's editor has unusual
   behaviours. *Mitigation:* the Phase 10 spike. If CodeMirror can't do something,
   write a custom extension. A fully custom editor is the fallback.
8. **GUI test round trips.** Every check on app state goes through the Playwright
   `window.__test` bridge. *Mitigation:* keep the bridge small and value-based, and
   compare against Vitest browser mode in Phase 7.
9. **Desktop-only behaviours** (native file paths, closing windows, quit, several
   windows). *Mitigation:* map these to browser equivalents (one project per tab, OPFS)
   and document how the corresponding tests changed.

## 6. Decisions

Decided:
- Numbers are canonical decimals (decimal.js configured as DECIMAL128), one representation for
  whole and fractional numbers, so 2.5 and 2.50 are the same value (Phase 1).
- `HashMap`/`HashSet` iterate in insertion order, with a check at each ported Java `HashMap`
  site for whether its order is observable (Phase 1). Where it is, a Java-order mode
  reproduces Java's order (Phase 2).
- Dates and times use js-joda rather than Temporal (Phase 2).
- Generated ANTLR output is not committed. `npm run gen:parsers` runs on install and before
  dev, build, test and typecheck, and takes under a second.
- Engine tests use Vitest (Node). GUI tests use Vitest browser mode (decided in Phase 7, after comparing it
  with Playwright Test).
- The engine is ported faithfully. The GUI is rebuilt natively in HTML to the same
  effect, not translated from JavaFX.
- The UI framework is Vue 3. Solid is the fallback if the Phase 7 grid prototype shows
  performance problems.

- Java bugs found during the port are reported to the project owner, who decides whether to
  fix them (Phase 4). Fixed ones are marked with a `PORT-NOTE`, and the golden tests list them as
  known differences.

- Phase 7, from the evidence of Part A: Vue stays (the grid prototype showed Vue is not the bottleneck); Reka UI
  for headless components; GUI tests in Vitest browser mode rather than Playwright's runner; browser-reserved
  shortcuts remapped as in CONVENTIONS.md "GUI"; and running the engine off the main thread is to be looked at
  soon, before Phase 8's production grid, rather than in Phase 13.
- After the worker spike: the engine runs in a Web Worker, which owns the TableManager, and the GUI talks to it
  by messages. Editors that need engine types while the user types (the expression editor's checking and
  completion; cell editors turned out not to, see Phase 8 step 4) run on the main thread against a copy of the type information
  (tables' columns and types, the TypeManager's types, units), taken when the editor opens: while it is open,
  nothing changes except by the user. The copy is taken once the worker is idle, so it includes any re-run
  still going from an earlier edit. Anything that needs table data rather than types is a request to the worker.

Open:
- Whether to optimise the engine's file loading (3–5× slower than Java's). In the worker it no longer freezes
  the page, but nothing shows until the whole file is loaded.
- Whether webR's download size is acceptable, or R support should be optional or
  deferred.
- Supported browsers. The File System Access API is Chromium-only, and other browsers
  fall back to upload/download.
