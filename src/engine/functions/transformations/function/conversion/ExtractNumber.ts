// Port of xyz.columnal.transformations.function.conversion.ExtractNumber (functions module).
import type { FuncDocKey } from "../../../../anns/Annotations.js";
import type { ValueFunction } from "../../../../expressions/transformations/expression/function/ValueFunction.js";
import { toJavaString, type Decimal } from "../../../../java/JavaBigDecimal.js";
import { ValueClass, type DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import { UserException } from "../../../../utility-error/error/UserException.js";
import { Log } from "../../../../utility/log/Log.js";

import { Utility } from "../../../../utility/utility/Utility.js";
import type { Value } from "../../../../utility/utility/Value.js";
import { FunctionDefinition } from "../FunctionDefinition.js";
import { ValueFunction1 } from "../ValueFunction1.js";

export class ExtractNumber extends FunctionDefinition
{
    public static readonly NAME: FuncDocKey = "conversion:extract number";

    public constructor()
    {
        super(ExtractNumber.NAME);
    }

    // Java: getInstance(TypeManager, SimulationFunction) calls the public getInstance(...)
    public override getInstance(_typeManager: TypeManager, _paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction;
    public override getInstance(): ValueFunction;
    public override getInstance(_typeManager?: TypeManager, _paramTypes?: (s: string) => Either<Unit, DataType>): ValueFunction
    {
        return new class extends ValueFunction1<string>
        {
            public override call1(s: string): Value
            {
                let result: Decimal | null = null;
                for (let i = 0; i < s.length; i++)
                {
                    if ("0" <= s.charAt(i) && s.charAt(i) <= "9")
                    {
                        let start = i;
                        // Look before us for minus sign:
                        if (i > 0 && s.charAt(i - 1) === "-")
                            start -= 1;
                        // Chomp all digits:
                        while (i < s.length && (("0" <= s.charAt(i) && s.charAt(i) <= "9") || s.charAt(i) === ","))
                            i += 1;
                        // Chomp dot and more digits:
                        if (i < s.length && s.charAt(i) === ".")
                        {
                            i += 1;
                            while (i < s.length && ("0" <= s.charAt(i) && s.charAt(i) <= "9"))
                                i += 1;
                        }
                        let parsed: Decimal | null = null;
                        try
                        {
                            parsed = Utility.parseNumber(s.substring(start, i).replaceAll(",", ""));
                        }
                        catch (e)
                        {
                            if (!(e instanceof UserException))
                                throw e;
                            // Shouldn't happen; log but continue
                            Log.log(e);
                        }
                        if (parsed !== null)
                        {
                            if (result !== null)
                                throw new UserException("Two numbers found: " + toJavaString(result) + " and " + toJavaString(parsed));
                            result = parsed;
                        }

                        // Counteract the next increment:
                        i -=1;
                    }
                }

                if (result === null)
                    throw new UserException("No number found");
                else
                    return result;
            }
        }(ValueClass.STRING);
    }
}
