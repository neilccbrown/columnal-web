<script setup lang="ts">
// Java: ImporterManager.ImportURLDialog: "Link:" (filled with the clipboard's text if it is a URL), "File
// type to import:" and the importers (the HTML one first selected; typing a link selects the one for its
// extension, if any), and the error.  OK checks the link (ImporterManager.checkURL), then downloads it
// (here fetch, so a site must allow it), giving the file and the importer picked.
import { shallowRef, useTemplateRef, watch } from "vue";
import { ImporterManager } from "../../../engine/importers/importers/manager/ImporterManager.js";
import LightDialog from "../../components/dialogs/LightDialog.vue";
import ErrorLabel from "../../components/dialogs/ErrorLabel.vue";
import type { ImporterInfo } from "../../engine/protocol.js";
import { t } from "../../i18n.js";
import PickImporterPane from "./PickImporterPane.vue";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ importers: readonly ImporterInfo[] }>();
const emit = defineEmits<{
    // The file downloaded (its name and bytes), where from, and the importer picked:
    chosen: [file: { readonly name: string, readonly bytes: Uint8Array, readonly url: string, readonly importer: number }],
}>();

const link = shallowRef("");
const error = shallowRef<string | null>(null);
const field = useTemplateRef<HTMLInputElement>("field");

// Java: PickImporterPane.guessImporterFromFileExtension: the first importer for the extension (ignoring
// case), if any
const guess = (extension: string): number | null =>
{
    const i = props.importers.findIndex(imp => imp.fileTypes.some(ext => ext.toLowerCase() === ("*." + extension).toLowerCase()));
    return i === -1 ? null : i;
};
const selected = shallowRef<number | null>(guess("html") ?? (props.importers.length > 0 ? 0 : null));

// Java: FilenameUtils.getExtension: after the last dot, if it is after the last separator
function extensionOf(s: string): string
{
    const dot = s.lastIndexOf(".");
    const separator = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
    return dot === -1 || separator > dot ? "" : s.substring(dot + 1);
}

watch(link, l =>
{
    // Will only set it if definitely recognised, otherwise will leave as-is:
    const g = guess(extensionOf(l));
    if (g !== null)
        selected.value = g;
});

watch(open, isOpen =>
{
    if (!isOpen)
        return;
    // Java: setOnShowing: the clipboard's text, if it parses as a URL
    void navigator.clipboard.readText().then(content =>
    {
        try
        {
            link.value = new URL(content).href;
        }
        catch (_e)
        {
            // Not a URL; never mind.
        }
    }).catch(() => {});
    setTimeout(() => field.value?.focus());
}, { immediate: true });

// The name of the file downloaded: the link's last part (or, if it has none, its host).
// PORT-NOTE: bug fix: Java downloaded to a temporary file, named from the link's path (only its letters
// and digits) with a random number and ".tmp", and the importers suggest the table's name from the
// file's, so a link's table was suggested a name like "dataxlsx1234567890".
function downloadName(url: URL): string
{
    const parts = url.pathname.split("/").filter(p => p !== "");
    let last = parts.at(-1) ?? "";
    try
    {
        last = decodeURIComponent(last);
    }
    catch (_e)
    {
        // (Not decodable: as it is)
    }
    return last !== "" ? last : url.hostname;
}

let downloading = false;

// Java: calculateResult (an ErrorableDialog's): the link checked, an importer picked, then downloaded
function okFilter(): boolean
{
    if (downloading)
        return false;
    ImporterManager.checkURL(link.value).either_(e =>
    {
        error.value = e;
    }, url =>
    {
        const importer = selected.value;
        if (importer === null)
        {
            error.value = t("importer.noimporter");
            return;
        }
        downloading = true;
        error.value = null;
        // TODO show progress while downloading
        void fetch(url.href).then(async response =>
        {
            if (!response.ok)
                throw new Error(String(response.status) + " " + response.statusText);
            return new Uint8Array(await response.arrayBuffer());
        }).then(bytes =>
        {
            open.value = false;
            emit("chosen", { name: downloadName(url), bytes, url: url.href, importer });
        }, (e: unknown) =>
        {
            error.value = t("importer.download.error", e instanceof Error ? e.message : String(e));
        }).finally(() =>
        {
            downloading = false;
        });
    });
    return false;
}
</script>

<template>
  <LightDialog
    v-model:open="open"
    :label="t('import.url')"
    resizable
    :ok-filter="okFilter"
  >
    <div class="import-link-contents">
      <label class="import-link-row">
        {{ t("importer.link") }}
        <input
          ref="field"
          v-model="link"
          type="text"
          class="text-field import-link-field"
        >
      </label>
      <label>{{ t("importer.importer") }}</label>
      <PickImporterPane
        v-model:selected="selected"
        :importers="importers"
      />
      <ErrorLabel :error="error ?? ''" />
    </div>
  </LightDialog>
</template>

<style scoped>
.import-link-contents {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 28em;
}
.import-link-row {
    display: flex;
    align-items: center;
    gap: 6px;
}
.import-link-field {
    flex: 1;
}
</style>
