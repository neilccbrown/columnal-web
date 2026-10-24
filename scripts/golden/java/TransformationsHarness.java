// Golden files for the transformations: loads each saved file input-*.rec in the given directory
// (test/engine/transformations/golden, written by the port; see scripts/golden/transformations.sh)
// into the ORIGINAL TableManager with the original TransformationManager (built by
// build-columnal-jvm.sh), saves it again, and writes the result to java-*.rec if it differs from
// the input (and, if so, loads and saves that, as java2-*.rec if it differs again).  It also writes the contents of every table to java-*.txt, in the format of
// dumpTables in test/engine/transformations/TransformationsGolden.test.ts, which checks that
// the port does the same.
package golden;

import com.google.common.collect.ImmutableMap;
import xyz.columnal.data.Column;
import xyz.columnal.data.Table;
import xyz.columnal.data.Table.FullSaver;
import xyz.columnal.data.TableManager;
import xyz.columnal.data.datatype.DataTypeUtility;
import xyz.columnal.transformations.RTransformation;
import xyz.columnal.transformations.TransformationManager;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class TransformationsHarness
{
    private static final int MAX_ROWS = 20;

    public static void main(String[] args) throws Exception
    {
        Path dir = Path.of(args[0]);
        List<Path> inputs;
        try (Stream<Path> files = Files.list(dir))
        {
            inputs = files.filter(p -> p.getFileName().toString().matches("input-.*\\.rec")).sorted().collect(Collectors.toList());
        }
        for (Path input : inputs)
        {
            TableManager mgr = new TableManager(TransformationManager.getInstance(), onError -> ImmutableMap.of());
            String inputSrc = Files.readString(input, StandardCharsets.UTF_8);
            mgr.loadAll(inputSrc, w -> {});
            FullSaver saver = new FullSaver(null);
            mgr.save(null, saver);
            String output = saver.getCompleteFile();
            Path javaFile = dir.resolve(input.getFileName().toString().replace("input-", "java-"));
            Files.deleteIfExists(javaFile);
            Path java2File = dir.resolve(input.getFileName().toString().replace("input-", "java2-"));
            Files.deleteIfExists(java2File);
            if (!output.equals(inputSrc))
            {
                Files.writeString(javaFile, output, StandardCharsets.UTF_8);
                // Java does not always save its own output unchanged (for example, a column reference
                // in an aggregate can alternate between having its table name and not), so load and save
                // that too, writing java2-*.rec if it differs:
                TableManager mgr2 = new TableManager(TransformationManager.getInstance(), onError -> ImmutableMap.of());
                mgr2.loadAll(output, w -> {});
                FullSaver saver2 = new FullSaver(null);
                mgr2.save(null, saver2);
                if (!saver2.getCompleteFile().equals(output))
                    Files.writeString(java2File, saver2.getCompleteFile(), StandardCharsets.UTF_8);
            }
            Files.writeString(dir.resolve(input.getFileName().toString().replace("input-", "java-").replace(".rec", ".txt")), dumpTables(mgr), StandardCharsets.UTF_8);
        }
        System.out.println(inputs.size() + " files");
    }

    private static String err(Throwable e)
    {
        return "!" + e.getClass().getSimpleName() + ": " + e.getMessage();
    }

    private static String dumpTables(TableManager mgr)
    {
        StringBuilder out = new StringBuilder();
        // (Sorted, as the order of getAllTables is an identity hash order)
        for (Table table : mgr.getAllTables().stream().sorted(java.util.Comparator.comparing(Table::getId)).collect(Collectors.toList()))
        {
            out.append("TABLE ").append(table.getId().getRaw()).append("\n");
            if (table instanceof RTransformation)
            {
                out.append("(R not run)\n");
                continue;
            }
            List<Column> columns;
            int length;
            try
            {
                columns = table.getData().getColumns();
                length = table.getData().getLength();
            }
            catch (Exception e)
            {
                out.append(err(e)).append("\n");
                continue;
            }
            out.append("LENGTH ").append(length).append("\n");
            for (Column column : columns)
            {
                String type;
                try
                {
                    type = column.getType().getType().toString();
                }
                catch (Exception e)
                {
                    out.append("COLUMN ").append(column.getName().getRaw()).append(" ").append(err(e)).append("\n");
                    continue;
                }
                out.append("COLUMN ").append(column.getName().getRaw()).append(" : ").append(type).append("\n");
                for (int row = 0; row < Math.min(length, MAX_ROWS); row++)
                {
                    String value;
                    try
                    {
                        value = DataTypeUtility.valueToString(column.getType().getCollapsed(row));
                    }
                    catch (Exception e)
                    {
                        value = err(e);
                    }
                    out.append("  ").append(row).append(": ").append(value).append("\n");
                }
            }
        }
        return out.toString();
    }
}
