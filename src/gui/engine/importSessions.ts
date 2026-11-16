// The importers' dialogs, for the engine (Java: the importers showed them on the parent window, waiting
// for each): each is asked of the GUI with an event, and answered by a method (EngineHost's import
// methods come here).  The import dialog (Java: ImportChoicesDialog) is a session, which the GUI asks
// for the source and previews of, until it closes.
import type { DataSource } from "../../engine/data/data/DataSource.js";
import type { EditableRecordSet } from "../../engine/data/data/EditableRecordSet.js";
import type { RecordSet } from "../../engine/data/data/RecordSet.js";
import type { Localized } from "../../engine/anns/Annotations.js";
import type { CellPosition } from "../../engine/data/data/CellPosition.js";
import type { Column } from "../../engine/data/data/Column.js";
import type { TableManager } from "../../engine/data/data/TableManager.js";
import { ExcelImporter } from "../../engine/importers/importers/ExcelImporter.js";
import { GuessFormat } from "../../engine/importers/importers/GuessFormat.js";
import { ImporterGUI, type ImportChoice } from "../../engine/importers/importers/gui/ImporterGUI.js";
import { HTMLImporter } from "../../engine/importers/importers/HTMLImporter.js";
import type { Importer } from "../../engine/importers/importers/Importer.js";
import type { ImporterDialogs } from "../../engine/importers/importers/ImporterDialogs.js";
import { ImporterManager } from "../../engine/importers/importers/manager/ImporterManager.js";
import { RImporter } from "../../engine/importers/importers/RImporter.js";
import { TextImporter } from "../../engine/importers/importers/TextImporter.js";
import { JavaFile } from "../../engine/java/JavaFile.js";
import { Pair } from "../../engine/utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../engine/utility-error/error/InternalException.js";
import { UserException } from "../../engine/utility-error/error/UserException.js";
import { Log } from "../../engine/utility/log/Log.js";
import { IdentifierUtility } from "../../engine/utility/utility/IdentifierUtility.js";
import type { CellContent, EngineEvent, ImportChoiceChange, ImportChoiceInfo, ImporterInfo, ImportPreview, ImportTrim } from "./protocol.js";

// Java: Main's registration of the importers, once
let registered = false;
function registerImporters(): void
{
    if (registered)
        return;
    registered = true;
    ImporterManager.getInstance().registerImporter(new TextImporter());
    ImporterManager.getInstance().registerImporter(new HTMLImporter());
    ImporterManager.getInstance().registerImporter(new ExcelImporter());
    ImporterManager.getInstance().registerImporter(new RImporter());
}

interface Session
{
    readonly importer: GuessFormat.Import<unknown, unknown>;
    readonly suggestedName: string;
    readonly choices: readonly ImportChoice[];
    readonly then: (importInfo: GuessFormat.ImportInfo<unknown> | null) => void;
    // The last preview's format (Java: ImportChoicesDialog.destFormat):
    destFormat: unknown;
}

export class ImportSessions implements ImporterDialogs
{
    private readonly sessions = new Map<number, Session>();
    private readonly requests = new Map<number, (result: unknown) => void>();
    private next = 0;

    public constructor(private readonly tableManager: TableManager, private readonly sendEvent: (event: EngineEvent) => void, private readonly cellContent: (column: Column, row: number) => CellContent, private readonly typeText: (column: Column) => string)
    {
        registerImporters();
    }

    public importers(): readonly ImporterInfo[]
    {
        return ImporterManager.getInstance().getRegisteredImporters().map(i => ({ name: i.getName(), fileTypes: i.getSupportedFileTypes() }));
    }

