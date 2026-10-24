// Generates docs/PORT-STATUS.md: how much of the Java original has been ported.
//   npm run fetch-reference   (once, to get reference/columnal)
//   npm run port-status
//
// Mapping from Java to TypeScript (see docs/CONVENTIONS.md):
//   <module>/src/main/java/xyz/columnal/<path>/X.java  -> src/engine/<module>/<path>/X.ts      (engine modules)
//                                                       -> src/gui-logic/<module>/<path>/X.ts   (GUI modules: logic only)
//   tests-x/src/test/java/test/<path>/X.java            -> test/engine/tests-x/<path>/X.test.ts (engine test modules)
//                                                       -> test/gui/tests-x/<path>/X.spec.ts    (GUI test modules,
//                                                          except ENGINE_TESTS_IN_GUI_MODULES and GUI_LOGIC_TESTS_IN_GUI_MODULES)
//   tests-x/src/testFixtures/java/(test|xyz/columnal)/<path>/X.java -> test/(engine|gui)/tests-x/fixtures/<path>/X.ts
// Test methods (@Test/@Property) count as ported when the TS test file has a test with the same name.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reference = join(root, "reference", "columnal");

const ENGINE_MODULES = ["utility-error", "utility-functional", "utility-adt", "parsers", "identifiers", "utility", "types", "data",
    "expressions", "functions", "r-interop", "transformations", "importers", "exporters"];
const GUI_MODULES = ["utility-gui", "lex-editor-completion", "stf", "lex-editor", "table-gui", "dialogs-non-expression", "app"];
const ENGINE_TEST_MODULES = ["tests-basic", "tests-functions", "tests-tables"];

interface FileStatus
{
    javaPath: string;
    tsPath: string;
    lines: number;
    ported: boolean;
    // Ported, but with parts marked PORT-DEFERRED (to be done in a later phase)
    deferred?: boolean;
    // Deliberately not ported, with the reason
    skipped?: string;
    testMethods?: { total: string[]; ported: string[] };
}

// Tests (and their fixtures) in GUI test modules that don't use the GUI, which are ported as Vitest engine tests
// (test/engine/tests-gui-x/<path>/X.test.ts) rather than Playwright specs:
const ENGINE_TESTS_IN_GUI_MODULES = new Set([
    "tests-gui-central/src/test/java/test/expressions/TestFromDoc.java",
    "tests-gui-r/src/test/java/test/importExport/TestRLoadSave.java",
    "tests-gui-r/src/test/java/test/importExport/GenRCompatibleRecordSet.java",
    "tests-gui-format/src/test/java/test/TestFormat.java",
    "tests-gui-format/src/testFixtures/java/test/gen/GenFormat.java",
    "tests-gui-format/src/testFixtures/java/test/gen/GenFormattedData.java",
]);

// Tests (and their helpers) in GUI test modules that only use the logic ported into src/gui-logic,
// which are ported as Vitest tests (test/gui-logic/tests-gui-x/<path>/X.test.ts):
const GUI_LOGIC_TESTS_IN_GUI_MODULES = new Set([
    "tests-gui-grid/src/test/java/test/gui/PropGridOverlap.java",
    "tests-gui-grid/src/test/java/test/gen/GenGridAreaList.java",
    "tests-gui-type-editor/src/test/java/test/gui/expressionEditor/TestTypeEditorError.java",
    "tests-gui-type-editor/src/test/java/test/gui/expressionEditor/TestTypeEditorCompletion.java",
    "tests-gui-type-editor/src/test/java/test/gui/expressionEditor/TestTypeQuickFix.java",
    "tests-gui-type-editor/src/test/java/test/gui/expressionEditor/TestExpressionQuickFixType.java",
    "tests-gui-expression-editor-further/src/test/java/test/gui/expressionEditor/TestExpressionEditorSyntaxError.java",
    "tests-gui-expression-editor-further/src/test/java/test/gui/expressionEditor/TestExpressionEditorTypeError.java",
    "tests-gui-expression-editor-further/src/test/java/test/gui/expressionEditor/TestExpressionQuickFixSyntax.java",
    "tests-gui-expression-editor-further/src/test/java/test/gui/expressionEditor/TestExpressionEditorCompletion.java",
]);

// The kind of TS test (engine, gui-logic or gui) a Java test file in a test module becomes:
function testKind(javaPath: string, moduleKind: string): string
{
    if (ENGINE_TESTS_IN_GUI_MODULES.has(javaPath))
        return "engine";
    if (GUI_LOGIC_TESTS_IN_GUI_MODULES.has(javaPath))
        return "gui-logic";
    return moduleKind;
}

