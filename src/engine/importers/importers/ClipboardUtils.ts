// Port of xyz.columnal.importers.ClipboardUtils (importers module).
//
// PORT-NOTE: Java reads and writes the system clipboard itself.  The browser's clipboard is
// asynchronous and belongs to the GUI, so here the GUI reads the clipboard and passes the content
// in (loadValuesFromClipboard), and is given the content to put on it (copyValuesToClipboard), as
// a map from MIME type to text: DATA_FORMAT for Columnal's own format, and "text/plain".
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { ColumnUtility } from "../../data/data/ColumnUtility.js";
import { DataSource } from "../../data/data/DataSources.js";
import type { EditableColumn } from "../../data/data/EditableColumn.js";
import type { RecordSet } from "../../data/data/RecordSet.js";
import { SaveTag } from "../../identifiers/id/SaveTag.js";
import { DataParser } from "../../parsers/generated/DataParser.js";
import { FormatLexer } from "../../parsers/generated/FormatLexer.js";
import { MainLexer } from "../../parsers/generated/MainLexer.js";
import { MainLexer2 } from "../../parsers/generated/MainLexer2.js";
import { MainParser2 } from "../../parsers/generated/MainParser2.js";
import { vocabularyOf } from "../../parsers/grammar/Vocabularies.js";
import { OverallVersion } from "../../parsers/grammar/Versions.js";
import { DataType } from "../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../types/data/datatype/DataTypeUtility.js";
import type { DataTypeValue } from "../../types/data/datatype/DataTypeValue.js";
import type { TypeManager } from "../../types/data/datatype/TypeManager.js";
import type { UnitManager } from "../../types/data/unit/UnitManager.js";
import { OutputBuilder } from "../../types/loadsave/OutputBuilder.js";
import type { Either } from "../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../utility-error/error/InternalException.js";
import { InvalidImmediateValueException } from "../../utility-error/error/InvalidImmediateValueException.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationFunction } from "../../utility-functional/utility/function/simulation/SimulationFunction.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { Utility } from "../../utility/utility/Utility.js";
import type { Value } from "../../utility/utility/Value.js";
import { Workers } from "../../utility/utility/Workers.js";
import { Platform } from "../../java/Platform.js";

export class ClipboardUtils
{
    // Java: FXUtility.getDataFormat("application/records")
    public static readonly DATA_FORMAT = "application/records";
    /** Java: DataFormat.PLAIN_TEXT */
    public static readonly PLAIN_TEXT = "text/plain";

    /**
     * Returns column-major, i.e. a list of columns
     *
     * Java: loadValuesFromClipboard(TypeManager), which reads the DATA_FORMAT content of the
     * system clipboard; here the GUI passes that content (or null if there is none).
     */
    public static loadValuesFromClipboard(typeManager: TypeManager, content: string | null): ClipboardUtils.LoadedColumnInfo[] | null
    {
        if (content === null)
            return null;
        else
        {
            try
            {
                return Utility.parseAsOne(content.toString(), s => new MainLexer2(s), t => new MainParser2(t), p => ClipboardUtils.loadIsolatedValues(p, typeManager));
            }
            catch (e)
            {
                if (e instanceof UserException)
                    ErrorHandler.getErrorHandler().showError(TranslationUtility.getString("error.copying.content"), e);
                else if (e instanceof InternalException)
                    Log.log(e);
                else
                    throw e;
            }
            return null;
        }
    }

    private static loadIsolatedValues(main: MainParser2, typeManager: TypeManager): ClipboardUtils.LoadedColumnInfo[]
    {
        const sections = new Map<string, string[]>();
        for (const contentContext of main.file().content())
        {
            sections.set(contentContext.ATOM(0)!.getText(), Utility.getDetailLines(contentContext.detail()));
        }

        // TODO check that units, types match
        const formatLines = sections.get("FORMAT");
        if (formatLines === undefined)
            throw new UserException("Missing FORMAT on clipboard (not copied from here?)");
        const format = DataSource.loadFormat(typeManager, formatLines, false);
        const cols: Pair<DataSource.LoadedFormat, Either<string, Value>[]>[] = [];
        for (let i = 0; i < format.length; i++)
        {
            cols.push(new Pair(format[i]!, []));
        }
        const valueLines = sections.get("VALUES");
        if (valueLines === undefined)
            throw new UserException("Missing VALUES on clipboard (not copied from here?)");
        Utility.loadData(valueLines, p =>
        {
            for (let i = 0; i < format.length; i++)
            {
                if (i > 0)
                    p.comma();
                const colFormat = format[i]!;
                cols[i]!.getSecond().push(DataType.loadSingleItem(colFormat.dataType, p, false));
            }
        });
        return cols.map(p => new ClipboardUtils.LoadedColumnInfo(p.getFirst().columnId, p.getFirst().dataType, p.getSecond()));
    }

