// Port of xyz.columnal.importers.TextImporter (importers module).
import type { Localized, TableDataRowIndex } from "../../anns/Annotations.js";
import { CellPosition } from "../../data/data/CellPosition.js";
import type { Column } from "../../data/data/Column.js";
import { NumericColumnType, OrBlankColumnType, TextColumnType, BlankColumnType, CleanDateColumnType } from "../../data/data/columntype/ColumnTypes.js";
import type { DataSource } from "../../data/data/DataSource.js";
import { ImmediateDataSource } from "../../data/data/DataSources.js";
import { EditableRecordSet } from "../../data/data/EditableRecordSet.js";
import { KnownLengthRecordSet } from "../../data/data/KnownLengthRecordSet.js";
import { RecordSet } from "../../data/data/RecordSet.js";
import type { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { TextFileColumn } from "../../data/data/TextFileColumn.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { Charset } from "../../java/JavaCharset.js";
import { IOException } from "../../java/JavaExceptions.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import { NumberInfo } from "../../types/data/datatype/NumberInfo.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../types/data/unit/Unit.js";
import { Either } from "../../utility-adt/utility/adt/Either.js";
import { FetchException } from "../../utility-error/error/FetchException.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationConsumerNoError } from "../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TaggedValue } from "../../utility/utility/TaggedValue.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { javaClassName, ReadState, Utility } from "../../utility/utility/Utility.js";
import { Workers } from "../../utility/utility/Workers.js";
import { GuessFormat } from "./GuessFormat.js";
import type { Importer } from "./Importer.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";

/**
 * Created by neil on 31/10/2016.
 */
