// Golden values for the types module: runs the ORIGINAL Columnal classes (built by
// scripts/golden/build-columnal-jvm.sh) and prints one line per case:
//   section|input|output
// where an exception is shown as "!SimpleClassName: message".  Run by scripts/golden/types.sh;
// test/engine/types/TypesGolden.test.ts replays each case with the port.  Cases driven by
// java.util.Random must use exactly the same calls in the TypeScript test.
package golden;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import com.google.common.collect.ImmutableSet;
import xyz.columnal.data.datatype.DataType;
import xyz.columnal.data.datatype.DataType.DateTimeInfo;
import xyz.columnal.data.datatype.DataType.DateTimeInfo.DateTimeType;
import xyz.columnal.data.datatype.DataTypeUtility;
import xyz.columnal.data.datatype.DataTypeUtility.StringView;
import xyz.columnal.data.datatype.TypeManager;
import xyz.columnal.data.unit.Unit;
import xyz.columnal.data.unit.UnitManager;
import xyz.columnal.jellytype.JellyType;
import xyz.columnal.loadsave.OutputBuilder;
import xyz.columnal.loadsave.OutputBuilder.QuoteBehaviour;
import xyz.columnal.typeExp.MutVar;
import xyz.columnal.typeExp.NumTypeExp;
import xyz.columnal.typeExp.TypeClassRequirements;
import xyz.columnal.typeExp.TypeCons;
import xyz.columnal.typeExp.TypeExp;
import xyz.columnal.typeExp.units.MutUnitVar;
import xyz.columnal.typeExp.units.UnitExp;
import xyz.columnal.utility.adt.Either;

import java.util.*;
import java.util.stream.Collectors;

public class TypesHarness
{
    interface Case { Object run() throws Throwable; }

    static void out(String section, String input, Case c)
    {
        String result;
        try
        {
            Object o = c.run();
            result = String.valueOf(o);
        }
        catch (Throwable t)
        {
            result = "!" + t.getClass().getSimpleName() + ": " + t.getMessage();
        }
        System.out.println(section + "|" + esc(input) + "|" + esc(result));
    }

    // Keeps each case on one line:
    static String esc(String s)
    {
        return s.replace("\\", "\\\\").replace("\n", "\\n").replace("|", "\\p");
    }

    // MutVar/MutUnitVar ids depend on how many were made before, so are not compared:
    static String norm(Object o)
    {
        return String.valueOf(o).replaceAll("_t[0-9]+", "_t").replaceAll("_u[0-9]+", "_u");
    }

    static final String[] UNITS = {"m", "s", "m/s", "m^2", "kg*m/s^2", "1/s", "inch", "inch/hour", "cm^2", "m/cm", "USD", "GBP*m",
        "(m*l)/(g^3*s^2)", "mile/hour^2", "1", "", "{m}", "m^0", "foo", "m/s/s", "m^-2", "l", "ml", "hour", "day", "year", "degC", "$",
        "s^-1*m", "m*m*m/(s*s)", "kg*m*s^-2", "(kg*m)/s^2", "km/hour", "mile/hour", "mg/l", "(m/s)/s", "m^2*s^-3", "acre", "lb", "ft^3", "ha/km^2"};

    static final String[] BASE_UNITS = {"m", "s", "g", "USD"};

    static final String USER_UNITS = String.join("\n",
        "@UNIT widget \"A widget\" = 3 * m",
        "@UNIT gadget \"Gadget\" = 7/2 * widget^2",
        "@ALIAS wd = widget",
        "@UNIT zork \"Zork\"",
        "@UNIT blarg \"Blarg\" PREFIX \"B$\"= 1000 * zork/s",
        "@ALIAS gg = gadget",
        "@UNIT alpha \"A\"",
        "@UNIT beta \"B\" SUFFIX \"bb\"= 2 * alpha",
        "@UNIT gamma \"G\" = 10^3 * beta*widget",
        "@UNIT delta \"D\" = 1/4 * gamma",
        "@UNIT epsilon \"E\"",
        "@UNIT zeta \"Z\" = 5 * epsilon^-1",
        "@UNIT m \"Clashes with built-in\"",
        "@UNIT \u00e9t\u00e9 \"Summer\" = 3 * month",
        "@UNIT k_x \"Underscored\" = 0.25 * kg",
        "") + "\n";

