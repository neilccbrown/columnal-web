// A copy, on the main thread, of the project's declared types and units (PLAN.md's "copy of the type
// information"), for the editors that need a TypeManager as the user types: the type and unit editors,
// and recognising a value of a type.  It's made from the engine's, each time a dialog needs it.
import { TypeManager } from "../../engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../engine/types/data/unit/UnitManager.js";
import type { EngineClient } from "../engine/EngineClient.js";

export async function copyTypeManager(client: EngineClient): Promise<TypeManager>
{
    const info = await client.request("typeInfo");
    const unitManager = new UnitManager();
    unitManager.loadUserUnits(info.units);
    const typeManager = new TypeManager(unitManager);
    typeManager.loadTypeDecls(info.types);
    return typeManager;
}
