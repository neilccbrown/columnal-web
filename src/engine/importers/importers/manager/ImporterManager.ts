// Port of xyz.columnal.importers.manager.ImporterManager (importers module).
//
// PORT-DEFERRED: chooseAndImportFile and chooseAndImportURL, with the dialogs they show (a file
// chooser, and ImportURLDialog, which suggests a URL from the clipboard, picks an importer from the
// link's extension, and downloads the file), and download (Phase 11; the browser's file pickers and
// fetching are asynchronous).  PickImporterPane's guessImporterFromFileExtension is here, and
// PickImporterDialog is shown through ImporterDialogs.pickImporter.
import type { Localized } from "../../../anns/Annotations.js";
import type { CellPosition } from "../../../data/data/CellPosition.js";
import type { DataSource } from "../../../data/data/DataSource.js";
import type { TableManager } from "../../../data/data/TableManager.js";
import type { JavaFile } from "../../../java/JavaFile.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import type { SimulationConsumerNoError } from "../../../utility-functional/utility/function/simulation/SimulationConsumerNoError.js";
import { TranslationUtility } from "../../../utility/utility/TranslationUtility.js";
import type { Importer } from "../Importer.js";
import type { ImporterDialogs } from "../ImporterDialogs.js";

export class ImporterManager
{
    // Singleton:
    private static readonly SINGLETON = new ImporterManager();

    private readonly registeredImporters: Importer[] = [];

    public registerImporter(importer: Importer): void
    {
        this.registeredImporters.push(importer);
    }

    /** Java: the registered importers, as listed in PickImporterPane. */
    public getRegisteredImporters(): readonly Importer[]
    {
        return this.registeredImporters;
    }

    /**
     * Java: importFile(Window parent, ...).  The dialogs stand in for the parent window (see
     * ImporterDialogs).
     */
    public importFile(dialogs: ImporterDialogs, tableManager: TableManager, destination: CellPosition, file: JavaFile, source: URL, onLoad: SimulationConsumerNoError<DataSource>): void
    {
        // Work out which importer will handle it:
        for (const importer of this.registeredImporters)
        {
            if (importer.getSupportedFileTypes().some(ext => ImporterManager.matches(file, ext)))
            {
                importer.importFile(dialogs, tableManager, destination, file, source, onLoad);
                return;
            }
        }
        // If none match, give user free choice of importers:
        dialogs.pickImporter(file, this.registeredImporters, importer =>
        {
            if (importer !== null)
                importer.importFile(dialogs, tableManager, destination, file, source, onLoad);
        });
    }

    private static matches(file: JavaFile, wildcard: string): boolean
    {
        if (wildcard.startsWith("*") && file.getName().endsWith(wildcard.substring(1)))
            return true;
        return false;
    }

    public static getInstance(): ImporterManager
    {
        return ImporterManager.SINGLETON;
    }

    /**
     * Java: PickImporterPane.guessImporterFromFileExtension, which selects the first importer that
     * supports the extension (ignoring case), if there is one.
     */
    public guessImporterFromFileExtension(fileExtensionWithoutDot: string): Importer | null
    {
        return this.registeredImporters.find(imp => imp.getSupportedFileTypes().some(ext => ext.toLowerCase() === ("*." + fileExtensionWithoutDot).toLowerCase())) ?? null;
    }

    /**
     * PORT-NOTE: Java first tries the text as a URL, then as a path to a local file that exists
     * ("file://" + src), then as an http URL.  A web page can't look at local files, so that step
     * is left out.  Java's URL class also accepts some text that JavaScript's doesn't, and vice versa.
     */
    public static checkURL(src: string): Either<Localized, URL>
    {
        if (src === "")
            return Either.left(TranslationUtility.getString("importer.error.url.blank"));
        let originalException: unknown;
        try
        {
            return Either.right(new URL(src));
        }
        catch (e)
        {
            originalException = e;
        }
        // Most likely issue is that it needs http:// on the front:
        try
        {
            return Either.right(new URL("http://" + src));
        }
        catch (_e)
        {
            // Not a URL, either
        }
        // Return first exception:
        return Either.left(originalException instanceof Error ? originalException.message : String(originalException));
    }
}
