// The Java counterpart of the port's command-line tool (scripts/cli/columnal-cli.ts), for
// scripts/compare-with-java.sh, using the ORIGINAL engine and exporters (built by
// build-importers-jvm.sh):
//   CliHarness export <file.rec> <output-dir>
//       loads the file, and writes saved.rec, tables.txt and each table's exports, exactly as the
//       port's tool does (tables.txt shows at most --max-rows rows, if given before export)
//   CliHarness dump-xlsx <file.xlsx>
//       prints the cells of an Excel file (so the port's and Java's can be compared as text)
package golden;

import com.google.common.collect.ImmutableMap;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import xyz.columnal.data.Column;
import xyz.columnal.data.Table;
import xyz.columnal.data.Table.FullSaver;
import xyz.columnal.data.TableManager;
import xyz.columnal.data.datatype.DataTypeUtility;
import xyz.columnal.exporters.CSVExporter;
import xyz.columnal.exporters.ExcelExporter;
import xyz.columnal.exporters.Exporter;
import xyz.columnal.exporters.HTMLExporter;
import xyz.columnal.exporters.RExporter;
import xyz.columnal.transformations.RTransformation;
import xyz.columnal.transformations.TransformationManager;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public class CliHarness
{
    public static void main(String[] args) throws Exception
    {
        int maxRows = Integer.MAX_VALUE;
        if (args.length >= 2 && args[0].equals("--max-rows"))
        {
            maxRows = Integer.parseInt(args[1]);
            args = java.util.Arrays.copyOfRange(args, 2, args.length);
        }
        if (args.length == 3 && args[0].equals("export"))
            export(Path.of(args[1]), Path.of(args[2]), maxRows);
        else if (args.length == 2 && args[0].equals("dump-xlsx"))
            System.out.print(dumpXlsx(new File(args[1])));
        else
        {
            System.err.println("Usage: CliHarness [--max-rows N] export <file.rec> <output-dir> | dump-xlsx <file.xlsx>");
            System.exit(2);
        }
    }

    private static void export(Path input, Path outDir, int maxRows) throws Exception
    {
        Files.createDirectories(outDir);
        TableManager mgr = new TableManager(TransformationManager.getInstance(), onError -> ImmutableMap.of());
        TableManager.Loaded loaded = mgr.loadAll(Files.readString(input, StandardCharsets.UTF_8), w -> {});
        loaded.errors.forEach(e -> System.err.println("Error loading: " + e.toPlain()));
        FullSaver saver = new FullSaver(null);
        mgr.save(null, saver);
        Files.writeString(outDir.resolve("saved.rec"), saver.getCompleteFile(), StandardCharsets.UTF_8);
        Files.writeString(outDir.resolve("tables.txt"), dumpTables(mgr, maxRows), StandardCharsets.UTF_8);

        Map<String, Exporter> exporters = ImmutableMap.of("csv", new CSVExporter(), "html", new HTMLExporter(), "xlsx", new ExcelExporter(), "rds", new RExporter());
        for (Table table : mgr.getAllTables())
        {
            String name = table.getId().getRaw().replaceAll("[^A-Za-z0-9]", "_");
            for (Map.Entry<String, Exporter> exporter : exporters.entrySet())
            {
                File file = outDir.resolve(name + "." + exporter.getKey()).toFile();
                try
                {
                    exporter.getValue().exportData(file, table);
                }
                catch (Exception e)
                {
                    file.delete();
                    Files.writeString(outDir.resolve(name + "." + exporter.getKey() + ".error.txt"), err(e) + "\n", StandardCharsets.UTF_8);
                }
            }
        }
        System.out.println(input + ": " + mgr.getAllTables().size() + " tables written to " + outDir);
    }

    private static String err(Throwable e)
    {
        return "!" + e.getClass().getSimpleName() + ": " + e.getMessage();
    }

    // As dumpTables in scripts/cli/dumpTables.ts (and TransformationsHarness)
    private static String dumpTables(TableManager mgr, int maxRows)
    {
        StringBuilder out = new StringBuilder();
        // (Sorted, as the order of getAllTables is an identity hash order)
        for (Table table : mgr.getAllTables().stream().sorted(Comparator.comparing(Table::getId)).collect(Collectors.toList()))
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
                for (int row = 0; row < Math.min(length, maxRows); row++)
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

    private static String dumpXlsx(File file) throws Exception
    {
        StringBuilder out = new StringBuilder();
        try (Workbook workbook = WorkbookFactory.create(file, null, true))
        {
            for (Sheet sheet : workbook)
            {
                out.append("SHEET ").append(sheet.getSheetName()).append("\n");
                for (Row row : sheet)
                {
                    for (Cell cell : row)
                    {
                        out.append(cell.getRowIndex()).append(",").append(cell.getColumnIndex()).append(" ");
                        switch (cell.getCellType())
                        {
                            case NUMERIC:
                                if (DateUtil.isCellDateFormatted(cell))
                                    out.append("DATE ").append(cell.getNumericCellValue()).append(" ").append(cell.getCellStyle().getDataFormatString());
                                else
                                    out.append("NUMBER ").append(cell.getNumericCellValue());
                                break;
                            case STRING:
                                out.append("STRING ").append(cell.getStringCellValue());
                                break;
                            case BOOLEAN:
                                out.append("BOOLEAN ").append(cell.getBooleanCellValue());
                                break;
                            default:
                                out.append(cell.getCellType()).append(" ").append(cell.toString());
                                break;
                        }
                        out.append("\n");
                    }
                }
            }
        }
        return out.toString();
    }
}
