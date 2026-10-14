// Port of test.gen.type.GenDataTypeMaker (tests-functions testFixtures).
// (Java's @MustHaveValues configuration annotation becomes the configure() method.)
import type { ExpressionIdentifier } from "../../../../../../src/engine/anns/Annotations.js";
import { javaEnumValues } from "../../../../../../src/engine/java/JavaEnum.js";
import type { DataType, TagType } from "../../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeId } from "../../../../../../src/engine/types/data/datatype/TypeId.js";
import type { TypeManager } from "../../../../../../src/engine/types/data/datatype/TypeManager.js";
import type { Unit } from "../../../../../../src/engine/types/data/unit/Unit.js";
import type { Either } from "../../../../../../src/engine/utility-adt/utility/adt/Either.js";
import type { Value } from "../../../../../../src/engine/utility/utility/Value.js";
import type { GenerationStatus, SourceOfRandomness } from "../../../../../support/quickcheck.js";
import { GenValueBase } from "../GenValueBase.js";
import { GenJellyTypeMaker } from "./GenJellyTypeMaker.js";

/**
 * Created by neil on 13/01/2017.
 */
export class GenDataTypeMaker extends GenValueBase<GenDataTypeMaker.DataTypeMaker>
{
    private readonly genJellyTypeMaker: GenJellyTypeMaker;
    private mustHaveValues: boolean;

    /**
     * Java has (), (mustHaveValues), (typeKinds, mustHaveValues) and a protected
     * (genJellyTypeMaker, mustHaveValues) constructor.
     */
    public constructor(typeKindsOrMaker: ReadonlySet<GenJellyTypeMaker.TypeKinds> | GenJellyTypeMaker = new Set(javaEnumValues<GenJellyTypeMaker.TypeKinds>(GenJellyTypeMaker.TypeKinds)), mustHaveValues: boolean = false)
    {
        super();
        this.genJellyTypeMaker = typeKindsOrMaker instanceof GenJellyTypeMaker ? typeKindsOrMaker : new GenJellyTypeMaker(typeKindsOrMaker, new Set(), mustHaveValues);
        this.mustHaveValues = mustHaveValues;
    }

    public override generate(r: SourceOfRandomness, generationStatus: GenerationStatus): GenDataTypeMaker.DataTypeMaker
    {
        this.r = r;
        this.gs = generationStatus;
        const jellyTypeMaker = this.genJellyTypeMaker.generate(r, generationStatus);
        return new GenDataTypeMaker.DataTypeMaker(this, jellyTypeMaker);
    }

    // Java: accessed by the inner classes
    public _mustHaveValues(): boolean
    {
        return this.mustHaveValues;
    }

    public _makeValue(dataType: DataType): Value
    {
        return this.makeValue(dataType);
    }

    public static hasValues(dataType: DataType): boolean
    {
        return dataType.apply<boolean>({
            number: () => true,
            text: () => true,
            date: () => true,
            bool: () => true,

            tagged(_typeName: TypeId, _typeVars: readonly Either<Unit, DataType>[], tags: readonly TagType<DataType>[]): boolean
            {
                if (tags.length === 0)
                {
                    return false;
                }
                else
                {
                    for (const tag of tags)
                    {
                        const inner = tag.getInner();
                        if (inner !== null && !GenDataTypeMaker.hasValues(inner))
                            return false;
                    }
                    return true;
                }
            },

            record(fields: ReadonlyMap<ExpressionIdentifier, DataType>): boolean
            {
                for (const type of fields.values())
                {
                    if (!GenDataTypeMaker.hasValues(type))
                    {
                        return false;
                    }
                }
                return true;
            },

            array(inner: DataType): boolean
            {
                return GenDataTypeMaker.hasValues(inner);
            },
        });
    }

    // Java: configure(@MustHaveValues), called by junit-quickcheck for an annotated parameter
    public configure(): void
    {
        this.mustHaveValues = true;
    }
}

export namespace GenDataTypeMaker
{
    // Java: an inner class
    export class DataTypeAndValueMaker
    {
        private readonly outer: GenDataTypeMaker;
        private readonly typeManager: TypeManager;
        private readonly dataType: DataType;

        // Java: private
        public constructor(outer: GenDataTypeMaker, typeManager: TypeManager, dataType: DataType)
        {
            this.outer = outer;
            this.typeManager = typeManager;
            this.dataType = dataType;
        }

        public getDataType(): DataType
        {
            return this.dataType;
        }

        public getTypeManager(): TypeManager
        {
            return this.typeManager;
        }

        public makeValue(): Value
        {
            return this.outer._makeValue(this.dataType);
        }
    }

    // Java: an inner class
    export class DataTypeMaker
    {
        private readonly outer: GenDataTypeMaker;
        private readonly jellyTypeMaker: GenJellyTypeMaker.JellyTypeMaker;

        public constructor(outer: GenDataTypeMaker, jellyTypeMaker: GenJellyTypeMaker.JellyTypeMaker)
        {
            this.outer = outer;
            this.jellyTypeMaker = jellyTypeMaker;
        }

        public makeType(): DataTypeAndValueMaker
        {
            let dataType: DataType;
            do
            {
                dataType = this.jellyTypeMaker.makeType().makeDataType(new Map(), this.jellyTypeMaker.typeManager);
            }
            while (this.outer._mustHaveValues() && !GenDataTypeMaker.hasValues(dataType));
            return new DataTypeAndValueMaker(this.outer, this.jellyTypeMaker.typeManager, dataType);
        }

        public getTypeManager(): TypeManager
        {
            return this.jellyTypeMaker.typeManager;
        }
    }

    export class GenTaggedType extends GenDataTypeMaker
    {
        public constructor()
        {
            super(new GenJellyTypeMaker.GenTaggedType(), true);
        }
    }
}
