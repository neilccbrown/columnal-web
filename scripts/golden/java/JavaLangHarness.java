// Golden values for the java.lang / java.util behaviour that src/engine/java reproduces.
// Run by scripts/golden/java-lang.sh.  Strings are printed as JSON-style escaped literals.
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;

public class JavaLangHarness
{
    static String esc(String s)
    {
        if (s == null)
            return "null";
        StringBuilder b = new StringBuilder("\"");
        for (char c : s.toCharArray())
            b.append(c >= 0x20 && c < 0x7f && c != '"' && c != '\\' ? String.valueOf(c) : String.format("\\u%04x", (int) c));
        return b.append('"').toString();
    }

    static String list(String[] items)
    {
        StringJoiner j = new StringJoiner(",", "[", "]");
        for (String s : items)
            j.add(esc(s));
        return j.toString();
    }

    interface Op { Object run() throws Exception; }

    static String run(Op op)
    {
        try { Object o = op.run(); return o instanceof String s ? esc(s) : String.valueOf(o); }
        catch (Exception e) { return "ERR " + e.getClass().getSimpleName(); }
    }

    // Prints the ranges of code points (in [0, 0x10FFFF]) for which the predicate holds
    interface CodePointTest { boolean test(int cp); }
    static void ranges(String name, CodePointTest t)
    {
        StringBuilder b = new StringBuilder("ranges " + name + " =");
        int start = -1;
        for (int cp = 0; cp <= 0x110000; cp++)
        {
            boolean v = cp <= 0x10FFFF && t.test(cp);
            if (v && start < 0) start = cp;
            if (!v && start >= 0) { b.append(" ").append(Integer.toHexString(start)).append("-").append(Integer.toHexString(cp - 1)); start = -1; }
        }
        System.out.println(b);
    }

    public static void main(String[] args) throws Exception
    {
        String[] splitInputs = {"", "a", "a\nb", "a\nb\n\n", "\na\n", "a\r\nb\r\n", ":a:b::", "::", "a::b", "abc"};
        String[] regexes = {"\\r?\\n", ":", ":+", "", "b"};
        for (String in : splitInputs)
            for (String re : regexes)
                System.out.println("split " + esc(in) + " " + esc(re) + " = " + list(in.split(re)));

        Random r = new Random(99);
        List<Double> doubles = new ArrayList<>(List.of(0.0, -0.0, 1.0, -2.0, 0.1, 0.001, 0.0009999, 1e7, 9999999.0, 1e-3, 123456.789, 1e21, 1e22, 1.5e-7, Double.MIN_VALUE, Double.MAX_VALUE, Double.NaN, Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 100.0, 1234567.0, 12345678.0, 3.14159));
        for (int i = 0; i < 60; i++)
            doubles.add(Double.longBitsToDouble(r.nextLong()));
        for (int i = 0; i < 40; i++)
            doubles.add(r.nextDouble() * Math.pow(10, r.nextInt(30) - 15));
        for (double d : doubles)
            System.out.println("doubleToString " + Long.toHexString(Double.doubleToRawLongBits(d)) + " = " + esc(Double.toString(d)));

        String[] doubleStrings = {"1", "1.5", " 2.5 ", "1e3", "1E-3", "1.5f", "2d", "NaN", "-Infinity", "+Infinity", "0x1p3", "0x1.8p1", "-0x.8p0", "0x1p", "", "abc", "1,5", ".5", "5.", "1e", "0x10", "١", "\t3\n", "1_000", "Infinityf"};
        for (String s : doubleStrings)
            System.out.println("parseDouble " + esc(s) + " = " + run(() -> Double.toString(Double.parseDouble(s))));

        String[] longStrings = {"0", "-0", "+5", "007", "9223372036854775807", "-9223372036854775808", "9223372036854775808", "", "-", "1 ", " 1", "1.0", "١٢", "１２", "0x10"};
        for (String s : longStrings)
            System.out.println("parseLong " + esc(s) + " = " + run(() -> Long.parseLong(s)));
        String[] intStrings = {"7f", "FF", "-80000000", "80000000", "7fffffff", "Ａ", "g", "+1a", ""};
        for (String s : intStrings)
            System.out.println("parseIntHex " + esc(s) + " = " + run(() -> Integer.parseInt(s, 16)));

        String[] trimInputs = {"", "  a  ", "\u0001a\u0001", " a ", " a", "\n\t a \r\n", " "};
        for (String s : trimInputs)
            System.out.println("trim " + esc(s) + " = " + esc(s.trim()));

        String[][] regionInputs = {{"Hello", "hELLO"}, {"straße", "STRASSE"}, {"İ", "i"}, {"ı", "I"}, {"abc", "abd"}, {"Σ", "ς"}};
        for (String[] p : regionInputs)
            System.out.println("regionMatchesIC " + esc(p[0]) + " " + esc(p[1]) + " = " + p[0].regionMatches(true, 0, p[1], 0, Math.min(p[0].length(), p[1].length())));

        // Simple (one-to-one) case mappings of every BMP char that changes:
        StringBuilder upper = new StringBuilder("caseUpper =");
        StringBuilder lower = new StringBuilder("caseLower =");
        for (char c = 0; c < 0xFFFF; c++)
        {
            if (Character.toUpperCase(c) != c)
                upper.append(" ").append(Integer.toHexString(c)).append(":").append(Integer.toHexString(Character.toUpperCase(c)));
            if (Character.toLowerCase(c) != c)
                lower.append(" ").append(Integer.toHexString(c)).append(":").append(Integer.toHexString(Character.toLowerCase(c)));
        }
        System.out.println(upper);
        System.out.println(lower);

        ranges("isWhitespace", Character::isWhitespace);
        ranges("isLetter", Character::isLetter);
        ranges("isDigit", Character::isDigit);
        ranges("isAlphabetic", Character::isAlphabetic);
        ranges("isDefined", Character::isDefined);
        ranges("isOtherLetter", cp -> Character.getType(cp) == Character.OTHER_LETTER);

        for (String file : args)
        {
            Properties p = new Properties();
            try (Reader reader = Files.newBufferedReader(Paths.get(file), StandardCharsets.UTF_8))
            {
                p.load(reader);
            }
            TreeMap<String, String> sorted = new TreeMap<>();
            for (String k : p.stringPropertyNames())
                sorted.put(k, p.getProperty(k));
            for (Map.Entry<String, String> e : sorted.entrySet())
                System.out.println("property " + Paths.get(file).getFileName() + " " + esc(e.getKey()) + " = " + esc(e.getValue()));
        }
    }
}
