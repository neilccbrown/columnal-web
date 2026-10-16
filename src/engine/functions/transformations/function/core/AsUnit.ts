// Port of xyz.columnal.transformations.function.core.AsUnit (functions module).
import { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import { decimalFromBigInt, type Decimal } from "../../../../java/JavaBigDecimal.js";
import type { Rational } from "../../../../java/Rational.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import { DataTypeUtility } from "../../../../types/data/datatype/DataTypeUtility.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { InternalException } from "../../../../utility-error/error/InternalException.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";

export class AsUnit extends FunctionDefinition
{
    public constructor()
    {
        super("core:convert unit");
    }

    public override getInstance(typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        try
        {
            const dest = paramTypes("u").getLeft("Variable u should be unit but was type");
            const orig = paramTypes("v").getLeft("Variable v should be unit but was type");

            const destToCanon = typeManager.getUnitManager().canonicalise(dest);
            const origToCanon = typeManager.getUnitManager().canonicalise(orig);

            if (!destToCanon.getSecond().equals(origToCanon.getSecond()))
            {
                throw new UserException("No mapping from " + orig.toString() + " to " + dest.toString() + " because " + orig.toString() + " reduces to " + origToCanon.getSecond().toString() + " whereas " + dest.toString() + " reduces to " + destToCanon.getSecond().toString());
            }

            return new AsUnit.Instance(origToCanon.getFirst().times(destToCanon.getFirst().reciprocal()));
        }
        catch (e)
        {
            if (!(e instanceof InternalException || e instanceof UserException))
                throw e;
            return new class extends ValueFunction
            {
                public override _call(): Value
                {
                    throw e;
                }
            }();
        }
    }
}

export namespace AsUnit
{
    export class Instance extends ValueFunction
    {
        private readonly scaleFactor: Decimal;

        public constructor(scaleFactor: Rational)
        {
            super();
            this.scaleFactor = DataTypeUtility.value(decimalFromBigInt(scaleFactor.getNum()).div(decimalFromBigInt(scaleFactor.getDen())));
        }

        public override _call(): Value
        {
            const src = this.arg(1, ValueClass.NUMBER);
            return Utility.multiplyNumbers(src, this.scaleFactor);
        }
    }
}
