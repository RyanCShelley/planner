import { expect, test, type Page } from "@playwright/test";

// Step 4: projects, goals, capture & chunk, project schedules. Each test names its own things.
const uid = (p: string) => `${p} ${Date.now().toString(36)}`;
const noErrors = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);
const card = (page: Page, title: string) => page.locator("main").getByRole("link", { name: new RegExp(title) });
const isMac = (p: string) => p === "mac";

// Creates a project in an area from the Projects page and names it. Leaves you on its page.
async function newProject(page: Page, area: string, title: string) {
  await page.goto("/projects");
  await page.getByRole("button", { name: `New project in ${area}` }).click();
  await page.waitForURL("**/projects/*");
  const t = page.getByLabel("Project title");
  await expect(t).toHaveValue("New project");
  await t.fill(title);
  await t.press("Enter");
  await expect(t).toHaveValue(title);
}

async function capture(page: Page, text: string, kind: "Idea / want / need" | "Communication" = "Idea / want / need") {
  await page.getByLabel("Kind").selectOption({ label: kind });
  await page.getByLabel("Capture", { exact: true }).fill(text);
  await page.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: text })).toBeVisible();
}

test("a long project title wraps instead of being cut off", async ({ page }) => {
  const title = uid("Rebuild the old barn behind the house before the first snow of the winter");
  await newProject(page, "Family", title);
  const t = page.getByLabel("Project title");
  // Every word is on screen: the field is as tall as its text and nothing scrolls sideways.
  const fits = await t.evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1);
  expect(fits).toBe(true);
  await t.press("Enter"); // Enter saves, it does not add a line
  await page.reload();
  await expect(page.getByLabel("Project title")).toHaveValue(title);
  await noErrors(page);
});

test("a project can be added, named and given a purpose", async ({ page }, info) => {
  const title = uid("Rebuild the barn");
  await newProject(page, "Family", title);
  await page.getByLabel("Purpose").fill("So the animals stay dry this winter");
  // Leave the purpose to save it, and wait for the save before reloading.
  const saved = page.waitForResponse((r) => r.url().includes("/rest/v1/projects") && r.request().method() === "PATCH" && r.ok());
  await page.getByLabel("Project title").click();
  await saved;
  await page.reload();
  await expect(page.getByLabel("Purpose")).toHaveValue("So the animals stay dry this winter");

  await page.goto("/projects");
  await expect(page.getByRole("region", { name: "Family" }).getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-projects.png`, fullPage: true });
  await noErrors(page);
});

test("captures chunk into a new goal, and the rest become to-dos", async ({ page }, info) => {
  const title = uid("Thesis");
  const goal = uid("Finish chapter 3");
  const a = uid("Outline the argument"), b = uid("Find two more sources"), c = uid("Email my advisor"), todo = uid("Renew library card");
  await newProject(page, "Field & Function", title);
  await capture(page, a);
  await capture(page, b);
  await capture(page, c, "Communication");
  await capture(page, todo);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-project.png`, fullPage: true });

  for (const t of [a, b, c]) await page.getByRole("checkbox", { name: t }).check();
  const bar = page.getByRole("group", { name: "Chunk selected" });
  await expect(bar).toContainText("3 selected");
  await bar.getByLabel("New goal name").fill(goal);
  await bar.getByRole("button", { name: "Chunk", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: a })).toHaveCount(0);
  await expect(card(page, goal)).toContainText("3 open actions");

  await page.getByRole("checkbox", { name: todo }).check();
  await page.getByRole("button", { name: "Make them to-dos" }).click();
  await expect(page.getByRole("checkbox", { name: todo })).toHaveCount(0);

  await card(page, goal).click();
  await page.waitForURL("**/goals/*");
  for (const t of [a, b, c]) await expect(page.getByRole("listitem", { name: t })).toBeVisible();

  await page.goto("/areas");
  await page.locator("main").getByRole("link", { name: "Field & Function", exact: true }).click();
  await expect(page.locator("main li", { hasText: todo })).toBeVisible();
  await expect(page.locator("main li", { hasText: a })).toHaveCount(0); // under its goal, not loose
  await noErrors(page);
});

