import { expect, test, type Page } from "@playwright/test";

// Weekly review. Each test makes its own area, so Mac and iPhone runs don't see each other's goals.
const uid = (p: string) => `${p} ${Date.now().toString(36)}`;
const noErrors = async (page: Page) => expect(page.getByText("Something went wrong")).toHaveCount(0);

async function newArea(page: Page) {
  const name = uid("Review test");
  await page.goto("/areas");
  await page.getByPlaceholder("New area").fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.locator("main").getByRole("link", { name, exact: true }).click();
  await expect(page.getByLabel("Area name")).toHaveValue(name);
  return name;
}

async function newGoal(page: Page, area: string, goal: string) {
  await page.goto("/projects");
  await page.getByRole("button", { name: `New goal in ${area}` }).click();
  await page.waitForURL("**/goals/*");
  await page.getByLabel("Goal", { exact: true }).fill(goal);
  const saved = page.waitForResponse((r) => r.url().includes("/rest/v1/goals") && r.request().method() === "PATCH" && r.ok());
  await page.getByLabel("Goal", { exact: true }).press("Enter");
  await saved;
  await expect(page.getByLabel("Goal", { exact: true })).toHaveValue(goal);
}

async function addAction(page: Page, title: string) {
  await page.getByLabel("New action").fill(title);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("listitem", { name: title })).toBeVisible();
}

test("the review flags goals with nothing scheduled this week and links to plan them", async ({ page }, info) => {
  const area = await newArea(page);
  const planned = uid("Read through the Psalms");
  const unplanned = uid("Memorize Romans 8");
  const block = uid("Quiet time");

  // A block this morning, and a goal with an action scheduled in it.
  await page.goto("/actions");
  await page.getByRole("region", { name: "Today", exact: true }).getByRole("button", { name: "Add a block morning" }).click();
  await page.getByLabel("Block name").fill(block);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Block name")).toHaveCount(0);

  await newGoal(page, area, planned);
  const act = uid("Psalm 1");
  await addAction(page, act);
  await page.getByRole("listitem", { name: act }).getByRole("button", { name: "Schedule →" }).click();
  const picker = page.getByLabel("Scheduled in");
  await picker.selectOption((await picker.locator("option", { hasText: block }).getAttribute("value"))!);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("listitem", { name: act })).toContainText("Today · Morning"); // its block's day and part

  // A second goal with an action that isn't on the board.
  await newGoal(page, area, unplanned);
  await addAction(page, uid("Verses 1 to 11"));

  await page.goto("/review");
  const section = page.getByRole("region", { name: area });
  await expect(section.getByRole("listitem", { name: planned })).toContainText("1 scheduled");
  // The block has no area of its own, so its time counts toward the area of the action in it.
  await expect(section).not.toContainText("0h blocked");
  await expect(section.getByRole("listitem", { name: unplanned })).toContainText("Nothing scheduled");
  // Named when there are a few, counted when there are many (other tests add goals too).
  await expect(page.getByRole("region", { name: "Summary" })).toContainText(/nothing scheduled this week/);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-review.png`, fullPage: true });

  await section.getByRole("listitem", { name: unplanned }).getByRole("link", { name: "Plan it →" }).click();
  await page.waitForURL("**/goals/*");
  await expect(page.getByLabel("Goal", { exact: true })).toHaveValue(unplanned);
  await noErrors(page);
});

test("the review shows each area's current focus and what got done", async ({ page }) => {
  const area = await newArea(page);
  const editor = page.getByRole("textbox", { name: `${area} focus` });
  await editor.click();
  await page.keyboard.type("Family dinners, phones away");
  await page.getByRole("region", { name: "Focus" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/^since /)).toBeVisible();

  const goal = uid("Eat together");
  const act = uid("Plan Sunday dinner");
  await newGoal(page, area, goal);
  await addAction(page, act);
  const done = page.waitForResponse((r) => r.url().includes("/complete") && r.ok());
  await page.getByRole("button", { name: `Mark ${act} complete` }).click();
  await done;

  await page.goto("/review");
  const section = page.getByRole("region", { name: area });
  await expect(section).toContainText("Family dinners, phones away");
  await expect(section).toContainText("1 done");

  // The focus links back to the area to change it.
  await section.getByRole("link", { name: /Family dinners/ }).click();
  await expect(page.getByLabel("Area name")).toHaveValue(area);
  await noErrors(page);
});