// Java files that are deliberately not ported (paths relative to reference/columnal):
const SKIPPED = new Map<string, string>([
    ["utility/src/main/java/xyz/columnal/utility/ResourceUtility.java", "loads classpath resources; resources are bundled by Vite instead"],
    ["importers/src/main/java/xyz/columnal/importers/gui/ImportChoicesDialog.java", "the import dialog, rebuilt in the GUI (Phase 11); the importers show it through ImporterDialogs"],
    ["importers/src/main/java/xyz/columnal/importers/gui/ImporterGUI.java", "the import dialog's choice rows, rebuilt in the GUI (Phase 11)"],
    ["stf/src/main/java/xyz/columnal/gui/stable/RowSelection.java", "entirely commented out in Java"],
    ["stf/src/main/java/xyz/columnal/gui/stable/ColumnSelection.java", "entirely commented out in Java"],
]);

function withStatus(f: FileStatus): FileStatus
{
    const skipped = SKIPPED.get(f.javaPath);
    if (skipped !== undefined)
        return { ...f, skipped, ported: true };
    if (f.ported && readFileSync(join(root, f.tsPath), "utf8").includes("PORT-DEFERRED"))
        return { ...f, deferred: true };
    return f;
}

function walk(dir: string, ext: string): string[]
{
    if (!existsSync(dir))
        return [];
    const result: string[] = [];
    for (const entry of readdirSync(dir))
    {
        const full = join(dir, entry);
        if (statSync(full).isDirectory())
            result.push(...walk(full, ext));
        else if (entry.endsWith(ext))
            result.push(full);
    }
    return result.sort();
}

function lineCount(file: string): number
{
    return readFileSync(file, "utf8").split("\n").length;
}

