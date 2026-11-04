// Port of test.gui.TestUnitEdit (tests-gui-side): adding, editing (and not editing) and removing a
// user-defined unit in the Units dialog, checking the project's saved units after
// (docs/gui-spec/types-and-units.md).
import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import type { UnitIdentifier } from "../../../src/engine/anns/Annotations.js";
import { UnitManager } from "../../../src/engine/types/data/unit/UnitManager.js";
import type { UnitDeclaration } from "../../../src/engine/types/data/unit/UnitDeclaration.js";
import type { Either } from "../../../src/engine/utility-adt/utility/adt/Either.js";
import { Pair } from "../../../src/engine/utility-adt/utility/adt/Pair.js";
import { isMac } from "../../../src/gui/shortcuts.js";
import { checkProperty, Generator, type GenerationStatus, type SourceOfRandomness } from "../../support/quickcheck.js";
import { GenUnitDefinition } from "../../engine/tests-functions/fixtures/gen/GenUnitDefinition.js";
import { getFocusOwner } from "../base/focusOwner.js";
import { doubleOk } from "../base/doubleOk.js";
import { push, write } from "../base/keyboard.js";
import { moveAndDismissPopupsAtPos } from "../base/popup.js";
import { selectAllCurrentTextField } from "../base/textField.js";
import { fileSection } from "../base/savedFile.js";
import { clickMenu, closeApp, renderApp, savedFile, shownProject, waitForLoaded, type RenderedApp } from "../fixtures/app.js";

let app: RenderedApp | null = null;
afterEach(async () =>
{
    if (app !== null)
        await closeApp(app);
    app = null;
});

type Units = ReadonlyMap<UnitIdentifier, Either<UnitIdentifier, UnitDeclaration>>;

// Java: TAppUtil.openDataAsTable with a DummyManager given the units
async function open(units: readonly GenUnitDefinition.UnitDetails[]): Promise<RenderedApp>
{
    if (app !== null)
        await closeApp(app);
    const content = savedFile(m =>
    {
        for (const u of units)
            m.getUnitManager().addUserUnit(new Pair(u.name, u.aliasOrDeclaration));
    });
    const a = app = await renderApp([{ name: "P", content }], 0);
    await waitForLoaded();
    return a;
}

async function openUnitsDialog(): Promise<void>
{
    await clickMenu("id-menu-view", "id-menu-view-units");
    await vi.waitUntil(() => document.querySelector(".user-unit-list") !== null);
}

// Java: clickOn(".close-button"), then reading the saved file's units
async function closeAndGetSavedUnits(a: RenderedApp): Promise<Units>
{
    const before = (await a.store.get(shownProject()!))?.content;
    await userEvent.click(document.querySelector(".close-button")!);
    await vi.waitUntil(() => document.querySelector(".user-unit-list") === null);
    // (Saved after the dialog closes)
    await vi.waitUntil(async () => (await a.store.get(shownProject()!))?.content !== before, { timeout: 3000 }).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 300));
    const fileContent = (await a.store.get(shownProject()!))!.content;
    const tmpUnits = new UnitManager();
    tmpUnits.loadUserUnits(fileSection(fileContent, "UNITS"));
    return tmpUnits.getAllUserDeclared();
}

function expectUnits(actual: Units, expected: readonly GenUnitDefinition.UnitDetails[]): void
{
    expect([...actual.keys()].sort()).toEqual(expected.map(u => u.name).sort());
    for (const u of expected)
        expect(actual.get(u.name)!.equals(u.aliasOrDeclaration), "Unit " + u.name).toBe(true);
}

async function enterUnitDetails(unitDetails: GenUnitDefinition.UnitDetails): Promise<void>
{
    const input = await selectAllCurrentTextField();
    await write(unitDetails.name);
    expect(input.value).toBe(unitDetails.name);
    if (unitDetails.aliasOrDeclaration.isLeft())
    {
        // Select and move to alias field:
        await userEvent.click(document.querySelector(".id-unit-alias")!);
        await push("Tab");
        await selectAllCurrentTextField();
        await write(unitDetails.aliasOrDeclaration.getLeft(""));
    }
    else
    {
        // Select and move to units:
        await userEvent.click(document.querySelector(".id-unit-full")!);
        await push("Tab");
        const declaration = unitDetails.aliasOrDeclaration.getRight("");
        await selectAllCurrentTextField();
        await write(declaration.getDefined().getDescription());
        await push("Tab");
        const equivCheck = getFocusOwner() as HTMLInputElement;
        expect(equivCheck.type).toBe("checkbox");
        const equiv = declaration.getEquivalentTo();
        if (equiv !== null)
        {
            // Tick the box:
            if (!equivCheck.checked)
                await push(" ");
            await push("Tab");
            await selectAllCurrentTextField();
            await write(equiv.getFirst().toString());
            await push("Tab");
            await userEvent.keyboard(isMac() ? "{Meta>}a{/Meta}" : "{Control>}a{/Control}");
            await push("Backspace");
            await write(equiv.getSecond().toString());
        }
        else
        {
            // Untick the box:
            if (equivCheck.checked)
                await push(" ");
        }
    }
}

