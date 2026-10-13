// Golden values generated on the JVM by: jshell -q scripts/golden/biginteger.jsh   (Java 21)
// new BigInteger(numBits, Random) is what junit-quickcheck's SourceOfRandomness.nextBigInteger uses.
import java.math.BigInteger;
import java.util.*;
StringBuilder sb = new StringBuilder();
for (long seed : new long[]{42L, -7L}) {
    Random r = new Random(seed);
    List<Object> out = new ArrayList<>();
    for (int bits : new int[]{1, 7, 8, 9, 31, 64, 65, 100, 0})
        out.add(new BigInteger(bits, r));
    sb.append("seed " + seed + " = " + out + "\n");
}
System.out.print(sb);
/exit
