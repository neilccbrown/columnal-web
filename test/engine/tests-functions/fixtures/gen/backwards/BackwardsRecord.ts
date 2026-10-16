// Port of test.gen.backwards.BackwardsRecord (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { FieldAccessExpression } from "../../../../../../src/engine/expressions/transformations/expression/Expressions.js";
import { DataType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { RecordMap } from "../../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { BackwardsProvider } from "./BackwardsProvider.js";
import type { ExpressionMaker } from "./ExpressionMaker.js";

export class BackwardsRecord extends BackwardsProvider
{
    public override terminals(_targetType: DataType, _targetValue: Value): ExpressionMaker[]
    {
        return [];
    }

    public override deep(maxLevels: number, targetType: DataType, targetValue: Value): ExpressionMaker[]
    {
        return [() => {
            // Make a record then access its field:
            const fields: Pair<ExpressionIdentifier, DataType>[] = [];
            const ourField = TBasicUtil.generateExpressionIdentifier(this.r);
            fields.push(new Pair(ourField, targetType));
            // Add a few more:
            fields.push(...TBasicUtil.makeList(this.r, 1, 3, () => new Pair(TBasicUtil.generateExpressionIdentifier(this.r), this.parent.makeType())));

            // Java: ImmutableMap.toImmutableMap(..., (a, b) -> a), which keeps the first of duplicates
            const fieldMap = new Map<ExpressionIdentifier, DataType>();
            for (const p of fields)
            {
                if (!fieldMap.has(p.getFirst()))
                    fieldMap.set(p.getFirst(), p.getSecond());
            }
            const recordType = DataType.record(fieldMap);

            const valueMap = new Map<ExpressionIdentifier, Value>();
            valueMap.set(ourField, targetValue);

            for (const [key, value] of fieldMap)
            {
                if (key !== ourField)
                    valueMap.set(key, this.parent.makeValue(value));
            }

            return new FieldAccessExpression(this.parent.make(recordType, new RecordMap(valueMap), maxLevels - 1), ourField);
        }];
    }
}
