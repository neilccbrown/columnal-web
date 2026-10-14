// Checks the types module against the ORIGINAL Java classes, run on the JVM by
// scripts/golden/types.sh (scripts/golden/java/TypesHarness.java).  Each golden line is
// section|input|output; this test recomputes the output with the port.  Cases driven by
// java.util.Random make exactly the same calls as the harness.
import { describe, expect, test } from "vitest";
import golden from "./golden/types.txt?raw";
import type { ExpressionIdentifier } from "../../../src/engine/anns/Annotations.js";
import { javaEnumValues } from "../../../src/engine/java/JavaEnum.js";
import { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { javaMessage } from "../../../src/engine/java/time/JavaTime.js";
import type { DataType } from "../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { DateTimeInfo } from "../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import { JellyType } from "../../../src/engine/types/jellytype/JellyTypes.js";
import { OutputBuilder } from "../../../src/engine/types/loadsave/OutputBuilder.js";
import { TypeClassRequirements } from "../../../src/engine/types/typeExp/TypeClassRequirements.js";
import { MutVar, NumTypeExp, TypeCons, TypeExp } from "../../../src/engine/types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../src/engine/types/typeExp/units/MutUnitVar.js";
import { UnitExp } from "../../../src/engine/types/typeExp/units/UnitExp.js";
import { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { javaEnumName } from "../../../src/engine/java/JavaEnum.js";

interface Case
{
    section: string;
    input: string;
    output: string;
}

function unesc(s: string): string
{
    return s.replace(/\\(\\|n|p)/g, (_m, c: string) => c === "n" ? "\n" : c === "p" ? "|" : "\\");
}

const cases: Case[] = golden.split("\n").filter(l => l !== "").map(line =>
{
    // Escaped fields cannot contain an unescaped "|":
    const [section, input, output] = line.split("|") as [string, string, string];
    return { section, input: unesc(input), output: unesc(output) };
});

function scriptText(name: string): string
{
    return cases.find(c => c.section === "script" && c.input === name)!.output;
}

// The Java simple class name for an exception thrown by the port
function javaClassOf(e: unknown): string
{
    if (e instanceof RangeError && e.message.includes("call stack"))
        return "StackOverflowError";
    return (e as Error).constructor.name;
}

function run(f: () => unknown): string
{
    try
    {
        return String(f());
    }
    catch (e)
    {
        if (javaClassOf(e) === "StackOverflowError")
            return "!StackOverflowError: null";
        return "!" + javaClassOf(e) + ": " + javaMessage(e as Error);
    }
}

function norm(o: unknown): string
{
    return String(o).replace(/_t[0-9]+/g, "_t").replace(/_u[0-9]+/g, "_u");
}

function javaSet(s: ReadonlySet<string> | null): string
{
    return s === null ? "null" : "[" + [...s].join(", ") + "]";
}

// Differences between the JVM's exception class names and the port's:
function normaliseJava(output: string): string
{
    return output.replace(/!ArrayIndexOutOfBoundsException:/g, "!IndexOutOfBoundsException:");
}

/** Checks every case of a section, reporting all mismatches at once. */
function check(section: string, compute: (input: string) => string, adjustExpected: (expected: string, actual: string) => string = e => e): void
{
    const sectionCases = cases.filter(c => c.section === section);
    expect(sectionCases.length, section).toBeGreaterThan(0);
    const mismatches = sectionCases.map(c =>
    {
        const actual = compute(c.input);
        return { input: c.input, expected: adjustExpected(normaliseJava(c.output), actual), actual };
    }).filter(m => m.expected !== m.actual);
    expect(mismatches).toEqual([]);
}

const BASE_UNITS = ["m", "s", "g", "USD"];
const FIELDS: ExpressionIdentifier[] = ["x", "field", "Total", "aa", "b c"];

describe("Types module against the JVM", () =>
{
    const mgr = new UnitManager();

    test("units", () =>
    {
        check("unit", u => run(() => {
            const unit = mgr.loadUse(u);
            const m = mgr.loadUse("m");
            const scale = unit.canScaleTo(m, mgr);
            return unit.toString() + " ; " + unit.forDisplay() + " ; " + unit.getDisplayPrefix() + " ; " + unit.getDisplaySuffix()
                + " ; " + mgr.canonicalise(unit).toString() + " ; " + unit.reciprocal().toString() + " ; " + unit.raisedTo(3).toString() + " ; " + (scale !== null ? scale.toString() : "empty")
                + " ; " + unit.hashCode();
        }));
    });

    test("unit manager", () =>
    {
        check("allDeclared", () => run(() => mgr.getAllDeclared().map(s => s.getName()).join(" ")));
        check("allBuiltIn", () => run(() => [...mgr.getAllBuiltIn().keys()].join(" ")));
        check("canonicalBase", u => run(() => javaSet(mgr.getCanonicalBaseUnit(u))));
        const user = new UnitManager();
        check("loadUser", () => run(() => { user.loadUserUnits(scriptText("USER_UNITS")); return "ok"; }));
        check("userDeclared", () => run(() => [...user.getAllUserDeclared().keys()].join(" ")));
        check("saveAll", () => run(() => user.save().join("\n")));
        check("saveSome", () => run(() => user.save(u => u === "gamma" || u === "zeta").join("\n")));
        check("canonGamma", () => run(() => user.canonicalise(user.loadUse("(gamma*gg)/wd"))));
        check("userUnit", u => run(() => { const unit = user.loadUse(u); return unit.toString() + " ; " + user.canonicalise(unit).toString() + " ; " + unit.getDisplayPrefix() + " ; " + unit.getDisplaySuffix() + " ; " + javaSet(user.getCanonicalBaseUnit(u)); }));
        user.removeUserUnit("delta");
        check("saveAfterRemove", () => run(() => user.save().join("\n")));
        user.clearAllUser();
        check("saveAfterClear", () => run(() => user.save().join("\n")));
    });

    function unitSide(r: JavaRandom, vars: MutUnitVar[]): UnitExp
    {
        let u = UnitExp.SCALAR;
        const terms = r.nextInt(4);
        for (let t = 0; t < terms; t++)
        {
            if (r.nextBoolean())
                u = u.times(new UnitExp(vars[r.nextInt(vars.length)]!).raisedTo(r.nextInt(7) - 3));
            else
                u = u.times(UnitExp.fromConcrete(mgr.loadUse(BASE_UNITS[r.nextInt(BASE_UNITS.length)]!)).raisedTo(r.nextInt(7) - 3));
        }
        return u;
    }

    test("unit inference", () =>
    {
        check("unitExp", seed => run(() => {
            const r = new JavaRandom(BigInt(seed));
            const vars: MutUnitVar[] = [];
            const n = 1 + r.nextInt(3);
            for (let i = 0; i < n; i++)
                vars.push(new MutUnitVar());
            const lhs = unitSide(r, vars);
            const rhs = unitSide(r, vars);
            const before = norm(lhs) + " = " + norm(rhs);
            const result = lhs.unifyWith(rhs);
            let sb = before + " => " + (result === null ? "fail" : norm(result));
            for (const v of vars)
                sb += " ; " + String(v.toConcreteUnit());
            // A second unification against a concrete unit:
            const second = lhs.unifyWith(UnitExp.fromConcrete(mgr.loadUse("m^2")));
            sb += " ; then " + (second === null ? "fail" : norm(second));
            for (const v of vars)
                sb += " ; " + String(v.toConcreteUnit());
            return sb;
        }));
    });

    function genType(r: JavaRandom, depth: number, vars: MutVar[], unitVars: MutUnitVar[]): TypeExp
    {
        switch (r.nextInt(depth > 0 ? 8 : 4))
        {
            case 0:
                if (r.nextBoolean())
                    return new NumTypeExp(null, new UnitExp(unitVars[r.nextInt(unitVars.length)]!));
                else
                    return new NumTypeExp(null, UnitExp.fromConcrete(mgr.loadUse(BASE_UNITS[r.nextInt(3)]!)));
            case 1:
                return TypeExp.text(null);
            case 2:
                return TypeExp.bool(null);
            case 3:
                return vars[r.nextInt(vars.length)]!;
            case 4:
                return TypeExp.list(null, genType(r, depth - 1, vars, unitVars));
            case 5:
            {
                const fields = new Map<ExpressionIdentifier, TypeExp>();
                const n = 1 + r.nextInt(3);
                for (let i = 0; i < n; i++)
                {
                    // Java's LinkedHashMap.put evaluates the key, then the value:
                    const key = FIELDS[r.nextInt(FIELDS.length)]!;
                    fields.set(key, genType(r, depth - 1, vars, unitVars));
                }
                return TypeExp.record(null, fields, r.nextBoolean());
            }
            case 6:
                return new TypeCons(null, "Optional", [Either.right<UnitExp, TypeExp>(genType(r, depth - 1, vars, unitVars))], TypeExp.ALL_TYPE_CLASSES);
            default:
            {
                const param = genType(r, depth - 1, vars, unitVars);
                return TypeExp.function(null, [param], genType(r, depth - 1, vars, unitVars));
            }
        }
    }

    function concrete(t: TypeExp, tm: TypeManager, subst: boolean): string
    {
        return t.toConcreteType(tm, subst).either(e => "E:" + norm(e), d => d.toString());
    }

    test("type inference", () =>
    {
        const tm = new TypeManager(new UnitManager());
        check("typeExp", seed => run(() => {
            const r = new JavaRandom(BigInt(seed));
            const vars = [new MutVar(null), new MutVar(null), new MutVar(null)];
            const unitVars = [new MutUnitVar(), new MutUnitVar()];
            const a = genType(r, 2, vars, unitVars);
            const b = genType(r, 2, vars, unitVars);
            let before = norm(a) + " = " + norm(b);
            if (r.nextInt(3) === 0)
            {
                const err = a.requireTypeClasses(TypeClassRequirements.require(r.nextBoolean() ? "Comparable" : "Readable", "f"));
                before += " [tc " + (err === null ? "ok" : norm(err)) + "]";
            }
            const result = TypeExp.unifyTypes(a, b);
            return before + " => " + result.either(e => "E:" + norm(e), t => norm(t))
                + " ; " + concrete(a, tm, false) + " ; " + concrete(b, tm, true)
                + " ; " + norm(vars[0]) + " ; " + norm(vars[1]);
        }));
    });

    test("types", () =>
    {
        const tm = new TypeManager(new UnitManager());
        check("typeDecls", () => run(() => { tm.loadTypeDecls(scriptText("TYPE_DECLS")); return "ok"; }));
        check("knownTypes", () => run(() => [...tm.getKnownTaggedTypes().keys()].map(t => t.getRaw()).join(" ")));
        check("userTypes", () => run(() => [...tm.getUserTaggedTypes().keys()].map(t => t.getRaw()).join(" ")));
        check("saveTypes", () => run(() => tm.save().join("\n")));
        check("lookupTag", tag => run(() => tm.lookupTag(null, tag).either(e => "E:" + e, ti => ti.getTypeName().toString() + " " + ti.tagIndex + " " + ti.getTagInfo().getName() + " " + String(ti.getTagInfo().getInner() !== null))));
        check("lookupTagIn", tag => run(() => tm.lookupTag("Colour", tag).either(e => "E:" + e, ti => ti.getTypeName().toString() + " " + ti.tagIndex)));
        check("ambiguous", tag => run(() => tm.ambiguousTagName(tag)));
        check("typeUse", use => run(() => {
            const dt = tm.loadTypeUse(use);
            const b = new OutputBuilder();
            dt.save(b);
            const bj = new OutputBuilder();
            JellyType.fromConcrete(dt).save(bj);
            const def = run(() => {
                const v = DataTypeUtility.makeDefaultValue(dt);
                return DataTypeUtility.valueToString(v) + " ; " + DataTypeUtility.valueToString(v, dt, false, null);
            });
            // The JVM's hash codes of date types include enums' identity hashes, so vary between runs:
            const hash = hasDateType(dt) ? "(date)" : String(dt.hashCode());
            return dt.toString() + " ; " + dt.toDisplay(false) + " ; " + b.toString() + " ; " + bj.toString() + " ; " + norm(TypeExp.fromDataType(null, dt)) + " ; " + def + " ; " + hash;
        }), (expected, actual) => actual.endsWith(" ; (date)") ? expected.replace(/ ; -?[0-9]+$/, " ; (date)") : expected);
        check("jellyParse", use => run(() => {
            const jt = JellyType.parse(use, tm);
            const b = new OutputBuilder();
            jt.save(b);
            const dt = run(() => jt.makeDataType(new Map(), tm).toString());
            return b.toString() + " ; " + dt;
        }));
    });

    test("values", () =>
    {
        const tm = new TypeManager(new UnitManager());
        tm.loadTypeDecls(scriptText("TYPE_DECLS"));
        check("value", input => run(() => {
            const [type, text] = input.split(" := ") as [string, string];
            const dt = tm.loadTypeUse(type);
            const loaded = dt.loadSingleItem(text);
            return loaded.either(l => "L:" + l, v => run(() => {
                const b = new OutputBuilder();
                b.dataValue(dt, v);
                return DataTypeUtility.valueToString(v) + " ; " + DataTypeUtility.valueToString(v, dt, false, null) + " ; " + b.toString() + " ; " + DataTypeUtility._test_valueToString(v);
            }));
        }));
    });

    test("flexible date parsing", () =>
    {
        check("flexible", input => run(() => {
            const space = input.indexOf(" ");
            const typeName = input.substring(0, space);
            const type = javaEnumValues<DateTimeInfo.DateTimeType>(DateTimeInfo.DateTimeType).find(t => javaEnumName(DateTimeInfo.DateTimeType, t) === typeName)!;
            const sv = new DataTypeUtility.StringView(input.substring(space + 1));
            const t = DataTypeUtility.parseTemporalFlexible(new DateTimeInfo(type), sv);
            return t.toString() + " @" + sv.getPosition();
        }));
    });

    test("output builder", () =>
    {
        check("d", d => run(() => new OutputBuilder().d(Number(d)).toString()));
        check("id", s => run(() => {
            const b = new OutputBuilder();
            for (const q of javaEnumValues<OutputBuilder.QuoteBehaviour>(OutputBuilder.QuoteBehaviour))
                b.id(s, q);
            b.s(s);
            b.nl();
            b.raw("next").unit("m/s").n(42).kw("@END");
            return b.toString() + " ; " + b.toLines().join(",");
        }));
    });
});

function hasDateType(dt: DataType): boolean
{
    return dt.toString().match(/\bDate|\bTime/) !== null;
}
