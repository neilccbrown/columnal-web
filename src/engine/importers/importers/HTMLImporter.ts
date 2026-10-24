// Port of xyz.columnal.importers.HTMLImporter (importers module).
//
// PORT-NOTE: Java parses the file with jsoup; here the browser's DOMParser parses it, with jsoup's
// text extraction (src/engine/java/Jsoup.ts).  The dialog that shows the document for picking a
// table (Java's PickHTMLTableDialog, a WebView whose "gui_import:id<n>" links pick table n) is
// rebuilt in the GUI and shown through ImporterDialogs.pickHTMLTable.
//
// PORT-DEFERRED: the options shown in the import dialog (Java's getGUI, Phase 11): check boxes for
// trimming whitespace ("import.trimWhitespace") and, for a page from Wikipedia, removing footnotes
// ("import.removeWikipediaFootnotes"), which set trimWhitespace and removeWikipediaFootnotes below
// and refresh the format.
import type { Localized } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { DataSource } from "../../data/data/DataSource.js";
import { ImmediateDataSource } from "../../data/data/DataSources.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { ColumnId } from "../../identifiers/id/ColumnId.js";
import { javaListGet } from "../../java/JavaCollections.js";
import { javaParseInt, NumberFormatException } from "../../java/JavaString.js";
import { IOException } from "../../java/JavaExceptions.js";
import type { JavaFile } from "../../java/JavaFile.js";
import { jsoupParse, jsoupText, jsoupWholeText } from "../../java/Jsoup.js";
import { Platform } from "../../java/Platform.js";
import { Pair } from "../../utility-adt/utility/adt/Pair.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { SimulationConsumer } from "../../utility-functional/utility/function/simulation/SimulationConsumer.js";
import type { SimulationConsumerNoError } from "../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { ErrorHandler } from "../../utility/log/ErrorHandler.js";
import { Log } from "../../utility/log/Log.js";
import { IdentifierUtility } from "../../utility/utility/IdentifierUtility.js";
import { TranslationUtility } from "../../utility/utility/TranslationUtility.js";
import { UnitType } from "../../utility/utility/UnitType.js";
import { Utility } from "../../utility/utility/Utility.js";
import { Workers } from "../../utility/utility/Workers.js";
import type { GuessFormat } from "./GuessFormat.js";
import type { Importer } from "./Importer.js";
import type { ImporterDialogs } from "./ImporterDialogs.js";
import { ImporterUtility } from "./ImporterUtility.js";
import { ImportPlainTable } from "./ImportPlainTable.js";

enum TableState { HEAD, BODY }

// Java: FXPlatformSupplier<@Nullable SimulationSupplier<DataSource>>, which shows the import
// dialog; here it passes the outcome to a callback, as the dialog can't be waited for.
type PendingImport = (then: (result: SimulationSupplier<DataSource> | null) => void) => void;

// Guava's CharMatcher.whitespace().trimFrom: the Unicode White_Space characters
function trimWhitespace(s: string): string
{
    return s.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}

/**
 * Created by neil on 31/10/2016.
 */
export class HTMLImporter implements Importer
{
    public static readonly FOOTNOTE_REGEX = "(\\[[A-Za-z0-9]+( [0-9]+)?\\]\\s*)+$";
    // FOOTNOTE_REGEX as a JavaScript regex (Java's \s is only ASCII whitespace):
    public static readonly FOOTNOTE = /(\[[A-Za-z0-9]+( [0-9]+)?\][ \t\n\v\f\r]*)+$/u;

    /**
     * PORT-NOTE: Java links the document to the app's htmlimport.css stylesheet (which outlines the
     * tables that can be imported); the GUI must serve its version at this address.
     */
    public static readonly IMPORT_STYLESHEET = "htmlimport.css";