async function clickOk(): Promise<void>
{
    const ok = document.querySelector(".ok-button")!.getBoundingClientRect();
    await moveAndDismissPopupsAtPos({ x: ok.left + ok.width / 2, y: ok.top + ok.height / 2 });
    await userEvent.click(document.querySelector(".ok-button")!);
}

// (JavaFX's TableView: Home selects the first row; the rows are each unit's)
async function selectFirstUnit(): Promise<void>
{
    const list = document.querySelector<HTMLElement>(".user-unit-list")!;
    await userEvent.click(list, { position: { x: 5, y: 5 } });
    await push("Home");
}

test("testNewUnit", () => checkProperty([new GenUnitDefinition()], async (unitDetails: GenUnitDefinition.UnitDetails) =>
{
    const a = await open([]);
    await openUnitsDialog();
    await userEvent.click(document.querySelector(".id-units-userDeclared-add")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("unit-name-field") === true);
    await enterUnitDetails(unitDetails);
    await doubleOk();
    await vi.waitUntil(() => document.querySelector(".edit-unit-dialog") === null);

    // Check that saved units in file match our new unit:
    expectUnits(await closeAndGetSavedUnits(a), [unitDetails]);
}, { trials: 5 }), 300_000);

test("testNoOpEditUnit", () => checkProperty([new GenUnitDefinition()], async (details: GenUnitDefinition.UnitDetails) =>
{
    const a = await open([details]);
    await openUnitsDialog();
    await selectFirstUnit();
    await userEvent.click(document.querySelector(".id-units-userDeclared-edit")!);
    await vi.waitUntil(() => document.querySelector(".edit-unit-dialog") !== null);

    // No edit
    await clickOk();
    await vi.waitUntil(() => document.querySelector(".edit-unit-dialog") === null);

    expectUnits(await closeAndGetSavedUnits(a), [details]);
}, { trials: 5 }), 300_000);

test("testEditUnit", () => checkProperty([new GenUnitDefinition(), new GenUnitDefinition()], async (before: GenUnitDefinition.UnitDetails, after: GenUnitDefinition.UnitDetails) =>
{
    const a = await open([before]);
    await openUnitsDialog();
    await selectFirstUnit();
    await userEvent.click(document.querySelector(".id-units-userDeclared-edit")!);
    await vi.waitUntil(() => document.activeElement?.classList.contains("unit-name-field") === true);

    await enterUnitDetails(after);

    await clickOk();
    await vi.waitUntil(() => document.querySelector(".edit-unit-dialog") === null);

    expectUnits(await closeAndGetSavedUnits(a), [after]);
}, { trials: 5 }), 300_000);

class GenInt extends Generator<number>
{
    public generate(r: SourceOfRandomness, _status: GenerationStatus): number
    {
        return r.nextInt();
    }
}

test("testDeleteUnit", () => checkProperty([new GenUnitDefinition(), new GenUnitDefinition(), new GenUnitDefinition(), new GenInt()], async (unitDetailsA: GenUnitDefinition.UnitDetails, unitDetailsB: GenUnitDefinition.UnitDetails, unitDetailsC: GenUnitDefinition.UnitDetails, _whichToDelete: number) =>
{
    const a = await open([unitDetailsA, unitDetailsB, unitDetailsC]);
    await openUnitsDialog();
    await selectFirstUnit();
    let count = 0;
    while (!existsSelectedCell(unitDetailsA.name) && count++ < 3)
        await push("ArrowDown");
    expect(existsSelectedCell(unitDetailsA.name), unitDetailsA.name).toBe(true);
    await userEvent.click(document.querySelector(".id-units-userDeclared-remove")!);

    expectUnits(await closeAndGetSavedUnits(a), [unitDetailsB, unitDetailsC]);
}, { trials: 5 }), 300_000);

function existsSelectedCell(content: string): boolean
{
    return [...document.querySelectorAll(".user-unit-list .table-row.selected .table-cell")].some(c => c.textContent === content);
}
