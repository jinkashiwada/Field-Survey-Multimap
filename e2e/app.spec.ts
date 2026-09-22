import { expect, test } from '@playwright/test';
import { buildCompactPinShareUrl } from '../src/services/pinShare';
import { defaultUrlState } from '../src/services/urlState';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(cyberjapandata\.gsi\.go\.jp|disaportaldata\.gsi\.go\.jp)\//, async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'offline in E2E' });
  });
});

test('選択ピンの共有URLを別端末で開き、一時表示から明示保存できる', async ({ page, browser }) => {
  await page.goto('/#v=1&lon=140.123456&lat=36.234567&z=12.345&rot=0.3&layout=quad');
  await page.getByRole('button', { name: 'ピン追加' }).click();
  await page.getByLabel('名称', { exact: true }).fill('共有する痕跡🌊');
  await page.getByRole('textbox', { name: 'メモ' }).fill('水路横の痕跡\n写真を確認');
  await page.getByRole('button', { name: 'この地点に追加' }).click();
  await page.getByRole('button', { name: 'このピンを共有' }).click();
  const dialog = page.getByRole('dialog', { name: 'このピンを共有' });
  const urlField = dialog.getByLabel('ピン付き共有URL');
  await expect(urlField).toHaveValue(/#s=1\./);
  const withoutMemoUrl = await urlField.inputValue();
  expect(withoutMemoUrl).not.toContain(encodeURIComponent('水路横'));
  await dialog.getByLabel('メモを含める').check();
  await expect.poll(() => urlField.inputValue()).not.toBe(withoutMemoUrl);
  const url = await urlField.inputValue();
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(390);
  await expect(dialog.getByRole('button', { name: 'ピン付きURLをコピー' })).toBeVisible();
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();

  const receiver = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    await receiver.addInitScript(() => {
      const key = 'flood-multimap:pins:v1';
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([{
        id: 'existing-pin', name: '受信者の既存ピン', type: 'memo', memo: '', longitude: 139, latitude: 35,
        elevation: null, elevationSource: null, createdAt: '2026-09-23T00:00:00Z', updatedAt: '2026-09-23T00:00:00Z',
      }]));
    });
    const incoming = await receiver.newPage();
    await incoming.route(/https:\/\/(cyberjapandata\.gsi\.go\.jp|disaportaldata\.gsi\.go\.jp)\//, (route) => route.abort());
    await incoming.goto(url);
    const banner = incoming.getByRole('region', { name: '受け取った共有ピン' });
    await expect(banner).toContainText('共有する痕跡🌊');
    await expect(incoming.locator('.map-grid')).toHaveAttribute('data-layout', 'quad');
    await expect(incoming.getByText('36.234567', { exact: true })).toBeVisible();
    expect(await incoming.evaluate(() => JSON.parse(localStorage.getItem('flood-multimap:pins:v1') ?? '[]'))).toHaveLength(1);
    await incoming.reload();
    await expect(banner).toContainText('共有する痕跡🌊');
    await banner.getByText('ピンの詳細', { exact: true }).click();
    await expect(banner).toContainText('水路横の痕跡');
    await banner.getByRole('button', { name: '自分のピンに保存' }).click();
    await expect(banner).toHaveCount(0);
    expect(new URLSearchParams(new URL(incoming.url()).hash.slice(1)).has('pin')).toBe(false);
    await incoming.reload();
    await incoming.getByRole('button', { name: 'ピン追加' }).click();
    await expect(incoming.getByText('保存済み：2件')).toBeVisible();
    await expect(incoming.getByText('受信者の既存ピン', { exact: true })).toBeVisible();
    await expect(incoming.getByText('共有する痕跡🌊', { exact: true })).toBeVisible();
  } finally {
    await receiver.close();
  }
});