    // Gives back an HTML document to display, and a function which takes a table index then imports that.
    public static importHTMLFile(
        dialogs: ImporterDialogs, mgr: TableManager, htmlFile: JavaFile, source: URL, destination: CellPosition, withDataSources: SimulationConsumer<readonly DataSource[]>): Pair<Document, (tableIndex: number) => void>
    {
        const results: PendingImport[] = [];
        const doc = HTMLImporter.parse(htmlFile);
        let parent = source;
        try
        {
            parent = (source.pathname.endsWith("/") ? new URL("..", source) : new URL(".", source));
        }
        catch (e)
        {
            console.error(e);
        }
        doc.head.insertAdjacentHTML("afterbegin", "<base href=\"" + parent.href + "\">");
        doc.head.insertAdjacentHTML("beforeend", "<link rel=\"stylesheet\" href=\"" + HTMLImporter.IMPORT_STYLESHEET + "\">");
        const tables = Array.from(doc.querySelectorAll("table"));
        for (let i = 0; i < tables.length; i++)
        {
            const table = tables[i]!;
            // Exclude nested tables (TODO have tickbox controlling this)
            // (jsoup's select includes the element itself)
            if (Array.from(table.children).every(e => !e.matches("table") && e.querySelector("table") === null))
            {
                table.insertAdjacentHTML("afterbegin", "<div class='overlay'></div>");
                const wrapper = doc.createElement("a");
                wrapper.setAttribute("class", "gui_import");
                wrapper.setAttribute("style", "");
                wrapper.setAttribute("href", "gui_import:id" + i);
                table.replaceWith(wrapper);
                wrapper.appendChild(table);
            }
        }

        const importTable = (tableIndex: number): void =>
        {
            HTMLImporter.importTable(dialogs, mgr, htmlFile, destination, withDataSources, results, tables, tableIndex, source.href.includes("wikipedia.org"));
        };

        return new Pair(doc, importTable);
    }

    /**
     * The contents of an HTML table, as Java's importTable reads them: a list of rows (from the
     * table's thead and tbody, spreading cells with colspan and rowspan), and the column names (the
     * cells of the last row in the head, or the last body row made only of th cells).
     *
     * PORT-NOTE: split out of importTable (which then shows the import dialog), so that it can be
     * tested without the GUI.
     */
    public static readTable(table: Element): Pair<string[][], Localized[]>
    {
        // vals is a list of rows:
        const vals: string[][] = [];
        // Maps position to pending item.  Abusing GridAreaCellPosition a little: it means table position here
        // (Java uses a HashMap keyed by GridAreaCellPosition; the key here is "row,column")
        const pendingSpanItems = new Map<string, string>();
        const pos = (row: number, col: number): string => row + "," + col;
        const ROW = 1;
        const COL = 1;

        const columnNames: Localized[] = [];


        let tableState: TableState;
        for (const tableBit of Array.from(table.children))
        {
            if (tableBit.localName === "thead")
            {
                tableState = TableState.HEAD;
            }
            else if (tableBit.localName === "tbody")
            {
                tableState = TableState.BODY;
            }
            else
                continue;
            const tableChildren = Array.from(tableBit.children);
            let rowIndex = 0;
            for (const row of tableChildren)
            {
                if (row.localName !== "tr")
                    continue;
                const rowVals: string[] = [];
                const children = Array.from(row.children);
                let columnIndex = 0;
                let nextPos = pos(rowIndex, columnIndex);
                while (pendingSpanItems.has(nextPos))
                {
                    rowVals.push(pendingSpanItems.get(nextPos)!);
                    columnIndex += 1 * COL;
                    nextPos = pos(rowIndex, columnIndex);
                }

                // If empty, don't count as allTH.  Otherwise start true
                let allTH = children.length !== 0;
                for (const cell of children)
                {
                    if (cell.localName !== "td" && cell.localName !== "th")
                        continue;
                    allTH = allTH && cell.localName === "th";
                    rowVals.push(jsoupWholeText(cell));
                    let rowSpan = 1;
                    let colSpan = 1;
                    if (cell.hasAttribute("colspan"))
                    {
                        try
                        {
                            colSpan = javaParseInt(cell.getAttribute("colspan")!);
                        }
                        catch (e)
                        {
                            if (!(e instanceof NumberFormatException))
                                throw e;
                            Log.log(e);
                            // Leave it at 1
                        }
                    }
                    if (cell.hasAttribute("rowspan"))
                    {
                        try
                        {
                            rowSpan = javaParseInt(cell.getAttribute("rowspan")!);
                        }
                        catch (e)
                        {
                            if (!(e instanceof NumberFormatException))
                                throw e;
                            Log.log(e);
                            // Leave it at 1
                        }
                    }
                    // add to current row (though it will just be removed by while loop beneath):
                    if (colSpan > 1)
                    {
                        for (let extraCol = 1 * COL; extraCol < colSpan; extraCol += 1 * COL)
                        {
                            pendingSpanItems.set(pos(rowIndex, columnIndex + extraCol), jsoupText(cell));
                        }
                    }
                    // Add to future rows:
                    if (rowSpan > 1)
                    {
                        for (let extraRow = 1 * ROW; extraRow < rowSpan; extraRow += 1 * ROW)
                        {
                            for (let extraCol = 0 * COL; extraCol < colSpan; extraCol += 1 * COL)
                            {
                                pendingSpanItems.set(pos(rowIndex + extraRow, columnIndex + extraCol), jsoupText(cell));
                            }
                        }
                    }
                    nextPos = pos(rowIndex, columnIndex);
                    while (pendingSpanItems.has(nextPos))
                    {
                        rowVals.push(pendingSpanItems.get(nextPos)!);
                        columnIndex += 1 * COL;
                        nextPos = pos(rowIndex, columnIndex);
                    }
                }

                if (tableState === TableState.BODY && !allTH)
                {
                    vals.push(rowVals);
                    rowIndex += 1 * ROW;
                }
                else
                {
                    columnNames.length = 0;
                    columnNames.push(...Utility.mapList_Index(rowVals, (_n, s) => s));
                }
            }
        }
        return new Pair(vals, columnNames);
    }