    // Java: ImporterManager.importFile (for a file picked; the origin, its file URL), or the importer
    // picked's importFile (Import URL)
    public importFile(name: string, bytes: Uint8Array, url: string | null, importer: number | null, position: CellPosition, onLoad: (dataSource: DataSource) => void): void
    {
        const file = new JavaFile(name, bytes);
        const origin = new URL(url ?? "file:///" + encodeURIComponent(name));
        if (importer === null)
            ImporterManager.getInstance().importFile(this, this.tableManager, position, file, origin, onLoad);
        else
            ImporterManager.getInstance().getRegisteredImporters()[importer]?.importFile(this, this.tableManager, position, file, origin, onLoad);
    }

    // Java: pasteIntoEmpty's text import, of a temporary file of the clipboard's text
    public importText(file: JavaFile, position: CellPosition, onLoad: (dataSource: DataSource) => void): void
    {
        TextImporter.importTextFile(this, this.tableManager, file, position, onLoad);
    }

    // --- ImporterDialogs -------------------------------------------------------------------------

    public showImportChoices<SRC_FORMAT, FORMAT>(suggestedName: string, importer: GuessFormat.Import<SRC_FORMAT, FORMAT>, then: (importInfo: GuessFormat.ImportInfo<FORMAT> | null) => void): void
    {
        const session = ++this.next;
        const choices = importer.getChoices?.() ?? [];
        this.sessions.set(session, { importer: importer as GuessFormat.Import<unknown, unknown>, suggestedName, choices, then: then as (importInfo: GuessFormat.ImportInfo<unknown> | null) => void, destFormat: null });
        this.sendEvent({ kind: "importChoices", session, suggestedName, choices: choices.map(choiceInfo) });
    }

    public pickHTMLTable(htmlFile: JavaFile, source: URL, then: (picked: Pair<string[][], Localized[]> | null) => void): void
    {
        this.ask({ kind: "pickHTMLTable", fileName: htmlFile.getName(), bytes: htmlFile.readAllBytes(), source: source.href }, picked =>
        {
            const p = picked as { readonly vals: readonly (readonly string[])[], readonly columnNames: readonly string[] } | null;
            then(p === null ? null : new Pair(p.vals.map(r => [...r]), [...p.columnNames]));
        });
    }

    public pickRTables(tables: readonly Pair<string, EditableRecordSet>[], then: (picked: readonly Pair<string, EditableRecordSet>[] | null) => void): void
    {
        this.ask({ kind: "pickRTables", tables: tables.map(t => t.getFirst()) }, picked => then(picked === null ? null : (picked as readonly number[]).map(i => tables[i]!)));
    }

    public pickImporter(src: JavaFile, importers: readonly Importer[], then: (importer: Importer | null) => void): void
    {
        const name = src.getName();
        const dot = name.lastIndexOf(".");
        const guess = ImporterManager.getInstance().guessImporterFromFileExtension(dot === -1 ? "" : name.substring(dot + 1));
        this.ask({ kind: "pickImporter", fileName: name, guess: guess === null ? null : importers.indexOf(guess) }, picked => then(picked === null ? null : importers[picked as number] ?? null));
    }

    private ask(dialog: Extract<EngineEvent, { kind: "importDialog" }>["dialog"], then: (result: unknown) => void): void
    {
        const request = ++this.next;
        this.requests.set(request, then);
        this.sendEvent({ kind: "importDialog", request, dialog });
    }

    /** A dialog's answer. */
    public answer(request: number, result: unknown): void
    {
        const then = this.requests.get(request);
        this.requests.delete(request);
        then?.(result);
    }

    // --- The import dialog's session -------------------------------------------------------------

    public choice(session: number, index: number, change: ImportChoiceChange): { readonly error: string | null, readonly changed: boolean }
    {
        const s = this.sessions.get(session);
        const choice = s?.choices[index];
        if (s === undefined || choice === undefined)
            return { error: null, changed: false };
        // (Java: the source format's listener, called when it changes)
        let changed = false;
        const listener = (): void =>
        {
            changed = true;
        };
        s.importer.currentSrcFormat().addListener(listener);
        let error: string | null = null;
        try
        {
            if (choice.kind === "check" && "checked" in change)
                choice.set(change.checked);
            else if (choice.kind === "pick" && "selected" in change)
                error = ImporterGUI.choose(choice.details, choice.choice, change.selected, change.otherText);
        }
        finally
        {
            s.importer.currentSrcFormat().removeListener(listener);
        }
        return { error, changed };
    }

