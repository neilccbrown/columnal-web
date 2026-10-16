// Golden values for the expressions and functions modules: runs the ORIGINAL Columnal classes
// (built by scripts/golden/build-columnal-jvm.sh) and prints one line per case:
//   section|input|output
// where an exception is shown as "!SimpleClassName: message".  Run by scripts/golden/functions.sh;
// test/engine/functions/FunctionsGolden.test.ts replays each case, in order, with the port.
//  - "log", "log2", "log10": big-math's BigDecimalMath with MathContext.DECIMAL128, on fixed and
//    random inputs.  They run first, in a fresh JVM, as big-math caches log(2), log(3) and log(10).
//  - "expr": each expression in functions-cases.txt, then random arithmetic: parsed, saved,
//    type checked and evaluated.
package golden;

import ch.obermuhlner.math.big.BigDecimalMath;
import xyz.columnal.data.datatype.DataTypeUtility;
import xyz.columnal.data.datatype.TypeManager;
import xyz.columnal.data.unit.UnitManager;
import xyz.columnal.grammar.Versions.ExpressionVersion;
import xyz.columnal.id.ColumnId;
import xyz.columnal.id.TableAndColumnRenames;
import xyz.columnal.id.TableId;
import xyz.columnal.styled.StyledString;
import xyz.columnal.transformations.expression.BracketedStatus;
import xyz.columnal.transformations.expression.ErrorAndTypeRecorderStorer;
import xyz.columnal.transformations.expression.EvaluateState;
import xyz.columnal.transformations.expression.Expression;
import xyz.columnal.transformations.expression.Expression.ColumnLookup;
import xyz.columnal.transformations.expression.Expression.SaveDestination;
import xyz.columnal.transformations.expression.ExpressionUtil;
import xyz.columnal.transformations.expression.TypeState;
import xyz.columnal.transformations.expression.function.FunctionLookup;
import xyz.columnal.transformations.function.FunctionList;
import xyz.columnal.typeExp.TypeExp;
import xyz.columnal.utility.adt.Pair;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.MathContext;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class FunctionsHarness
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

    // The log inputs: fixed ones, then random ones (unscaled value and scale from java.util.Random)
    static List<BigDecimal> logInputs()
    {
        List<BigDecimal> inputs = new ArrayList<>();
        for (String s : new String[] {"1", "2", "3", "10", "0.5", "100", "1000", "7", "9.99", "10.01", "0.0001", "0.01", "0.1", "0.115", "0.14", "0.2", "0.3", "0.42", "0.7", "1.4", "2.5", "3.5", "5", "8.5", "1E-10", "1E+20", "1.000000001", "0.999999999", "123456789.123456789", "2.718281828459045235360287471352662", "0", "-1"})
            inputs.add(new BigDecimal(s));
        Random r = new Random(4711);
        for (int i = 0; i < 300; i++)
        {
            BigInteger unscaled = BigInteger.valueOf(r.nextLong()).abs().add(BigInteger.ONE);
            int scale = r.nextInt(60) - 25;
            inputs.add(new BigDecimal(unscaled, scale));
        }
        return inputs;
    }

    // Random arithmetic: numbers of up to 7 decimal places, and the operators + - * / ^
    static String makeNum(Random r)
    {
        if (r.nextBoolean())
            return Integer.toString(r.nextInt(2001) - 1000);
        else
            return BigDecimal.valueOf(r.nextInt(2000001) - 1000000, r.nextInt(8)).toPlainString();
    }

    static String makeExpr(Random r, int depth)
    {
        if (depth == 0 || r.nextInt(3) == 0)
        {
            String n = makeNum(r);
            return n.startsWith("-") ? "(" + n + ")" : n;
        }
        switch (r.nextInt(5))
        {
            case 0: return "(" + makeExpr(r, depth - 1) + " + " + makeExpr(r, depth - 1) + ")";
            case 1: return "(" + makeExpr(r, depth - 1) + " - " + makeExpr(r, depth - 1) + ")";
            case 2: return "(" + makeExpr(r, depth - 1) + " * " + makeExpr(r, depth - 1) + ")";
            case 3: return "(" + makeExpr(r, depth - 1) + " / " + makeExpr(r, depth - 1) + ")";
            default: return "(" + makeExpr(r, depth - 1) + " ^ " + (r.nextInt(9) - 4) + ")";
        }
    }

    public static void main(String[] args) throws Throwable
    {
        for (BigDecimal x : logInputs())
        {
            out("log", x.toString(), () -> BigDecimalMath.log(x, MathContext.DECIMAL128));
            out("log2", x.toString(), () -> BigDecimalMath.log2(x, MathContext.DECIMAL128));
            out("log10", x.toString(), () -> BigDecimalMath.log10(x, MathContext.DECIMAL128));
        }

        UnitManager unitManager = new UnitManager();
        TypeManager typeManager = new TypeManager(unitManager);
        FunctionLookup functionLookup = FunctionList.getFunctionLookup(unitManager);
        ColumnLookup columnLookup = new ColumnLookup()
        {
            @Override
            public FoundColumn getColumn(Expression expression, TableId tableId, ColumnId columnId)
            {
                return null;
            }

            @Override
            public FoundTable getTable(TableId tableName)
            {
                return null;
            }

            @Override
            public Stream<Pair<TableId, ColumnId>> getAvailableColumnReferences()
            {
                return Stream.empty();
            }

            @Override
            public Stream<TableId> getAvailableTableReferences()
            {
                return Stream.empty();
            }

            @Override
            public Stream<ClickedReference> getPossibleColumnReferences(TableId tableId, ColumnId columnId)
            {
                return Stream.empty();
            }
        };

        List<String> expressions = new ArrayList<>();
        for (String line : Files.readAllLines(Paths.get(args[0]), StandardCharsets.UTF_8))
        {
            if (!line.isEmpty() && !line.startsWith("#"))
                expressions.add(line);
        }
        Random r = new Random(1789);
        for (int i = 0; i < 400; i++)
            expressions.add(makeExpr(r, 1 + r.nextInt(4)));

        for (String src : expressions)
        {
            out("expr", src, () -> {
                Expression expression = ExpressionUtil.parse(null, src, ExpressionVersion.latest(), typeManager, functionLookup);
                String saved = expression.save(SaveDestination.TO_FILE, BracketedStatus.DONT_NEED_BRACKETS, TableAndColumnRenames.EMPTY);
                ErrorAndTypeRecorderStorer errors = new ErrorAndTypeRecorderStorer();
                TypeExp typeExp = expression.checkExpression(columnLookup, TypeState.withRowNumber(typeManager, functionLookup), errors);
                String errorText = errors.getAllErrors().map(StyledString::toPlain).collect(Collectors.joining(" / "));
                if (typeExp == null)
                    return saved + " :: !" + errorText;
                String type = typeExp.toConcreteType(typeManager).either(e -> "!" + e.getErrorText().toPlain(), t -> t.toString());
                String value;
                try
                {
                    value = DataTypeUtility.valueToString(expression.calculateValue(new EvaluateState(typeManager, OptionalInt.empty())).value);
                }
                catch (Throwable t)
                {
                    value = "!" + t.getClass().getSimpleName() + ": " + t.getMessage();
                }
                return saved + " :: " + type + (errorText.isEmpty() ? "" : " (" + errorText + ")") + " = " + value;
            });
        }
    }
}
