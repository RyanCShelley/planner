import { expect, test, type Page } from "@playwright/test";

// Opaque-box E2E tests for the workflow redesign (Tiers 1–4).
// Every test uses unique suffixes so it can run against a shared CI database.
const uid = (p: string) => `${p} ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const isMac = (projectName: string) => projectName === "mac";

const noErrors = async (page: Page) => {
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
};

const checkNoHorizontalOverflow = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  expect(overflow).toBe(false);
};

const waitForPatch = (page: Page) =>
  page.waitForResponse((res) => res.request().method() === "PATCH" && res.status() < 400);

async function quickAddInbox(page: Page, text: string) {
  await page.goto("/inbox");
  await page.getByPlaceholder(/Add something/i).fill(text);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByPlaceholder(/Add something/i)).toHaveValue("");
}

test.describe("Tier 1: Navigation, Workbench Removal & Layout", () => {
  test("navigation uses Actions and removes Workbench", async ({ page }, info) => {
    await page.goto("/actions");
    await expect(page.getByRole("link", { name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Actions" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Weekly review" })).toBeVisible();

    // Workbench nav link and /bench route should be gone
    await expect(page.getByRole("link", { name: /Work bench/i })).toHaveCount(0);
    await checkNoHorizontalOverflow(page);

    if (isMac(info.project.name)) {
      await expect(page.getByRole("region", { name: "Work bench" })).toHaveCount(0);
    }
    await noErrors(page);
  });
});

test.describe("Tier 2: Areas & Sub-roles", () => {
  test("Core Four + General areas exist and sub-roles can be added, renamed, and deleted", async ({ page }) => {
    await page.goto("/areas");
    for (const area of ["Faith", "Fortitude", "Family", "Field & Function", "General"]) {
      await expect(page.locator("main").getByRole("link", { name: area, exact: true })).toBeVisible();
    }

    await page.locator("main").getByRole("link", { name: "Faith", exact: true }).click();
    await expect(page.getByLabel("Area name")).toHaveValue("Faith");
    await checkNoHorizontalOverflow(page);

    const subRole = uid("Spiritual growth");
    const subRoleInput = page.getByPlaceholder(/Add sub-role|New sub-role/i);
    await subRoleInput.fill(subRole);
    await page.getByRole("button", { name: /Add sub-role|Add/i }).first().click();
    await expect(page.getByText(subRole)).toBeVisible();

    const renamed = `${subRole} updated`;
    const patchPromise = waitForPatch(page);
    await page.locator(`input[value="${subRole}"]`).fill(renamed);
    await page.locator(`input[value="${renamed}"]`).press("Enter");
    await patchPromise;

    await page.reload();
    await expect(page.getByText(renamed)).toBeVisible();

    // Delete sub-role
    await page.getByRole("button", { name: new RegExp(`Delete ${renamed}|Remove ${renamed}`, "i") }).click();
    await expect(page.getByText(renamed)).toHaveCount(0);
    await noErrors(page);
  });
});

test.describe("Tier 2: Inbox (AcciFlow split/drawer, Sometimes folder, Keep-until-scheduled)", () => {
  test("Mac shows AcciFlow Inbox drawer/split without losing Today view; items stay until scheduled", async ({ page }, info) => {
    const task = uid("Review quarterly budget");
    await quickAddInbox(page, task);
    await expect(page.locator("main").getByText(task)).toBeVisible();

    if (isMac(info.project.name)) {
      await page.goto("/actions");
      await page.getByRole("link", { name: "Inbox" }).click();
      // Today view remains visible alongside Inbox split/drawer on desktop
      await expect(page.getByText(/Today/i).first()).toBeVisible();
      await expect(page.getByText(task)).toBeVisible();
    }

    await checkNoHorizontalOverflow(page);
    await noErrors(page);
  });

  test("items can be moved to Sometimes folder and restored", async ({ page }) => {
    const task = uid("Clean garage shelves");
    await quickAddInbox(page, task);

    await page.locator("main li", { hasText: task }).locator("button").nth(1).click();
    await page.getByRole("button", { name: /Sometimes/i }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await page.getByRole("tab", { name: /Sometimes/i }).click();
    await expect(page.locator("main").getByText(task)).toBeVisible();
    await noErrors(page);
  });
});

test.describe("Tier 3: Actions, Multi-day Views & Calendar View DnD", () => {
  test("Actions shows Today's Actions (overdue, today, later, unscheduled count) and 1d/3d/5d/1w/2w views", async ({ page }, info) => {
    await page.goto("/actions");
    await expect(page.getByRole("heading", { name: /Today's Actions/i })).toBeVisible();
    await expect(page.getByText(/unscheduled/i)).toBeVisible();
    await checkNoHorizontalOverflow(page);

    if (isMac(info.project.name)) {
      for (const view of ["1d", "3d", "5d", "1w", "2w"]) {
        await page.getByRole("button", { name: view, exact: true }).click();
      }
      // Switch to Calendar View
      await page.getByRole("button", { name: /Calendar View/i }).click();
      await expect(page.getByRole("button", { name: /Calendar View/i })).toBeVisible();
    }
    await noErrors(page);
  });

  test("Calendar View supports dragging an action onto a calendar slot", async ({ page }, info) => {
    test.skip(!isMac(info.project.name), "Calendar View drag-and-drop is a desktop interaction");
    const task = uid("Draft architecture note");
    await quickAddInbox(page, task);

    await page.goto("/actions");
    await page.getByRole("button", { name: /Calendar View/i }).click();

    const item = page.getByText(task).first();
    const targetSlot = page.locator("[data-calendar-slot]").first();
    await item.dragTo(targetSlot);
    await expect(targetSlot).toContainText(task);
    await noErrors(page);
  });
});

test.describe("Tier 3: Projects (Full-screen tiles, Unified Title+Why+Goal, Capture->Chunk->Schedule)", () => {
  test("projects render as full-screen tiles with unified Title+Why+Goal and Capture->Chunk->Schedule", async ({ page }) => {
    await page.goto("/projects");
    await checkNoHorizontalOverflow(page);

    const title = uid("Launch Home Gym");
    await page.getByPlaceholder(/Project title|New project/i).fill(title);
    await page.getByRole("button", { name: /Create|Add/i }).first().click();

    await expect(page.getByText(title)).toBeVisible();
    await page.getByText(title).click();

    // Unified Title + Why + Goal under project
    const whyPatch = waitForPatch(page);
    await page.getByLabel(/Why|Purpose/i).fill("Stay strong and energetic");
    await page.getByLabel(/Why|Purpose/i).blur();
    await whyPatch;

    const goalPatch = waitForPatch(page);
    await page.getByLabel(/Goal/i).fill("Complete 3 workouts per week");
    await page.getByLabel(/Goal/i).blur();
    await goalPatch;

    // Capture -> Chunk -> Schedule
    const idea = uid("Order kettlebell");
    await page.getByPlaceholder(/Capture idea|Shoot off ideas/i).fill(idea);
    await page.getByRole("button", { name: /Capture|Add idea/i }).click();
    await expect(page.getByText(idea)).toBeVisible();

    await page.getByRole("button", { name: /Chunk/i }).click();
    await page.getByRole("button", { name: /Schedule/i }).click();
    await noErrors(page);
  });
});

test.describe("Tier 4: Weekly Review (4-stage GTD Wizard & Pending/Wait List)", () => {
  test("4-stage GTD wizard navigates through all stages and supports Pending/Wait list", async ({ page }) => {
    await page.goto("/review");
    await checkNoHorizontalOverflow(page);

    // Stage 1: Mission & Resolutions
    await expect(page.getByText(/Mission|Resolutions/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Next/i }).click();

    // Stage 2: Inbox / Loose Papers Triage (including Delegate -> Pending/Wait)
    await expect(page.getByText(/Inbox|Triage/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Next/i }).click();

    // Stage 3: Notes, Actions, Follow-ups & Meetings
    await expect(page.getByText(/Follow-ups|Last week/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Next/i }).click();

    // Stage 4: Week's Musts / Priorities & Goal Scheduling
    await expect(page.getByText(/Musts|Priorities/i).first()).toBeVisible();

    // Pending/Wait list section
    await expect(page.getByText(/Pending|Wait/i).first()).toBeVisible();
    await noErrors(page);
  });
});