    // Java: ImportChoicesDialog's listener on the source format: the source loaded (on a worker thread)
    public source(session: number): ImportPreview
    {
        const s = this.sessions.get(session);
        const srcFormat = s?.importer.currentSrcFormat().get() ?? null;
        if (s === undefined || srcFormat === null)
            return { kind: "none" };
        try
        {
            const loadedSrc = s.importer.loadSource(srcFormat);
            const columns = loadedSrc.recordSet.getColumns();
            const overrides = loadedSrc.columnNameOverrides;
            const names = overrides !== null && overrides.length === columns.length ? overrides : columns.map(c => c.getName().getRaw());
            const t = loadedSrc.trimChoice;
            return { kind: "table", columns: names.map(name => ({ name, type: null })), rows: this.rows(loadedSrc.recordSet), trim: { top: t.trimFromTop, bottom: t.trimFromBottom, left: t.trimFromLeft, right: t.trimFromRight } };
        }
        catch (e)
        {
            return failed(e);
        }
    }

    // Java: ImportChoicesDialog.updateDestPreview
    public dest(session: number, trim: ImportTrim): ImportPreview
    {
        const s = this.sessions.get(session);
        const srcFormat = s?.importer.currentSrcFormat().get() ?? null;
        if (s === undefined || srcFormat === null)
            return { kind: "none" };
        try
        {
            const loadedDest = s.importer.loadDest(srcFormat, new GuessFormat.TrimChoice(trim.top, trim.bottom, trim.left, trim.right));
            s.destFormat = loadedDest.getFirst();
            const recordSet = loadedDest.getSecond();
            return { kind: "table", columns: recordSet.getColumns().map(c => ({ name: c.getName().getRaw(), type: this.typeText(c) })), rows: this.rows(recordSet), trim: null };
        }
        catch (e)
        {
            return failed(e);
        }
    }

    // Java: ImportChoicesDialog's result converter: with OK (and a preview made), the table's name and
    // the format
    public close(session: number, ok: boolean): void
    {
        const s = this.sessions.get(session);
        if (s === undefined)
            return;
        this.sessions.delete(session);
        s.then(ok && s.destFormat !== null ? new GuessFormat.ImportInfo(IdentifierUtility.fixExpressionIdentifier(s.suggestedName, "Table"), s.destFormat) : null);
    }

    private rows(recordSet: RecordSet): CellContent[][]
    {
        const columns = recordSet.getColumns();
        const r: CellContent[][] = [];
        const length = recordSet.getLength();
        for (let row = 0; row < length; row++)
            r.push(columns.map(c => this.cellContent(c, row)));
        return r;
    }
}

// Java: makeGUI's row for a choice, or getGUI's check box
function choiceInfo(choice: ImportChoice): ImportChoiceInfo
{
    if (choice.kind === "check")
        return { kind: "check", labelKey: choice.labelKey, helpId: choice.helpKey, checked: choice.get() };
    const row = ImporterGUI.makeGUI(choice.details, choice.choice);
    const labelKey = choice.details.getLabelKey();
    const helpId = choice.details.getHelpId();
    return row.kind === "label" ? { kind: "label", labelKey, helpId, text: row.text } : { kind: "combo", labelKey, helpId, items: row.items, other: row.other, selected: row.selected, otherText: row.otherText };
}

// (Java logged the error, and showed no columns)
function failed(e: unknown): ImportPreview
{
    if (!(e instanceof InternalException || e instanceof UserException))
        throw e;
    Log.log(e);
    return { kind: "error" };
}
