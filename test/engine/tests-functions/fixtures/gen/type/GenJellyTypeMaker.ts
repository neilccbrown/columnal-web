// Port of test.gen.type.GenJellyTypeMaker (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { javaEnumValues } from "../../../../../../src/engine/java/JavaEnum.js";
import { DataType, TagType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import { DateTimeInfo } from "../../../../../../src/engine/types/data/datatype/DateTimeInfo.js";
import { TaggedTypeDefinition } from "../../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../../../../src/engine/types/data/unit/UnitManager.js";
import { JellyType, JellyTypeRecord } from "../../../../../../src/engine/types/jellytype/JellyTypes.js";
import { JellyUnit } from "../../../../../../src/engine/types/jellytype/JellyUnit.js";
import { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../../../src/engine/utility/utility/Utility.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenUnit } from "../../../../tests-basic/fixtures/gen/GenUnit.js";

// Java: Sets.difference, in the iteration order of the first set
function difference<T>(a: ReadonlySet<T>, b: readonly T[]): ReadonlySet<T>
{
    return new Set([...a].filter(x => !b.includes(x)));
}

/**
 * Generates a generator for jelly types
 */
export class GenJellyTypeMaker extends Generator<GenJellyTypeMaker.JellyTypeMaker>
{
    // Java: ImmutableSets (iteration in insertion order)
    private readonly startingTypeKinds: ReadonlySet<GenJellyTypeMaker.TypeKinds>;
    private readonly availableTypeVars: ReadonlySet<ExpressionIdentifier>;
    private readonly mustHaveValues: boolean;

    // Java has (), (typeKinds) and (typeKinds, availableTypeVars, mustHaveValues) constructors
    public constructor(typeKinds: ReadonlySet<GenJellyTypeMaker.TypeKinds> = new Set(javaEnumValues<GenJellyTypeMaker.TypeKinds>(GenJellyTypeMaker.TypeKinds)), availableTypeVars: ReadonlySet<ExpressionIdentifier> = new Set(), mustHaveValues: boolean = false)
    {
        super();
        this.startingTypeKinds = typeKinds;
        this.availableTypeVars = availableTypeVars;
        this.mustHaveValues = mustHaveValues;
    }

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): GenJellyTypeMaker.JellyTypeMaker
    {
        // Use depth system to prevent infinite generation:
        /*
            @Nullable InputStream stream = ResourceUtility.getResourceAsStream("builtin_units.txt");
            if (stream == null)
                return new UnitManager(null);
            else */
        const typeManager = new TypeManager(new UnitManager());
        return new GenJellyTypeMaker.JellyTypeMaker(typeManager, () => this.genDepth(typeManager, r, 3, generationStatus, this.startingTypeKinds));
    }

    private genDepth(typeManager: TypeManager, r: SourceOfRandomness, maxDepth: number, gs: GenerationStatus, typeKinds: ReadonlySet<GenJellyTypeMaker.TypeKinds>): JellyType
    {
        const TypeKinds = GenJellyTypeMaker.TypeKinds;
        const options: (() => JellyType)[] = [];
        if (typeKinds.has(TypeKinds.NUM_TEXT_TEMPORAL))
        {
            options.push(
                () => JellyType.fromConcrete(DataType.TEXT),
                () => JellyType.number(JellyUnit.fromConcrete(new GenUnit().generate(r, gs))),
                () => JellyType.fromConcrete(DataType.date(new DateTimeInfo(r.choose(javaEnumValues<DateTimeInfo.DateTimeType>(DateTimeInfo.DateTimeType)))))
            );
        }
        if (typeKinds.has(TypeKinds.BOOLEAN))
        {
            options.push(() => JellyType.fromConcrete(DataType.BOOLEAN));
        }
        if (maxDepth > 1 && typeKinds.has(TypeKinds.RECORD))
        {
            options.push(
                    () => {
                        // Java: toImmutableMap with a merge function that keeps the first value
                        const fields = new Map<ExpressionIdentifier, JellyTypeRecord.Field>();
                        for (const p of TBasicUtil.makeList(r, 2, 5, () => new Pair<ExpressionIdentifier, JellyType>(TBasicUtil.generateExpressionIdentifier(r), this.genDepth(typeManager, r, maxDepth - 1, gs, typeKinds))))
                        {
                            if (!fields.has(p.getFirst()))
                                fields.set(p.getFirst(), new JellyTypeRecord.Field(p.getSecond(), true));
                        }
                        return JellyType.record(fields);
                    }
            );
        }
        if (maxDepth > 1 && typeKinds.has(TypeKinds.LIST))
        {
            options.push(
                () => JellyType.list(this.genDepth(typeManager, r, maxDepth - 1, gs, typeKinds))
            );
        }
        if ((typeKinds.has(TypeKinds.OTHER_BUILTIN_TAGGED) || typeKinds.has(TypeKinds.NEW_TAGGED_INNER)) && maxDepth > 1)
        {
            options.push(() => this.genTagged(typeManager, r, maxDepth, gs, typeKinds));
        }
        else if ((typeKinds.has(TypeKinds.NEW_TAGGED_NO_INNER) || typeKinds.has(TypeKinds.MAYBE_UNNESTED)) && maxDepth > 1)
        {
            options.push(() => this.genTagged(typeManager, r, maxDepth, gs,
                difference(typeKinds, [TypeKinds.RECORD, TypeKinds.LIST])
            ));
        }
        if (this.availableTypeVars.size !== 0)
            options.push(() => JellyType.typeVariable(r.choose([...this.availableTypeVars])));

        return r.choose(options)();
    }

    protected genTagged(typeManager: TypeManager, r: SourceOfRandomness, maxDepth: number, gs: GenerationStatus, typeKinds: ReadonlySet<GenJellyTypeMaker.TypeKinds>): JellyType
    {
        const TypeKinds = GenJellyTypeMaker.TypeKinds;
        let typeDefinition: TaggedTypeDefinition | null = null;

        const pool: TaggedTypeDefinition[] = [];
        if (typeKinds.has(TypeKinds.OTHER_BUILTIN_TAGGED))
            pool.push(...typeManager.getKnownTaggedTypes().values());
        else if (typeKinds.has(TypeKinds.MAYBE_UNNESTED) || typeKinds.has(TypeKinds.OTHER_BUILTIN_TAGGED))
            pool.push(typeManager.getMaybeType());
        pool.push(...typeManager.getUserTaggedTypes().values());
        if (this.mustHaveValues)
        {
            // Java: pool.removeIf(...)
            const kept = pool.filter(t => t.getTags().length !== 0);
            pool.length = 0;
            pool.push(...kept);
        }

        // Limit it to 100 types:
        const typeIndex = r.nextInt(100);
        if (typeIndex >= pool.length && (typeKinds.has(TypeKinds.NEW_TAGGED_INNER) || typeKinds.has(TypeKinds.NEW_TAGGED_NO_INNER)))
        {
            // Don't need to add N more, just add one for now:

            let typeVars: Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[];
            if (r.nextBoolean() && typeKinds.has(TypeKinds.NEW_TAGGED_INNER))
            {
                // Must use distinct to make sure no duplicates:
                typeVars = [...new Set(TBasicUtil.makeList(r, 1, 4, () => {
                    const az: ExpressionIdentifier = "" + r.nextChar("a", "z");
                    return az;
                }))].map(s => new Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>(r.nextInt(3) === 1 ? TaggedTypeDefinition.TypeVariableKind.UNIT : TaggedTypeDefinition.TypeVariableKind.TYPE, s));
            }
            else
            {
                typeVars = [];
            }

            // Outside type variables are not visible in a new tagged type:
            let types: (JellyType | null)[];
            // First add the items with inner type:
            if (r.nextInt(3) === 1 || !typeKinds.has(TypeKinds.NEW_TAGGED_INNER))
                types = [];
            else
                types = [...TBasicUtil.makeList(r, 1, 10, () => this.genDepth(typeManager, r, maxDepth - 1, gs, typeKinds))];
            // Then those with inner types, making sure we have at least one:
            const extraNulls = r.nextInt(5) + (types.length === 0 ? 1 : 0);
            for (let i = 0; i < extraNulls; i++)
            {
                types.splice(r.nextInt(types.length + 1), 0, null);
            }
            const typeName: ExpressionIdentifier = "" + r.nextChar("A", "Z") + r.nextChar("A", "Z");
            typeDefinition = typeManager.registerTaggedType(typeName, typeVars, Utility.mapListExI_Index(types, (i, t) => {
                const tagName: ExpressionIdentifier = "T" + r.nextChar("A", "Z") + " " + i;
                return new TagType<JellyType>(tagName, t);
            }));
        }

        if (typeDefinition === null)
        {
            typeDefinition = r.choose(pool);
        }

        const taggedTypeName = typeDefinition.getTaggedTypeName();
        return JellyType.tagged(taggedTypeName, Utility.mapListExI(typeDefinition.getTypeArguments(), (arg: Pair<TaggedTypeDefinition.TypeVariableKind, string>) => {
            if (arg.getFirst() === TaggedTypeDefinition.TypeVariableKind.TYPE)
            {
                const taggedAllowed = typeKinds.has(TypeKinds.NEW_TAGGED_INNER)
                    || typeKinds.has(TypeKinds.OTHER_BUILTIN_TAGGED);
                const ks = taggedAllowed ? typeKinds : difference(typeKinds,
                    [TypeKinds.MAYBE_UNNESTED, TypeKinds.NEW_TAGGED_INNER, TypeKinds.NEW_TAGGED_NO_INNER, TypeKinds.OTHER_BUILTIN_TAGGED]);
                return Either.right<JellyUnit, JellyType>(this.genDepth(typeManager, r, maxDepth - 1, gs, ks));
            } else
                return Either.left<JellyUnit, JellyType>(JellyUnit.fromConcrete(new GenUnit().generate(r, gs)));
        }));
    }
}

