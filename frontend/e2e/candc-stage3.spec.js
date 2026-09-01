import { test, expect } from "@playwright/test";

const API = process.env.E2E_API_BASE || "http://127.0.0.1:4000";
const KEY = process.env.E2E_LECTURER_KEY || "stage3-e2e-facilitator-key";

async function openSession(request, activityId) {
  const response = await request.post(`${API}/api/candc/activities/${activityId}/sessions`, {
    headers: { "X-GEDL-Lecturer-Key": KEY },
    data: {},
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function put(request, sessionId, token, itemId, categoryIds = [], explicitNone = false) {
  const response = await request.put(`${API}/api/candc/sessions/${sessionId}/response`, {
    data: { token, item_id: itemId, category_ids: categoryIds, explicit_none: explicitNone },
  });
  expect(response.ok()).toBeTruthy();
}

async function commit(request, sessionId, token) {
  const response = await request.post(`${API}/api/candc/sessions/${sessionId}/commit`, { data: { token } });
  expect(response.ok()).toBeTruthy();
}

async function reveal(request, sessionId) {
  const response = await request.post(`${API}/api/candc/sessions/${sessionId}/reveal`, {
    headers: { "X-GEDL-Lecturer-Key": KEY },
  });
  expect(response.ok()).toBeTruthy();
}

async function assertMechanismInvisible(page) {
  const text = await page.locator("body").innerText();
  for (const forbidden of ["GEDL", "C&C", "Commitment", "Confrontation", "Diagnostic item", "Resolution", "Trace", "ANTICIPATE"]) {
    expect(text).not.toContain(forbidden);
  }
}

test("W1-style multi-tag journey preserves neutral state, hidden distribution and three-surface reveal", async ({ page, request }) => {
  const activityId = "b1141-w1-language-and-assumptions";
  const session = await openSession(request, activityId);

  await page.goto(`/#/stage3/respond/${activityId}`);
  await expect(page.getByRole("heading", { name: "What, if anything, might this wording assume?" })).toBeVisible();
  await assertMechanismInvisible(page);
  await expect(page.locator("body")).not.toContainText(/predict/i);

  await page.getByRole("button", { name: "Gender-related assumption" }).click();
  await expect(page.getByRole("button", { name: "Gender-related assumption" })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Next case" }).click();

  await page.getByRole("button", { name: "Gender-related assumption" }).click();
  await expect(page.getByRole("button", { name: "Gender-related assumption" })).toHaveClass(/selected/);
  await page.getByRole("button", { name: "I don't see a clear social assumption here" }).click();
  await expect(page.getByRole("button", { name: "I don't see a clear social assumption here" })).toHaveClass(/selected/);
  await expect(page.getByRole("button", { name: "Gender-related assumption" })).not.toHaveClass(/selected/);
  await page.getByRole("button", { name: "Next case" }).click();

  await page.getByRole("button", { name: "Class/status-related assumption" }).click();
  await expect(page.getByText("3 of 3 sorted")).toBeVisible();
  await page.getByRole("button", { name: /sorted these/i }).click();
  await expect(page.getByRole("heading", { name: /show the group responses shortly/i })).toBeVisible();

  const second = "acceptance-participant-two-123";
  await put(request, session.id, second, "natural_athlete", ["gender"]);
  await put(request, session.id, second, "aggressive", ["race_ethnicity"]);
  await put(request, session.id, second, "captain_material", ["class_status"]);
  await commit(request, session.id, second);

  const hidden = await request.get(`${API}/api/candc/sessions/${session.id}/aggregate`);
  const hiddenBody = await hidden.json();
  expect(hiddenBody.response_count).toBe(2);
  expect(hiddenBody.revealed).toBe(false);
  expect(hiddenBody.counts).toBeUndefined();

  const lecturer = await page.context().newPage();
  await lecturer.goto(`/#/stage3/control/${activityId}`);
  await expect(lecturer.getByText("2", { exact: true })).toBeVisible();
  await expect(lecturer.getByRole("heading", { name: "Response pattern hidden" })).toBeVisible();
  await expect(lecturer.locator("body")).not.toContainText("50%");

  const presentation = await page.context().newPage();
  await presentation.goto(`/#/stage3/display/${activityId}`);
  await expect(presentation.getByText("2", { exact: true })).toBeVisible();
  await expect(presentation.locator("body")).not.toContainText("50%");
  await assertMechanismInvisible(presentation);

  await lecturer.getByLabel("Facilitator key").fill(KEY);
  await lecturer.getByRole("button", { name: "Show group responses" }).click();

  await expect(page.getByText("How did the group respond?")).toBeVisible();
  await expect(page.getByText("One case produced the widest spread of readings.")).toBeVisible();
  await assertMechanismInvisible(page);
  await expect(presentation.getByText("How did the group respond?")).toBeVisible();
  await expect(lecturer.getByText("Suggested discussion case")).toBeVisible();

  const revealed = await request.get(`${API}/api/candc/sessions/${session.id}/aggregate`);
  const revealedBody = await revealed.json();
  expect(revealedBody.diagnostic_item_id).toBe("aggressive");

  await page.getByRole("button", { name: "Look at it again" }).click();
  await expect(page.getByText("What is it about this comment that makes it possible to read in more than one way?")).toBeVisible();
  await page.getByRole("button", { name: "I’d keep the same reading" }).click();
  await page.getByRole("button", { name: "That’s where I am now" }).click();
  await expect(page.getByRole("heading", { name: "You’re finished with this activity." })).toBeVisible();
});

test("W2-style exclusive journey replaces only the frozen focus classification", async ({ page, request }) => {
  const activityId = "b1141-w2-us-them";
  const session = await openSession(request, activityId);

  await page.goto(`/#/stage3/respond/${activityId}`);
  await expect(page.getByRole("heading", { name: "What does each behaviour create?" })).toBeVisible();
  await page.getByRole("button", { name: "Belonging" }).click();
  await page.getByRole("button", { name: "Next case" }).click();
  await page.getByRole("button", { name: "Exclusion" }).click();
  await page.getByRole("button", { name: "Next case" }).click();
  await page.getByRole("button", { name: "Both / contested" }).click();
  await page.getByRole("button", { name: /sorted these/i }).click();

  const second = "acceptance-exclusive-two-123";
  await put(request, session.id, second, "shared_chant", ["exclusion"]);
  await put(request, session.id, second, "hostile_rival", ["exclusion"]);
  await put(request, session.id, second, "challenge_abuse", ["both_contested"]);
  await commit(request, session.id, second);
  await reveal(request, session.id);

  await expect(page.getByText("How did the group respond?")).toBeVisible();
  const group = await (await request.get(`${API}/api/candc/sessions/${session.id}/aggregate`)).json();
  expect(group.diagnostic_item_id).toBe("shared_chant");
  await page.getByRole("button", { name: "Look at it again" }).click();
  await expect(page.getByText("What is it about this behaviour that makes it difficult to place clearly in only one category?")).toBeVisible();
  await page.getByRole("button", { name: "I’d change my classification" }).click();
  await page.locator(".candc-revision").getByRole("button", { name: "Exclusion" }).click();
  await page.getByRole("button", { name: "That’s where I am now" }).click();
  await expect(page.getByRole("heading", { name: "You’re finished with this activity." })).toBeVisible();

  const token = await page.evaluate((id) => JSON.parse(localStorage.getItem(`gedl:candc:${id}:participant`)).token, activityId);
  const mine = await (await request.get(`${API}/api/candc/sessions/${session.id}/me?token=${encodeURIComponent(token)}`)).json();
  expect(mine.committed.shared_chant.category_ids).toEqual(["belonging"]);
  expect(mine.revised_diagnostic.category_ids).toEqual(["exclusion"]);
  expect(mine.completed).toBe(true);
});
