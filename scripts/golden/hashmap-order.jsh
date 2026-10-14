// Golden values generated on the JVM by:
//   jshell -q scripts/golden/hashmap-order.jsh > test/engine/java/golden/hashmap-order.txt   (Java 21)
// Each line is: initialCapacity|space-separated operations|iteration order, where the
// operations are +key put, *key merge, ?key computeIfAbsent and -key remove
import java.util.*;
StringBuilder sb = new StringBuilder();
Random r = new Random(1234);
String[] words = {"Optional", "Boolean", "Number", "Text", "Date", "Time", "None", "Is", "a", "b", "c", "x", "y", "z", "m", "s", "kg", "inch", "foot", "USD", "GBP", "EUR", "Maybe", "Either", "Left", "Right", "Pair", "Unit", "Type", "Column", "Table"};
for (int t = 0; t < 200; t++) {
    int initial = t % 5 == 0 ? r.nextInt(40) : 16;
    HashMap<String, Integer> m = new HashMap<>(initial);
    List<String> ops = new ArrayList<>();
    int n = r.nextInt(t % 3 == 0 ? 120 : 60);
    for (int i = 0; i < n; i++) {
        String k = r.nextInt(3) == 0 ? words[r.nextInt(words.length)] : ("k" + r.nextInt(100));
        int op = r.nextInt(8);
        if (op == 0 && !m.isEmpty()) {
            ops.add("-" + k);
            m.remove(k);
        } else if (op == 1 && t % 2 == 1) {
            ops.add("*" + k);
            m.merge(k, i, (a, b) -> a + b);
        } else if (op == 2 && t % 2 == 1) {
            ops.add("?" + k);
            final int v = i;
            m.computeIfAbsent(k, kk -> v);
        } else {
            ops.add("+" + k);
            m.put(k, i);
        }
    }
    sb.append(initial).append("|").append(String.join(" ", ops)).append("|").append(String.join(" ", m.keySet())).append("\n");
}
System.out.print(sb);
/exit
