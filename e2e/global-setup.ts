import { chromium, type FullConfig } from "@playwright/test";

// Creates a fresh test user (so every run starts clean, with the five seeded areas)
// and signs in through the real login page.
export default async function globalSetup(config: FullConfig) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const email = `e2e-${Date.now()}@test.local`;
  const password = "test-password-123";

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`creating test user failed: ${res.status} ${await res.text()}`);

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Test sign-in" }).click();
  await page.waitForURL("**/inbox");
  await page.context().storageState({ path: "e2e/.auth.json" });
  await browser.close();
}
