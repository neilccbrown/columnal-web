// Port of xyz.columnal.transformations.TransformationInfo (transformations module).
import type { LocalizableKey } from "../../anns/Annotations.js";
import type { CellPosition } from "../../data/data/CellPosition.js";
import type { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import type { Transformation } from "../../data/data/Transformation.js";
import type { TableId } from "../../identifiers/id/TableId.js";
import { javaStringHashCode } from "../../java/JavaObject.js";
import type { ExpressionVersion } from "../../parsers/grammar/Versions.js";
import type { FXPlatformSupplier } from "../../utility-functional/utility/function/fx/FXPlatformSupplier.js";
import type { SimulationSupplier } from "../../utility-functional/utility/function/simulation/SimulationSupplier.js";

/**
 * Created by neil on 02/11/2016.
 */
export abstract class TransformationInfo
{
    /**
     * The name, as will be used for saving and loading.
     */
    protected readonly canonicalName: string;

    /**
     * The name, as will be shown in the search bar and display.
     */
    protected readonly displayNameKey: LocalizableKey;

    private readonly imageFileName: string;

    /**
     * Keywords to search (e.g. alternative names for this function).
     */
    protected readonly keywords: readonly string[];

    /**
     * The key for the text explaining this transformation
     */
    private readonly explanationKey: LocalizableKey;


    public constructor(canonicalName: string, displayNameKey: LocalizableKey, imageFileName: string, explanationKey: LocalizableKey, keywords: readonly string[])
    {
        this.canonicalName = canonicalName;
        this.displayNameKey = displayNameKey;
        this.imageFileName = imageFileName;
        this.keywords = keywords;
        this.explanationKey = explanationKey;
    }

    public getCanonicalName(): string
    {
        return this.canonicalName;
    }

    public getDisplayNameKey(): LocalizableKey
    {
        return this.displayNameKey;
    }

    public abstract load(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails, source: readonly TableId[], detail: string, expressionVersion: ExpressionVersion): Transformation;

    public abstract make(mgr: TableManager, destination: CellPosition, askForSingleSrcTable: FXPlatformSupplier<Table | null>): SimulationSupplier<Transformation> | null;

    public getImageFileName(): string
    {
        return this.imageFileName;
    }


    // TransformationInfo is uniquely keyed by the canonical name:
    public hashCode(): number
    {
        return javaStringHashCode(this.getCanonicalName());
    }

    public equals(obj: unknown): boolean
    {
        return obj instanceof TransformationInfo && this.getCanonicalName() === obj.getCanonicalName();
    }

    public getExplanationKey(): LocalizableKey
    {
        return this.explanationKey;
    }
}
