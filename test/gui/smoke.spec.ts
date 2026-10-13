// Placeholder GUI smoke test: the app loads and shows engine-derived content.
// Ported GUI tests (tests-gui-*) will live alongside this from Phase 7.
import { expect, test } from "@playwright/test";

test("app loads", async ({ page }) =>
{
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Columnal" })).toBeVisible();
    await expect(page.getByText("File format version 3")).toBeVisible();
});
