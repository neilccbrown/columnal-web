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

// The same for the logic ported from the GUI modules (src/gui-logic/<module>/), which may use the
// engine modules and the other GUI modules that their Java modules depended on.
const GUI_LOGIC_MODULE_DEPENDENCIES = {
    "utility-gui": { engine: ["utility", "utility-adt", "utility-error", "utility-functional", "parsers"], gui: [] },
    "lex-editor-completion": { engine: ["utility", "utility-adt", "utility-error", "utility-functional"], gui: ["utility-gui"] },
    "stf": { engine: ["identifiers", "utility", "utility-adt", "utility-error", "utility-functional", "data", "parsers", "types"], gui: ["utility-gui"] },
    "lex-editor": { engine: ["utility", "utility-adt", "utility-error", "utility-functional", "expressions", "identifiers", "types", "data", "parsers"], gui: ["utility-gui", "lex-editor-completion"] },
    "dialogs-non-expression": { engine: ["data", "identifiers", "parsers", "transformations", "utility", "utility-adt", "utility-error", "utility-functional"], gui: ["utility-gui"] },
    "table-gui": { engine: ["utility", "utility-adt", "utility-error", "utility-functional", "parsers", "data", "exporters", "expressions", "functions", "identifiers", "transformations", "r-interop", "types"], gui: ["utility-gui", "stf", "dialogs-non-expression", "lex-editor"] },
    "app": { engine: ["utility", "utility-adt", "utility-error", "utility-functional", "parsers", "data", "exporters", "expressions", "functions", "identifiers", "importers", "transformations", "r-interop", "types"], gui: ["utility-gui", "stf", "dialogs-non-expression", "lex-editor", "table-gui"] },
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

const guiLogicLayerRules = Object.entries(GUI_LOGIC_MODULE_DEPENDENCIES).flatMap(([module, deps]) => [
    {
        name: `gui-logic-layering-${module}`,
        comment: `src/gui-logic/${module} may only depend on gui-logic modules: ${[module, ...deps.gui].join(", ")} (mirrors the Java Gradle module dependencies).`,
        severity: "error",
        from: { path: `^src/gui-logic/${escapeRegex(module)}/` },
        to: {
            path: "^src/gui-logic/[^/]+/",
            pathNot: `^src/gui-logic/(${[module, ...deps.gui].map(escapeRegex).join("|")})/`,
        },
    },
    {
        name: `gui-logic-engine-layering-${module}`,
        comment: `src/gui-logic/${module} may only depend on engine modules: ${["java", "anns", ...deps.engine].join(", ")} (mirrors the Java Gradle module dependencies).`,
        severity: "error",
        from: { path: `^src/gui-logic/${escapeRegex(module)}/` },
        to: {
            path: "^src/engine/[^/]+/",
            pathNot: `^src/engine/(${["java", "anns", ...deps.engine].map(escapeRegex).join("|")})/`,
        },
    },
]);

// Class hierarchies whose base class constructs its subclasses (so the modules import each
// other): each is loaded through a barrel module that lists the base class first, and other
// modules must import these classes' values through the barrel (see docs/CONVENTIONS.md).
const HIERARCHY_BARRELS = {
    "src/engine/types/typeExp/TypeExps.ts": ["TypeExp", "MutVar", "NumTypeExp", "RecordTypeExp", "TypeCons"],
    "src/engine/types/jellytype/JellyTypes.ts": ["JellyType", "JellyTypeApply", "JellyTypeArray", "JellyTypeFunction", "JellyTypeIdent", "JellyTypeNumberWithUnit", "JellyTypePrimitive", "JellyTypeRecord"],
    "src/engine/data/data/DataSources.ts": ["DataSource", "ImmediateDataSource", "LinkedDataSource"],
    "src/engine/data/data/columntype/ColumnTypes.ts": ["ColumnType", "BlankColumnType", "BoolColumnType", "CleanDateColumnType", "NumericColumnType", "OrBlankColumnType", "TextColumnType"],
    "src/engine/expressions/transformations/expression/Expressions.ts": ["Expression", "NonOperatorExpression", "Literal", "BinaryOpExpression", "NaryOpExpression", "NaryOpShortCircuitExpression", "NaryOpTotalExpression", "AddSubtractExpression", "AndExpression", "ArrayExpression", "BooleanLiteral", "CallExpression", "ComparisonExpression", "DefineExpression", "DivideExpression", "EqualExpression", "FieldAccessExpression", "HasTypeExpression", "IdentExpression", "IfThenElseExpression", "ImplicitLambdaArg", "InvalidIdentExpression", "InvalidOperatorExpression", "LambdaExpression", "MatchAnythingExpression", "MatchExpression", "NotEqualExpression", "NumericLiteral", "OrExpression", "PlusMinusPatternExpression", "RaiseExpression", "RecordExpression", "StringConcatExpression", "StringLiteral", "TemporalLiteral", "TimesExpression", "TypeLiteralExpression", "UnitLiteralExpression"],
    "src/engine/expressions/transformations/expression/UnitExpressions.ts": ["UnitExpression", "UnitDivideExpression", "UnitExpressionIntLiteral", "UnitRaiseExpression", "UnitTimesExpression", "SingleUnitExpression", "InvalidSingleUnitExpression", "InvalidOperatorUnitExpression"],
    "src/engine/expressions/transformations/expression/type/TypeExpressions.ts": ["TypeExpression", "IdentTypeExpression", "InvalidIdentTypeExpression", "InvalidOpTypeExpression", "ListTypeExpression", "NumberTypeExpression", "RecordTypeExpression", "TypePrimitiveLiteral", "UnitLiteralTypeExpression", "TypeApplyExpression"],
};

const hierarchyRules = Object.entries(HIERARCHY_BARRELS).map(([barrel, classes]) => {
    const dir = barrel.substring(0, barrel.lastIndexOf("/") + 1);
    return {
        name: `via-barrel-${barrel.substring(barrel.lastIndexOf("/") + 1, barrel.length - 3)}`,
        comment: `Import ${classes.join(", ")} through ${barrel}, so the base class is always initialised first (type-only imports are fine).`,
        severity: "error",
        from: { pathNot: `^${escapeRegex(barrel)}$` },
        to: {
            path: `^${escapeRegex(dir)}(${classes.join("|")})\\.ts$`,
            dependencyTypesNot: ["type-only"],
        },
    };
});

const barrelPaths = Object.keys(HIERARCHY_BARRELS).map(escapeRegex).join("|");

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
            name: "js-joda-only-via-java",
            comment: "Use java.time classes from src/engine/java/time/JavaTime.ts, which adapts js-joda to behave like Java 21.",
            severity: "error",
            from: { path: "^(src|test)/", pathNot: "^src/engine/java/" },
            to: { path: "node_modules/@js-joda/" },
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
        ...guiLogicLayerRules,
        {
            name: "no-circular",
            comment: "Circular imports can cause initialisation-order errors with ES module classes. Java allows cycles, so some may be needed; review each one.",
            severity: "warn",
            from: { pathNot: "^src/engine/parsers/generated/" },
            // Cycles through the hierarchy barrels are by design:
            to: { circular: true, viaOnly: { dependencyTypesNot: ["type-only"], pathNot: `^(${barrelPaths})$` } },
        },
        ...hierarchyRules,
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