export namespace GenJellyTypeMaker
{
    export enum TypeKinds {
        NUM_TEXT_TEMPORAL,
        BOOLEAN,
        RECORD,
        LIST,
        MAYBE_UNNESTED,
        OTHER_BUILTIN_TAGGED, // besides maybe
        NEW_TAGGED_NO_INNER,
        NEW_TAGGED_INNER,
    }

    /**
     * A generator for jelly types, each of which is added to the same type manager.
     * (Java: an inner class)
     */
    export class JellyTypeMaker
    {
        public readonly typeManager: TypeManager;
        private readonly maker: () => JellyType;

        // Java: private
        public constructor(typeManager: TypeManager, maker: () => JellyType)
        {
            this.typeManager = typeManager;
            this.maker = maker;
        }

        public makeType(): JellyType
        {
            return this.maker();
        }
    }

    export class GenTaggedType extends GenJellyTypeMaker
    {
        public constructor()
        {
            super();
        }

        public override generate(sourceOfRandomness: SourceOfRandomness, generationStatus: GenerationStatus): JellyTypeMaker
        {
            const typeManager = new TypeManager(new UnitManager());
            return new JellyTypeMaker(typeManager, () => this.genTagged(typeManager, sourceOfRandomness, 3, generationStatus, new Set(javaEnumValues<TypeKinds>(TypeKinds))));
        }
    }
}