test('通常の表示URLは受信ピンを含めず、コピー失敗時も同じURLを表示する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const url = await buildCompactPinShareUrl('http://127.0.0.1:4173/', { ...defaultUrlState(), layout: 'quad' }, {
    name: 'URL限定ピン', memo: '', type: 'memo', longitude: 139.9, latitude: 35.9, elevation: null, elevationSource: null,
  }, false);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = () => false;
  });
  await page.goto(url);
  await expect(page.getByTestId('map-pane')).toHaveCount(2);
  await expect(page.getByRole('region', { name: '受け取った共有ピン' })).toContainText('URL限定ピン');
  await page.getByRole('button', { name: '表示URLをコピー' }).click();
  const fallback = page.getByRole('dialog', { name: '表示URL', exact: true });
  const sharedUrl = await fallback.getByLabel('共有する表示URL').inputValue();
  expect(new URLSearchParams(new URL(sharedUrl).hash.slice(1)).has('pin')).toBe(false);
  await fallback.getByRole('button', { name: '閉じる' }).click();
  await page.getByRole('button', { name: '共有ピンを閉じる' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: '受け取った共有ピン' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('flood-multimap:pins:v1') ?? '[]'))).toEqual([]);
});

test('破損した共有ピンでも地図を操作できる', async ({ page }) => {
  await page.goto('/#v=1&layout=single&pin=broken');
  await expect(page.getByRole('alert')).toContainText('共有ピンを読み込めませんでした');
  await page.getByRole('button', { name: '2画面', exact: true }).click();
  await expect(page.getByTestId('map-pane')).toHaveCount(2);
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

test('携帯電話でツールバーが一行表示されレイヤー設定を常に閉じられる', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.app-titlebar')).toHaveCount(0);
  await expect(page.locator('.pane-header')).toHaveCount(0);
  const toolbar = page.getByRole('navigation', { name: '地図表示ツール' });
  await expect(toolbar).toBeVisible();
  expect((await toolbar.boundingBox())?.height).toBeLessThanOrEqual(60);
  for (const button of await toolbar.getByRole('button').all()) {
    expect(await button.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  }

  await page.getByLabel('画面1のレイヤー設定').click();
  const panel = page.getByRole('dialog', { name: '画面1のレイヤー設定' });
  await expect(panel).toBeVisible();
  await panel.locator('.layer-controls-panel-body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const closeButton = panel.getByRole('button', { name: 'レイヤー設定を閉じる' });
  await expect(closeButton).toBeVisible();
  await closeButton.click();
  await expect(panel).toHaveCount(0);
});

test('画面を切り替えてもレイヤーパネルは常に1つだけ開く', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.getByLabel('画面1のレイヤー設定').click();
  await expect(page.getByRole('dialog', { name: '画面1のレイヤー設定' })).toBeVisible();
  await page.getByLabel('画面2のレイヤー設定').click();
  await expect(page.getByRole('dialog', { name: '画面1のレイヤー設定' })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '画面2のレイヤー設定' })).toBeVisible();
  await expect(page.locator('.layer-controls-panel')).toHaveCount(1);
});

test('現在の地図中心から公式の観測施設マップを案内する', async ({ page }) => {
  await page.goto('/#v=1&lon=140.123456&lat=36.654321&z=13.6&rot=0&layout=split-vertical');
  await page.getByRole('button', { name: '観測施設' }).click();
  const panel = page.getByRole('complementary', { name: '河川観測施設' });
  await expect(panel).toBeVisible();
  const officialLink = panel.getByRole('link', { name: '川の防災情報で観測施設を開く' });
  await expect(officialLink).toHaveAttribute('href', /river\.go\.jp\/kawabou\/pc\/tmlist/);
  await expect(officialLink).toHaveAttribute('href', /clat=36\.654321/);
  await expect(officialLink).toHaveAttribute('href', /clon=140\.123456/);
  await expect(officialLink).toHaveAttribute('href', /zm=14/);
});

test('二本指操作では地点操作メニューを開かない', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const map = page.locator('.map-target').first();
  await map.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 150, clientY: 300 });
  await map.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 2, clientX: 230, clientY: 300 });
  await page.waitForTimeout(750);
  await expect(page.getByRole('menu', { name: '地点操作' })).toHaveCount(0);
  await map.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 150, clientY: 300 });
  await map.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 2, clientX: 230, clientY: 300 });
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
  await expect(page.getByText(/再配色は新しい256pxタイル/)).toBeVisible();
  await page.getByRole('dialog', { name: '画面1のレイヤー設定' })
    .getByRole('button', { name: 'レイヤー設定を閉じる' }).click();
  await expect(page.getByRole('button', { name: '表示範囲から配色レンジを推定' })).toBeVisible();
  await page.getByLabel('移動後に自動推定').check();
  await expect.poll(() => new URL(page.url()).hash).toContain('ae0=1');
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
