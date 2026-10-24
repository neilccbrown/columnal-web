// Golden files for the importers and exporters (see scripts/golden/importers.sh).  For each input
// in the given directory (test/engine/importers/golden, written by the port), runs the ORIGINAL
// importers or exporters (built by build-importers-jvm.sh) and writes what they did to
// java-<input>.txt, in the format of test/engine/importers/ImportersGolden.test.ts, which checks
// that the port does the same:
//   txt-*      a text file: guesses its format as the import dialog first shows it (GuessFormat),
//              loads the source and destination of the import, and loads it as TextImporter does
//   html-*     an HTML file: reads each table that can be imported (as HTMLImporter.importTable
//              does, copied into HTMLTableReader), and loads the import's source and destination,
//              with and without trimming whitespace.  "-wiki" files are taken to be from Wikipedia.
//   xlsx-*     an Excel file: reads it as ExcelImporter does, and loads the import's source and destination
//   rec-*.rec  a saved file: exports each table with the CSV, HTML and Excel exporters, writing the
//              CSV and HTML (without the HTML's export time) to the .txt file, and the Excel file to
//              java-<input>-<table>.xlsx, which is then read as an xlsx-* input would be.
package golden;

import com.google.common.collect.ImmutableList;
import com.google.common.collect.ImmutableMap;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import xyz.columnal.data.CellPosition;
import xyz.columnal.data.Column;
import xyz.columnal.data.RecordSet;
import xyz.columnal.data.Table;
import xyz.columnal.data.TableManager;
import xyz.columnal.data.columntype.CleanDateColumnType;
import xyz.columnal.data.columntype.ColumnType;
import xyz.columnal.data.datatype.DataType.DateTimeInfo;
import xyz.columnal.data.datatype.DataTypeUtility;
import xyz.columnal.error.InvalidImmediateValueException;
import xyz.columnal.exporters.CSVExporter;
import xyz.columnal.exporters.ExcelExporter;
import xyz.columnal.exporters.HTMLExporter;
import xyz.columnal.importers.ColumnInfo;
import xyz.columnal.importers.ExcelImporter;
import xyz.columnal.importers.GuessFormat;
import xyz.columnal.importers.GuessFormat.FinalTextFormat;
import xyz.columnal.importers.GuessFormat.Import;
import xyz.columnal.importers.GuessFormat.Import.SrcDetails;
import xyz.columnal.importers.GuessFormat.InitialTextFormat;
import xyz.columnal.importers.HTMLTableReader;
import xyz.columnal.importers.TextImporter;
import xyz.columnal.importers.gui.ImportChoicesDialog;
import xyz.columnal.data.datatype.TypeManager;
import xyz.columnal.data.unit.UnitManager;
import xyz.columnal.loadsave.OutputBuilder;
import xyz.columnal.transformations.TransformationManager;
import xyz.columnal.utility.UnitType;
import xyz.columnal.utility.adt.Pair;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Field;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class ImportersHarness
{
    private static final int MAX_ROWS = 60;

    private final StringBuilder out = new StringBuilder();

    private void line(String s)
    {
        out.append(s).append("\n");
    }

    public static void main(String[] args) throws Exception
    {
        Path dir = Path.of(args[0]);
        List<Path> inputs;
        try (Stream<Path> files = Files.list(dir))
        {
            inputs = files.filter(p -> p.getFileName().toString().matches("(txt|html|xlsx|rec)-.*")).sorted().collect(Collectors.toList());
        }
        for (Path input : inputs)
        {
            ImportersHarness h = new ImportersHarness();
            String name = input.getFileName().toString();
            h.line("FILE " + name);
            try
            {
                if (name.startsWith("txt-"))
                    h.text(input.toFile());
                else if (name.startsWith("html-"))
                    h.html(input.toFile(), name.contains("-wiki"));
                else if (name.startsWith("xlsx-"))
                    h.excel(input.toFile());
                else
                    h.export(dir, input);
            }
            catch (Throwable e)
            {
                h.line("EXCEPTION " + describe(e));
            }
            Files.writeString(dir.resolve("java-" + name.replaceAll("\\.[a-z]+$", "") + ".txt"), h.out.toString(), StandardCharsets.UTF_8);
        }
    }

    private static String describe(Throwable e)
    {
        return e.getClass().getSimpleName() + ": " + e.getMessage();
    }

    private static TableManager makeManager() throws Exception
    {
        return new TableManager(TransformationManager.getInstance(), onError -> ImmutableMap.of());
    }

    // As TextImporter.getInitial (private), which reads every line in each charset:
    private static Map<Charset, List<String>> getInitial(File textFile) throws Exception
    {
        Map<Charset, List<String>> initial = new LinkedHashMap<>();
        for (Charset charset : List.of(StandardCharsets.UTF_8, StandardCharsets.ISO_8859_1, StandardCharsets.UTF_16))
        {
            ArrayList<String> initialLines = new ArrayList<>();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(new FileInputStream(textFile), charset)))
            {
                String l;
                while ((l = br.readLine()) != null)
                    initialLines.add(l);
            }
            initial.put(charset, initialLines);
        }
        return initial;
    }

    private void text(File file) throws Exception
    {
        TableManager mgr = makeManager();
        TypeManager typeManager = mgr.getTypeManager();
        UnitManager unitManager = mgr.getUnitManager();
        Import<InitialTextFormat, FinalTextFormat> imp = GuessFormat.guessTextFormat(typeManager, unitManager, getInitial(file), null, null);
        InitialTextFormat srcFormat = imp.currentSrcFormat().get();
        line("guessed " + srcFormat);
        if (srcFormat == null)
            return;
        FinalTextFormat dest = loadSourceAndDest(imp, srcFormat);
        if (dest == null)
            return;
        line("text file:");
        try
        {
            dumpRecordSet(TextImporter.makeRecordSet(typeManager, file, dest));
        }
        catch (Exception e)
        {
            line("EXCEPTION " + describe(e));
        }
    }

    // Loads the source, then the destination with the source's trim, dumping both; returns the destination format.
    private <S, D> D loadSourceAndDest(Import<S, D> imp, S srcFormat)
    {
        SrcDetails src;
        try
        {
            src = imp.loadSource(srcFormat);
        }
        catch (Exception e)
        {
            line("source EXCEPTION " + describe(e));
            return null;
        }
        line("source trim " + src.trimChoice + " names " + src.columnNameOverrides);
        dumpRecordSet(src.recordSet);
        Pair<D, RecordSet> dest;
        try
        {
            dest = imp.loadDest(srcFormat, src.trimChoice);
        }
        catch (Exception e)
        {
            line("dest EXCEPTION " + describe(e));
            return null;
        }
        D format = dest.getFirst();
        if (format instanceof FinalTextFormat)
        {
            FinalTextFormat f = (FinalTextFormat) format;
            line("dest " + f.initialTextFormat + " " + f.trimChoice);
            describeColumns(f.columnTypes);
        }
        else if (HTMLTableReader.plainImportInfo(format) != null)
        {
            Pair<GuessFormat.TrimChoice, ImmutableList<ColumnInfo>> p = HTMLTableReader.plainImportInfo(format);
            line("dest " + p.getFirst());
            describeColumns(p.getSecond());
        }
        dumpRecordSet(dest.getSecond());
        return format;
    }

    private void describeColumns(List<ColumnInfo> columns)
    {
        for (ColumnInfo c : columns)
            line("  column " + c.title.getRaw() + ": " + describeType(c.type));
    }

    // CleanDateColumnType's toString includes its formatter's, which java.time prints slightly
    // differently from js-joda, so the formatter is given as its position in the flexible formatters:
    private static String describeType(ColumnType type)
    {
        if (type instanceof CleanDateColumnType)
        {
            CleanDateColumnType d = (CleanDateColumnType) type;
            String s = d.toString();
            String rest = s.substring(s.lastIndexOf('"') + 2);
            List<DateTimeFormatter> formatters = d.getDateTimeInfo().getFlexibleFormatters().stream().flatMap(l -> l.stream()).collect(Collectors.toList());
            int index = -1;
            for (int i = 0; i < formatters.size(); i++)
            {
                if (formatters.get(i).toString().equals(d.getDateTimeFormatter().toString()))
                {
                    index = i;
                    break;
                }
            }
            return "CleanDate #" + index + " " + rest;
        }
        return type.toString();
    }

    private void dumpRecordSet(RecordSet rs)
    {
        line("  columns " + rs.getColumns().stream().map(c -> c.getName().getRaw()).collect(Collectors.joining("|")));
        StringBuilder types = new StringBuilder();
        for (Column c : rs.getColumns())
        {
            try
            {
                OutputBuilder b = new OutputBuilder();
                c.getType().getType().save(b);
                types.append(" ").append(b.toString().trim());
            }
            catch (Exception e)
            {
                types.append(" ERROR");
            }
        }
        line("  types" + types);
        int length;
        try
        {
            length = rs.getLength();
        }
        catch (Exception e)
        {
            line("  length EXCEPTION " + describe(e));
            return;
        }
        line("  length " + length);
        for (int i = 0; i < Math.min(length, MAX_ROWS); i++)
        {
            List<String> values = new ArrayList<>();
            for (Column c : rs.getColumns())
            {
                try
                {
                    values.add(DataTypeUtility.valueToString(c.getType().getCollapsed(i)));
                }
                catch (InvalidImmediateValueException e)
                {
                    values.add("INVALID " + e.getInvalid());
                }
                catch (Exception e)
                {
                    values.add("ERROR " + e.getClass().getSimpleName());
                }
            }
            line("  " + String.join(" | ", values));
        }
    }

    private void html(File file, boolean fromWikipedia) throws Exception
    {
        TableManager mgr = makeManager();
        Document doc = Jsoup.parse(file, null);
        Elements tables = doc.select("table");
        for (int i = 0; i < tables.size(); i++)
        {
            Element table = tables.get(i);
            // As importHTMLFile: only tables without nested tables can be imported
            if (table.children().stream().allMatch(e -> e.select("table").isEmpty()))
            {
                table.prepend("<div class='overlay'></div>").wrap("<a class='gui_import' style='' href='gui_import:id" + i + "'></a>");
            }
            else
                continue;
            line("TABLE " + i);
            List<List<String>> vals = new ArrayList<>();
            List<String> columnNames = new ArrayList<>();
            Import<UnitType, ?> imp;
            try
            {
                imp = HTMLTableReader.readTable(mgr, table, fromWikipedia, vals, columnNames);
            }
            catch (Exception e)
            {
                line("read EXCEPTION " + describe(e));
                continue;
            }
            line("names " + columnNames.stream().map(ImportersHarness::escape).collect(Collectors.joining("|")));
            for (List<String> row : vals)
                line("row " + row.stream().map(ImportersHarness::escape).collect(Collectors.joining("|")));
            for (boolean trim : new boolean[] {true, false})
            {
                Field f = imp.getClass().getDeclaredField("trimWhitespace");
                f.setAccessible(true);
                ((AtomicBoolean) f.get(imp)).set(trim);
                line("trim whitespace " + trim);
                loadSourceAndDest(imp, UnitType.UNIT);
            }
        }
    }

    private static String escape(String s)
    {
        return s.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t").replace("|", "\\|");
    }

    @SuppressWarnings("unchecked")
    private void excel(File file) throws Exception
    {
        TableManager mgr = makeManager();
        ImportChoicesDialog.lastImport = null;
        try
        {
            new ExcelImporter().importFile(null, mgr, CellPosition.ORIGIN, file, file.toURI().toURL(), ds -> {});
        }
        catch (Exception e)
        {
            line("EXCEPTION " + e.getClass().getSimpleName());
            return;
        }
        Import<UnitType, ?> imp = (Import<UnitType, ?>) ImportChoicesDialog.lastImport;
        if (imp == null)
        {
            line("no import");
            return;
        }
        loadSourceAndDest(imp, UnitType.UNIT);
    }

    private void export(Path dir, Path input) throws Exception
    {
        TableManager mgr = makeManager();
        mgr.loadAll(Files.readString(input, StandardCharsets.UTF_8), w -> {});
        String base = input.getFileName().toString().replaceAll("\\.rec$", "");
        for (Table table : mgr.getAllTables())
        {
            String id = table.getId().getRaw();
            line("TABLE " + id);
            File csv = File.createTempFile("export", ".csv");
            File html = File.createTempFile("export", ".html");
            try
            {
                new CSVExporter().exportData(csv, table);
                line("CSV");
                out.append(Files.readString(csv.toPath(), StandardCharsets.UTF_8));
                line("END CSV");
            }
            catch (Exception e)
            {
                line("CSV EXCEPTION " + describe(e));
            }
            try
            {
                new HTMLExporter().exportData(html, table);
                line("HTML");
                out.append(Files.readString(html.toPath(), StandardCharsets.UTF_8).replaceAll("<p>Exported on [^<]*</p>", "<p>Exported on (time)</p>"));
                line("END HTML");
            }
            catch (Exception e)
            {
                line("HTML EXCEPTION " + describe(e));
            }
            csv.delete();
            html.delete();
            File xlsx = dir.resolve("java-" + base + "-" + id.replaceAll("[^A-Za-z0-9]", "_") + ".xlsx").toFile();
            try
            {
                new ExcelExporter().exportData(xlsx, table);
                line("EXCEL");
                excel(xlsx);
                line("END EXCEL");
            }
            catch (Exception e)
            {
                line("EXCEL EXCEPTION " + describe(e));
            }
        }
    }
}
