// Port of test.gen.GenFormat (tests-gui-format testFixtures).
import type { ColumnType } from "../../../../../src/engine/data/data/columntype/ColumnType.js";
import { BlankColumnType, CleanDateColumnType, ColumnType as ColumnTypes, NumericColumnType, TextColumnType } from "../../../../../src/engine/data/data/columntype/ColumnTypes.js";
import { ColumnId } from "../../../../../src/engine/identifiers/id/ColumnId.js";
import { Charset } from "../../../../../src/engine/java/JavaCharset.js";
import { LocalDate, type DateTimeFormatter } from "../../../../../src/engine/java/time/JavaTime.js";
import { ColumnInfo } from "../../../../../src/engine/importers/importers/ColumnInfo.js";
import { GuessFormat } from "../../../../../src/engine/importers/importers/GuessFormat.js";
import { DateTimeInfo } from "../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { Unit } from "../../../../../src/engine/types/data/unit/Unit.js";
import { IdentifierUtility } from "../../../../../src/engine/utility/utility/IdentifierUtility.js";
import { canEncode } from "../../../../support/charsets.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { DummyManager } from "../../../tests-functions/fixtures/DummyManager.js";

/**
 * Created by neil on 29/10/2016.
 */
export class GenFormat extends Generator<GuessFormat.FinalTextFormat>
{
    public static CHARSETS: Charset[] = ["ISO-8859-1", "UTF-8", "UTF-16"].map(c => Charset.forName(c));
    public static seps: string[] = [",", ";", "\t", "|"];
    // Only EUR has reliable one-to-one connection with currency symbol:
    public static currencies: Unit[] = [
        DummyManager.make().getUnitManager().loadUse("EUR"),
    ];

    public static f(headerRows: number, columns: readonly ColumnInfo[], sep: string | null, quote: string | null, charset: Charset): GuessFormat.FinalTextFormat
    {
        return new GuessFormat.FinalTextFormat(new GuessFormat.InitialTextFormat(charset, sep, quote), new GuessFormat.TrimChoice(headerRows, 0, 0, 0), columns);
    }

    public override generate(sourceOfRandomness: SourceOfRandomness, _generationStatus: GenerationStatus): GuessFormat.FinalTextFormat
    {
        const sep = "" + sourceOfRandomness.choose(GenFormat.seps);
        const hasTitle = true; //sourceOfRandomness.nextBoolean();
        const garbageBeforeTitle = 0; //sourceOfRandomness.nextInt(0, 10);
        const garbageAfterTitle = 0; //sourceOfRandomness.nextInt(0, 5);
        const columns: ColumnInfo[] = [];
        const columnCount = sourceOfRandomness.nextInt(2, 15);
        for (let i = 0; i < columnCount; i++)
        {
            const dateFormats: DateTimeFormatter[] = new DateTimeInfo(DateTimeInfo.DateTimeType.YEARMONTHDAY).getFlexibleFormatters().flatMap(l => l);
            // The list's items are made in order, as Java evaluates them:
            const blank = ColumnTypes.BLANK;
            const text = new TextColumnType();
            const numeric: ColumnType = sourceOfRandomness.nextInt(0, 10) < 7 ?
                new NumericColumnType(Unit.SCALAR, sourceOfRandomness.nextInt(0, 6), null, null) :
                ((): ColumnType =>
                {
                    const curr = sourceOfRandomness.choose(GenFormat.currencies);
                    let displayPrefix: string | null = curr.getDisplayPrefix();
                    let displaySuffix: string | null = curr.getDisplaySuffix();
                    // We use null if empty:
                    if (displayPrefix === "")
                        displayPrefix = null;
                    if (displaySuffix === "")
                        displaySuffix = null;
                    return new NumericColumnType(curr, sourceOfRandomness.nextInt(0, 6), displayPrefix, displaySuffix);
                })();
            const date = new CleanDateColumnType(DateTimeInfo.DateTimeType.YEARMONTHDAY, true, sourceOfRandomness.choose(dateFormats), LocalDate.FROM);
            let type: ColumnType = sourceOfRandomness.choose<ColumnType>([blank, text, numeric, date]);
                //TODO tag?, boolean
            // Don't end with blank:
            if (i === columnCount - 1 && (type instanceof BlankColumnType || columns.every(c => GenFormat.canBeBlank(c))))
                type = new TextColumnType();
            // Don't let all be text/blank:
            if (i === columnCount - 1 && columns.every(c => c.type instanceof TextColumnType || c.type instanceof BlankColumnType))
                type = new CleanDateColumnType(DateTimeInfo.DateTimeType.YEARMONTHDAY, true, sourceOfRandomness.choose(dateFormats), LocalDate.FROM);
            const title = IdentifierUtility.identNum(hasTitle ? "GenCol" : "Unspec", i);
            columns.push(new ColumnInfo(type, new ColumnId(title)));
        }
        // Don't pick a charset which can't represent the currency signs:
        const possibleCharsets = GenFormat.CHARSETS.filter(charset => columns.every(ci => ci.type instanceof NumericColumnType ?
            canEncode(charset, ci.type.unit.getDisplayPrefix()) : true)
        );

        return GenFormat.f(garbageBeforeTitle + garbageAfterTitle + (hasTitle ? 1 : 0), [...columns], sep, ""/*TODO */, sourceOfRandomness.choose(possibleCharsets));
    }

    public override doShrink(_random: SourceOfRandomness, larger: GuessFormat.FinalTextFormat): GuessFormat.FinalTextFormat[]
    {
        const r: GuessFormat.FinalTextFormat[] = [];
        for (let i = 0; i < larger.columnTypes.length; i++)
        {
            const reducedCols = [...larger.columnTypes];
            if (i === larger.columnTypes.length - 1 && i >= 1 && reducedCols[i - 1]!.type instanceof BlankColumnType)
                continue; // Don't remove last one if one before is blank
            reducedCols.splice(i, 1);
            // Don't let them all be blank or all text/blank:
            if (reducedCols.every(c => GenFormat.canBeBlank(c)) || reducedCols.every(c => c.type instanceof TextColumnType || c.type instanceof BlankColumnType))
                continue;
            const smaller = GenFormat.f(larger.trimChoice.trimFromTop, reducedCols, larger.initialTextFormat.separator, larger.initialTextFormat.quote, Charset.forName("UTF-8"));
            if (reducedCols.length >= 2) // TODO allow one column
                r.push(smaller);
        }
        return r;
    }

    private static canBeBlank(columnInfo: ColumnInfo): boolean
    {
        return columnInfo.type instanceof BlankColumnType;
    }
}
