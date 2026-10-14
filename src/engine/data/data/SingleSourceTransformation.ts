// Port of xyz.columnal.data.SingleSourceTransformation (data module).
import type { TableId } from "../../identifiers/id/TableId.js";
import type { Transformation } from "./Transformation.js";

export interface SingleSourceTransformation
{
    getSrcTableId(): TableId;

    withNewSource(newSrcTableId: TableId): Transformation;
}
