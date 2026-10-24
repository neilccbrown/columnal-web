// Port of xyz.columnal.exporters.manager.ExporterManager (exporters module).
//
// PORT-DEFERRED: chooseAndExportFile, with its dialogs (PickExporterDialog, which lists the registered
// exporters as "name (*.ext, ...)", picking one by double-click or OK, then a file chooser), which runs
// the export on the worker thread, showing any error ("error.exporting") (Phase 11; saving a file in
// the browser is asynchronous).
import type { Exporter } from "../Exporter.js";

export class ExporterManager
{
    // Singleton:
    private static readonly SINGLETON = new ExporterManager();

    private readonly registeredExporters: Exporter[] = [];

    public registerExporter(exporter: Exporter): void
    {
        this.registeredExporters.push(exporter);
    }

    /** Java: the registered exporters, as listed in PickExporterPane. */
    public getRegisteredExporters(): readonly Exporter[]
    {
        return this.registeredExporters;
    }

    public static getInstance(): ExporterManager
    {
        return ExporterManager.SINGLETON;
    }
}
