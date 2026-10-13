// Dependency rules: the engine never depends on the GUI, and engine modules only depend on
// the modules their Java counterparts depended on in the Gradle build (see docs/PLAN.md §1).
// Run with: npm run depcheck

// Allowed dependencies between engine modules (src/engine/<module>/), from the original
// build.gradle files, minus the Checker Framework modules.  Where a Java engine module
// depended on a GUI module (transformations, importers and exporters on utility-gui, and
// importers on stf/table-gui), that dependency is deliberately dropped: the GUI parts are
// rebuilt separately, and whatever the engine used from them must move into the engine.
// "java" (Java standard library equivalents) and "anns" (the Java annotation qualifiers)
// may be used by every engine module.
const ENGINE_MODULE_DEPENDENCIES = {
    "java": [],
    "anns": [],
    "utility-error": [],
    "utility-functional": ["utility-error"],
    "utility-adt": ["utility-error", "utility-functional"],
    "parsers": [],
    "identifiers": ["parsers", "utility-adt", "utility-error"],
    "utility": ["parsers", "utility-adt", "utility-error", "utility-functional"],
    "types": ["identifiers", "parsers", "utility", "utility-adt", "utility-error", "utility-functional"],
    "data": ["identifiers", "parsers", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "expressions": ["identifiers", "parsers", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "functions": ["expressions", "parsers", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "r-interop": ["data", "identifiers", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "transformations": ["data", "expressions", "functions", "identifiers", "parsers", "r-interop", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "importers": ["data", "identifiers", "parsers", "r-interop", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
    "exporters": ["data", "identifiers", "r-interop", "types", "utility", "utility-adt", "utility-error", "utility-functional"],
};

const escapeRegex = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");

const engineLayerRules = Object.entries(ENGINE_MODULE_DEPENDENCIES).map(([module, deps]) => ({
    name: `engine-layering-${module}`,
    comment: `src/engine/${module} may only depend on: ${["java", "anns", ...deps].join(", ")} (mirrors the Java Gradle module dependencies).`,
    severity: "error",
    from: { path: `^src/engine/${escapeRegex(module)}/` },
    to: {
        path: "^src/engine/[^/]+/",
        pathNot: `^src/engine/(${[module, "java", "anns", ...deps].map(escapeRegex).join("|")})/`,
    },
}));

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
    forbidden: [
        {
            name: "engine-not-to-gui",
            comment: "The engine is framework-free and must not depend on the GUI or the GUI logic.",
            severity: "error",
            from: { path: "^src/engine/" },
            to: { path: "^src/(gui|gui-logic)/" },
        },
        {
            name: "gui-logic-not-to-gui",
            comment: "gui-logic is pure TypeScript ported from the Java GUI modules; it must not depend on the Vue GUI.",
            severity: "error",
            from: { path: "^src/gui-logic/" },
            to: { path: "^src/gui/" },
        },
        {
            name: "no-ui-frameworks-below-gui",
            comment: "Only src/gui may use Vue or UI component libraries.",
            severity: "error",
            from: { path: "^src/(engine|gui-logic)/" },
            to: { path: "node_modules/(vue|@vue|reka-ui|@ark-ui|@zag-js)/" },
        },
        {
            name: "decimal-only-via-java",
            comment: "Use Decimal from src/engine/java/JavaBigDecimal.ts: importing decimal.js directly gives the wrong precision and rounding.",
            severity: "error",
            from: { path: "^(src|test)/", pathNot: "^src/engine/java/" },
            to: { path: "node_modules/decimal\\.js/" },
        },
        {
            name: "src-not-to-test",
            comment: "Application code must not depend on tests.",
            severity: "error",
            from: { path: "^src/" },
            to: { path: "^test/" },
        },
        {
            name: "no-node-builtins-in-src",
            comment: "The app runs in the browser, so it cannot use Node built-in modules.",
            severity: "error",
            from: { path: "^src/" },
            to: { dependencyTypes: ["core"] },
        },
        ...engineLayerRules,
        {
            name: "no-circular",
            comment: "Circular imports can cause initialisation-order errors with ES module classes. Java allows cycles, so some may be needed; review each one.",
            severity: "warn",
            from: { pathNot: "^src/engine/parsers/generated/" },
            to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"] } },
        },
    ],
    options: {
        doNotFollow: { path: "node_modules" },
        tsConfig: { fileName: "tsconfig.app.json" },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: {
            exportsFields: ["exports"],
            conditionNames: ["import", "require", "node", "default", "types"],
            extensions: [".ts", ".js", ".vue", ".json"],
        },
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