    /**
     * The import (for the import dialog) of a table's contents, as read by readTable.
     * PORT-NOTE: split out of importTable, like readTable.
     */
    public static makeImport(mgr: TableManager, vals: readonly (readonly string[])[], columnNames: readonly Localized[], fromWikipedia: boolean): HTMLImporter.HTMLImport
    {
        return new HTMLImporter.HTMLImport(vals.length === 0 ? 0 : vals[0]!.length, mgr, vals, columnNames, fromWikipedia);
    }

    protected static importTable(dialogs: ImporterDialogs, mgr: TableManager, htmlFile: JavaFile, destination: CellPosition, withDataSources: SimulationConsumer<readonly DataSource[]>, results: PendingImport[], tables: readonly Element[], tableIndex: number, fromWikipedia: boolean): void
    {
        const table = tables[tableIndex]!;
        const read = HTMLImporter.readTable(table);
        const vals = read.getFirst();
        const columnNames = read.getSecond();
        ImporterUtility.rectangulariseAndRemoveBlankRows(vals);
        const imp = HTMLImporter.makeImport(mgr, vals, columnNames, fromWikipedia);
        results.push(then =>
        {
            dialogs.showImportChoices(htmlFile.getName(), imp, outcome =>
            {
                if (outcome !== null)
                {
                    const outcomeNonNull = outcome;
                    const makeDataSource: SimulationSupplier<DataSource> = () =>
                    {
                        return new ImmediateDataSource(mgr, outcomeNonNull.getInitialLoadDetails(destination), ImporterUtility.makeEditableRecordSet(mgr.getTypeManager(), imp.processTrimmed(outcomeNonNull.getFormat().trim.trim(vals)), outcomeNonNull.getFormat().columnInfo));
                    };
                    then(makeDataSource);
                }
                else
                    then(null);
            });
        });
        // Java: shows each pending import's dialog in turn (including any from an earlier call),
        // then makes the data sources on the worker thread:
        const sources: SimulationSupplier<DataSource>[] = [];
        const showNext = (i: number): void =>
        {
            if (i < results.length)
            {
                results[i]!(s =>
                {
                    if (s !== null)
                        sources.push(s);
                    showNext(i + 1);
                });
            }
            else
                Workers.onWorkerThread("Loading HTML", Workers.Priority.LOAD_FROM_DISK, () => ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.loading.html"), () => withDataSources(Utility.mapListExI(sources, s => s()))));
        };
        showNext(0);
    }

    private static importHTMLFileThen(dialogs: ImporterDialogs, mgr: TableManager, htmlFile: JavaFile, destination: CellPosition, source: URL, withDataSources: SimulationConsumer<readonly DataSource[]>): void
    {
        const p = HTMLImporter.importHTMLFile(dialogs, mgr, htmlFile, source, destination, withDataSources);
        Platform.runLater(() =>
        {
            dialogs.pickHTMLTable(p.getFirst(), n =>
            {
                if (n !== null)
                    p.getSecond()(n);
            });
        });
    }

    private static parse(htmlFile: JavaFile): Document
    {
        return jsoupParse(htmlFile.readAllBytes());
    }

    public getName(): Localized
    {
        return TranslationUtility.getString("importer.html.files");
    }

    public getSupportedFileTypes(): readonly string[]
    {
        return ["*.html", "*.htm"];
    }

    public importFile(dialogs: ImporterDialogs, tableManager: TableManager, destination: CellPosition, src: JavaFile, origin: URL, recordLoadedTable: SimulationConsumerNoError<DataSource>): void
    {
        Workers.onWorkerThread("Importing HTML", Workers.Priority.LOAD_FROM_DISK, () => ErrorHandler.getErrorHandler().alertOnError_(TranslationUtility.getString("error.importing.html"), () =>
        {
            try
            {
                HTMLImporter.importHTMLFileThen(dialogs, tableManager, src, destination, origin, dataSources =>
                {
                    for (const dataSource of dataSources)
                    {
                        recordLoadedTable(dataSource);
                    }
                });
            }
            catch (e)
            {
                if (!(e instanceof IOException))
                    throw e;
                throw new UserException("IO Error", e);
            }
        }));
    }
}

export namespace HTMLImporter
{
    /** Java: the anonymous ImportPlainTable subclass in importTable. */
    export class HTMLImport extends ImportPlainTable
    {
        // By default, trim:
        public readonly trimWhitespace: { value: boolean } = { value: true };
        public readonly removeWikipediaFootnotes: { value: boolean };

