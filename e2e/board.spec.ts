import { expect, test, type Page } from "@playwright/test";

// Actions board (step 3). Every test names its own blocks and items, so they can share one user.
const uid = (p: string) => `${p} ${Date.now().toString(36)}`;
const noErrors = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);
const todayCol = (page: Page) => page.getByRole("region", { name: "Today", exact: true });
const block = (page: Page, name: string) => page.getByRole("group", { name: `Block ${name}` });
const bench = (page: Page) => page.getByRole("region", { name: "Work bench" });
const isMac = (p: string) => p === "mac";

async function quickAdd(page: Page, text: string) {
  await page.goto("/inbox");
  await page.getByPlaceholder(/Add something/).fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByPlaceholder(/Add something/)).toHaveValue("");
}

// Adds a block to this morning with "+", names it, and returns to the board.
async function addBlock(page: Page, name: string, pin?: string) {
  await page.goto("/actions");
  await todayCol(page).getByRole("button", { name: "Add a block morning" }).click();
  await page.getByLabel("Block name").fill(name);
  if (pin) await page.getByLabel("Pinned time").selectOption({ label: pin });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Block name")).toHaveCount(0);
  await expect(block(page, name)).toBeVisible();
}

// The iPhone path: open the item and pick a block in "Scheduled in".
async function schedule(page: Page, item: string, blockName: string) {
  await page.goto("/inbox");
  await page.locator("main li", { hasText: item }).locator("button").nth(1).click();
  const picker = page.getByLabel("Scheduled in");
  const value = await picker.locator("option", { hasText: blockName }).getAttribute("value");
  await picker.selectOption(value!);
  await page.getByRole("button", { name: "Save", exact: true }).click();
}

test("a block can be added, pinned, and shows in Hourly", async ({ page }, info) => {
  const name = uid("Deep work");
  await addBlock(page, name, "9am");
  await expect(block(page, name)).toContainText("9am");

  await page.getByRole("button", { name: "Hourly" }).click();
  await expect(block(page, name)).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-hourly.png`, fullPage: true });

  // The choice of view is remembered.
  await page.reload();
  await expect(block(page, name)).toBeVisible();
  await page.getByRole("button", { name: "Day parts" }).click();
  await noErrors(page);
});

test("an action scheduled from its sheet shows inside the block", async ({ page }, info) => {
  const b = uid("Chores");
  const t = uid("Sweep the porch");
  await addBlock(page, b);
  await quickAdd(page, t);
  await schedule(page, t, b);

  await page.goto("/actions");
  await expect(block(page, b)).toContainText(t);
  if (isMac(info.project.name)) await expect(bench(page)).not.toContainText(t);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-board.png`, fullPage: true });

  // Completing it from the board removes it.
  await block(page, b).getByRole("button", { name: `Mark ${t} complete` }).click();
  await expect(block(page, b)).not.toContainText(t);
  await noErrors(page);
});

test("deleting a block sends its actions back to the Work bench", async ({ page }, info) => {
  test.skip(!isMac(info.project.name), "The Work bench column is on the Mac layout");
  const b = uid("Errands");
  const t = uid("Return library books");
  await addBlock(page, b);
  await quickAdd(page, t);
  await schedule(page, t, b);

  await page.goto("/actions");
  await expect(block(page, b)).toContainText(t);
  await block(page, b).getByRole("button", { name: new RegExp(`^${b}`) }).click();
  await page.getByRole("button", { name: "Delete block" }).click();
  await expect(block(page, b)).toHaveCount(0);
  await expect(bench(page)).toContainText(t);
  await noErrors(page);
});

test("dragging from the Work bench onto a block schedules it", async ({ page }, info) => {
  test.skip(!isMac(info.project.name), "Drag and drop is the Mac path; iPhone uses Scheduled in");
  const b = uid("Admin");
  const t = uid("Pay the water bill");
  await addBlock(page, b);
  await quickAdd(page, t);

  await page.goto("/actions");
  await bench(page).getByText(t).dragTo(block(page, b));
  await expect(block(page, b)).toContainText(t);
  await expect(bench(page)).not.toContainText(t);

  // And back again.
  await block(page, b).getByText(t).dragTo(bench(page));
  await expect(bench(page)).toContainText(t);
  await noErrors(page);
});

test("unfinished actions in past blocks roll back to the Work bench", async ({ page }, info) => {
  test.skip(!isMac(info.project.name), "The Work bench column is on the Mac layout");
  const b = uid("Yesterday block");
  const t = uid("Unfinished thing");
  await addBlock(page, b);
  await quickAdd(page, t);
  await schedule(page, t, b);

  // Move the block to yesterday.
  await page.goto("/actions");
  await block(page, b).getByRole("button", { name: new RegExp(`^${b}`) }).click();
  const y = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await page.getByLabel("Day", { exact: true }).fill(y);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(block(page, b)).toHaveCount(0);
  await expect(bench(page)).toContainText(t);
  await noErrors(page);
});

test("the Work bench can be hidden and stays hidden", async ({ page }, info) => {
  test.skip(!isMac(info.project.name), "The Work bench column is on the Mac layout");
  await page.goto("/actions");
  await expect(bench(page)).toBeVisible();
  await page.getByRole("button", { name: "Hide Work bench" }).click();
  await expect(bench(page)).toHaveCount(0);
  await page.reload();
  await expect(bench(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Show Work bench" }).click();
  await expect(bench(page)).toBeVisible();
});

test("iPhone shows one day at a time with a day strip", async ({ page }, info) => {
  test.skip(isMac(info.project.name), "iPhone layout");
  await page.goto("/actions");
  await expect(todayCol(page)).toBeVisible();
  await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
  await expect(page.getByRole("region", { name: "Tomorrow", exact: true })).toBeVisible();
  await expect(todayCol(page)).toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-tomorrow.png` });
});
