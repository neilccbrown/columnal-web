// Port of test.gen.GenTaggedTypeDefinition (tests-functions testFixtures).
import type { ExpressionIdentifier } from "../../../../../src/engine/anns/Annotations.js";
import { TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import { TaggedTypeDefinition } from "../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import type { JellyType } from "../../../../../src/engine/types/jellytype/JellyTypes.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import { Utility } from "../../../../../src/engine/utility/utility/Utility.js";
import { Generator, type GenerationStatus, type SourceOfRandomness } from "../../../../support/quickcheck.js";
import { TBasicUtil } from "../../../tests-basic/fixtures/data/TBasicUtil.js";
import { GenJellyTypeMaker } from "./type/GenJellyTypeMaker.js";

const TypeKinds = GenJellyTypeMaker.TypeKinds;

export class GenTaggedTypeDefinition extends Generator<TaggedTypeDefinition>
{
    public override generate(r: SourceOfRandomness, status: GenerationStatus): TaggedTypeDefinition
    {
        let typeVars: Pair<TaggedTypeDefinition.TypeVariableKind, ExpressionIdentifier>[];
        if (r.nextInt(3) === 1)
        {
            // Must use distinct to make sure no duplicate names:
            typeVars = [...new Set(TBasicUtil.makeList(r, 1, 4, () => "" + r.nextChar("a", "z")))].map(name => new Pair(r.nextInt(3) === 1 ? TaggedTypeDefinition.TypeVariableKind.UNIT : TaggedTypeDefinition.TypeVariableKind.TYPE, name as ExpressionIdentifier));
        }
        else
        {
            typeVars = [];
        }
        const genDataType = new GenJellyTypeMaker(new Set([TypeKinds.NUM_TEXT_TEMPORAL,
                TypeKinds.BOOLEAN, TypeKinds.RECORD, TypeKinds.LIST,
                TypeKinds.MAYBE_UNNESTED, TypeKinds.OTHER_BUILTIN_TAGGED]), new Set(typeVars.map(p => p.getSecond())), false);

        // Outside type variables are not visible in a new tagged type:
        const noInner = r.nextInt() % 3 === 1;
        const types: (JellyType | null)[] = noInner ? [] : [...TBasicUtil.makeList(r, 1, 10, () => genDataType.generate(r, status).makeType())];
        const extraNulls = r.nextInt(5) + (types.length === 0 ? 1 : 0);
        for (let i = 0; i < extraNulls; i++)
        {
            types.splice(r.nextInt(types.length + 1), 0, null);
        }
        const typeId = new TypeId(("" + r.nextChar("A", "Z") + r.nextChar("A", "Z")) as ExpressionIdentifier);
        return new TaggedTypeDefinition(typeId, typeVars, Utility.mapListExI_Index(types, (i, t) => {
            const tagName = ("T" + i) as ExpressionIdentifier;
            return new TagType<JellyType>(tagName, t);
        }));
    }
}