    /**
     * PORT-NOTE: Java puts the content on the system clipboard (on the FX thread) and completes
     * onCompletion with true; here setContent is called with the content (a map from MIME type to
     * text), and then onCompletion with true.  If there are no columns, only onCompletion(false)
     * is called, as in Java.
     */
    public static copyValuesToClipboard(unitManager: UnitManager, typeManager: TypeManager, columns: readonly Pair<ColumnId, DataTypeValue>[], rowRangeSupplier: SimulationSupplier<ClipboardUtils.RowRange>, setContent: (content: ReadonlyMap<string, string>) => void, onCompletion: ((copied: boolean) => void) | null): void
    {
        if (columns.length === 0)
        {
            if (onCompletion !== null)
                onCompletion(false);
            return;
        }
        Workers.onWorkerThread("Copying to clipboard", Workers.Priority.FETCH, () =>
        {
            const errorHandler = ErrorHandler.getErrorHandler();
            const b = new OutputBuilder();
            b.raw("COLUMNAL").nl();
            b.raw("VERSION " + OverallVersion.asNumber(OverallVersion.latest())).nl();
            b.t(MainLexer.UNITS).begin().raw("UU").nl();
            b.pushPrefix(new SaveTag("UU"));
            for (const unitLine of unitManager.save(DataTypeUtility.featuresUnit(Utility.mapList(columns, p => p.getSecond().getType()))))
            {
                b.raw(unitLine).nl();
            }
            b.pop();
            b.end().raw("UU").t(MainLexer.UNITS).nl();
            b.t(MainLexer.TYPES).begin().raw("TT").nl();
            b.pushPrefix(new SaveTag("TT"));
            for (const typeLine of typeManager.save(DataTypeUtility.featuresTaggedType(Utility.mapList(columns, p => p.getSecond().getType()))))
            {
                b.raw(typeLine).nl();
            }
            b.pop();
            b.end().raw("TT").t(MainLexer.TYPES).nl();
            b.t(MainLexer.FORMAT).begin().raw("FF").nl();
            b.pushPrefix(new SaveTag("FF"));
            for (const c of columns)
            {
                b.t(FormatLexer.COLUMN, vocabularyOf(FormatLexer)).unquoted(c.getFirst()).t(FormatLexer.TYPE, vocabularyOf(FormatLexer));
                errorHandler.alertOnError_(TranslationUtility.getString("error.copying.column", c.getFirst().getRaw()), () => c.getSecond().getType().save(b));
                b.nl();
            }
            b.pop();
            b.end().raw("FF").t(MainLexer.FORMAT).nl();
            let plainText = "";
            errorHandler.alertOnError_(TranslationUtility.getString("error.copying.data.values"), () =>
            {
                b.t(MainLexer.VALUES).begin().raw("VV").nl();
                b.pushPrefix(new SaveTag("VV"));
                const rowRange = rowRangeSupplier();
                for (let i = rowRange.startRowIncl; i <= rowRange.endRowIncl; i++)
                {
                    b.indent();
                    let firstValueInRow = true;
                    for (const c of columns)
                    {
                        if (!firstValueInRow)
                            b.raw(",");
                        b.data(c.getSecond(), i);
                        if (!firstValueInRow)
                            plainText += ", ";
                        try
                        {
                            plainText += DataTypeUtility.valueToString(c.getSecond().getCollapsed(i));
                        }
                        catch (e)
                        {
                            if (!(e instanceof InvalidImmediateValueException))
                                throw e;
                            plainText += OutputBuilder.token(vocabularyOf(DataParser), DataParser.INVALID) + OutputBuilder.quoted(e.getInvalid());
                        }
                        firstValueInRow = false;
                    }
                    if (i < rowRange.endRowIncl)
                        plainText += "\n";
                    b.nl();
                }
                b.pop();
                b.end().raw("VV").t(MainLexer.VALUES).nl();
                const str = b.toString();
                const plainTextFinal = plainText;
                Platform.runLater(() =>
                {
                    const copyData = new Map<string, string>();
                    copyData.set(ClipboardUtils.DATA_FORMAT, str);
                    copyData.set(ClipboardUtils.PLAIN_TEXT, plainTextFinal);
                    //System.out.println("Copying: {{{\n" + str + "\n}}}");
                    setContent(copyData);
                    if (onCompletion !== null)
                        onCompletion(true);
                });
            });

        });
    }
}

export namespace ClipboardUtils
{
    export class LoadedColumnInfo
    {
        public readonly columnName: ColumnId | null; // May not be known
        public readonly dataType: DataType;
        public readonly dataValues: readonly Either<string, Value>[];

        public constructor(columnName: ColumnId | null, dataType: DataType, dataValues: readonly Either<string, Value>[])
        {
            this.columnName = columnName;
            this.dataType = dataType;
            this.dataValues = dataValues;
        }

        public load(i: number): SimulationFunction<RecordSet, EditableColumn>
        {
            return rs =>
            {
                return ColumnUtility.makeImmediateColumn(this.dataType, this.columnName !== null ? this.columnName : new ColumnId(IdentifierUtility.identNum("Column", i)), this.dataValues, DataTypeUtility.makeDefaultValue(this.dataType))(rs);
            };
        }
    }

    export class RowRange
    {
        /** @internal Java: private, but read by ClipboardUtils */
        public readonly startRowIncl: number;
        /** @internal Java: private, but read by ClipboardUtils */
        public readonly endRowIncl: number;

        public constructor(startRowIncl: number, endRowIncl: number)
        {
            this.startRowIncl = startRowIncl;
            this.endRowIncl = endRowIncl;
        }
    }
}
