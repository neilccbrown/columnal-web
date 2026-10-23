// Port of xyz.columnal.transformations.function.FunctionDefinition (functions module).
//
// The function details come from the .properties files that scripts/gen-funcdoc.mjs generates
// from the funcdoc XML (as the original build did with XSLT), loaded here instead of through
// ResourceBundle.
import constraintsText from "../../generated/function_constraints_en.properties?raw";
import minisText from "../../generated/function_minis_en.properties?raw";
import synonymsText from "../../generated/function_synonyms_en.properties?raw";
import typeargsText from "../../generated/function_typeargs_en.properties?raw";
import typesText from "../../generated/function_types_en.properties?raw";
import unitargsText from "../../generated/function_unitargs_en.properties?raw";
import type { ExpressionIdentifier, FuncDocKey, Localized } from "../../../anns/Annotations.js";
import type { StandardFunctionDefinition } from "../../../expressions/transformations/expression/function/StandardFunctionDefinition.js";
import type { ValueFunction } from "../../../expressions/transformations/expression/function/ValueFunction.js";
import { javaObjectsHash } from "../../../java/JavaObject.js";
import { loadProperties } from "../../../java/JavaProperties.js";
import { javaSplit } from "../../../java/JavaString.js";
import type { DataType } from "../../../types/data/datatype/DataType.js";
import type { TypeManager } from "../../../types/data/datatype/TypeManager.js";
import type { Unit } from "../../../types/data/unit/Unit.js";
import { JellyType } from "../../../types/jellytype/JellyTypes.js";
import { TypeClassRequirements } from "../../../types/typeExp/TypeClassRequirements.js";
import { MutVar, type TypeExp } from "../../../types/typeExp/TypeExps.js";
import { MutUnitVar } from "../../../types/typeExp/units/MutUnitVar.js";
import { Either } from "../../../utility-adt/utility/adt/Either.js";
import { Pair } from "../../../utility-adt/utility/adt/Pair.js";
import { InternalException } from "../../../utility-error/error/InternalException.js";
import { UserException } from "../../../utility-error/error/UserException.js";

const FUNCTION_MINIS = loadProperties(minisText);
const FUNCTION_TYPEARGS = loadProperties(typeargsText);
const FUNCTION_CONSTRAINTS = loadProperties(constraintsText);
const FUNCTION_UNITARGS = loadProperties(unitargsText);
const FUNCTION_TYPES = loadProperties(typesText);
const FUNCTION_SYNONYMS = loadProperties(synonymsText);

class MissingResourceException extends Error
{
}

// Java: ResourceBundle.getString, which throws MissingResourceException if the key is missing
function getString(bundle: ReadonlyMap<string, string>, key: string): string
{
    const s = bundle.get(key);
    if (s === undefined)
        throw new MissingResourceException("Can't find resource for key " + key);
    return s;
}

// Apache Commons' StringUtils.split(str, separatorChars): adjacent separators are treated as one,
// so there are no empty items.
function stringUtilsSplit(s: string, separator: string): string[]
{
    return s.split(separator).filter(item => item.length > 0);
}

/**
 * This class is one function, it will have a unique name, a single type and a single implementation
 */
export abstract class FunctionDefinition implements StandardFunctionDefinition
{
    // Namespace colon function name
    private readonly funcDocKey: FuncDocKey;
    private readonly typeMatcher: FunctionDefinition.TypeMatcher;
    private readonly miniDescription: Localized;
    private readonly synonyms: readonly string[];
    private readonly paramNames: readonly string[];

    public constructor(funcDocKey: FuncDocKey)
    {
        this.funcDocKey = funcDocKey;
        const details = FunctionDefinition.lookupFunction(FunctionDefinition.extractName(funcDocKey), funcDocKey);
        this.miniDescription = details.miniDescription;
        this.typeMatcher = details.typeMatcher;
        this.synonyms = details.synonyms;
        this.paramNames = details.paramNames;
    }

    private static extractNamespace(funcDocKey: FuncDocKey): string
    {
        const split = javaSplit(funcDocKey, /:/u);
        return split[0]!;
    }

    private static extractName(funcDocKey: FuncDocKey): ExpressionIdentifier
    {
        const split = javaSplit(funcDocKey, /:/u);
        return split[split.length - 1]!;
    }

    /**
     * Function name, scoped with backslashes, not colons
     */
    public getScopedName(): string
    {
        return this.funcDocKey.replaceAll(":", "\\");
    }

    public getFullName(): readonly ExpressionIdentifier[]
    {
        return javaSplit(this.funcDocKey, /:/u);
    }

    public equals(o: unknown): boolean
    {
        if (this === o) return true;
        if (!(o instanceof FunctionDefinition)) return false;
        return this.funcDocKey === o.funcDocKey;
    }

    public hashCode(): number
    {
        return javaObjectsHash(this.funcDocKey);
    }