    static final String TYPE_DECLS = String.join("\n",
        "@TYPE Colour @tagged (Red | Green | Blue | Custom(Number))",
        "@TYPE Pair @tagged @typevar a @typevar b (Pair((first: @apply Optional(a), second: b)))",
        "@TYPE Measure @tagged @unitvar u (Measured(Number{@unitvar u}) | Unmeasured)",
        "@TYPE Tree @tagged @typevar t (Leaf | Node(t) | Many([@apply Tree(t)]))",
        "@TYPE Shape @tagged (Circle((radius: Number{m})) | Rect((width: Number{m}, height: Number{m})) | Named(Text))",
        "@TYPE Wrapper @tagged (Wrap(@apply Pair(Colour)(Shape)))",
        "@TYPE Multi Word Name @tagged (Odd Tag | Normal)",
        "@TYPE Fn @tagged (F((Number, Text) -> Boolean))",
        "@TYPE Dates @tagged (D(Date) | DT(DateTime) | DTZ(DateTimeZoned) | T(Time) | YM(DateYM))",
        "@TYPE Zebra @tagged (Stripe(Shape) | Plain)",
        "@TYPE Apple @tagged (Core(@apply Tree(Zebra)))",
        "@TYPE Mango @tagged @typevar x (Fruit(x) | Is)",
        "") + "\n";

    static final String[] TYPE_USES = {"Number", "Number{m/s}", "Text", "Boolean", "Date", "DateYM", "Time", "DateTime", "DateTimeZoned",
        "[Number]", "[[Text]]", "(a: Number, b: Text)", "(z: Boolean, field: [Date], Total: Number{USD}, aa: Text, x: Time)", "Colour",
        "@apply Optional(Number)", "@apply Optional(@apply Optional(Text))", "@apply Pair(Number)(Text)", "@apply Measure{m}",
        "@apply Measure{kg*m/s^2}", "@apply Tree(Boolean)", "Shape", "Wrapper", "Multi Word Name", "Fn", "Apple", "@apply Mango(Number)", "(a: Number, _)", "Dates", "(Number, Text) -> Boolean",
        "[(a: Colour, b: @apply Optional(Shape))]", "Nonexistent", "@apply Optional(Number)(Text)", "@apply Measure(Number)", "Number{foo}",
        "(a: Number, a: Text)", "Void", "@apply Type(Number)", "@apply Unit{m}"};

