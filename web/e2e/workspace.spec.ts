import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function signup(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "创建自己的空间" }).click();
  await page.getByLabel("怎么称呼你").fill("工作台测试");
  await page
    .getByLabel("邮箱", { exact: true })
    .fill("e2e-" + crypto.randomUUID() + "@example.com");
  await page
    .getByLabel("密码", { exact: true })
    .fill("browser-test-password-2026");
  await page.getByRole("button", { name: "创建账户", exact: true }).click();
  await expect(page.getByRole("heading", { name: /工作台测试/ })).toBeVisible();
}
async function nav(page: Page, name: string) {
  const desktop = page.getByRole("navigation", { name: "主导航", exact: true });
  const mobile = page.getByRole("navigation", { name: "手机主导航" });
  await ((await desktop.isVisible()) ? desktop : mobile)
    .getByRole("link", { name, exact: true })
    .click();
}
async function save(page: Page) {
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("title-only task persists, scheduled today, event has no checkbox, all navigation", async ({
  page,
}) => {
  await signup(page);
  await nav(page, "日程");
  await page
    .getByRole("button", { name: "新增任务", exact: true })
    .first()
    .click();
  await page.getByLabel("任务标题").fill("只需标题的任务");
  await save(page);
  await page.getByRole("button", { name: "收集箱", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /只需标题的任务/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "安排今天 只需标题的任务" }).click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.getByText("只需标题的任务", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("只需标题的任务", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "新增事件", exact: true }).click();
  await page.getByLabel("事件标题").fill("独立会议");
  await save(page);
  await expect(page.getByText("独立会议", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "完成任务 独立会议" }),
  ).toHaveCount(0);
  for (const n of ["经济", "运动", "饮食", "首页"]) {
    await nav(page, n);
    await expect(page.locator("h1")).toBeVisible();
  }
});

