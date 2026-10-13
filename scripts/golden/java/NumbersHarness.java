// Golden-value harness for Columnal's number utilities.  The Utility methods are extracted from
// the ORIGINAL Utility.java by scripts/golden/numbers.sh and pasted in at "EXTRACTED" below.
import java.math.*;
import java.util.*;

public class NumbersHarness
{
    interface Op { Object run() throws Exception; }

    static String show(Object o)
    {
        if (o instanceof BigDecimal b)
            return b.signum() == 0 ? "0" : b.stripTrailingZeros().toPlainString();
        return String.valueOf(o);
    }

    static String run(Op op)
    {
        try { return show(op.run()); }
        catch (Exception e) { return "ERR " + e.getClass().getSimpleName() + ": " + e.getMessage(); }
    }

    static String esc(String s)
    {
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray())
            b.append(c >= 0x20 && c < 0x7f && c != '"' && c != '\\' ? String.valueOf(c) : String.format("\\u%04x", (int) c));
        return b.append('"').toString();
    }

    static String randomDigits(Random r, int n)
    {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < n; i++)
            b.append((char)('0' + r.nextInt(10)));
        return b.toString();
    }

    public static void main(String[] args) throws Exception
    {
        Random r = new Random(1234);
        List<String> strings = new ArrayList<>(List.of(
            "0", "-0", "0.000", "1", "-1", "1.50", ".5", "5.", "+3", "007", "1e5", "1E-5", "2.5e+3", "-0.0001",
            "9223372036854775807", "-9223372036854775808", "9223372036854775808", "-9223372036854775809",
            "123456789012345678901234567890123456789", "0.1234567890123456789012345678901234567890",
            "1e400", "1e-400", "99999999999999999999999999999999995", "1.0000000000000000000000000000000005",
            "abc", "", " 1", "1 ", "0x10", "Infinity", "NaN", "1e", "--1", "1.2.3", "1,000", "١٢", "+", "-", "e5", ".e5"));
        for (int i = 0; i < 120; i++)
        {
            switch (r.nextInt(5))
            {
                case 0 -> strings.add(Integer.toString(r.nextInt(201) - 100));
                case 1 -> strings.add(Long.toString(r.nextLong()));
                case 2 -> strings.add((r.nextBoolean() ? "-" : "") + randomDigits(r, 1 + r.nextInt(40)));
                case 3 -> {
                    String digits = randomDigits(r, 1 + r.nextInt(40));
                    int point = r.nextInt(digits.length() + 1);
                    strings.add((r.nextBoolean() ? "-" : "") + digits.substring(0, point) + "." + digits.substring(point) + (point == 0 && digits.isEmpty() ? "0" : ""));
                }
                default -> strings.add(randomDigits(r, 1 + r.nextInt(20)) + "e" + (r.nextInt(81) - 40));
            }
        }

        List<Number> numbers = new ArrayList<>();
        for (String s : strings)
        {
            System.out.println("parse " + esc(s) + " = " + run(() -> Utility.parseNumberOpt(s).<Object>map(x -> x).orElse("EMPTY")));
            Utility.parseNumberOpt(s).ifPresent(numbers::add);
        }

        // Exponents for raise: plain integers and non-integers only (see NumbersHarness notes in numbers.sh)
        List<Number> exponents = new ArrayList<>();
        for (String s : List.of("0", "1", "2", "3", "-1", "-2", "5", "17", "-7", "999", "-999", "1000", "-1000", "100000", "0.5", "1.5", "-0.5", "2.25", "0.3333"))
            exponents.add(Utility.parseNumberOpt(s).get());

        for (int i = 0; i < 400; i++)
        {
            Number a = numbers.get(r.nextInt(numbers.size()));
            Number b = numbers.get(r.nextInt(numbers.size()));
            String sa = show(a), sb = show(b);
            System.out.println("add " + sa + " " + sb + " = " + run(() -> Utility.addSubtractNumbers(a, b, true)));
            System.out.println("subtract " + sa + " " + sb + " = " + run(() -> Utility.addSubtractNumbers(a, b, false)));
            System.out.println("multiply " + sa + " " + sb + " = " + run(() -> Utility.multiplyNumbers(a, b)));
            System.out.println("divide " + sa + " " + sb + " = " + run(() -> Utility.divideNumbers(a, b)));
            System.out.println("compare " + sa + " " + sb + " = " + run(() -> Utility.compareNumbers(a, b)));
            Number e = exponents.get(r.nextInt(exponents.size()));
            Number small = Utility.parseNumberOpt(Integer.toString(r.nextInt(21) - 10)).get();
            Number base = r.nextBoolean() ? a : small;
            System.out.println("raise " + show(base) + " " + show(e) + " = " + run(() -> Utility.raiseNumber(base, e)));
        }
        // Division by zero and integer division:
        for (String[] p : new String[][] {{"1", "0"}, {"0", "0"}, {"1.5", "0"}, {"7", "2"}, {"-7", "2"}, {"6", "3"}, {"-9223372036854775808", "-1"}, {"1", "3"}, {"2", "3"}, {"-1", "3"}})
        {
            Number a = Utility.parseNumberOpt(p[0]).get(), b = Utility.parseNumberOpt(p[1]).get();
            System.out.println("divide " + p[0] + " " + p[1] + " = " + run(() -> Utility.divideNumbers(a, b)));
        }
        for (Number n : numbers)
        {
            String sn = show(n);
            System.out.println("negate " + sn + " = " + run(() -> Utility.negate(n)));
            System.out.println("integerPart " + sn + " = " + run(() -> Utility.getIntegerPart(n)));
            System.out.println("fracPart " + sn + " 3 = " + run(() -> Utility.getFracPart(n, 3)));
            System.out.println("isIntegral " + sn + " = " + run(() -> Utility.isIntegral(n)));
            for (int[] dp : new int[][] {{0, 1}, {0, 5}, {2, 4}, {3, 3}, {0, -1}, {10, 40}})
                System.out.println("fracPartAsString " + sn + " " + dp[0] + " " + dp[1] + " = " + run(() -> Utility.getFracPartAsString(n, dp[0], dp[1])));
        }
        // Epsilon comparisons (including the RELATIVE behaviour):
        for (String[] p : new String[][] {{"1", "1.0005"}, {"1", "2"}, {"100", "100.1"}, {"-5", "5"}, {"0", "0.0001"}, {"5", "-5"}, {"3", "3"}})
        {
            Number a = Utility.parseNumberOpt(p[0]).get(), b = Utility.parseNumberOpt(p[1]).get();
            for (Utility.EpsilonType t : Utility.EpsilonType.values())
                for (String eps : List.of("0.001", "0.5"))
                    System.out.println("compareEpsilon " + p[0] + " " + p[1] + " " + t + " " + eps + " = " + run(() -> Utility.compareNumbers(a, b, new Pair<>(t, new BigDecimal(eps)))));
        }
    }
}

// Stand-ins for the types the extracted methods use (the launcher needs the main class first):
class UserException extends Exception { UserException(String m) { super(m); } }
class InternalException extends Exception { InternalException(String m) { super(m); } }
interface FunctionInt<T, R> { R apply(T t) throws InternalException; }
record Pair<A, B>(A first, B second) { A getFirst() { return first; } B getSecond() { return second; } }

class Utility
{
    //EXTRACTED
}

