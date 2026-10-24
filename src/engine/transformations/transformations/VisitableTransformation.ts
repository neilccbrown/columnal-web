// Port of xyz.columnal.transformations.VisitableTransformation (transformations module).
import type { Table } from "../../data/data/Table.js";
import type { TableManager } from "../../data/data/TableManager.js";
import { Transformation } from "../../data/data/Transformation.js";
import type { TransformationVisitor } from "./TransformationVisitor.js";

export abstract class VisitableTransformation extends Transformation
{
    public constructor(mgr: TableManager, initialLoadDetails: Table.InitialLoadDetails)
    {
        super(mgr, initialLoadDetails);
    }

    public abstract visit<T>(visitor: TransformationVisitor<T>): T;
}
