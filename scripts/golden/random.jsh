// Golden values generated on the JVM by: jshell -q scripts/golden/random.jsh   (Java 21)
import java.util.*;
StringBuilder sb = new StringBuilder();
void line(String name, Object v) { sb.append(name).append(" = ").append(v).append("\n"); }
for (long seed : new long[]{42L, 0L, -123456789012345L, Long.MIN_VALUE, Long.MAX_VALUE}) {
    Random r = new Random(seed);
    List<Object> out = new ArrayList<>();
    for (int i = 0; i < 3; i++) out.add(r.nextInt());
    for (int i = 0; i < 5; i++) out.add(r.nextInt(10));
    for (int i = 0; i < 3; i++) out.add(r.nextInt(1 << 20));
    for (int i = 0; i < 3; i++) out.add(r.nextInt(1_000_000_007));
    for (int i = 0; i < 3; i++) out.add(r.nextLong());
    for (int i = 0; i < 5; i++) out.add(r.nextBoolean());
    for (int i = 0; i < 3; i++) out.add(r.nextDouble());
    for (int i = 0; i < 3; i++) out.add(r.nextFloat());
    for (int i = 0; i < 5; i++) out.add(r.nextInt(5, 17));
    for (int i = 0; i < 3; i++) out.add(r.nextInt(-8, 8));
    for (int i = 0; i < 3; i++) out.add(r.nextInt(Integer.MIN_VALUE, Integer.MAX_VALUE));
    for (int i = 0; i < 3; i++) out.add(r.nextInt(-5, 1_000_000_007));
    for (int i = 0; i < 4; i++) out.add(r.nextGaussian());
    byte[] bytes = new byte[11]; r.nextBytes(bytes); out.add(Arrays.toString(bytes));
    line("seed " + seed, out);
}
System.out.print(sb);
/exit
