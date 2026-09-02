import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(cyberjapandata\.gsi\.go\.jp|disaportaldata\.gsi\.go\.jp)\//, async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'offline in E2E' });
  });
});

test('PC幅で4画面を同期表示できる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: '4画面' }).click();
  await expect(page.locator('[data-testid="map-pane"]')).toHaveCount(4);
  await expect(page.locator('.map-grid')).toHaveAttribute('data-layout', 'quad');
});

test('携帯電話幅ではquad指定を2画面へ縮退する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#v=1&lon=139.908&lat=35.918&z=14&rot=0&layout=quad');
  await expect(page.locator('[data-testid="map-pane"]')).toHaveCount(2);
  await expect(page.getByText(/2画面へ切り替えました/)).toBeVisible();
  await expect(page.getByRole('button', { name: '4画面' })).toBeDisabled();
});

test('プリセットを切り替えられる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByLabel('プリセット').selectOption('terrain-and-flood');
  await expect(page.getByText('治水地形分類と想定最大規模')).toBeVisible();
  await expect(page.locator('[data-testid="map-pane"]')).toHaveCount(2);
});

test('ピンを作成して再読込み後も保持する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ピン追加' }).click();
  await page.getByLabel('名称').fill('E2E痕跡地点');
  await page.getByRole('textbox', { name: 'メモ' }).fill('再読込み確認');
  await page.getByRole('button', { name: '中心に追加' }).click();
  await expect(page.getByText('E2E痕跡地点')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'ピン追加' }).click();
  await expect(page.getByText('E2E痕跡地点')).toBeVisible();
  await expect(page.getByText('保存済み：1件')).toBeVisible();
});

test('geolocationをモックして現在地へ移動できる', async ({ page, context }) => {
  await context.grantPermissions(['geolocation'], { origin: 'http://127.0.0.1:4173' });
  await context.setGeolocation({ longitude: 140.123456, latitude: 36.123456, accuracy: 12 });
  await page.goto('/');
  await page.getByRole('button', { name: '現在地を取得して表示' }).click();
  await expect(page.getByText(/現在位置を表示しました/)).toBeVisible();
  await expect.poll(() => new URL(page.url()).hash).toContain('lon=140.123456');
});

test('表示hashを再読込みすると状態が復元される', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '1画面' }).click();
  await expect(page.locator('[data-testid="map-pane"]')).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).hash).toContain('layout=single');
  await page.reload();
  await expect(page.locator('[data-testid="map-pane"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: '1画面' })).toHaveAttribute('aria-pressed', 'true');
});
