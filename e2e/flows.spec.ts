import { expect, test, type Page } from "@playwright/test";

// The flows Ryan uses every day. Each test makes its own uniquely named items.
const uid = (p: string) => `${p} ${Date.now().toString(36)}`;
const row = (page: Page, t: string) => page.locator("main li", { hasText: t });
const open = (page: Page, t: string) => row(page, t).locator("button").nth(1).click();
const complete = (page: Page, t: string) => row(page, t).getByRole("button", { name: /^Mark .* complete$/ }).click();
const link = (page: Page, name: string) => page.locator("main").getByRole("link", { name, exact: true });
const noErrors = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);

async function quickAdd(page: Page, text: string) {
  await page.goto("/inbox");
  await page.getByPlaceholder(/Add something/).fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
}

async function openArea(page: Page, name: string) {
  await page.goto("/areas");
  await link(page, name).click();
  await expect(page.getByLabel("Area name")).toHaveValue(name);
}

test("signed in with the five seeded areas", async ({ page }) => {
  await page.goto("/areas");
  for (const a of ["Faith", "Fortitude", "Family", "Field & Function", "General"])
    await expect(link(page, a)).toBeVisible();
});

test("quick add splits several items and parses repeat and due date", async ({ page }) => {
  const a = uid("Feed the chickens"), b = uid("Call Mom");
  await quickAdd(page, `${a} every day, ${b} tomorrow`);
  await expect(row(page, a)).toContainText("↻ daily");
  await expect(row(page, b)).toContainText("Tomorrow");
  await expect(page.getByPlaceholder(/Add something/)).toHaveValue("");
  await noErrors(page);
});

test("setting an area moves the item to the Work bench and the area page", async ({ page }) => {
  const t = uid("Fix the coop door");
  await quickAdd(page, t);
  await open(page, t);
  await page.getByRole("button", { name: "Family", exact: true }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(row(page, t)).toHaveCount(0); // left the Inbox

  await page.goto("/bench");
  const family = page.locator("section", { has: page.getByRole("heading", { name: "Family" }) });
  await expect(family.locator("li", { hasText: t })).toBeVisible();

  await openArea(page, "Family");
  await expect(row(page, t)).toBeVisible();
  await noErrors(page);
});

test("Save keeps the item open; Mark complete hides it; Show completed and Reopen bring it back", async ({ page }) => {
  const t = uid("Order filters");
  await quickAdd(page, t);
  await open(page, t);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row(page, t)).toBeVisible(); // Save never completes

  await page.goto("/bench");
  await complete(page, t);
  await expect(row(page, t)).toHaveCount(0);

  await page.getByRole("button", { name: "Show completed" }).click();
  await row(page, t).getByRole("button", { name: /^Reopen / }).click();
  await page.getByRole("button", { name: "Show completed" }).click();
  await expect(row(page, t)).toBeVisible();
  await noErrors(page);
});

test("completing a repeating item creates the next one", async ({ page }) => {
  const t = uid("Water the garden");
  await quickAdd(page, `${t} every day`);
  await expect(row(page, t)).toHaveCount(1);
  await complete(page, t);
  // The completed one goes away and the next instance appears, due tomorrow.
  await expect(row(page, t)).toHaveCount(1);
  await expect(row(page, t)).toContainText("Tomorrow");
  await noErrors(page);
});

test("areas can be added, renamed and removed", async ({ page }) => {
  const name = uid("Side project");
  await page.goto("/areas");
  await page.getByPlaceholder("New area").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await link(page, name).click();

  const renamed = `${name} renamed`;
  await page.getByLabel("Area name").fill(renamed);
  await page.getByLabel("Area name").press("Enter");
  await page.goto("/areas");
  await expect(link(page, renamed)).toBeVisible();

  await link(page, renamed).click();
  await page.getByRole("button", { name: "Remove this area…" }).click();
  await page.getByRole("combobox").selectOption({ label: "General" });
  await page.getByRole("button", { name: "Move and remove" }).click();
  await page.waitForURL("**/areas");
  await expect(link(page, renamed)).toHaveCount(0);
  await noErrors(page);
});