test("a goal's action plan keeps leverage, priority and must", async ({ page }, info) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New goal in Fortitude" }).click();
  await page.waitForURL("**/goals/*");
  const goal = uid("Run a half marathon");
  await page.getByLabel("Goal", { exact: true }).fill(goal);
  await page.getByLabel("Goal", { exact: true }).press("Enter");
  await page.getByLabel("Purpose").fill("Strong enough to keep up with the kids");

  const act = uid("Long run Saturday");
  await page.getByLabel("New action").fill(act);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const row = page.getByRole("listitem", { name: act });
  await row.getByLabel("Leverage").fill("Running club");
  await row.getByLabel("Leverage").press("Enter");
  await row.getByLabel("Priority").fill("1");
  await row.getByLabel("Priority").press("Enter");
  await row.getByTitle("Must do").click();
  await row.getByLabel("Repeats").selectOption("weekly");
  await expect(page.getByText("1 musts")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${info.project.name}-goal.png`, fullPage: true });

  await page.reload();
  const again = page.getByRole("listitem", { name: act });
  await expect(again.getByLabel("Leverage")).toHaveValue("Running club");
  await expect(again.getByLabel("Priority")).toHaveValue("1");
  await expect(again.getByLabel("Must")).toBeChecked();
  await expect(again.getByLabel("Repeats")).toHaveValue("weekly");
  await expect(page.getByLabel("Purpose")).toHaveValue("Strong enough to keep up with the kids");

  // Standalone goals show on the Projects page under their area.
  await page.goto("/projects");
  await expect(page.getByRole("region", { name: "Fortitude" }).getByRole("link", { name: new RegExp(goal) })).toBeVisible();
  await noErrors(page);
});

test("a project schedule puts blocks on the Actions board, and removing it takes them off", async ({ page }) => {
  const title = uid("Garden");
  await newProject(page, "Family", title);
  const days = page.getByRole("group", { name: "Days" });
  for (const d of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) await days.getByText(d, { exact: true }).click();
  await page.getByLabel("Part of day").selectOption("evening");
  await page.getByRole("button", { name: "Add to schedule" }).click();
  await expect(page.getByText(/Sun, Mon, Tue, Wed, Thu, Fri, Sat · Evening/)).toBeVisible();

  await page.goto("/actions");
  const today = page.getByRole("region", { name: "Today", exact: true });
  await expect(today.getByRole("group", { name: `Block ${title}` })).toBeVisible();
  // Loading the board again doesn't add a second one.
  await page.reload();
  await expect(today.getByRole("group", { name: `Block ${title}` })).toHaveCount(1);

  await page.goto("/projects");
  await card(page, title).click();
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("No schedule yet.")).toBeVisible();
  await page.goto("/actions");
  await expect(today).toBeVisible();
  await expect(today.getByRole("group", { name: `Block ${title}` })).toHaveCount(0);
  await noErrors(page);
});

test("Inbox items chunk into a new goal and leave the Inbox", async ({ page }) => {
  const a = uid("Call the vet"), b = uid("Order chicken feed");
  const goal = uid("Healthy flock");
  await page.goto("/inbox");
  await page.getByPlaceholder(/Add something/).fill(`${a}, ${b}`);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator("main li", { hasText: b })).toBeVisible();

  await page.getByRole("button", { name: "Chunk…" }).click();
  await page.getByLabel(`Select ${a}`).check();
  await page.getByLabel(`Select ${b}`).check();
  const bar = page.getByRole("group", { name: "Chunk selected" });
  await bar.getByLabel("New goal name").fill(goal);
  await bar.getByLabel("Area for new goal").selectOption({ label: "Family" });
  await bar.getByRole("button", { name: "Chunk", exact: true }).click();
  await expect(page.locator("main li", { hasText: a })).toHaveCount(0);

  await page.goto("/projects");
  const g = page.getByRole("region", { name: "Family" }).getByRole("link", { name: new RegExp(goal) });
  await expect(g).toContainText("2 open actions");
  await noErrors(page);
});

test("the Work bench hide control sits in the Work bench header", async ({ page }, info) => {
  test.skip(!isMac(info.project.name), "The Work bench column is on the Mac layout");
  await page.goto("/actions");
  const bench = page.getByRole("region", { name: "Work bench" });
  await bench.getByRole("button", { name: "Hide Work bench" }).click();
  await expect(bench).toHaveCount(0);
  await page.getByRole("button", { name: "Show Work bench" }).click();
  await expect(bench).toBeVisible();
});
