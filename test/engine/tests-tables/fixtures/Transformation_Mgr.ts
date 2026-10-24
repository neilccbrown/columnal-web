// Port of test.Transformation_Mgr (tests-tables testFixtures).
import type { TableManager } from "../../../../src/engine/data/data/TableManager.js";
import type { Transformation } from "../../../../src/engine/data/data/Transformation.js";

export class Transformation_Mgr
{
    public readonly mgr: TableManager;
    public readonly transformation: Transformation;

    public constructor(mgr: TableManager, transformation: Transformation)
    {
        this.mgr = mgr;
        this.transformation = transformation;
        mgr.record(transformation);
    }

    public toString(): string
    {
        return this.transformation.toString();
    }
}
