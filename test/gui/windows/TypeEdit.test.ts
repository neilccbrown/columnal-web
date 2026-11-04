// Port of test.gui.TestTypeEdit (tests-gui-side): adding, editing (and not editing) and removing a
// user-defined tagged type in the Types dialog, through both its plain and inner values tabs, checking
// the project's saved types after (docs/gui-spec/types-and-units.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { TypeExpression } from "../../../src/engine/expressions/transformations/expression/type/TypeExpressions.js";
import type { JavaRandom } from "../../../src/engine/java/JavaRandom.js";
import type { TagType } from "../../../src/engine/types/data/datatype/DataType.js";
import { TaggedTypeDefinition } from "../../../src/engine/types/data/datatype/TaggedTypeDefinition.js";
import { TypeManager } from "../../../src/engine/types/data/datatype/TypeManager.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import type { JellyType } from "../../../src/engine/types/jellytype/JellyType.js";
import { checkProperty, Generator, type GenerationStatus, type SourceOfRandomness } from "../../support/quickcheck.js";
import { GenRandom } from "../../engine/tests-basic/fixtures/gen/GenRandom.js";
import { GenTaggedTypeDefinition } from "../../engine/tests-functions/fixtures/gen/GenTaggedTypeDefinition.js";
import { enterType } from "../base/enterType.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { fileSection } from "../base/savedFile.js";
import { selectAllCurrentTextField } from "../base/textField.js";
import { clickMenu, closeApp, engineHost, renderApp, savedFile, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

// Java: TAppUtil.openDataAsTable with a DummyManager given the types
async function open(types: readonly TaggedTypeDefinition[]): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const content = savedFile(m =>
    {
        for (const t of types)
            m.getTypeManager().registerTaggedType(t.getTaggedTypeName().getRaw(), t.getTypeArguments(), t.getTags());
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    return a;
}

async function openTypesDialog(): Promise<void>
{
    await clickMenu("id-menu-view", "id-menu-view-types");
    await vi.waitUntil(() => document.querySelector(".types-list") !== null);
}

// Java: clickOn(".close-button"), then reading the saved file's types
async function closeAndGetSavedTypes(a: RenderedApp): Promise<TypeManager>
{
    const before = (await a.store.get(shownProject()!))?.content;
    await userEvent.click(document.querySelector(".close-button")!);
    await vi.waitUntil(() => document.querySelector(".types-list") === null);
    // (Saved after the dialog closes)
    await vi.waitUntil(async () => (await a.store.get(shownProject()!))?.content !== before, { timeout: 3000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 300));
    const tmpTypes = new TypeManager(new UnitManager());
    tmpTypes.loadTypeDecls(fileSection((await a.store.get(shownProject()!))!.content, "TYPES"));
    return tmpTypes;
}

function expectTypes(actual: TypeManager, expected: readonly TaggedTypeDefinition[]): void
{
    const types = actual.getUserTaggedTypes();
    expect([...types.keys()].map(k => k.getRaw()).sort()).toEqual(expected.map(t => t.getTaggedTypeName().getRaw()).sort());
    for (const t of expected)
        expect(types.get(t.getTaggedTypeName())!.equals(t), "Type " + t.getTaggedTypeName().getRaw()).toBe(true);
}

// Java: CheckWindowBoundsTrait.checkWindowWithinScreen, for the dialog in front
function checkWindowWithinScreen(): void
{
    const dialogs = document.querySelectorAll("[role=dialog]");
    const r = dialogs[dialogs.length - 1]!.getBoundingClientRect();
    expect(r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight, "Dialog within window: " + JSON.stringify(r)).toBe(true);
}

async function enterTypeDetails(typeDefinition: TaggedTypeDefinition, r: JavaRandom, typeManager: TypeManager): Promise<void>
{
    checkWindowWithinScreen();
    await selectAllCurrentTextField();
    await write(typeDefinition.getTaggedTypeName().getRaw());

    const canUsePlainEntry = typeDefinition.getTags().every(t => t.getInner() === null) && typeDefinition.getTypeArguments().length === 0;

    if (canUsePlainEntry && r.nextInt(3) !== 1)
    {
        const numTags = typeDefinition.getTags().length;
        // Chance of beginning in the inner-values side:
        if (numTags >= 2 && r.nextInt(3) === 1)
        {
            const split = 1 + r.nextInt(numTags - 1);

            await userEvent.click(document.querySelector(".type-entry-tab-standard")!);
            await userEvent.click(document.querySelector(".type-entry-inner-type-args")!);
            await selectAllCurrentTextField();
            await push("Delete");
            await deleteExistingInnerValueTags();

            for (const tagType of typeDefinition.getTags().slice(0, split))
                await enterNewInnerValueTag(r, typeManager, tagType);

            assertNoErrors();
            await userEvent.click(document.querySelector(".type-entry-tab-plain")!);
            await userEvent.click(document.querySelector(".type-entry-plain-tags-textarea")!);
            await userEvent.keyboard("{Control>}{End}{/Control}");
            await write(typeDefinition.getTags().slice(split).map(t => tagDivider(r) + t.getName()).join(""));
        }
        else
        {
            // Select and move to alias field:
            assertNoErrors();
            await userEvent.click(document.querySelector(".type-entry-tab-plain")!);
            await userEvent.click(document.querySelector(".type-entry-plain-tags-textarea")!);
            await selectAllCurrentTextField();
            await write(typeDefinition.getTags().map(t => t.getName()).join(tagDivider(r)));
        }
    }
    else
    {
        // If we can start in plain side, then potentially do so:
        const index = typeDefinition.getTags().findIndex(t => t.getInner() !== null);
        const firstWithInner = index === -1 ? typeDefinition.getTags().length : index;
        let alreadyEntered = 0;
        if (firstWithInner > 0 && r.nextInt(3) === 1)
        {
            assertNoErrors();
            await userEvent.click(document.querySelector(".type-entry-tab-plain")!);
            await userEvent.click(document.querySelector(".type-entry-plain-tags-textarea")!);
            await selectAllCurrentTextField();
            await write(typeDefinition.getTags().slice(0, firstWithInner).map(t => t.getName()).join(tagDivider(r)));
            alreadyEntered = firstWithInner;
        }

        await userEvent.click(document.querySelector(".type-entry-tab-standard")!);
        await userEvent.click(document.querySelector(".type-entry-inner-type-args")!);
        await selectAllCurrentTextField();
        await push("Delete");
        await write(typeDefinition.getTypeArguments()
            .map(p => p.getFirst() === TaggedTypeDefinition.TypeVariableKind.UNIT ? "{" + p.getSecond() + "}" : p.getSecond())
            .join(", "));
        if (alreadyEntered === 0)
            await deleteExistingInnerValueTags();

        for (const tagType of typeDefinition.getTags().slice(alreadyEntered))
            await enterNewInnerValueTag(r, typeManager, tagType);
    }
}

function assertNoErrors(): void
{
    expect(document.querySelectorAll(".error-underline").length).toBe(0);
}

function tagDivider(r: JavaRandom): string
{
    // Blank items between dividers should get ignored:
    if (r.nextInt(5) === 1)
        return r.nextBoolean() ? " , , " : " \n , \n ";
    else
        return r.nextBoolean() ? " , " : " \n ";
}

async function deleteExistingInnerValueTags(): Promise<void>
{
    let count = 0;
    while (document.querySelector(".small-delete") !== null && ++count < 30)
    {
        // Click highest one as likely to not be off the screen:
        const node = [...document.querySelectorAll<HTMLElement>(".small-delete-circle")].filter(n => n.checkVisibility())
            .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (node !== undefined)
        {
            await userEvent.click(node);
            await new Promise(resolve => setTimeout(resolve, 800));
        }
    }
    expect(document.querySelector(".small-delete"), "Small delete").toBeNull();
}

async function enterNewInnerValueTag(r: JavaRandom, typeManager: TypeManager, tagType: TagType<JellyType>): Promise<void>
{
    const add = document.querySelector<HTMLElement>(".id-fancylist-add")!;
    add.scrollIntoView({ block: "nearest" });
    const box = add.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    await userEvent.click(add);
    await vi.waitUntil(() => document.activeElement?.classList.contains("tag-name-field") === true && (document.activeElement as HTMLInputElement).value === "");
    await write(tagType.getName());
    const inner = tagType.getInner();
    if (inner !== null)
    {
        await push("Tab");
        await enterType(TypeExpression.fromJellyType(inner, typeManager), r);
        // Cancel auto-complete:
        await push("Escape");
    }
}

async function selectFirstType(): Promise<void>
{
    await userEvent.click(document.querySelector(".types-list")!, { position: { x: 5, y: 5 } });
    await push("ArrowDown");
    await push("Home");
}

async function clickOk(): Promise<void>
{
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
}

test("testNewType", () => checkProperty([new GenTaggedTypeDefinition(), new GenRandom()], async (typeDefinition: TaggedTypeDefinition, random: JavaRandom) =>
{
    const a = await open([]);
    await openTypesDialog();
    await userEvent.click(document.querySelector(".id-types-add")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("type-name-field") === true);
    await enterTypeDetails(typeDefinition, random, engineHost(a).tableManager.getTypeManager());
    await clickOk();
    await vi.waitUntil(() => document.querySelector(".edit-type-dialog-content") === null);

    // Check that saved types in file match our new unit:
    expectTypes(await closeAndGetSavedTypes(a), [typeDefinition]);
}, { trials: 5 }), 300_000);

test("testNoOpEditType", () => checkProperty([new GenTaggedTypeDefinition(), new GenRandom()], async (typeDefinition: TaggedTypeDefinition, _random: JavaRandom) =>
{
    const a = await open([typeDefinition]);
    await openTypesDialog();
    await selectFirstType();
    await userEvent.click(document.querySelector(".id-types-edit")!);
    await vi.waitUntil(() => document.querySelector(".edit-type-dialog-content") !== null);
    await new Promise(resolve => setTimeout(resolve, 500));
    await userEvent.click(document.querySelector(".ok-button")!);
    await vi.waitUntil(() => document.querySelector(".edit-type-dialog-content") === null);

    expectTypes(await closeAndGetSavedTypes(a), [typeDefinition]);
}, { trials: 10 }), 300_000);

test("testEditType", () => checkProperty([new GenTaggedTypeDefinition(), new GenTaggedTypeDefinition(), new GenRandom()], async (before: TaggedTypeDefinition, after: TaggedTypeDefinition, random: JavaRandom) =>
{
    const a = await open([before]);
    await openTypesDialog();
    await selectFirstType();
    await userEvent.click(document.querySelector(".id-types-edit")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("type-name-field") === true);
    await enterTypeDetails(after, random, engineHost(a).tableManager.getTypeManager());
    await clickOk();
    await vi.waitUntil(() => document.querySelector(".edit-type-dialog-content") === null);

    expectTypes(await closeAndGetSavedTypes(a), [after]);
}, { trials: 5 }), 300_000);

class GenInt extends Generator<number>
{
    public generate(r: SourceOfRandomness, _status: GenerationStatus): number
    {
        return r.nextInt();
    }
}

test("testDeleteType", () => checkProperty([new GenTaggedTypeDefinition(), new GenTaggedTypeDefinition(), new GenTaggedTypeDefinition(), new GenInt()], async (typeDefinitionA: TaggedTypeDefinition, typeDefinitionB: TaggedTypeDefinition, typeDefinitionC: TaggedTypeDefinition, whichToDelete: number) =>
{
    // If the names overlap they won't register successfully and the test will be invalid:
    if (typeDefinitionA.getTaggedTypeName().equals(typeDefinitionB.getTaggedTypeName())
        || typeDefinitionA.getTaggedTypeName().equals(typeDefinitionC.getTaggedTypeName())
        || typeDefinitionB.getTaggedTypeName().equals(typeDefinitionC.getTaggedTypeName()))
        return;

    const a = await open([typeDefinitionA, typeDefinitionB, typeDefinitionC]);
    await openTypesDialog();
    await selectFirstType();
    // (Java's %, which keeps the sign)
    const toDelete = whichToDelete % 3 === 0 ? typeDefinitionA : whichToDelete % 3 === 1 ? typeDefinitionB : typeDefinitionC;
    let count = 0;
    const toDeleteCellText = toDelete.getTaggedTypeName().getRaw() + toDelete.getTypeArguments().map(t => "(" + t.getSecond() + ")").join("");
    while (!existsSelectedCell(toDeleteCellText) && count++ < 3)
        await push("ArrowDown");
    expect(existsSelectedCell(toDeleteCellText), toDeleteCellText).toBe(true);
    await userEvent.click(document.querySelector(".id-types-remove")!);

    expectTypes(await closeAndGetSavedTypes(a), [typeDefinitionA, typeDefinitionB, typeDefinitionC].filter(t => t !== toDelete));
}, { trials: 5 }), 300_000);

function existsSelectedCell(content: string): boolean
{
    return [...document.querySelectorAll(".types-list .list-cell.selected")].some(c => c.textContent?.trim() === content);
}
