// Grid prototype (Phase 7, throwaway): see GridPrototype.vue.  Shows the golden file input-01.rec
// (fetched from the dev server), plus a generated data table of N rows with ?big=N.
import { createApp } from "vue";
import { bigTableFile } from "./bigTable.js";
import GridPrototype from "./GridPrototype.vue";
import { timings } from "./ProtoTableDisplay.js";

const params = new URLSearchParams(location.search);
{
    const input01 = await (await fetch("/test/engine/transformations/golden/input-01.rec")).text();
    const bigRows = Number.parseInt(params.get("big") ?? "0", 10);
    const start = performance.now();
    const fileText = input01 + (bigRows > 0 ? "\n" + bigTableFile(bigRows) : "");
    if (bigRows > 0)
        timings.push({ what: `generate file of ${bigRows} rows (${(fileText.length / 1e6).toFixed(1)} MB)`, ms: performance.now() - start });
    createApp(GridPrototype, { fileText }).mount("#app");
}