    static final String[][] VALUES = {
        {"Number", "0"}, {"Number", "-12.50"}, {"Number", "1e3"}, {"Number", "123456789012345678901234567890.123456789"}, {"Number", "abc"},
        {"Number{m}", "3.14159"}, {"Text", "\"hello\""}, {"Text", "\"with ^q quote and ^n newline\""}, {"Text", "unquoted"},
        {"Boolean", "true"}, {"Boolean", "FALSE"}, {"Date", "2023-02-28"}, {"Date", "2023-02-30"}, {"DateYM", "1999-12"},
        {"Time", "13:45:07.123"}, {"Time", "1:2"}, {"DateTime", "2001-01-01 00:00:00"}, {"DateTimeZoned", "2001-06-01 12:00 Europe/London"},
        {"DateTimeZoned", "2001-06-01 12:00 +05:30"}, {"[Number]", "[1, 2, 3]"}, {"[Number]", "[]"}, {"[[Text]]", "[[\"a\"], [], [\"b\", \"c\"]]"},
        {"(a: Number, b: Text)", "(b: \"x\", a: 5)"}, {"(a: Number, b: Text)", "(a: 5)"}, {"Colour", "Red"}, {"Colour", "Custom(4)"}, {"Colour", "Purple"},
        {"@apply Optional(Number)", "None"}, {"@apply Optional(Number)", "Is(7)"}, {"@apply Pair(Number)(Text)", "Pair((first: Is(1), second: \"two\"))"},
        {"@apply Measure{m}", "Measured(2.5)"}, {"@apply Tree(Boolean)", "Many([Leaf, Node(true), Many([])])"}, {"Multi Word Name", "\"Odd Tag\""}, {"Multi Word Name", "Normal"}, {"@apply Mango(Text)", "Is"}, {"@apply Mango(Text)", "Fruit(\"apple\")"},
        {"Shape", "Rect((height: 2, width: 3))"}, {"[(a: Colour, b: @apply Optional(Shape))]", "[(a: Blue, b: Is(Circle((radius: 1))))]"},
        {"Number", "@INVALID \"bad\""}, {"[Number]", "[1, @INVALID \"x\"]"},
    };

    static final String[][] FLEXIBLE = {
        {"YEARMONTHDAY", "2023-02-28"}, {"YEARMONTHDAY", "28/02/2023"}, {"YEARMONTHDAY", "02/28/2023"}, {"YEARMONTHDAY", "1/2/2003"},
        {"YEARMONTHDAY", "3 March 1999"}, {"YEARMONTHDAY", "March 3 1999 and more"}, {"YEARMONTHDAY", "  2001 Jan 5"}, {"YEARMONTHDAY", "12/13/14"},
        {"YEARMONTHDAY", "not a date"}, {"YEARMONTH", "03/1999"}, {"YEARMONTH", "Mar 99"}, {"YEARMONTH", "1999-03"}, {"TIMEOFDAY", "13:45"},
        {"TIMEOFDAY", "1:45 PM"}, {"TIMEOFDAY", "1:45:30.5pm"}, {"TIMEOFDAY", "25:00"}, {"DATETIME", "2001-02-03 04:05:06"},
        {"DATETIME", "3 Feb 2001 4:05 AM"}, {"DATETIME", "2001-02-03T04:05"}, {"DATETIMEZONED", "2001-02-03 04:05 Europe/Paris"},
        {"DATETIMEZONED", "2001-02-03 04:05 UTC"}, {"DATETIMEZONED", "2001-02-03 04:05 EST"}, {"DATETIMEZONED", "2001-02-03 04:05+01:00[Europe/Paris]"},
        {"DATETIMEZONED", "2001-02-03 04:05"},
    };

    static UnitManager mgr;

    public static void main(String[] args) throws Throwable
    {
        mgr = new UnitManager();
        // The fixed inputs that the test reads back:
        out("script", "USER_UNITS", () -> USER_UNITS);
        out("script", "TYPE_DECLS", () -> TYPE_DECLS);
        units();
        unitManager();
        unitExps();
        typeExps();
        types();
        values();
        flexible();
        outputBuilder();
    }

    static void units()
    {
        for (String u : UNITS)
        {
            out("unit", u, () -> {
                Unit unit = mgr.loadUse(u);
                Unit m = mgr.loadUse("m");
                Optional<org.sosy_lab.common.rationals.Rational> scale = unit.canScaleTo(m, mgr);
                return unit + " ; " + unit.forDisplay() + " ; " + unit.getDisplayPrefix() + " ; " + unit.getDisplaySuffix()
                    + " ; " + mgr.canonicalise(unit) + " ; " + unit.reciprocal() + " ; " + unit.raisedTo(3) + " ; " + (scale.isPresent() ? scale.get() : "empty")
                    + " ; " + unit.hashCode();
            });
        }
    }

