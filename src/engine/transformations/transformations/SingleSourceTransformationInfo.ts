// Port of xyz.columnal.transformations.SingleSourceTransformationInfo (transformations module).
import type { LocalizableKey } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { javaListGet } from "../../java/JavaCollections.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import { UserException } from "../../utility-error/error/UserException.js";
import type { FXPlatformSupplier } from "../../utility-functional/utility/function/fx/FXPlatformSupplier.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";
import { TransformationInfo } from "./TransformationInfo.js";

/**
 * Helper class that simplifies implementing TransformationInfo for those transformations which have a single primary source.
 */
export abstract class SingleSourceTransformationInfo extends TransformationInfo
{
    public constructor(canonicalName: string, displayNameKey: LocalizableKey, imageFileName: string, explanationKey: LocalizableKey, keywords: readonly string[])
    {
        super(canonicalName, displayNameKey, imageFileName, explanationKey, keywords);
    }

    public override load(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, source: readonly TableId[], detail: string, expressionVersion: ExpressionVersion): Transformation
    {
        if (source.length > 1)
            throw new UserException("Transformation " + this.getCanonicalName() + " cannot have multiple sources. (If source name has a space, make sure to quote it.)");
        return this.loadSingle(mgr, initialLoadDetails, javaListGet(source, 0), detail, expressionVersion);
    }

    protected abstract loadSingle(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, srcTableId: TableId, detail: string, expressionVersion: ExpressionVersion): Transformation;

    public override make(mgr: TableManager, destination: CellPosition, askForSingleSrcTable: FXPlatformSupplier<Table | null>): SimulationSupplier<Transformation> | null
    {
        const srcTable = askForSingleSrcTable();
        if (srcTable === null)
            return null;
        return () => this.makeWithSource(mgr, destination, srcTable);
    }

    protected abstract makeWithSource(mgr: TableManager, destination: CellPosition, srcTable: Table): Transformation;
}
