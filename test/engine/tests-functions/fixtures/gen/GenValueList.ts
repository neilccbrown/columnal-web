// Port of test.gen.GenValueList (tests-functions testFixtures).
import { javaListGet } from "../../../../../src/engine/java/JavaCollections.js";
import { DataType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../../src/engine/types/data/datatype/DataTypeUtility.js";
import { ListEx } from "../../../../../src/engine/utility/utility/Utility.js";
import type { Value } from "../../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TFunctionUtil } from "../functions/TFunctionUtil.js";
import { GenValueBase } from "./GenValueBase.js";

/**
 * Created by neil on 22/01/2017.
 */
export class GenValueList extends GenValueBase<GenValueList.ListAndType>
{
    public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): GenValueList.ListAndType
    {
        this.r = sourceOfRandomness;
        this.gs = generationStatus;
        const t = this.r.choose(TFunctionUtil.managerWithTestTypes().getSecond());
        const length = this.r.nextInt(0, 100);
        const values: Value[] = new Array<Value>(length);
        for (let i = 0; i < length; i++)
        {
            values[i] = this.makeValue(t);
        }
        return new GenValueList.ListAndType(DataTypeUtility.value(new class extends ListEx
        {
            public override size(): number
            {
                return length;
            }

            public override get(index: number): Value
            {
                // Java: values[index], which throws ArrayIndexOutOfBoundsException
                return javaListGet(values, index);
            }
        }()), DataType.array(t));
    }
}

export namespace GenValueList
{
    export class ListAndType
    {
        public readonly list: ListEx;
        // Type of the whole array, not the item inside:
        public readonly type: DataType;

        public constructor(list: ListEx, type: DataType)
        {
            this.list = list;
            this.type = type;
        }

        public toString(): string
        {
            return "ListAndType{Type: " + this.type.toString() + "}";
        }
    }
}
