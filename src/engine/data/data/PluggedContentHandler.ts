// Port of xyz.columnal.data.PluggedContentHandler (data module), a Java functional interface.
import type { SaveTag } from "../../identifiers/id/SaveTag.js";
import type { Pair } from "../../utility-adt/utility/adt/Pair.js";
import type { StyledString } from "../../utility-error/styled/StyledString.js";
import type { SimulationConsumer } from "../../utility-functional/utility/function/simulation/SimulationConsumer.js";

export interface PluggedContentHandler
{
    getHandledContent(onError: (error: StyledString) => void): ReadonlyMap<string, SimulationConsumer<Pair<SaveTag, string>>>;
}