    static void unitManager() throws Throwable
    {
        out("allDeclared", "", () -> mgr.getAllDeclared().stream().map(s -> s.getName()).collect(Collectors.joining(" ")));
        out("allBuiltIn", "", () -> String.join(" ", mgr.getAllBuiltIn().keySet()));
        for (String u : new String[] {"m", "inch", "acre", "N", "foo", "l", "year", "kg", "MHz"})
            out("canonicalBase", u, () -> mgr.getCanonicalBaseUnit(u));
        UnitManager user = new UnitManager();
        out("loadUser", "", () -> { user.loadUserUnits(USER_UNITS); return "ok"; });
        out("userDeclared", "", () -> String.join(" ", user.getAllUserDeclared().keySet()));
        out("saveAll", "", () -> String.join("\n", user.save()));
        out("saveSome", "gamma zeta", () -> String.join("\n", user.save(u -> u.equals("gamma") || u.equals("zeta"))));
        out("canonGamma", "", () -> user.canonicalise(user.loadUse("(gamma*gg)/wd")));
        for (String u : new String[] {"widget", "gadget", "gamma", "delta", "zeta", "blarg", "beta", "\u00e9t\u00e9", "k_x", "m"})
            out("userUnit", u, () -> { Unit unit = user.loadUse(u); return unit + " ; " + user.canonicalise(unit) + " ; " + unit.getDisplayPrefix() + " ; " + unit.getDisplaySuffix() + " ; " + user.getCanonicalBaseUnit(u); });
        user.removeUserUnit("delta");
        out("saveAfterRemove", "", () -> String.join("\n", user.save()));
        user.clearAllUser();
        out("saveAfterClear", "", () -> String.join("\n", user.save()));
    }

    static UnitExp unitSide(Random r, MutUnitVar[] vars) throws Throwable
    {
        UnitExp u = UnitExp.SCALAR;
        int terms = r.nextInt(4);
        for (int t = 0; t < terms; t++)
        {
            if (r.nextBoolean())
                u = u.times(new UnitExp(vars[r.nextInt(vars.length)]).raisedTo(r.nextInt(7) - 3));
            else
                u = u.times(UnitExp.fromConcrete(mgr.loadUse(BASE_UNITS[r.nextInt(BASE_UNITS.length)])).raisedTo(r.nextInt(7) - 3));
        }
        return u;
    }

    static void unitExps()
    {
        for (int seed = 0; seed < 400; seed++)
        {
            int s = seed;
            out("unitExp", "" + seed, () -> {
                Random r = new Random(s);
                MutUnitVar[] vars = new MutUnitVar[1 + r.nextInt(3)];
                for (int i = 0; i < vars.length; i++)
                    vars[i] = new MutUnitVar();
                UnitExp lhs = unitSide(r, vars);
                UnitExp rhs = unitSide(r, vars);
                String before = norm(lhs) + " = " + norm(rhs);
                UnitExp result = lhs.unifyWith(rhs);
                StringBuilder sb = new StringBuilder(before + " => " + (result == null ? "fail" : norm(result)));
                for (MutUnitVar v : vars)
                    sb.append(" ; ").append(String.valueOf(v.toConcreteUnit()));
                // A second unification against a concrete unit:
                UnitExp second = lhs.unifyWith(UnitExp.fromConcrete(mgr.loadUse("m^2")));
                sb.append(" ; then ").append(second == null ? "fail" : norm(second));
                for (MutUnitVar v : vars)
                    sb.append(" ; ").append(String.valueOf(v.toConcreteUnit()));
                return sb.toString();
            });
        }
    }

    static final String[] FIELDS = {"x", "field", "Total", "aa", "b c"};

