// Port of xyz.columnal.transformations.function.list.AnyAllNone (functions module).
import { ValueClass } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

// Maybe this should be a package
export abstract class AnyAllNone
{
}

export namespace AnyAllNone
{
    // Java: private static class
    export class Processor extends ValueFunction
    {
        private readonly returnIfTrueFound: boolean | null;
        private readonly returnIfFalseFound: boolean | null;
        private readonly returnAtEnd: boolean;

        public constructor(returnIfTrueFound: boolean | null, returnIfFalseFound: boolean | null, returnAtEnd: boolean)
        {
            super();
            this.returnIfTrueFound = returnIfTrueFound === null ? null : DataTypeUtility.value(returnIfTrueFound);
            this.returnIfFalseFound = returnIfFalseFound === null ? null : DataTypeUtility.value(returnIfFalseFound);
            this.returnAtEnd = DataTypeUtility.value(returnAtEnd);
        }

        public override _call(): Value
        {
            const list = this.arg(0, ValueClass.LIST);
            for (let i = 0; i < list.size(); i++)
            {
                const iFinal = i;
                const result = Utility.cast(this.callArg(1, [list.get(i)]), Boolean);
                if (result && this.returnIfTrueFound !== null)
                {
                    this.addUsedLocations(args => Utility.streamNullable(args[0]!.getListElementLocation(iFinal)));
                    return this.returnIfTrueFound;
                }
                else if (!result && this.returnIfFalseFound !== null)
                {
                    this.addUsedLocations(args => Utility.streamNullable(args[0]!.getListElementLocation(iFinal)));
                    return this.returnIfFalseFound;
                }
            }
            return this.returnAtEnd;
        }
    }

    export class Any extends FunctionDefinition
    {
        public constructor()
        {
            super("listprocess:any");
        }

        public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
        {
            return new Processor(true, null, false);
        }
    }

    export class All extends FunctionDefinition
    {
        public constructor()
        {
            super("listprocess:all");
        }

        public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
        {
            return new Processor(null, false, true);
        }
    }

    export class None extends FunctionDefinition
    {
        public constructor()
        {
            super("listprocess:none");
        }

        public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
        {
            return new Processor(false, null, true);
        }
    }
}
