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

test("a focus can be typed and formatted, and it saves", async ({ page }, info) => {
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
  await page.getByLabel("Add a note").click(); // leaving the editor saves it
  await expect(page.getByText(/^since /)).toBeVisible();
  // The hint only shows while the editor is empty, never on top of what you typed.
  await expect(editor.locator(".is-editor-empty")).toHaveCount(0);

  await page.reload();
  const again = page.getByRole("textbox", { name: `${name} focus` });
  await expect(again).toContainText("Morning prayer");
  await expect(again.locator("strong")).toHaveText("every day");
  await expect(again.locator("ul li")).toHaveText("Psalms before email");
  await page.screenshot({ path: `test-results/screens/${info.project.name}-focus.png`, fullPage: true });
  await noErrors(page);
});

test("notes, new focus and past focuses", async ({ page }) => {
  const name = await newArea(page);
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.type("Get the coop finished");
  await page.getByLabel("Add a note").click();
  await expect(page.getByText(/^since /)).toBeVisible();

  await page.getByLabel("Add a note").fill("Framing is done");
  await page.getByRole("button", { name: "Note", exact: true }).click();
  await expect(page.getByText("Framing is done")).toBeVisible();

  await page.getByRole("button", { name: "New focus" }).click();
  await expect(page.getByRole("textbox", { name: `${name} focus` })).toHaveText("");
  await page.getByRole("textbox", { name: `${name} focus` }).click();
  await page.keyboard.type("Plant the garden");
  await page.getByRole("button", { name: /Past focuses \(1\)/ }).click(); // also leaves the editor

  const past = page.getByRole("region", { name: "Past focuses" });
  await expect(past).toContainText("Get the coop finished");
  await expect(past).toContainText("Framing is done");
  // Past focuses can still get notes.
  await past.getByLabel("Add a note").fill("Looking back: worth it");
  await past.getByRole("button", { name: "Note", exact: true }).click();
  await expect(past).toContainText("Looking back: worth it");

  await page.reload();
  await expect(page.getByRole("textbox", { name: `${name} focus` })).toContainText("Plant the garden");
  await noErrors(page);
});

test("an area can hold context about itself", async ({ page }) => {
  const name = await newArea(page);
  await page.getByRole("button", { name: "+ Add context about this area" }).click();
  await page.getByRole("textbox", { name: `About ${name}` }).click();
  await page.keyboard.type("Who this covers and what good looks like");
  const saved = page.waitForResponse((r) => r.url().includes("/rest/v1/areas") && r.request().method() === "PATCH");
  await page.getByLabel("Area name").click(); // leaving the editor saves it
  await saved;
  await page.reload();
  await expect(page.getByRole("textbox", { name: `About ${name}` })).toContainText("what good looks like");
  await noErrors(page);
});
