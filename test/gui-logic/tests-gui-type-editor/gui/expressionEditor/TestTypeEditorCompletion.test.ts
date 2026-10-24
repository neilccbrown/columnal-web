// TestTypeEditorCompletion (tests-gui-type-editor): the completions in the type editor of a new
// column of a table, checked against the type editor's content and display (see makeEditor).
import { describe, test } from "vitest";
import { TypeId } from "../../../../../src/engine/types/data/datatype/TypeId.js";
import { TaggedTypeDefinition } from "../../../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TagType } from "../../../../../src/engine/types/data/datatype/DataType.js";
import type { TypeExpression } from "../../../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { Pair } from "../../../../../src/engine/utility-adt/utility/adt/Pair.js";
import type { CodeCompletionContext } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/CodeCompletionContext.js";
import { TypeLexer } from "../../../../../src/gui-logic/lex-editor/gui/lexeditor/TypeLexer.js";
import type { JellyType } from "../../../../../src/engine/types/jellytype/JellyTypes.js";
import { DummyManager } from "../../../../engine/tests-functions/fixtures/DummyManager.js";
import { c, makeEditor, type Editing } from "../../../lex-editor/EditorHarness.js";

// The GUI test opens a table and starts creating a column, whose type editor (in
// EditImmediateColumnDialog) requires a concrete type, which must not be empty
function loadTypeExpression(typeExpressionSrc: string, ...taggedTypes: TaggedTypeDefinition[]): Editing<TypeExpression, CodeCompletionContext>
{
    const toLoad = new DummyManager();
    for (const taggedTypeDefinition of taggedTypes)
    {
        toLoad.getTypeManager().registerTaggedType(taggedTypeDefinition.getTaggedTypeName().getRaw(), taggedTypeDefinition.getTypeArguments(), taggedTypeDefinition.getTags());
    }
    return makeEditor(typeExpressionSrc, new TypeLexer(toLoad.getTypeManager(), true, false), true);
}

describe("TestTypeEditorCompletion", () =>
{
    test("testCore", () =>
    {
        const ed = loadTypeExpression("");
        ed.checkCompletions(
            c("Number", 0, 0),
            c("Number{}", 0, 0),
            c("Text", 0, 0),
            c("Date", 0, 0),
            c("DateTime", 0, 0),
            c("DateYM", 0, 0)
        );
        ed.write("Dat");

        ed.checkCompletions(
            c("Number", 0, 0),
            c("Number{}", 0, 0),
            c("Text", 0, 0),
            c("Date", 0, 3),
            c("DateTime", 0, 3),
            c("DateYM", 0, 3)
        );
    });

    test("testBuiltInTagged", () =>
    {
        const ed = loadTypeExpression("",
            new TaggedTypeDefinition(new TypeId("Opsicle"), [], [new TagType<JellyType>("Single", null)]),
            new TaggedTypeDefinition(new TypeId("Either"), [new Pair(TaggedTypeDefinition.TypeVariableKind.TYPE, "a"), new Pair(TaggedTypeDefinition.TypeVariableKind.TYPE, "b")], [new TagType<JellyType>("Left", null)]));
        // Don't want to offer Void or Type as they are considered internal
        ed.checkCompletions(
            c("Optional()", 0, 0),
            c("Opsicle", 0, 0),
            c("Either()()", 0, 0),
            c("Void"),
            c("Type")
        );
        ed.write("Opst");

        ed.checkCompletions(
            c("Optional()", 0, 2),
            c("Opsicle", 0, 3),
            c("Either()()", 0, 0),
            c("Void"),
            c("Type")
        );
    });
});
