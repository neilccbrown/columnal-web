// Port of xyz.columnal.transformations.TransformationVisitor (transformations module).
import type { Aggregate } from "./Aggregate.js";
import type { Calculate } from "./Calculate.js";
import type { Check } from "./Check.js";
import type { Concatenate } from "./Concatenate.js";
import type { Filter } from "./Filter.js";
import type { HideColumns } from "./HideColumns.js";
import type { Join } from "./Join.js";
import type { ManualEdit } from "./ManualEdit.js";
import type { RTransformation } from "./RTransformation.js";
import type { Sort } from "./Sort.js";

export interface TransformationVisitor<T>
{
    aggregate(aggregate: Aggregate): T;
    calculate(calculate: Calculate): T;
    check(check: Check): T;
    concatenate(concatenate: Concatenate): T;
    filter(filter: Filter): T;
    hideColumns(hideColumns: HideColumns): T;
    join(join: Join): T;
    manualEdit(manualEdit: ManualEdit): T;
    sort(sort: Sort): T;
    runR(rTransformation: RTransformation): T;
}