    private static lookupFunction(functionName: string, funcDocKey: FuncDocKey): FunctionDefinition.Details
    {
        const key = funcDocKey;
        try
        {
            // TODO move the signature to its own file?
            const sigKey = key + ":sig";
            return new FunctionDefinition.Details(
                getString(FUNCTION_MINIS, key),
                stringUtilsSplit(getString(FUNCTION_SYNONYMS, key), ";"),
                stringUtilsSplit(getString(FUNCTION_TYPES, sigKey), ";"),
                FunctionDefinition.parseFunctionType(functionName,
                    stringUtilsSplit(getString(FUNCTION_TYPEARGS, key), ";"),
                    stringUtilsSplit(getString(FUNCTION_CONSTRAINTS, key), ";"),
                    stringUtilsSplit(getString(FUNCTION_UNITARGS, key), ";"),
                    getString(FUNCTION_TYPES, key)
                )
            );
        }
        catch (e)
        {
            if (!(e instanceof MissingResourceException))
                throw e;
            throw new InternalException("Missing information for " + key, e);
        }
    }

    private static parseFunctionType(functionName: string, typeArgs: readonly string[], constraints: readonly string[], unitArgs: readonly string[], functionType: string): FunctionDefinition.TypeMatcher
    {
        return typeManager => {
            try
            {
                // Only looked up by name, so the order doesn't matter:
                const typeVars = new Map<string, Either<MutUnitVar, MutVar>>();
                for (const typeArg of typeArgs)
                {
                    let typeClassRequirements = TypeClassRequirements.empty();
                    for (const constraint of constraints)
                    {
                        if (constraint.endsWith(" " + typeArg))
                        {
                            typeClassRequirements = TypeClassRequirements.union(typeClassRequirements,
                                TypeClassRequirements.require(constraint.substring(0, constraint.length - (" " + typeArg).length), functionName));
                        }
                    }

                    // PORT-NOTE: bug fix.  Java worked out the requirements but made the type variable
                    // without them, so (for example) maximum of a list of functions type checked,
                    // then failed at run time with an internal error.
                    typeVars.set(typeArg, Either.right(new MutVar(null, typeClassRequirements)));
                }
                for (const unitArg of unitArgs)
                {
                    typeVars.set(unitArg, Either.left(new MutUnitVar()));
                }

                return new Pair<TypeExp, ReadonlyMap<string, Either<MutUnitVar, MutVar>>>(JellyType.parse(functionType, typeManager).makeTypeExp(new Map(typeVars)), typeVars);
            }
            catch (e)
            {
                if (!(e instanceof UserException || e instanceof InternalException))
                    throw e;
                // It's us that wrote the type, so user exceptions become internal exceptions:
                throw new InternalException("Error in built-in function " + functionName, e);
            }
        };
    }


    public getMiniDescription(): Localized
    {
        return this.miniDescription;
    }

    // Function type, and map from named typed vars to type expression
    public getType(typeManager: TypeManager): Pair<TypeExp, ReadonlyMap<string, Either<MutUnitVar, MutVar>>>
    {
        return this.typeMatcher(typeManager);
    }

    /**
     * Gets the instance of this function
     * @param typeManager The TypeManager to use
     * @param paramTypes A map from the declared typevar/unitvar items in the function XML description, to the concrete Unit or DataType
     * @return The function instance to use during execution.
     */
    public abstract getInstance(typeManager: TypeManager, paramTypes: (s: string) => Either<Unit, DataType>): ValueFunction;

    /**
     * For autocompleting parameters: what are likely types to this function?
     */
    private getLikelyParamType(): TypeExp | null
    {
        return null;
    }

    /**
     * Gets the text to display when showing information about the argument type in the GUI.
     */
    public getParamDisplay(): Localized
    {
        const paramType = this.getLikelyParamType();
        return paramType === null ? "" : paramType.toString();
    }

    public getParamNames(): readonly string[]
    {
        return this.paramNames;
    }

    /**
     * Gets the text to display when showing information about the return type in the GUI.
     */
    public getReturnDisplay(): Localized
    {
        return "";
    }

    public getName(): ExpressionIdentifier
    {
        return FunctionDefinition.extractName(this.funcDocKey);
    }

    public getNamespace(): string
    {
        return FunctionDefinition.extractNamespace(this.funcDocKey);
    }

    public getDocKey(): FuncDocKey
    {
        return this.funcDocKey;
    }

    public getSynonyms(): readonly string[]
    {
        return this.synonyms;
    }
}

export namespace FunctionDefinition
{
    export class Details
    {
        public readonly miniDescription: Localized;
        public readonly synonyms: readonly string[];
        public readonly paramNames: readonly string[];
        public readonly typeMatcher: TypeMatcher;

        public constructor(miniDescription: Localized, synonyms: readonly string[], paramNames: readonly string[], typeMatcher: TypeMatcher)
        {
            this.miniDescription = miniDescription;
            this.synonyms = synonyms;
            this.paramNames = paramNames;
            this.typeMatcher = typeMatcher;
        }
    }

    // We have to make it fresh for each type inference, because the params and return may
    // share a type variable which will get unified during the inference
    // Returns type of function, and type vars by name.
    // Java: interface TypeMatcher { makeParamAndReturnType(TypeManager) }
    export type TypeMatcher = (typeManager: TypeManager) => Pair<TypeExp, ReadonlyMap<string, Either<MutUnitVar, MutVar>>>;
}