export class TextImporter implements Importer
{
    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.txt", "*.csv"];
    }

    public importFile(dialogs: ImporterDialogs, tableManager: TableManager, destination: CellPosition, src: JavaFile, _origin: URL, recordLoadedTable: SimulationConsumerNoError<DataSource>): void
    {
        Workers.onWorkerThread("GuessFormat data", Workers.Priority.LOAD_FROM_DISK, () =>
        {
            try
            {
                TextImporter.importTextFile(dialogs, tableManager, src, destination, rs => recordLoadedTable(rs));
            }
            catch (ex)
            {
                if (!(ex instanceof IOException))
                    throw ex;
                // Java: FXUtility.logAndShowError("import.text.error", ex)
                TextImporter.logAndShowError("import.text.error", ex);
            }
        });
    }

    // Java: FXUtility.logAndShowError, which logs the exception and shows it in an error dialog.
    /** @internal */
    public static logAndShowError(actionKey: string, ex: Error): void
    {
        const actionString = TranslationUtility.getString(actionKey);
        ErrorHandler.getErrorHandler().showError(actionString, (s: Localized) => actionString + ": " + s, ex);
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.files.text");
    }

    /**
     * Java: importTextFile(@Nullable Window parentWindow, ...).  The dialogs stand in for the
     * parent window (see ImporterDialogs).
     */
    public static importTextFile(dialogs: ImporterDialogs, mgr: TableManager, textFile: JavaFile, destination: CellPosition, then: SimulationConsumerNoError<DataSource>): void
    {
        const initial = TextImporter.getInitial(textFile);
        GuessFormat.guessTextFormatGUI_Then(dialogs, mgr, textFile, TextImporter.getNameWithoutExtension(textFile.getName()), initial, impInfo =>
        {
            try
            {
                Log.debug("Importing format " + String(impInfo.getFormat()));
                const ds = TextImporter.makeDataSource(mgr, textFile, impInfo.getInitialLoadDetails(destination), impInfo.getFormat());
                then(ds);
            }
            catch (e)
            {
                if (!(e instanceof InternalException || e instanceof UserException || e instanceof IOException))
                    throw e;
                // TODO display
                Log.log(e);
            }
        });
    }

    // Guava's Files.getNameWithoutExtension
    private static getNameWithoutExtension(fileName: string): string
    {
        const dotIndex = fileName.lastIndexOf(".");
        return (dotIndex === -1) ? fileName : fileName.substring(0, dotIndex);
    }

    /**
     * Java: _test_importTextFile(TableManager, File), which returns a CompletableFuture of the
     * record set once the GUI has been used to pick the format.  Here the dialogs are passed in.
     */
    public static _test_importTextFile(dialogs: ImporterDialogs, mgr: TableManager, textFile: JavaFile): Promise<RecordSet>
    {
        return new Promise<RecordSet>(resolve =>
        {
            // TODO need some test code to operate the GUI
            TextImporter.importTextFile(dialogs, mgr, textFile, CellPosition.ORIGIN, data =>
            {
                try
                {
                    resolve(data.getData());
                }
                catch (e)
                {
                    console.error(e);
                }
            });
        });
    }

    private static makeDataSource(mgr: TableManager, textFile: JavaFile, initialLoadDetails: Table.InitialLoadDetails, format: GuessFormat.FinalTextFormat): DataSource
    {
        const rs = TextImporter.makeRecordSet(mgr.getTypeManager(), textFile, format);
        //if (importInfo.linkFile)
            //return new LinkedDataSource(mgr, importInfo.tableName, rs, MainLexer.TEXTFILE, textFile);
        //else
            return new ImmediateDataSource(mgr, initialLoadDetails, new EditableRecordSet(rs));
    }

    public static makeSrcRecordSet(textFile: JavaFile, charset: Charset, separator: string | null, quote: string | null, totalColumns: number): RecordSet
    {
        const columns: SimulationFunction<RecordSet, Column>[] = [];
        for (let i = 0; i < totalColumns; i++)
        {
            // Must be one per column:
            const reader = Utility.skipFirstNRows(textFile, charset, 0);
            const iFinal = i;
            columns.push(rs =>
            {
                const columnName = new ColumnId(IdentifierUtility.identNum("Column", (iFinal + 1)));
                return TextFileColumn.stringColumn(rs, reader, separator, quote, columnName, iFinal, totalColumns);
            });
        }
        return new KnownLengthRecordSet(columns, Utility.countLines(textFile, charset));
    }

    public static makeRecordSet(typeManager: TypeManager, textFile: JavaFile, format: GuessFormat.FinalTextFormat): RecordSet
    {
        const columns: SimulationFunction<RecordSet, Column>[] = [];
        const totalColumns = format.columnTypes.length;
        for (let i = 0; i < totalColumns; i++)
        {
            // Must be one per column:
            const reader = Utility.skipFirstNRows(textFile, format.initialTextFormat.charset, format.trimChoice.trimFromTop);
            const columnInfo = format.columnTypes[i]!;
            const columnIndexInSrc = i + format.trimChoice.trimFromLeft;
            const type = columnInfo.type;
            if (type instanceof NumericColumnType)
            {
                columns.push(rs =>
                {
                    const numericColumnType = type;
                    return TextFileColumn.numericColumn(rs, reader, format.initialTextFormat.separator, format.initialTextFormat.quote, columnInfo.title, columnIndexInSrc, totalColumns, new NumberInfo(numericColumnType.unit), s => numericColumnType.removePrefixAndSuffix(s));
                });
            }
            else if (type instanceof OrBlankColumnType)
            {
                const orBlankColumnType = type;
                const inner = orBlankColumnType.getInner();
                if (inner instanceof NumericColumnType)
                {
                    const numericColumnType = inner;
                    const numberType = DataType.number(new NumberInfo(numericColumnType.unit));
                    const numberOrBlank = typeManager.getMaybeType().instantiate([Either.right<Unit, DataType>(numberType)], typeManager);
                    columns.push(rs =>
                    {
                        return TextFileColumn.taggedColumn(rs, reader, format.initialTextFormat.separator, format.initialTextFormat.quote, columnInfo.title, columnIndexInSrc, totalColumns, DataTypeUtility.getTaggedTypeName(numberOrBlank), [Either.right<Unit, DataType>(numberType)], DataTypeUtility.getTagTypes(numberOrBlank), str =>
                        {
                            if (str === orBlankColumnType.getBlankString())
                            {
                                return Either.right<string, TaggedValue>(new TaggedValue(0, null, typeManager.getMaybeType()));
                            }
                            else
                            {
                                const n = Utility.parseNumberOpt(str);
                                return n !== null ? Either.right<string, TaggedValue>(new TaggedValue(1, n, typeManager.getMaybeType())) : Either.left<string, TaggedValue>(str);
                            }
                        });
                    });
                }
                else
                    throw new InternalException("Unhandled or-blank column type: " + javaClassName(orBlankColumnType.getInner()));
            }
            else if (type instanceof TextColumnType || type instanceof BlankColumnType)
            {
                columns.push(rs => TextFileColumn.stringColumn(rs, reader, format.initialTextFormat.separator, format.initialTextFormat.quote, columnInfo.title, columnIndexInSrc, totalColumns));
            }
            else if (type instanceof CleanDateColumnType)
            {
                columns.push(rs =>
                {
                    const dateColumnType = type;
                    return TextFileColumn.dateColumn(rs, reader, format.initialTextFormat.separator, format.initialTextFormat.quote, columnInfo.title, columnIndexInSrc, totalColumns, dateColumnType.getDateTimeInfo(), s => dateColumnType.parse(s));
                });
            }
            else
                throw new InternalException("Unhandled column type: " + javaClassName(type));
        }
        return new class extends RecordSet
        {
            protected rowCount = -1;

            public override indexValid(index: number): boolean
            {
                return index < this.getLength();
            }

            public override getLength(): TableDataRowIndex
            {
                if (this.rowCount === -1)
                {
                    try
                    {
                        this.rowCount = Utility.countLines(textFile, format.initialTextFormat.charset) - format.trimChoice.trimFromTop - format.trimChoice.trimFromBottom;
                    }
                    catch (e)
                    {
                        if (!(e instanceof IOException))
                            throw e;
                        throw new FetchException("Error counting rows", e);
                    }
                }
                return this.rowCount;
            }
        }(columns);
    }

    /**
     * Java: returns a LinkedHashMap from each charset to the file's lines read in that charset.
     * PORT-NOTE: Java's default charset is UTF-8 (since Java 18), which is already in the list.
     */
    /** @internal Java: private, but used by tests */
    public static getInitial(textFile: JavaFile): Map<Charset, string[]>
    {
        const initial = new Map<Charset, string[]>();
        const charsets: Charset[] = [Charset.UTF_8, Charset.ISO_8859_1, Charset.UTF_16];
        for (const charset of charsets)
        {
            const initialLines: string[] = [];
            // Read the first few lines:
            const br = new ReadState(textFile, charset, 0);
            let line: string | null;
            while ((line = br.nextLine()) !== null/* && initialLines.size() < GuessFormat.INITIAL_ROWS_TEXT_FILE*/)
            {
                initialLines.push(line);
            }
            initial.set(charset, initialLines);
        }
        return initial;
    }
}
