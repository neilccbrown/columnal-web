// Port of xyz.columnal.grammar.Versions (parsers module).
import { javaEnumValues } from "../../java/JavaEnum.js";

/*
 * Each overall save version corresponds to:
 *  - an expression parser version
 *  - a data parser version
 *  - a main parser version
 *
 * The overall version must be incremented when any of those sub-versions increments, but it's not required that every version increases in tandem.
 * The history is:
 *  - OverallVersion.ONE: ExpressionVersion.ONE, DataVersion.ONE, MainVersion.ONE
 *  - OverallVersion.TWO: ExpressionVersion.ONE, DataVersion.TWO, MainVersion.TWO
 *  - OverallVersion.THREE: ExpressionVersion.TWO, DataVersion.TWO, MainVersion.TWO
 */

// All versions must in ascending numeric order

export enum OverallVersion
{
    ONE, TWO, THREE
}
export namespace OverallVersion
{
    export function latest(): OverallVersion
    {
        return javaEnumValues(OverallVersion).at(-1)!;
    }

    export function asNumber(v: OverallVersion): number
    {
        return v + 1;
    }
}

export enum ExpressionVersion
{
    ONE, TWO
}
export namespace ExpressionVersion
{
    export function latest(): ExpressionVersion
    {
        return javaEnumValues(ExpressionVersion).at(-1)!;
    }
}

export enum DataVersion
{
    ONE, TWO
}

export enum MainVersion
{
    ONE, TWO
}

export function getExpressionVersion(overallVersion: OverallVersion): ExpressionVersion
{
    switch (overallVersion)
    {
        case OverallVersion.ONE: case OverallVersion.TWO:
            return ExpressionVersion.ONE;
        case OverallVersion.THREE:
        default:
            return ExpressionVersion.TWO;
    }
}

export function getDataVersion(overallVersion: OverallVersion): DataVersion
{
    switch (overallVersion)
    {
        case OverallVersion.ONE:
            return DataVersion.ONE;
        case OverallVersion.TWO:
        case OverallVersion.THREE:
        default:
            return DataVersion.TWO;
    }
}

export function getMainVersion(overallVersion: OverallVersion): MainVersion
{
    switch (overallVersion)
    {
        case OverallVersion.ONE:
            return MainVersion.ONE;
        case OverallVersion.TWO:
        case OverallVersion.THREE:
        default:
            return MainVersion.TWO;
    }
}
