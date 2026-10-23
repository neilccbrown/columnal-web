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
| Excel | Apache POI | **SheetJS** (`xlsx`, Apache-2.0) | |
| HTML import | jsoup | `DOMParser` | |
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
| UI framework | JavaFX + ControlsFX + WellBehavedFX | **Vue 3** (Composition API, `<script setup lang="ts">`) with **Reka UI** or **Ark UI** headless components | Decided. The project owner knows Vue best, which matters because they'll review all the GUI code and behaviour drift is the main GUI risk. Vue's fine-grained reactivity suits "the engine changed, so update exactly the affected cells". Reka UI and Ark UI provide accessible dialogs, menus, context menus, popovers, combo boxes and tooltips, which is most of what ControlsFX and WellBehavedFX did. Ark UI is built on Zag.js state machines, which also support React and Solid. Choose between Reka UI and Ark UI in Phase 7. **Fallback:** Solid, if the Phase 7 grid prototype shows Vue can't keep up with very large tables. |
| Engine → UI updates | FX properties and listeners | A small **store adapter**: engine listeners increment a per-table or per-column version held in a `shallowRef`, and components read it in a `computed` | The engine stays mutable and framework-free. **Rule:** engine objects are never made reactive (no `reactive()` or deep `ref()` around them; use `markRaw`/`shallowRef`). Vue's Proxies would break `#private` fields and change object identity. A lint rule enforces this where it can. |
| Table canvas (VirtualGrid) | Custom virtualised grid with its own scrolling and floating layers | **One native scroll container.** Tables are absolutely positioned on a shared logical grid of rows and columns (widths shared per grid column). Headers and row labels use `position: sticky`. Each table only renders the rows currently visible (TanStack Virtual or a hand-rolled version). Cells are real DOM, not canvas. | Native scrolling, sticky positioning and the browser's layout replace `SmoothScroller`, `ScrollGroup` and the floating suppliers. Real DOM cells keep accessibility and test selectors. The logical grid model (cell positions, table placement, selection) is ported as pure TS. |
| Cell editing (DocumentTextField) | Custom document and text field per cell | **One active editor overlaid on the cell being edited**, built on an `<input>` or a lightweight CodeMirror instance. It uses the **ported recognisers** for parsing and error highlighting. | Same behaviour, and far less code. |
| Expression/type/unit editor (lex-editor) | Custom token display, caret and completion | **CodeMirror 6** using the ported lexers: tokens become decorations, the completion source uses the ported ranking, savers produce diagnostics, and quick fixes become CodeMirror actions | CodeMirror already handles editing, selection, undo, IME, completion popups and tooltips. |
| Styling | JavaFX CSS from SCSS | Fresh CSS (SCSS or CSS modules), built on design tokens taken from the original SCSS | Matches the look, not the rule structure. |
| GUI tests | testjavafx (FxRobot) | **Playwright Test**, page objects, and a test-only `window.__test` bridge | Decided, and to be reviewed after the Phase 7 comparison with Vitest browser mode. Values cross the bridge in the `.rec` file format's lossless text form, which Node parses back with the same engine code. Generators and expected values run in Node, which can import the engine. Elements are found by ARIA role or `data-testid`, not by CSS classes copied from JavaFX. |

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

### Phase 5: Transformations (L5)
- Port Calculate, Filter, Sort, Aggregate, Join, Concatenate, HideColumns, Check,
  ManualEdit, MultipleTableLookup and RTransformation (R execution stubbed until
  Phase 12).
- Port TransformationManager, saving/loading, and the dependency DAG and recalculation.
- Port the RDS/RData readers and writers (`RRead`, `RWrite`, `ConvertFromR`,
  `ConvertToR`).

**Tests:** all of `tests-tables`, and RDS parsing against the `.rds`/`.Rdata` fixtures.

Carried over from Phase 4:
- **Fix the relative-tolerance comparison when porting `PropRunExpression`** (agreed with the
  project owner). `Utility.compareNumbers` with `EpsilonType.RELATIVE` computes |a−b|/a − 1 (and the
  same with b) rather than |a−b|/|a|, so it says every pair of numbers is equal. Only
  `PropRunExpression` uses it, so that test's numeric check could never fail in Java; fixing it may
  show up failures that the Java test hid.
- `PropRunExpression` (in `tests-tables`) was deferred from Phase 4: it needs the transformations.
- Remove the `PORT-DEFERRED` in `test/engine/tests-functions/fixtures/DummyManager.ts`: it should
  pass `TransformationManager` as the transformation loader.
- Add `transformations` and `r-interop` to `MODULES` in `scripts/golden/build-columnal-jvm.sh` for
  any golden tests of these modules.
- Open offers to the project owner, not yet answered: make `years between` from 29 February into a
  non-leap year give an answer (treating it as 28 February) rather than the current error; and add
  the full MIT licence notice to `src/engine/java/Damerau.ts` (it only names the licence).
- Minor: `javaClassName` gives an empty class name for anonymous classes, so an internal error
  such as "Uncomparable types" shows `class ` where Java shows the class name. Only internal-error
  messages are affected.
- Some `tests-gui-central` tests may be engine-level, like `TestFromDoc` (for example parts of
  `TestExpressionExplanation` and `TestLoadSaveExpression`). Check each when its phase comes; a
  test that doesn't use the GUI goes in `ENGINE_TESTS_IN_GUI_MODULES` in `scripts/port-status.ts`.

### Phase 6: Import/export engines and GUI logic (L6 and gui-logic)
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

**Tests:** the non-GUI halves of the format tests, and new Vitest unit tests for each
gui-logic module, derived from the GUI tests that exercise it.

**Milestone:** the engine is complete and headless. A Node CLI can load a `.rec` file,
recompute everything and export it, and the results can be compared against Java
outputs on real-world files.

### Phase 7: GUI foundations, grid prototype, test harness
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

### Phase 8: Table canvas and cell editing (rebuilds `stf` and `table-gui`)
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

### Phase 9: Main window and tables (core of `app`)
- Main window, menus, initial screen, the project file flow (new/open/save/save-as,
  autosave, recent files), data table creation, and adding and removing rows and
  columns.
- The type and unit editors (TypesDialog/UnitsDialog equivalents), comments and table
  highlights.

**Tests:** `tests-gui-tables`, `tests-gui-side`, `tests-gui-type-editor`, and the parts
of `tests-gui-central` that do not need expressions.

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
- Engine tests use Vitest (Node). GUI tests use Playwright Test, to be reviewed after the
  Phase 7 comparison with Vitest browser mode.
- The engine is ported faithfully. The GUI is rebuilt natively in HTML to the same
  effect, not translated from JavaFX.
- The UI framework is Vue 3. Solid is the fallback if the Phase 7 grid prototype shows
  performance problems.

- Java bugs found during the port are reported to the project owner, who decides whether to
  fix them (Phase 4). Fixed ones are marked with a `PORT-NOTE`, and the golden tests list them as
  known differences.

Open:
- Reka UI vs. Ark UI for headless components (Phase 7).
- How to handle browser-reserved shortcuts.
- Whether webR's download size is acceptable, or R support should be optional or
  deferred.
- Supported browsers. The File System Access API is Chromium-only, and other browsers
  fall back to upload/download.
