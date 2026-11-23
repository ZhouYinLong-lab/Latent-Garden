import { expect, test } from "@playwright/test";

test("loads the real 3D garden and supports core exploration", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator("#graph canvas")).toBeVisible();
  await expect(page.locator("#result-count")).toHaveText("48/48");
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "test-results/semantic-garden-3d.png", fullPage: true });
  }

  await page.locator('[data-mode="2d"]').click();
  await expect(page.locator('[data-mode="2d"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#space-note")).toContainText("二维 UMAP");

  await page.locator("#filter-toggle").click();
  await page.locator('[data-filter-kind="category"][data-filter-value="看人间"]').click();
  await expect(page.locator("#filter-summary")).not.toHaveText("显示全部文章");
  await page.locator("#article-list button").first().click();
  await expect(page.locator("#detail")).toBeVisible();
  await expect(page.locator("#detail-title")).not.toBeEmpty();

  await page.screenshot({ path: `test-results/semantic-garden-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("legacy data stays in 2D instead of inventing depth", async ({ page }) => {
  await page.route("**/legacy-garden.json", route => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      version: "0.1",
      nodes: [
        { id: "a", title: "旧文章 A", x: -.4, y: .2, categories: ["看人间"], tags: ["旧数据"] },
        { id: "b", title: "旧文章 B", x: .4, y: -.2, categories: ["做东西"], tags: [] },
      ],
      clusters: [],
      metadata: {},
    }),
  }));
  await page.goto("/?data=legacy-garden.json");
  await expect(page.locator("#status")).toBeHidden();
  await expect(page.locator('[data-mode="3d"]')).toBeDisabled();
  await expect(page.locator('[data-mode="2d"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#space-note")).toContainText("旧版数据");
});
