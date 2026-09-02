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
  await page.getByRole('button', { name: 'この地点に追加' }).click();
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

test('解析用色別標高図の常設操作と自動推定を利用できる', async ({ page }) => {
  await page.route(/https:\/\/cyberjapandata\.gsi\.go\.jp\/xyz\/dem_png\//, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    });
  });
  await page.goto('/');
  await page.getByLabel('画面1のレイヤー設定').click();
  await page.getByLabel('背景地図').first().selectOption('gsi-relief-custom');
  await page.getByLabel('最低（m）').fill('3');
  await page.getByLabel('最高（m）').fill('22');
  await page.getByRole('button', { name: '適用' }).click();
  await expect.poll(() => new URL(page.url()).hash).toContain('e0=3.0%3A22.0');
  await expect(page.getByRole('button', { name: '表示範囲から配色レンジを推定' })).toBeVisible();
  await page.getByLabel('移動後に自動推定').check();
  await expect.poll(() => new URL(page.url()).hash).toContain('ae0=1');
  await expect(page.getByText(/再配色は新しい256pxタイル/)).toBeVisible();
  await page.getByLabel('画面1のレイヤー設定').click();
  await page.locator('.map-target').first().hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash), { timeout: 10_000 }).not.toContain('e0=3.0:22.0');
});

test('右クリック地点へピンを追加できる', async ({ page }) => {
  await page.goto('/');
  await page.locator('.map-target').first().click({ button: 'right', position: { x: 220, y: 220 } });
  await expect(page.getByRole('menu', { name: '地点操作' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'ここにピンを追加' }).click();
  await page.getByLabel('名称').fill('右クリック地点');
  await page.getByRole('button', { name: 'この地点に追加' }).click();
  await expect(page.getByText('右クリック地点')).toBeVisible();
});

test('座標を検索して移動できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '検索' }).click();
  await page.getByLabel('座標、ピン名、読込み地物名').fill('35.700000, 139.900000');
  await page.getByRole('button', { name: '検索', exact: true }).last().click();
  await page.getByRole('button', { name: /座標 35.700000/ }).click();
  await expect.poll(() => new URL(page.url()).hash).toContain('lon=139.900000');
});

test('道路・鉄道・河川・等高線を独立して選択できる', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('画面1のレイヤー設定').click();
  for (const name of ['主要道路（試験公開）', '鉄道（試験公開）', '河川中心線（試験公開）', '等高線（試験公開・省電力）']) {
    await page.getByText(name, { exact: false }).first().click();
  }
  await expect.poll(() => decodeURIComponent(new URL(page.url()).hash)).toContain('gsi-vector-river');
});