test("financial review, negative asset, unknown result queries original request, privacy persists", async ({
  page,
}) => {
  await signup(page);
  await nav(page, "经济");
  await page.getByRole("button", { name: "新增账户", exact: true }).click();
  await page.getByLabel("账户名称").fill("真实现金");
  await page.getByLabel("真实期初余额").fill("50");
  await save(page);
  await page.getByRole("button", { name: "记一笔", exact: true }).click();
  await page.getByLabel("操作账户").selectOption({ label: "真实现金 · 资产" });
  await page.getByLabel("金额", { exact: true }).fill("80");
  await page.getByLabel("说明", { exact: true }).fill("真实支出");
  await page.getByRole("button", { name: "核对账务影响" }).click();
  await expect(page.getByText("核对本次账务影响")).toBeVisible();
  await expect(page.getByText(/资产账面余额将为负/)).toBeVisible();
  await page.getByLabel("我已核对，确认记录真实发生的事实").check();
  let lost = false;
  await page.route("**/api/v1/finance/transactions", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "确认并提交" }).click();
  await expect(page.getByText(/提交结果未知/)).toBeVisible();
  await page
    .getByRole("button", { name: "查询原操作结果", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.unroute("**/api/v1/finance/transactions");
  await page.getByRole("button", { name: "账户", exact: true }).click();
  await expect(page.getByRole("heading", { name: "真实账户" })).toBeVisible();
  await expect(page.getByText("-¥30.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "隐藏敏感摘要" }).click();
  await expect(page.getByText("-¥30.00", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "显示敏感摘要" }),
  ).toBeVisible();
  await expect(page.getByText("-¥30.00", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "余额校正", exact: true }).click();
  await expect(page.getByLabel("金额", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "关闭面板" }).click();
});

test("workout autosaves, refresh recovery, failed save prevents finish, conflict preserves input", async ({
  page,
}) => {
  await signup(page);
  await nav(page, "运动");
  await page.getByRole("button", { name: "训练", exact: true }).click();
  await page.getByRole("button", { name: "开始详细训练", exact: true }).click();
  await save(page);
  await page.getByLabel("新增训练动作名称").fill("深蹲");
  await page.getByRole("button", { name: "添加一组" }).click();
  await expect(page.getByLabel("第1组次数")).toBeVisible();
  await page.getByLabel("第1组重量").fill("20");
  await page.getByLabel("第1组次数").fill("8");
  await page.getByLabel("第1组实际完成").check();
  await expect(page.getByText(/已保存 · v2/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("第1组次数")).toHaveValue("8");
  await page.route("**/api/v1/fitness/sessions/*/sets/*", (route) =>
    route.request().method() === "PATCH"
      ? route.abort("failed")
      : route.continue(),
  );
  await page.getByLabel("第1组次数").fill("10");
  await expect(page.getByText("保存失败 · 本端输入保留")).toBeVisible();
  await expect(page.getByRole("button", { name: "结束核对" })).toBeDisabled();
  await expect(page.getByLabel("第1组次数")).toHaveValue("10");
  await page.unroute("**/api/v1/fitness/sessions/*/sets/*");
  await page.getByRole("button", { name: "重试保存当前输入" }).click();
  await expect(page.getByText(/已保存 · v3/)).toBeVisible();
  await page.getByRole("button", { name: "结束核对" }).click();
  await page.getByRole("button", { name: "确认完成", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "历史", exact: true }).click();
  await expect(page.getByText("1 组实际完成")).toBeVisible();
});

test("recipe, meal plan and shopping never create actual meal or spending", async ({
  page,
}) => {
  await signup(page);
  await nav(page, "饮食");
  await page.getByRole("button", { name: "食谱", exact: true }).click();
  await page.getByRole("button", { name: "导入基础食谱" }).click();
  await page.getByRole("button", { name: /番茄炒蛋/ }).click();
  await page.getByRole("button", { name: "加入菜单" }).click();
  await save(page);
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.getByText("今天，实际吃了什么？")).toBeVisible();
  await page.getByRole("button", { name: "采购", exact: true }).click();
  await page.getByRole("button", { name: "生成本周清单" }).click();
  await expect(
    page.getByRole("button", { name: "买到全部待购 鸡蛋" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "买到全部待购 鸡蛋" }).click();
  await nav(page, "经济");
  await expect(page.getByText("给自己的账本一个起点")).toBeVisible();
});

test("320px mobile and enlarged text: navigation, sheets, keyboard, accessibility", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await signup(page);
  await expect(
    page.getByRole("navigation", { name: "手机主导航" }),
  ).toBeVisible();
  for (const n of ["日程", "经济", "运动", "饮食", "首页"]) {
    await nav(page, n);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await page.screenshot({
    path: "test-results/mobile-dashboard.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "新增", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "任务", exact: false })
    .click();
  await page.getByLabel("任务标题").fill("键盘可用");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("执行状态")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.addStyleTag({ content: ":root{font-size:200%}" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("desktop accessibility and visual screenshot", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1080 });
  await signup(page);
  await page.screenshot({
    path: "test-results/desktop-dashboard.png",
    fullPage: true,
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("dashboard domain failure is isolated and never turns into a fabricated zero", async ({
  page,
}) => {
  await signup(page);
  await page.route("**/api/v1/finance/summary?*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "UNAVAILABLE", message: "测试模拟财务不可用" },
      }),
    }),
  );
  await page.reload();
  await expect(page.getByText("测试模拟财务不可用")).toBeVisible();
  await expect(page.getByRole("heading", { name: "今日行动" })).toBeVisible();
  await expect(page.getByText("今日实际用餐", { exact: true })).toBeVisible();
  await expect(page.getByText("建立自己的账本")).toHaveCount(0);
  await page.unroute("**/api/v1/finance/summary?*");
  await page.getByRole("button", { name: "重新加载" }).click();
  await expect(page.getByText("建立自己的账本")).toBeVisible();
});

test("multi-device workout conflict, privacy covers passive body data and editing stays readable", async ({
  page,
  context,
}) => {
  await signup(page);
  await nav(page, "运动");
  await page.getByRole("button", { name: "训练", exact: true }).click();
  await page.getByRole("button", { name: "开始详细训练", exact: true }).click();
  await save(page);
  await page.getByLabel("新增训练动作名称").fill("划船");
  await page.getByRole("button", { name: "添加一组" }).click();
  await expect(page.getByLabel("第1组次数")).toBeVisible();
  const second = await context.newPage();
  await second.goto("/fitness?view=workout");
  await expect(second.getByLabel("第1组次数")).toBeVisible();
  await second.getByLabel("第1组次数").fill("6");
  await expect(second.getByText(/已保存 · v2/)).toBeVisible();
  await page.getByLabel("第1组次数").fill("9");
  await expect(page.getByText("版本冲突 · 本端输入保留")).toBeVisible();
  await expect(page.getByLabel("第1组次数")).toHaveValue("9");
  await page
    .getByRole("button", { name: "已核对，以本端输入重新保存" })
    .click();
  await expect(page.getByText(/已保存 · v3/)).toBeVisible();
  await second.close();
  await page.getByRole("button", { name: "隐藏敏感摘要" }).click();
  await nav(page, "运动");
  await page.getByRole("button", { name: "身体", exact: true }).click();
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await page.getByLabel("体重（kg，可选）").fill("63.72");
  await page.getByLabel("恢复反馈（可选）").fill("PRIVATE-RECOVERY-TEST");
  await save(page);
  await expect(page.getByText(/63.72/)).toHaveCount(0);
  await expect(page.getByText("PRIVATE-RECOVERY-TEST")).toHaveCount(0);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByLabel("体重（kg，可选）")).toHaveValue("63.72");
  await expect(page.getByLabel("恢复反馈（可选）")).toHaveValue(
    "PRIVATE-RECOVERY-TEST",
  );
  await page.getByRole("button", { name: "关闭面板" }).click();
  await expect(
    page.getByRole("button", { name: "显示敏感摘要" }),
  ).toBeVisible();
});

test("mobile settings logout revokes session and new account creation returns to the pending transaction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await nav(page, "经济");
  await page.getByRole("button", { name: "记一笔", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "新增账户" })
    .click();
  await page.getByLabel("账户名称").fill("手机账户");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "保存", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "新增 · 记一笔" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭面板" }).click();
  await page.getByRole("button", { name: "个人设置", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "退出登录", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await page.goto("/finance");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.getByText("手机账户", { exact: true })).toHaveCount(0);
});
