<script setup lang="ts">
// The importing dialogs (Java: ImporterManager.chooseAndImportFile and chooseAndImportURL, and the
// dialogs the importers show): the file picker (Java: a file chooser), the URL dialog, and those the
// engine's importers ask for ("importChoices" and "importDialog" events), one at a time, in turn
// (docs/gui-spec/importing.md).
import { markRaw, onBeforeUnmount, shallowRef, useTemplateRef } from "vue";
import type { CellPosition } from "../../../engine/data/data/CellPosition.js";
import { ignoreClosed } from "../../engine/EngineClient.js";
import type { EngineEvent, ImporterInfo } from "../../engine/protocol.js";
import { useEngine } from "../../engine/useEngine.js";
import ImportChoicesDialog from "./ImportChoicesDialog.vue";
import ImportURLDialog from "./ImportURLDialog.vue";
import PickHTMLTableDialog from "./PickHTMLTableDialog.vue";
import PickImporterDialog from "./PickImporterDialog.vue";
import PickRTablesDialog from "./PickRTablesDialog.vue";

const engine = useEngine();

type ImportEvent = Extract<EngineEvent, { kind: "importChoices" } | { kind: "importDialog" }>;
// The dialogs asked for, the first showing:
const queue = shallowRef<readonly ImportEvent[]>([]);
const importers = shallowRef<readonly ImporterInfo[]>([]);
const dialogOpen = shallowRef(true);

const stopListening = engine.client.listen(event =>
{
    if (event.kind === "importChoices" || event.kind === "importDialog")
    {
        void loadImporters().then(() =>
        {
            queue.value = [...queue.value, markRaw(event)];
        });
    }
});
onBeforeUnmount(stopListening);

async function loadImporters(): Promise<readonly ImporterInfo[]>
{
    if (importers.value.length === 0)
        importers.value = await engine.client.request("importers");
    return importers.value;
}

// The one showing is done: the next one shows
function next(): void
{
    queue.value = queue.value.slice(1);
    dialogOpen.value = true;
}

// A dialog's answer (null if cancelled), then the next
function answered(event: Extract<ImportEvent, { kind: "importDialog" }>, result: unknown): void
{
    const request = event.request;
    if (event.dialog.kind === "pickHTMLTable")
        void engine.client.request("htmlTablePicked", request, result as { vals: string[][], columnNames: string[] } | null).catch(ignoreClosed);
    else if (event.dialog.kind === "pickRTables")
        void engine.client.request("rTablesPicked", request, result as number[] | null).catch(ignoreClosed);
    else
        void engine.client.request("importerPicked", request, result as number | null).catch(ignoreClosed);
    next();
}

// Each dialog answers once: its chosen, or null when it closes without (a dialog may close before or
// after it emits chosen, so the answer is given once it has done both)
let chosenFor: { readonly event: ImportEvent, readonly result: unknown } | null = null;
function dialogClosed(isOpen: boolean): void
{
    const current = queue.value[0];
    if (isOpen || current === undefined || current.kind !== "importDialog")
        return;
    setTimeout(() =>
    {
        const result = chosenFor !== null && chosenFor.event === current ? chosenFor.result : null;
        chosenFor = null;
        answered(current, result);
    });
}

function chosen(result: unknown): void
{
    const current = queue.value[0];
    if (current !== undefined)
        chosenFor = { event: current, result };
}

// --- Java: ImporterManager.chooseAndImportFile and chooseAndImportURL --------------------------

const fileInput = useTemplateRef<HTMLInputElement>("fileInput");
let fileTarget: CellPosition | null = null;
const urlTarget = shallowRef<CellPosition | null>(null);
const urlOpen = shallowRef(false);

// (All the importers' file types: Java's "All Known Types" filter, then each importer's, then all files)
const accept = (): string => importers.value.flatMap(i => i.fileTypes).map(ext => ext.replace(/^\*/, "")).join(",");

function chooseAndImportFile(destination: CellPosition): void
{
    fileTarget = destination;
    const input = fileInput.value!;
    input.value = "";
    // (Called in the click on the new-table dialog's button, as a file picker needs)
    input.click();
}

async function fileChosen(): Promise<void>
{
    const file = fileInput.value?.files?.[0];
    const target = fileTarget;
    if (file === undefined || target === null)
        return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await engine.client.request("importFile", file.name, bytes, null, null, target.columnIndex, target.rowIndex);
}

async function chooseAndImportURL(destination: CellPosition): Promise<void>
{
    await loadImporters();
    urlTarget.value = destination;
    urlOpen.value = true;
}

function urlChosen(file: { readonly name: string, readonly bytes: Uint8Array, readonly url: string, readonly importer: number }): void
{
    const target = urlTarget.value;
    if (target !== null)
        void engine.client.request("importFile", file.name, file.bytes, file.url, file.importer, target.columnIndex, target.rowIndex).catch(ignoreClosed);
}

void loadImporters().catch(ignoreClosed);

defineExpose({
    chooseAndImportFile,
    chooseAndImportURL: (destination: CellPosition) => void chooseAndImportURL(destination).catch(ignoreClosed),
});
</script>

<template>
  <input
    ref="fileInput"
    type="file"
    class="import-file-input"
    :accept="accept()"
    hidden
    @change="void fileChosen().catch(ignoreClosed)"
  >
  <ImportURLDialog
    v-if="urlOpen"
    v-model:open="urlOpen"
    :importers="importers"
    @chosen="urlChosen"
  />
  <template v-if="queue[0] !== undefined">
    <ImportChoicesDialog
      v-if="queue[0].kind === 'importChoices'"
      :key="'choices' + queue[0].session"
      :session="queue[0].session"
      :suggested-name="queue[0].suggestedName"
      :choices="queue[0].choices"
      @closed="next"
    />
    <template v-else>
      <PickHTMLTableDialog
        v-if="queue[0].dialog.kind === 'pickHTMLTable'"
        :key="'html' + queue[0].request"
        v-model:open="dialogOpen"
        :file-name="queue[0].dialog.fileName"
        :bytes="queue[0].dialog.bytes"
        :source="queue[0].dialog.source"
        @update:open="dialogClosed"
        @chosen="chosen"
      />
      <PickRTablesDialog
        v-else-if="queue[0].dialog.kind === 'pickRTables'"
        :key="'r' + queue[0].request"
        v-model:open="dialogOpen"
        :tables="queue[0].dialog.tables"
        @update:open="dialogClosed"
        @chosen="chosen"
      />
      <PickImporterDialog
        v-else
        :key="'importer' + queue[0].request"
        v-model:open="dialogOpen"
        :file-name="queue[0].dialog.fileName"
        :importers="importers"
        :guess="queue[0].dialog.guess"
        @update:open="dialogClosed"
        @chosen="chosen"
      />
    </template>
  </template>
</template>
