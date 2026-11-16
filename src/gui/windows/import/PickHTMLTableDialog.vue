<script setup lang="ts">
// Java: HTMLImporter.PickHTMLTableDialog: "Click any red-bordered table to import it", above the page
// (Java: a WebView), in which each table that can be imported is outlined in red (redder while hovered);
// clicking one picks it.  Cancel only.
//
// PORT-NOTE: the page parses the file and reads the table picked here (HTMLImporter.prepareForPicking and
// readTable), as the engine's Web Worker has no DOM.  The page is shown in a sandboxed iframe (no
// scripts, which Java's WebView ran), with htmlimport.css's rules inline (Java linked the stylesheet);
// clicking its other links does nothing (Java's WebView followed them).
import { shallowRef, useTemplateRef } from "vue";
import { HTMLImporter } from "../../../engine/importers/importers/HTMLImporter.js";
import { JavaFile } from "../../../engine/java/JavaFile.js";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import { t } from "../../i18n.js";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ fileName: string, bytes: Uint8Array, source: string }>();
const emit = defineEmits<{
    // The table's rows and column names:
    chosen: [picked: { readonly vals: string[][], readonly columnNames: string[] }],
}>();

// htmlimport.scss
const IMPORT_STYLES = `
a.gui_import { display: block; position: relative; }
a.gui_import > table { display: block; width: 100%; height: auto; }
a.gui_import > .overlay { position: absolute; top: 0; bottom: 0; left: 0; right: 0; height: 100%; width: 100%; border: 3px solid red; transition: .5s ease; background-color: rgba(255, 64, 64, 0.3); color: white; }
a.gui_import:hover > .overlay { background-color: rgba(255, 64, 64, 0.8); }
`;

const { doc, tables } = HTMLImporter.prepareForPicking(new JavaFile(props.fileName, props.bytes), new URL(props.source));
doc.head.querySelector(`link[href="${HTMLImporter.IMPORT_STYLESHEET}"]`)?.remove();
const style = doc.createElement("style");
style.textContent = IMPORT_STYLES;
doc.head.appendChild(style);
const html = "<!DOCTYPE html>" + doc.documentElement.outerHTML;

const frame = useTemplateRef<HTMLIFrameElement>("frame");
const loaded = shallowRef(false);

// Java: enableGUIImportLinks: a link to "gui_import:id<n>" picks table n
function frameLoaded(): void
{
    const frameDoc = frame.value?.contentDocument;
    if (frameDoc === null || frameDoc === undefined || loaded.value)
        return;
    loaded.value = true;
    frameDoc.addEventListener("click", e =>
    {
        // (The frame's elements are of its own window, so not instanceof this one's Element)
        const a = (e.target as Element | null)?.closest?.("a") ?? null;
        if (a === null)
            return;
        e.preventDefault();
        const href = a.getAttribute("href") ?? "";
        const prefix = "gui_import:id";
        if (!href.startsWith(prefix))
            return;
        const table = tables[Number.parseInt(href.substring(prefix.length), 10)];
        if (table === undefined)
            return;
        const read = HTMLImporter.readTable(table);
        open.value = false;
        emit("chosen", { vals: read.getFirst(), columnNames: read.getSecond() });
    });
}

defineExpose({ _test_loaded: () => loaded.value, _test_frame: () => frame.value });
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('import.html.picktable.title')"
    :buttons="['cancel']"
    resizable
  >
    <div class="pick-html-table">
      <p class="pick-html-table-instruction">
        {{ t("import.html.picktable.instruction") }}
      </p>
      <div class="pick-html-webview-wrapper">
        <iframe
          ref="frame"
          class="pick-html-table-frame"
          sandbox="allow-same-origin"
          :srcdoc="html"
          :title="t('import.html.picktable.title')"
          @load="frameLoaded"
        />
      </div>
    </div>
  </LightDialog>
</template>

<style scoped>
.pick-html-table {
    display: flex;
    flex-direction: column;
    width: min(900px, calc(100vw - 120px));
    height: min(700px, calc(100vh - 160px));
}
.pick-html-table-instruction {
    margin: 0;
    text-align: center;
}
.pick-html-webview-wrapper {
    flex: 1;
    margin-top: 10px;
    border: 1px solid var(--control-border);
}
.pick-html-table-frame {
    width: 100%;
    height: 100%;
    border: none;
    background: white;
}
</style>
