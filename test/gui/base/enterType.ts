// Port of test.gui.trait.EnterTypeTrait (tests-gui-base): typing a type or unit into the focused
// type or unit editor.  The editor adds the closing bracket after an opening one, which is deleted
// (and typed later).
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import { Expression } from "../../../src/engine/expressions/transformations/expression/Expressions.js";
import type { UnitExpression } from "../../../src/engine/expressions/transformations/expression/UnitExpression.js";
import { IdentTypeExpression, InvalidIdentTypeExpression, ListTypeExpression, NumberTypeExpression, RecordTypeExpression, TypeApplyExpression, TypePrimitiveLiteral, type TypeExpression } from "../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import { push, write } from "./keyboard.js";

export async function enterType(typeExpression: TypeExpression, r: JavaRandom): Promise<void>
{
    if (typeExpression instanceof TypePrimitiveLiteral)
    {
        await write(typeExpression._test_getType().toString());
    }
    else if (typeExpression instanceof IdentTypeExpression)
    {
        await write(typeExpression.asIdent());
    }
    else if (typeExpression instanceof InvalidIdentTypeExpression)
    {
        await write(typeExpression._test_getContent());
    }
    else if (typeExpression instanceof TypeApplyExpression)
    {
        await write(typeExpression.getTypeName());
        for (const arg of typeExpression.getArgumentsOnly())
        {
            await write("(");
            await push("Delete");
            if (arg.isLeft())
            {
                await write("{");
                await push("Delete");
                await enterUnit(arg.getLeft(""), r);
                await write("}");
            }
            else
                await enterType(arg.getRight(""), r);
            await write(")");
        }
    }
    else if (typeExpression instanceof RecordTypeExpression)
    {
        await write("(");
        await push("Delete");
        const items = typeExpression._test_getItems();
        for (let i = 0; i < items.length; i++)
        {
            const item = items[i]!;
            await write(item.getFirst() + ": ");
            await enterType(item.getSecond(), r);
            if (i < items.length - 1)
                await write(r.nextBoolean() ? "," : " , ");
        }
        await write(")");
    }
    else if (typeExpression instanceof ListTypeExpression)
    {
        await write("[");
        await push("Delete");
        await enterType(typeExpression._test_getContent(), r);
        await write("]");
    }
    else if (typeExpression instanceof NumberTypeExpression)
    {
        await write("Number");
        const units = typeExpression._test_getUnits();
        if (units !== null)
        {
            await write("{");
            await push("Delete");
            await enterUnit(units, r);
            await write("}");
        }
    }
    else
    {
        throw new Error("Unknown TypeExpression sub type: " + typeExpression.constructor.name);
    }
}

export async function enterUnit(unitExpression: UnitExpression, _r: JavaRandom): Promise<void>
{
    // Bit of a hack...
    for (const c of unitExpression.save(Expression.SaveDestination.TO_EDITOR_FULL_NAME, true))
    {
        await write(c);
        if (c === "(")
            await push("Delete");
    }
}

export async function enterAndDeleteSmartBrackets(internalContent: string): Promise<void>
{
    for (const c of internalContent)
    {
        await write(c);
        if ("({[\"".includes(c))
            await push("Delete");
    }
}
