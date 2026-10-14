// Golden files for the data module: loads each saved file input-*.rec in the given directories
// (test/engine/data/golden/rec, written by the port, and golden/handwritten; see
// scripts/golden/data.sh) into the ORIGINAL TableManager (built by build-columnal-jvm.sh), saves
// it again, and writes the result to java-*.rec if it differs from the input.  An exception is
// written as "!SimpleClassName: message".  test/engine/data/DataGolden.test.ts checks that the
// port loads the files and saves them byte for byte as Java did.
package golden;

import com.google.common.collect.ImmutableMap;
import xyz.columnal.data.Table.FullSaver;
import xyz.columnal.data.TableManager;
import xyz.columnal.data.TableManager.TransformationLoader;
import xyz.columnal.data.Transformation;
import xyz.columnal.error.InternalException;
import xyz.columnal.grammar.MainParser.TableContext;
import xyz.columnal.grammar.TableParser2.TableTransformationContext;
import xyz.columnal.grammar.Versions.ExpressionVersion;
import xyz.columnal.id.SaveTag;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public class DataHarness
{
    public static void main(String[] args) throws Exception
    {
        int count = 0;
        for (String arg : args)
            count += processDirectory(Path.of(arg));
        System.out.println(count + " files");
    }

    private static int processDirectory(Path dir) throws Exception
    {
        List<Path> inputs;
        try (Stream<Path> files = Files.list(dir))
        {
            inputs = files.filter(p -> p.getFileName().toString().matches("input-.*\\.rec")).sorted().collect(Collectors.toList());
        }
        for (Path input : inputs)
        {
            String output;
            try
            {
                TableManager mgr = new TableManager(new TransformationLoader()
                {
                    @Override
                    public Transformation loadOne(TableManager mgr, TableContext table, ExpressionVersion expressionVersion) throws InternalException
                    {
                        throw new InternalException("No transformations");
                    }

                    @Override
                    public Transformation loadOne(TableManager mgr, SaveTag saveTag, TableTransformationContext table, ExpressionVersion expressionVersion) throws InternalException
                    {
                        throw new InternalException("No transformations");
                    }
                }, onError -> ImmutableMap.of());
                mgr.loadAll(Files.readString(input, StandardCharsets.UTF_8), w -> {});
                FullSaver saver = new FullSaver(null);
                mgr.save(null, saver);
                output = saver.getCompleteFile();
            }
            catch (Throwable t)
            {
                output = "!" + t.getClass().getSimpleName() + ": " + t.getMessage() + (t.getCause() == null ? "" : " caused by " + t.getCause()) + "\n";
            }
            Path javaFile = dir.resolve(input.getFileName().toString().replace("input-", "java-"));
            Files.deleteIfExists(javaFile);
            if (!output.equals(Files.readString(input, StandardCharsets.UTF_8)))
                Files.writeString(javaFile, output, StandardCharsets.UTF_8);
        }
        return inputs.size();
    }
}
