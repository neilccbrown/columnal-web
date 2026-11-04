// A copy, on the main thread, of the project's declared types and units (PLAN.md's "copy of the type
// information"), for the editors that need a TypeManager as the user types: the type and unit editors,
// and recognising a value of a type.  It's made from the engine's, each time a dialog needs it.
import { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../engine/types/data/unit/UnitManager.js";
import type { EngineClient } from "../engine/EngineClient.js";
import type { TypeInfo } from "../engine/protocol.js";

export async function copyTypeManager(client: EngineClient): Promise<TypeManager>
{
    const info = await client.request("typeInfo");
    const unitManager = new UnitManager();
    unitManager.loadUserUnits(info.units);
    const typeManager = new TypeManager(unitManager);
    typeManager.loadTypeDecls(info.types);
    return typeManager;
}

/** The copy's declared types and units, as the engine's typeInfo gives them (to send back to it). */
export function typeInfoOf(typeManager: TypeManager): TypeInfo
{
    // (Each on its own line, as Table.FullSaver writes them)
    const lines = (items: readonly string[]): string => items.map(s => s.endsWith("\n") ? s : s + "\n").join("");
    return { units: lines(typeManager.getUnitManager().save()), types: lines(typeManager.save()) };
}
