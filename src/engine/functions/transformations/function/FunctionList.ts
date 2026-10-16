// Port of xyz.columnal.transformations.function.FunctionList (functions module).
import type { FunctionLookup } from "../../../expressions/transformations/expression/function/FunctionLookup.js";
import type { StandardFunctionDefinition } from "../../../expressions/transformations/expression/function/StandardFunctionDefinition.js";
import type { UnitManager } from "../../../types/data/unit/UnitManager.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { Log } from "../../../utility/log/Log.js";
import { Absolute } from "./Absolute.js";
import { Max } from "./comparison/Max.js";
import { MaxIndex } from "./comparison/MaxIndex.js";
import { Min } from "./comparison/Min.js";
import { MinIndex } from "./comparison/MinIndex.js";
import { ExtractNumber } from "./conversion/ExtractNumber.js";
import { ExtractNumberOrNone } from "./conversion/ExtractNumberOrNone.js";
import { AsType } from "./core/AsType.js";
import { AsUnit } from "./core/AsUnit.js";
import { TypeOf } from "./core/TypeOf.js";
import { AddDays } from "./datetime/AddDays.js";
import { DaysBetween } from "./datetime/DaysBetween.js";
import { SecondsBetween } from "./datetime/SecondsBetween.js";
import { YearsBetween } from "./datetime/YearsBetween.js";
import { FromString } from "./FromString.js";
import type { FunctionDefinition } from "./FunctionDefinition.js";
import { AnyAllNone } from "./list/AnyAllNone.js";
import { Combine } from "./list/Combine.js";
import { Count } from "./list/Count.js";
import { CountWhere } from "./list/CountWhere.js";
import { GetElement } from "./list/GetElement.js";
import { GetElementOrDefault } from "./list/GetElementOrDefault.js";
import { InList } from "./list/InList.js";
import { JoinLists } from "./list/JoinLists.js";
import { KeepFunction } from "./list/KeepFunction.js";
import { MapFunction } from "./list/MapFunction.js";
import { Single } from "./list/Single.js";
import { LookupFunctions } from "./lookup/LookupFunctions.js";
import { Logarithm } from "./math/Logarithm.js";
import { LogarithmNatural } from "./math/LogarithmNatural.js";
import { Mean } from "./Mean.js";
import { Not } from "./Not.js";
import { Round } from "./number/Round.js";
import { RoundDP } from "./number/RoundDP.js";
import { RoundSF } from "./number/RoundSF.js";
import { GetOptionalOrDefault } from "./optional/GetOptionalOrDefault.js";
import { GetOptionalOrError } from "./optional/GetOptionalOrError.js";
import { GetOptionalsFromList } from "./optional/GetOptionalsFromList.js";
import { StringLength } from "./StringLength.js";
import { StringTrim } from "./StringTrim.js";
import { Sum } from "./Sum.js";
import { StringJoin } from "./text/StringJoin.js";
import { StringJoinWith } from "./text/StringJoinWith.js";
import { StringLowerCase } from "./text/StringLowerCase.js";
import { StringReplace } from "./text/StringReplace.js";
import { StringReplaceMany } from "./text/StringReplaceMany.js";
import { StringSplit } from "./text/StringSplit.js";
import { ToDate } from "./ToDate.js";
import { ToDateTime } from "./ToDateTime.js";
import { ToDateTimeZone } from "./ToDateTimeZone.js";
import { ToString } from "./ToString.js";
import type { ToTemporalFunction } from "./ToTemporalFunction.js";
import { ToTime } from "./ToTime.js";
import { ToYearMonth } from "./ToYearMonth.js";
import { Xor } from "./Xor.js";

/**
 * Created by neil on 13/12/2016.
 */
export class FunctionList
{
    public static getAllFunctions(unitManager: UnitManager): readonly FunctionDefinition[]
    {
        return [
            ...[
                new Absolute(),
                new AddDays(),
                new AnyAllNone.Any(),
                new AnyAllNone.All(),
                new AnyAllNone.None(),
                new AsType(),
                new AsUnit(),
                new Combine(),
                new Count(),
                new CountWhere(),
                new DaysBetween(),
                new ExtractNumber(),
                new ExtractNumberOrNone(),
                new GetElement(),
                new GetElementOrDefault(),
                new GetOptionalOrError(),
                new GetOptionalOrDefault(),
                new GetOptionalsFromList(),
                new InList(),
                new JoinLists(),
                new KeepFunction(),
                new Logarithm(),
                new LogarithmNatural(),
                new MapFunction(),
                new Max(),
                new MaxIndex(),
                new Mean(),
                new Min(),
                new MinIndex(),
                new Not(),
                new Round(),
                new RoundDP(),
                new RoundSF(),
                new SecondsBetween(),
                new Single(),
                new StringJoin(),
                new StringJoinWith(),
                // TODO document and put back all these string functions:
                //new StringLeft(),
                new StringLength(),
                new StringLowerCase(),
                //new StringMid(),
                new StringReplace(),
                new StringReplaceMany(),
                new StringSplit(),
                //new StringRight(),
                new StringTrim(),
                //new StringWithin(),
                //new StringWithinIndex(),
                new Sum(),
                new ToString(),
                new TypeOf(),
                new Xor(),
                new YearsBetween(),
            ],
            ...FromString.getFunctions(),
            ...LookupFunctions.getLookupFunctions(),
            ...([
                // TODO document and put back all these date conversion functions:
                new ToDate(),
                new ToTime(),
                new ToDateTime(),
                new ToDateTimeZone(),
                new ToYearMonth(),
            ] as ToTemporalFunction[]).flatMap(t => {
                try
                {
                    return t.getTemporalFunctions(unitManager);
                }
                catch (e)
                {
                    if (!(e instanceof InternalException))
                        throw e;
                    Log.log(e);
                    return [];
                }
            }),
        ];
    }

    public static lookup(mgr: UnitManager, functionName: string): FunctionDefinition | null
    {
        for (const functionDefinition of FunctionList.getAllFunctions(mgr))
        {
            if (functionDefinition.getName() === functionName || functionDefinition.getDocKey() === functionName || functionDefinition.getFullName().join("\\") === functionName)
                return functionDefinition;
        }
        return null;
    }

    public static getFunctionLookup(unitManager: UnitManager): FunctionLookup
    {
        return {
            lookup(functionName: string): StandardFunctionDefinition | null
            {
                return FunctionList.lookup(unitManager, functionName);
            },

            getAllFunctions(): readonly StandardFunctionDefinition[]
            {
                return [...FunctionList.getAllFunctions(unitManager)];
            },
        };
    }
}