    static TypeExp genType(Random r, int depth, MutVar[] vars, MutUnitVar[] unitVars) throws Throwable
    {
        switch (r.nextInt(depth > 0 ? 8 : 4))
        {
            case 0:
                if (r.nextBoolean())
                    return new NumTypeExp(null, new UnitExp(unitVars[r.nextInt(unitVars.length)]));
                else
                    return new NumTypeExp(null, UnitExp.fromConcrete(mgr.loadUse(BASE_UNITS[r.nextInt(3)])));
            case 1:
                return TypeExp.text(null);
            case 2:
                return TypeExp.bool(null);
            case 3:
                return vars[r.nextInt(vars.length)];
            case 4:
                return TypeExp.list(null, genType(r, depth - 1, vars, unitVars));
            case 5:
            {
                LinkedHashMap<String, TypeExp> fields = new LinkedHashMap<>();
                int n = 1 + r.nextInt(3);
                for (int i = 0; i < n; i++)
                    fields.put(FIELDS[r.nextInt(FIELDS.length)], genType(r, depth - 1, vars, unitVars));
                return TypeExp.record(null, fields, r.nextBoolean());
            }
            case 6:
                return new TypeCons(null, "Optional", ImmutableList.of(Either.<UnitExp, TypeExp>right(genType(r, depth - 1, vars, unitVars))), TypeExp.ALL_TYPE_CLASSES);
            default:
                return TypeExp.function(null, ImmutableList.of(genType(r, depth - 1, vars, unitVars)), genType(r, depth - 1, vars, unitVars));
        }
    }

    static String concrete(TypeExp t, TypeManager tm, boolean subst) throws Throwable
    {
        return t.toConcreteType(tm, subst).either(e -> "E:" + norm(e), d -> d.toString());
    }

    static void typeExps() throws Throwable
    {
        TypeManager tm = new TypeManager(new UnitManager());
        for (int seed = 0; seed < 400; seed++)
        {
            int s = seed;
            out("typeExp", "" + seed, () -> {
                Random r = new Random(s);
                MutVar[] vars = {new MutVar(null), new MutVar(null), new MutVar(null)};
                MutUnitVar[] unitVars = {new MutUnitVar(), new MutUnitVar()};
                TypeExp a = genType(r, 2, vars, unitVars);
                TypeExp b = genType(r, 2, vars, unitVars);
                String before = norm(a) + " = " + norm(b);
                if (r.nextInt(3) == 0)
                {
                    TypeExp.TypeError err = a.requireTypeClasses(TypeClassRequirements.require(r.nextBoolean() ? "Comparable" : "Readable", "f"));
                    before += " [tc " + (err == null ? "ok" : norm(err)) + "]";
                }
                Either<TypeExp.TypeError, TypeExp> result = TypeExp.unifyTypes(a, b);
                return before + " => " + result.either(e -> "E:" + norm(e), t -> norm(t))
                    + " ; " + concrete(a, tm, false) + " ; " + concrete(b, tm, true)
                    + " ; " + norm(vars[0]) + " ; " + norm(vars[1]);
            });
        }
    }