function stripPackageRoot(rel: string): string
{
    return rel.replace(/^xyz\/columnal\//, "").replace(/^test\//, "");
}

const isIgnoredJava = (f: string) => f.endsWith("module-info.java") || f.endsWith("package-info.java");

function mainFiles(module: string, tsRoot: string): FileStatus[]
{
    const javaRoot = join(reference, module, "src", "main", "java");
    return walk(javaRoot, ".java").filter(f => !isIgnoredJava(f)).map(f =>
    {
        const rel = stripPackageRoot(relative(javaRoot, f)).replace(/\.java$/, ".ts");
        const tsPath = join(tsRoot, module, rel);
        return withStatus({ javaPath: relative(reference, f), tsPath: relative(root, tsPath), lines: lineCount(f), ported: existsSync(tsPath) });
    });
}

function javaTestMethods(file: string): string[]
{
    // Test methods that are commented out don't count:
    const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const names: string[] = [];
    const re = /@(?:Test|Property)\b(?:\([^)]*\))?[\s\S]*?(?:public\s+)?(?:static\s+)?void\s+(\w+)\s*\(/g;
    for (let m = re.exec(src); m !== null; m = re.exec(src))
        names.push(m[1]!);
    return names;
}

function tsTestNames(file: string): Set<string>
{
    const names = new Set<string>();
    if (!existsSync(file))
        return names;
    const src = readFileSync(file, "utf8");
    const re = /\b(?:test|it|propertyTest)(?:\.\w+)?\(\s*["'`]([^"'`]+)["'`]/g;
    for (let m = re.exec(src); m !== null; m = re.exec(src))
        names.add(m[1]!);
    return names;
}

function testModuleFiles(module: string): FileStatus[]
{
    const kind = ENGINE_TEST_MODULES.includes(module) ? "engine" : "gui";
    const result: FileStatus[] = [];
    const testsRoot = join(reference, module, "src", "test", "java");
    for (const f of walk(testsRoot, ".java").filter(f => !isIgnoredJava(f)))
    {
        const fileKind = testKind(relative(reference, f), kind);
        const methods = javaTestMethods(f);
        // A helper class with no test methods (such as a generator) is a plain module, not a test file:
        const rel = stripPackageRoot(relative(testsRoot, f)).replace(/\.java$/, methods.length === 0 ? ".ts" : fileKind === "gui" ? ".spec.ts" : ".test.ts");
        const tsPath = join(root, "test", fileKind, module, rel);
        const tsNames = tsTestNames(tsPath);
        result.push({
            javaPath: relative(reference, f), tsPath: relative(root, tsPath), lines: lineCount(f),
            ported: existsSync(tsPath) && methods.every(m => tsNames.has(m)),
            testMethods: { total: methods, ported: methods.filter(m => tsNames.has(m)) },
        });
    }
    const fixturesRoot = join(reference, module, "src", "testFixtures", "java");
    for (const f of walk(fixturesRoot, ".java").filter(f => !isIgnoredJava(f)))
    {
        const rel = stripPackageRoot(relative(fixturesRoot, f)).replace(/\.java$/, ".ts");
        const fixtureKind = testKind(relative(reference, f), kind);
        const tsPath = join(root, "test", fixtureKind, module, "fixtures", rel);
        result.push(withStatus({ javaPath: relative(reference, f), tsPath: relative(root, tsPath), lines: lineCount(f), ported: existsSync(tsPath) }));
    }
    return result;
}

function grammarFiles(): FileStatus[]
{
    const dir = join(reference, "parsers", "src", "main", "antlr");
    return walk(dir, ".g4").map(f =>
    {
        const tsPath = join(root, "src", "engine", "parsers", "antlr", relative(dir, f));
        return { javaPath: relative(reference, f), tsPath: relative(root, tsPath), lines: lineCount(f), ported: existsSync(tsPath) };
    });
}

function pct(n: number, total: number): string
{
    return total === 0 ? "–" : `${Math.round(100 * n / total)}%`;
}

function summarise(files: FileStatus[]): { files: string; lines: string; methods: string; done: boolean }
{
    const ported = files.filter(f => f.ported);
    const lines = files.reduce((s, f) => s + f.lines, 0);
    const portedLines = ported.reduce((s, f) => s + f.lines, 0);
    const methods = files.reduce((s, f) => s + (f.testMethods?.total.length ?? 0), 0);
    const portedMethods = files.reduce((s, f) => s + (f.testMethods?.ported.length ?? 0), 0);
    return {
        files: `${ported.length} / ${files.length}`,
        lines: `${portedLines} / ${lines} (${pct(portedLines, lines)})`,
        methods: methods === 0 ? "" : `${portedMethods} / ${methods} (${pct(portedMethods, methods)})`,
        done: files.length > 0 && ported.length === files.length,
    };
}

function section(title: string, groups: [string, FileStatus[]][], showMethods: boolean): string
{
    let out = `## ${title}\n\n| Module | Files | Lines${showMethods ? " | Test methods" : ""} |\n|---|---|---${showMethods ? "|---" : ""}|\n`;
    for (const [name, files] of groups)
    {
        const s = summarise(files);
        out += `| ${s.done ? "✅ " : ""}${name} | ${s.files} | ${s.lines}${showMethods ? ` | ${s.methods}` : ""} |\n`;
    }
    out += "\n";
    for (const [name, files] of groups)
    {
        if (files.length === 0)
            continue;
        out += `<details><summary>${name}</summary>\n\n| Java | TypeScript | Lines | Status |\n|---|---|---|---|\n`;
        for (const f of files)
        {
            const methods = f.testMethods && f.testMethods.total.length > 0 ? ` (${f.testMethods.ported.length}/${f.testMethods.total.length} tests)` : "";
            const status = f.skipped !== undefined ? `skipped: ${f.skipped}` : f.deferred ? "✅ (parts deferred)" : f.ported ? "✅" : "–";
            out += `| \`${f.javaPath}\` | \`${f.tsPath}\` | ${f.lines} | ${status}${methods} |\n`;
        }
        out += "\n</details>\n\n";
    }
    return out;
}

if (!existsSync(reference))
{
    console.error("reference/columnal is missing: run `npm run fetch-reference` first.");
    process.exit(1);
}

const commit = readFileSync(join(root, "scripts", "fetch-reference.sh"), "utf8").match(/COMMIT=(\w+)/)?.[1] ?? "unknown";

let doc = `# Port status\n\nGenerated by \`npm run port-status\` against the Java original at commit \`${commit.substring(0, 9)}\`. Do not edit by hand.\n\n`;
doc += "\"Parts deferred\" means the file is ported apart from members marked `PORT-DEFERRED` in the TypeScript (usually ones that need a later phase).\n\n";
doc += "Lines are lines of Java, including licence headers. GUI modules are rebuilt rather than ported, so their table only counts the logic ported into `src/gui-logic`; progress on the rebuilt GUI is tracked through the GUI test methods.\n\n";
doc += section("Engine", [["grammars (parsers/*.g4)", grammarFiles()], ...ENGINE_MODULES.map(m => [m, mainFiles(m, join(root, "src", "engine"))] as [string, FileStatus[]])], false);
doc += section("GUI logic (ported into src/gui-logic)", GUI_MODULES.map(m => [m, mainFiles(m, join(root, "src", "gui-logic"))] as [string, FileStatus[]]), false);
const testModules = readdirSync(reference).filter(d => d.startsWith("tests-")).sort();
doc += section("Tests", testModules.map(m => [m, testModuleFiles(m)] as [string, FileStatus[]]), true);

writeFileSync(join(root, "docs", "PORT-STATUS.md"), doc);
console.log("Wrote docs/PORT-STATUS.md");
