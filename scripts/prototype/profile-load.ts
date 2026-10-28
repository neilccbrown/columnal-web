// Profiles loading a saved file with a large data table in Node (the engine only), to see where the
// time goes:
//   node --import tsx --import ./scripts/cli/register-resources.mjs --cpu-prof --cpu-prof-dir=<dir> scripts/prototype/profile-load.ts [rows]
import { TableManager } from "../../src/engine/data/data/TableManager.js";
import { TransformationManager } from "../../src/engine/transformations/transformations/TransformationManager.js";
import { bigTableFile } from "../../src/gui/prototype/grid/bigTable.js";

const rows = Number(process.argv[2] ?? 200000);
const text = "COLUMNAL\nVERSION 3\n\n" + bigTableFile(rows);
const mgr = new TableManager(TransformationManager.getInstance(), { getHandledContent: () => new Map() });
const start = performance.now();
const loaded = mgr.loadAll(text, () => {});
console.log(`loaded ${rows} rows in ${(performance.now() - start).toFixed(0)} ms; errors: ${loaded.errors.map(e => e.toPlain()).join("; ")}`);