    static void types() throws Throwable
    {
        TypeManager tm = new TypeManager(new UnitManager());
        out("typeDecls", "", () -> { tm.loadTypeDecls(TYPE_DECLS); return "ok"; });
        out("knownTypes", "", () -> tm.getKnownTaggedTypes().keySet().stream().map(t -> t.getRaw()).collect(Collectors.joining(" ")));
        out("userTypes", "", () -> tm.getUserTaggedTypes().keySet().stream().map(t -> t.getRaw()).collect(Collectors.joining(" ")));
        out("saveTypes", "", () -> String.join("\n", tm.save()));
        for (String tag : new String[] {"Red", "Is", "None", "Pair", "Node", "Leaf", "Unknown", "Odd Tag", "Type", "Wrap", "Stripe", "Plain"})
        {
            out("lookupTag", tag, () -> tm.lookupTag(null, tag).either(e -> "E:" + e, ti -> ti.getTypeName() + " " + ti.tagIndex + " " + ti.getTagInfo().getName() + " " + (ti.getTagInfo().getInner() != null)));
            out("lookupTagIn", tag, () -> tm.lookupTag("Colour", tag).either(e -> "E:" + e, ti -> ti.getTypeName() + " " + ti.tagIndex));
            out("ambiguous", tag, () -> tm.ambiguousTagName(tag));
        }
        for (String use : TYPE_USES)
        {
            out("typeUse", use, () -> {
                DataType dt = tm.loadTypeUse(use);
                OutputBuilder b = new OutputBuilder();
                dt.save(b);
                OutputBuilder bj = new OutputBuilder();
                JellyType.fromConcrete(dt).save(bj);
                String def;
                try
                {
                    Object v = DataTypeUtility.makeDefaultValue(dt);
                    def = DataTypeUtility.valueToString(v) + " ; " + DataTypeUtility.valueToString(v, dt, false, null);
                }
                catch (Throwable t)
                {
                    def = "!" + t.getClass().getSimpleName() + ": " + t.getMessage();
                }
                return dt + " ; " + dt.toDisplay(false) + " ; " + b + " ; " + bj + " ; " + norm(TypeExp.fromDataType(null, dt)) + " ; " + def + " ; " + dt.hashCode();
            });
            out("jellyParse", use, () -> {
                JellyType jt = JellyType.parse(use, tm);
                OutputBuilder b = new OutputBuilder();
                jt.save(b);
                String dt;
                try
                {
                    dt = jt.makeDataType(ImmutableMap.of(), tm).toString();
                }
                catch (Throwable t)
                {
                    dt = "!" + t.getClass().getSimpleName() + ": " + t.getMessage();
                }
                return b + " ; " + dt;
            });
        }
    }

    static void values() throws Throwable
    {
        TypeManager tm = new TypeManager(new UnitManager());
        tm.loadTypeDecls(TYPE_DECLS);
        for (String[] tv : VALUES)
        {
            out("value", tv[0] + " := " + tv[1], () -> {
                DataType dt = tm.loadTypeUse(tv[0]);
                Either<String, Object> loaded = dt.loadSingleItem(tv[1]);
                return loaded.either(l -> "L:" + l, v -> {
                    try
                    {
                        OutputBuilder b = new OutputBuilder();
                        b.dataValue(dt, v);
                        return DataTypeUtility.valueToString(v) + " ; " + DataTypeUtility.valueToString(v, dt, false, null) + " ; " + b + " ; " + DataTypeUtility._test_valueToString(v);
                    }
                    catch (Throwable t)
                    {
                        return "!" + t.getClass().getSimpleName() + ": " + t.getMessage();
                    }
                });
            });
        }
    }

    static void flexible()
    {
        for (String[] f : FLEXIBLE)
        {
            out("flexible", f[0] + " " + f[1], () -> {
                StringView sv = new StringView(f[1]);
                Object t = DataTypeUtility.parseTemporalFlexible(new DateTimeInfo(DateTimeType.valueOf(f[0])), sv);
                return t + " @" + sv.getPosition();
            });
        }
    }

    static void outputBuilder()
    {
        for (double d : new double[] {0, -0.0, 1.5, 0.15, 2.5e-7, 1234567.891234567, -3.0000005, 1e20, 123.4564999, Double.NaN, Double.POSITIVE_INFINITY})
            out("d", "" + d, () -> new OutputBuilder().d(d).toString());
        for (String s : new String[] {"simple", "with space", "Number", "@BEGIN", "a\"b", "", "x^y", "true", "tab\there"})
        {
            out("id", s, () -> {
                OutputBuilder b = new OutputBuilder();
                for (QuoteBehaviour q : QuoteBehaviour.values())
                    b.id(s, q);
                b.s(s);
                b.nl();
                b.raw("next").unit("m/s").n(42).kw("@END");
                return b.toString() + " ; " + String.join(",", b.toLines());
            });
        }
    }
}