        public constructor(numSrcColumns: number, mgr: TableManager, private readonly tableVals: readonly (readonly string[])[], private readonly columnNames: readonly Localized[], fromWikipedia: boolean)
        {
            super(numSrcColumns, mgr, tableVals);
            this.removeWikipediaFootnotes = { value: fromWikipedia };
        }

        public override srcColumnName(index: number): Pair<ColumnId, Localized>
        {
            if (index < this.columnNames.length)
                return new Pair(new ColumnId(IdentifierUtility.fixExpressionIdentifier(this.columnNames[index]!, IdentifierUtility.identNum("Col", index))), this.columnNames[index]!);
            else
            {
                const columnId = new ColumnId(IdentifierUtility.identNum("C", (index + 1)));
                return new Pair(columnId, columnId.getRaw());
            }
        }

        public override destColumnName(trimChoice: GuessFormat.TrimChoice, index: number): ColumnId
        {
            if (index < this.columnNames.length)
            {
                let orig = this.columnNames[index]!;
                if (this.removeWikipediaFootnotes.value)
                {
                    orig = orig.replace(HTMLImporter.FOOTNOTE, "");
                }
                return new ColumnId(IdentifierUtility.fixExpressionIdentifier(orig, IdentifierUtility.identNum("Col", index)));
            }
            else if (trimChoice.trimFromTop > 0)
            {
                const valAbove = javaListGet(javaListGet(this.tableVals, trimChoice.trimFromTop - 1), index);
                return new ColumnId(IdentifierUtility.fixExpressionIdentifier(valAbove, IdentifierUtility.identNum("C", (index + 1))));
            }

            return this.srcColumnName(index).getFirst();
        }

        public override processTrimmed(all: readonly (readonly string[])[]): readonly (readonly string[])[]
        {
            const trimWS = this.trimWhitespace.value;
            const removeFoot = this.removeWikipediaFootnotes.value;
            if (trimWS || removeFoot)
                return Utility.mapListI(all, line => Utility.mapListI(line, s =>
                {
                    if (trimWS)
                        s = trimWhitespace(s);
                    if (removeFoot)
                        s = s.replace(HTMLImporter.FOOTNOTE, "");
                    return s;
                }));
            else
                return all;
        }

        /** Java: the check boxes in getGUI change the options, then force a refresh of the format. */
        public setOptions(trimWhitespace: boolean, removeWikipediaFootnotes: boolean): void
        {
            this.trimWhitespace.value = trimWhitespace;
            this.removeWikipediaFootnotes.value = removeWikipediaFootnotes;
            // Force refresh:
            this.format.set(null);
            this.format.set(UnitType.UNIT);
        }
    }
}
