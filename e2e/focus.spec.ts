import { expect, test, type Page } from "@playwright/test";

// Area Focus. Each test makes its own area so Mac and iPhone runs don't share a focus.
const uid = (p: string) => `${p} ${Date.now().toString(36)}`;
const noErrors = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);

async function newArea(page: Page) {
  const name = uid("Focus test");
  await page.goto("/areas");
  await page.getByPlaceholder("New area").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("main").getByRole("link", { name, exact: true }).click();
  await expect(page.getByLabel("Area name")).toHaveValue(name);
  return name;
}

const focusPage = (page: Page, name: string) => page.getByRole("article", { name: `${name} focus` });

async function saveFocus(page: Page) {
  const saved = page.waitForResponse((r) => r.url().includes("/rest/v1/area_focuses") && r.request().method() !== "GET" && r.ok());
  await page.getByRole("region", { name: "Focus" }).getByRole("button", { name: "Save" }).click();
  await saved;
}

test("a focus is written, formatted and saved like a notebook page", async ({ page }, info) => {
  const name = await newArea(page);
  const editor = page.getByRole("textbox", { name: `${name} focus` });
  await editor.click();
  await page.keyboard.type("Morning prayer, ");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.type("every day");
  await page.getByRole("button", { name: "Bold" }).click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("Psalms before email");
  // The hint only shows while the editor is empty, never on top of what you typed.
  await expect(editor.locator(".is-editor-empty")).toHaveCount(0);
  await saveFocus(page);

  // Saved, it reads as a finished page, not an open editor.
  const saved = focusPage(page, name);
  await expect(saved.locator("strong")).toHaveText("every day");
  await expect(page.getByRole("textbox", { name: `${name} focus` })).toHaveCount(0);
  await expect(page.getByText(/^since /)).toBeVisible();

  await page.reload();
  await expect(focusPage(page, name)).toContainText("Morning prayer");
  await expect(focusPage(page, name).locator("ul li")).toHaveText("Psalms before email");
  await page.screenshot({ path: `test-results/screens/${info.project.name}-focus.png`, fullPage: true });

  // Edit changes the same page; Cancel throws the change away.
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and fasting Fridays");
  await page.getByRole("region", { name: "Focus" }).getByRole("button", { name: "Cancel" }).click();
  await expect(focusPage(page, name)).not.toContainText("fasting");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and fasting Fridays");
  await saveFocus(page);
  await page.reload();
  await expect(focusPage(page, name)).toContainText("fasting Fridays");
  await expect(page.getByRole("button", { name: /Past focuses/ })).toHaveCount(0); // editing doesn't start a new page
  await noErrors(page);
});

test("notes, new focus and past focuses", async ({ page }, info) => {
  const name = await newArea(page);
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.type("Get the coop finished");
  await saveFocus(page);
  await expect(page.getByText(/^since /)).toBeVisible();

  await page.getByLabel("Add a note").fill("Framing is done");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.getByText("Framing is done")).toBeVisible();

  await page.getByRole("button", { name: "New focus" }).click();
  await expect(page.getByRole("textbox", { name: `${name} focus` })).toHaveText("");
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.type("Plant the garden");
  await saveFocus(page);
  await expect(focusPage(page, name)).toContainText("Plant the garden");

  await page.getByRole("button", { name: /Past focuses \(1\)/ }).click();
  const past = page.getByRole("region", { name: "Past focuses" });
  await expect(past).toContainText("Get the coop finished");
  await expect(past).toContainText("Framing is done");
  // Past focuses can still get notes.
  await past.getByLabel("Add a note").fill("Looking back: worth it");
  await past.getByRole("button", { name: "Note", exact: true }).click();
  await expect(past).toContainText("Looking back: worth it");
  await page.screenshot({ path: `test-results/screens/${info.project.name}-focus-history.png`, fullPage: true });

  await page.reload();
  await expect(focusPage(page, name)).toContainText("Plant the garden");
  await noErrors(page);
});

test("an area can hold context about itself", async ({ page }) => {
  const name = await newArea(page);
  await page.getByRole("button", { name: "+ Add context about this area" }).click();
  await page.getByRole("textbox", { name: `About ${name}` }).click();
  await page.keyboard.type("Who this covers and what good looks like");
  const saved = page.waitForResponse((r) => r.url().includes("/rest/v1/areas") && r.request().method() === "PATCH" && r.ok());
  await page.getByRole("region", { name: "Context" }).getByRole("button", { name: "Save" }).click();
  await saved;
  await expect(page.getByRole("article", { name: `About ${name}` })).toContainText("what good looks like");
  await page.reload();
  await expect(page.getByRole("article", { name: `About ${name}` })).toContainText("what good looks like");
  await noErrors(page);
});
