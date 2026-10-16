// Port of xyz.columnal.transformations.expression.function.StandardFunctionDefinition (expressions module).
import type { ExpressionIdentifier, FuncDocKey, Localized } from "../../../../anns/Annotations.js";
import type { DataType } from "../../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../types/data/unit/Unit.js";
import type { MutVar, TypeExp } from "../../../../types/typeExp/TypeExps.js";
import type { MutUnitVar } from "../../../../types/typeExp/units/MutUnitVar.js";
import type { Either } from "../../../../utility-adt/utility/adt/Either.js";
import type { Pair } from "../../../../utility-adt/utility/adt/Pair.js";
import type { ValueFunction } from "./ValueFunction.js";

export interface StandardFunctionDefinition
{
    getName(): ExpressionIdentifier;

    getFullName(): readonly ExpressionIdentifier[];

    getInstance(typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction;

    getType(typeManager: TypeManager): Pair<TypeExp, ReadonlyMap<string, Either<MutUnitVar, MutVar>>>;

    getDocKey(): FuncDocKey;

    getMiniDescription(): Localized;

    getParamNames(): readonly string[];

    getSynonyms(): readonly string[];

    // Java compares function definitions with equals (FunctionDefinition compares their doc keys).
    equals(o: unknown): boolean;
}
