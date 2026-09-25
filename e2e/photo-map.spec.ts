import { expect, test, type Page } from '@playwright/test';
import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js/index-native.js';
import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fromLonLat, toLonLat } from 'ol/proj.js';
import {
  emptyProject,
  type Photo,
  type Point,
  type Project,
} from '../src/photo-map/model';
import { fitRegistration, invert, multiply, projectPoint } from '../src/photo-map/homography';

configure({ useWebWorkers: false });
const PHOTO_PATH = process.env.PHOTO_MAP_PATH ?? '/photo-map/';
function crc(bytes: Buffer) {
  let c = 0xffffffff;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function png(width = 600, height = 400, solid = false, color?: readonly [number, number, number]): Buffer {
  const chunk = (name: string, data: Buffer) => {
    const type = Buffer.from(name),
      length = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x++) {
      const i = row + 1 + x * 4;
      rows[i] = color?.[0] ?? (solid ? 30 : y < height / 2 ? 230 : 40);
      rows[i + 1] = color?.[1] ?? (solid ? 170 : x < width / 2 ? 70 : 160);
      rows[i + 2] = color?.[2] ?? (solid ? 100 : y < height / 2 ? 55 : 215);
      rows[i + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function fixture(count = 1, width = 600, height = 400): Project {
  const project = emptyProject(),
    center = fromLonLat([139.9, 35.9]);
  project.name = '合成画像による判読検証';
  project.view = { center: [139.9, 35.9], zoom: 17, rotation: 0 };
  project.layout = 'compare';
  project.export.longEdge = 256;
  project.inverse = {
    baseLayerId: 'gsi-pale',
    overlayIds: [],
    opacity: 0.4,
    drawings: true,
    gis: true,
  };
  for (let i = 0; i < count; i++) {
    const scale = 600 / width,
      h = [
        scale,
        0,
        center[0]! - 300,
        0,
        -scale,
        center[1]! + 200,
        0,
        0,
        1,
      ] as Parameters<typeof projectPoint>[0];
    const points: Point[] = [
      [20, 20],
      [width - 21, 20],
      [width - 21, height - 21],
      [20, height - 21],
      [width / 2, height / 2],
    ];
    const p: Photo = {
      id: `photo-${i}`,
      name: `合成写真 ${i + 1}`,
      filename: `image-${i}.png`,
      mime: 'image/png',
      width,
      height,
      capturedAt: '2026-09-01T10:00',
      source: '合成試験画像',
      memo: '',
      gcps: points.map((image, j) => ({
        id: `gcp-${j}`,
        image,
        map: toLonLat(projectPoint(h, image)!) as Point,
        role: 'fit',
      })),
      crop: [-0.5, -0.5, width - 0.5, height - 0.5],
      masks: [],
      visible: [true, false],
      opacity: [0.65, 0.65],
    };
    p.registration = fitRegistration(p.gcps);
    project.photos.push(p);
  }
  project.activePhotoId = 'photo-0';
  project.drawings = [
    {
      id: 'trace',
      name: '写真で判読した範囲',
      type: 'Polygon',
      anchor: 'photo',
      photoId: 'photo-0',
      points: [
        [120, 100],
        [300, 100],
        [300, 230],
        [120, 230],
        [120, 100],
      ],
      evidence: ['photo-0'],
      classification: 'estimated',
      memo: '確認用',
      at: '2026-09-01T10:00',
      visible: true,
    },
    {
      id: 'fixed',
      name: '地図に固定した線',
      type: 'LineString',
      anchor: 'map',
      points: [
        [139.898, 35.9],
        [139.902, 35.9],
      ],
      evidence: [],
      classification: 'interpreted',
      memo: '',
      at: '',
      visible: true,
    },
  ];
  return project;
}
async function archive(project: Project, image: Buffer): Promise<Buffer> {
  const writer = new ZipWriter(new BlobWriter());
  await writer.add(
    'project.json',
    new BlobReader(
      new Blob([JSON.stringify({ format: 'flood-photo-map', project })]),
    ),
    { level: 0 },
  );
  for (const p of project.photos)
    await writer.add(
      `originals/${p.id}`,
      new BlobReader(new Blob([new Uint8Array(image)])),
      { level: 0 },
    );
  return Buffer.from(await (await writer.close()).arrayBuffer());
}
async function openFixture(page: Page, project = fixture(), image = png()) {
  await page.getByLabel('プロジェクトZIP', { exact: true }).setInputFiles({
    name: 'fixture.zip',
    mimeType: 'application/zip',
    buffer: await archive(project, image),
  });
  await expect(
    page.getByText('ZIPを復元しました。続けて編集できます。'),
  ).toBeVisible({ timeout: 120000 });
}
async function savedProject(page: Page, rasters = false) {
  await page.getByRole('button', { name: 'ZIPで保存', exact: true }).click();
  await page
    .getByLabel('変換画像と位置情報（PNG / PGW / PRJ）を含める')
    .setChecked(rasters);
  const downloaded = page.waitForEvent('download', { timeout: 150000 });
  await page.getByRole('button', { name: 'ZIPを書き出す' }).click();
  const download = await downloaded;
  const buffer = await readFile((await download.path())!);
  const reader = new ZipReader(
    new BlobReader(new Blob([new Uint8Array(buffer)])),
  );
  const entries = await reader.getEntries();
  const entry = entries.find((e) => e.filename === 'project.json')!;
  if (!('getData' in entry)) throw new Error('missing manifest');
  const project = JSON.parse(
    await (await entry.getData(new BlobWriter())).text(),
  ).project as Project;
  await reader.close();
  return { buffer, project };
}
test.beforeEach(async ({ page }) => {
  const tile = png(256, 256, true);
  await page.route(
    /https:\/\/(cyberjapandata\.gsi\.go\.jp|disaportaldata\.gsi\.go\.jp)\//,
    (route) =>
      route.request().url().endsWith('.pbf')
        ? route.fulfill({ status: 404, body: 'fixture: no vectors' })
        : route.fulfill({
            status: 200,
            contentType: 'image/png',
            headers: { 'access-control-allow-origin': '*' },
            body: tile,
          }),
  );
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(PHOTO_PATH);
});

test('地図縮尺、写真選択解除、各画面の透過度と明示的な表示順を保持する', async ({ page }) => {
  const project = fixture(3);
  project.panes[0].overlayLayerIds = ['gsi-vector-major-road', 'hazard-flood-l2'];
  project.panes[0].opacityByLayerId = { 'gsi-vector-major-road': .1, 'hazard-flood-l2': .9 };
  await openFixture(page, project);
  await expect(page.getByTestId('map-0').locator('.ol-scale-bar')).toBeVisible();
  await expect(page.getByTestId('map-1').locator('.ol-scale-bar')).toBeVisible();
  await expect(page.getByTestId('map-0').locator('.ol-scale-bar')).toContainText(/m|km/);
  const firstScale = await page.getByTestId('map-0').locator('.ol-scale-bar').innerText();
  await page.getByTestId('map-0').dblclick({ position: { x: 75, y: 75 } });
  await expect.poll(() => page.getByTestId('map-0').locator('.ol-scale-bar').innerText()).not.toBe(firstScale);
  await page.getByRole('slider', { name: '写真の逆投影の透過度' }).fill('0.35');
  await page.getByRole('slider', { name: '地図Aの重畳レイヤーの透過度' }).fill('0.4');
  await page.getByRole('slider', { name: '地図Bの重畳レイヤーの透過度' }).fill('0.75');
  await page.getByRole('button', { name: '地図Aのレイヤー', exact: true }).click();
  await expect(page.getByLabel('主要道路（試験公開）の透過度')).toHaveCount(0);
  await expect(page.getByLabel('洪水浸水想定区域・想定最大規模の透過度')).toHaveCount(0);
  await page.getByRole('button', { name: '地図Aのレイヤー', exact: true }).click();
  await page.getByRole('button', { name: '地図1面' }).click();
  await expect(page.getByTestId('photo-canvas')).toHaveCount(0);
  await expect(page.getByTestId('map-1')).toHaveCount(0);
  await expect(page.getByTestId('map-0').locator('.ol-scale-bar')).toBeVisible();
  await page.getByRole('button', { name: '合成写真 3を編集' }).click();
  await expect(page.getByTestId('photo-canvas')).toBeVisible();
  const box = (await page.getByTestId('map-0').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await expect(page.getByRole('menu', { name: '合成写真 3の操作' })).toBeVisible();
  await page.getByRole('menuitem', { name: '最背面に移動' }).click();
  await expect(page.locator('.pm-photo-card').last()).toHaveAttribute('data-photo-id', 'photo-2');
  const saved = await savedProject(page);
  expect(saved.project.photos[0]!.id).toBe('photo-2');
  expect(saved.project.panes[0].overlayOpacity).toBeCloseTo(.6);
  expect(saved.project.panes[1].overlayOpacity).toBeCloseTo(.25);
  expect(saved.project.inverse.opacity).toBeCloseTo(.65);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('photo-canvas')).toHaveCount(0);
  const cleared = (await savedProject(page)).project;
  expect(cleared.schemaVersion).toBe(2);
  expect(cleared.layout).toBe('single');
  expect(cleared.activePhotoId).toBeNull();
});

test('同一画角の比較画像と斜め写真ペアを画像専用ZIPに出力する', async ({ page }) => {
  const outgoing: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (request) => outgoing.push({ url: request.url(), method: request.method(), body: request.postData() }));
  await page.route('**/experimental_rvrcl/**', (route) => route.fulfill({
    status: 200, contentType: 'application/geo+json', headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify({ type: 'FeatureCollection', features: [] }),
  }));
  await page.route('**/dem_png/**', (route) => route.fulfill({
    status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' },
    body: png(256, 256, true, [0, 3, 232]), // 10.00 m in GSI DEM RGB.
  }));
  const project = fixture(2);
  project.photos[0]!.crop = [80, 60, 520, 340];
  project.panes[0].overlayLayerIds = ['gsi-vector-major-road', 'gsi-vector-river'];
  project.panes[1].overlayLayerIds = [];
  await openFixture(page, project);
  await page.getByRole('button', { name: 'オルソ画像エクスポート' }).click();
  await expect(page.locator('.pm-export-settings input[type="range"]').first()).toHaveValue('0.2');
  await expect(page.locator('.pm-export-settings input[type="range"]').nth(1)).toHaveValue('1');
  await page.getByLabel('画像の長辺（px）').fill('256');
  await page.setViewportSize({ width: 1536, height: 864 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await expect(page.getByRole('heading', { name: 'オルソ画像エクスポート' })).toBeVisible();
  const chrome = page.getByRole('img', { name: '縮尺・北の方位・出典・クレジットの出力プレビュー' });
  await expect(chrome).toBeVisible();
  const beforeNorth = await chrome.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  const preview = (await page.locator('.pm-export-preview').boundingBox())!;
  await page.mouse.move(preview.x + 90, preview.y + 120);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(preview.x + 190, preview.y + 120, { steps: 5 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(() => chrome.evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(beforeNorth);
  await page.getByRole('button', { name: '合成写真 1を前面へ' }).click();
  await expect(page.locator('.pm-export-photo-row').first()).toContainText('合成写真 1');
  await page.locator('.pm-export-crop .pm-crop-se').dragTo(page.locator('.pm-export-preview'), { targetPosition: { x: 920, y: 590 } });
  const cropBeforeMove = (await page.locator('.pm-export-crop').boundingBox())!;
  await page.locator('.pm-export-crop > b').dragTo(page.locator('.pm-export-preview'), { targetPosition: { x: 500, y: 300 } });
  const cropAfterMove = (await page.locator('.pm-export-crop').boundingBox())!;
  const chromeAfterMove = (await chrome.boundingBox())!;
  expect(Math.abs(cropAfterMove.x - cropBeforeMove.x) + Math.abs(cropAfterMove.y - cropBeforeMove.y)).toBeGreaterThan(10);
  expect(Math.abs(chromeAfterMove.x - cropAfterMove.x)).toBeLessThan(2);
  expect(Math.abs(chromeAfterMove.y - cropAfterMove.y)).toBeLessThan(2);
  let hazardRequests = 0;
  await page.route('**/01_flood_l2_shinsuishin_data/**', (route) => {
    hazardRequests++;
    return hazardRequests === 1
      ? route.fulfill({ status: 404, body: 'fixture: uncovered tile' })
      : route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png(256, 256) });
  });
  const downloaded = page.waitForEvent('download', { timeout: 150000 });
  await page.getByRole('button', { name: '比較画像ZIPを書き出す' }).click();
  const file = await downloaded;
  const reader = new ZipReader(new BlobReader(new Blob([new Uint8Array(await readFile((await file.path())!))])));
  const entries = await reader.getEntries();
  const names = entries.map((entry) => entry.filename);
  expect(names).toContain('01_ortho_composite.png');
  expect(names).toContain('02_standard_map.png');
  expect(names).toContain('03_aerial.png');
  expect(names).toContain('04_aerial_rivers.png');
  expect(names).toContain('05_flood_hazard_l2.png');
  expect(names).toContain('06_flood_hazard_l1.png');
  expect(names).toContain('08_relief.png');
  expect(names).toContain('09_relief_custom.png');
  expect(names).toContain('photo_001_01_reference.png');
  expect(names).toContain('photo_001_02_after.png');
  expect(names).toContain('sources.txt');
  expect(names).not.toContain('project.json');
  expect(names.some((name) => name.startsWith('originals/'))).toBe(false);
  expect(hazardRequests).toBeGreaterThan(1);
  const dimensions = async (name: string) => {
    const entry = entries.find((item) => item.filename === name)!;
    if (!('getData' in entry)) throw new Error('missing image');
    const bytes = new DataView(await (await entry.getData(new BlobWriter())).arrayBuffer());
    return [bytes.getUint32(16), bytes.getUint32(20)];
  };
  const mapSize = await dimensions('01_ortho_composite.png');
  expect(Math.abs(mapSize[0]! / mapSize[1]! - cropAfterMove.width / cropAfterMove.height)).toBeLessThan(.02);
  for (const name of names.filter((value) => /^0[1-9]_.*\.png$/.test(value)))
    expect(await dimensions(name)).toEqual(mapSize);
  expect(await dimensions('photo_001_01_reference.png')).toEqual(await dimensions('photo_001_02_after.png'));
  const sample = async (name: string, x = .5, y = .5, footer = 0) => {
    const entry = entries.find((item) => item.filename === name)!;
    if (!('getData' in entry)) throw new Error('missing image');
    const bytes = new Uint8Array(await (await entry.getData(new BlobWriter())).arrayBuffer());
    return page.evaluate(async ({ data, x, y, footer }) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0);
      return [...ctx.getImageData(Math.floor(bitmap.width * x), Math.floor((bitmap.height - footer) * y), 1, 1).data];
    }, { data: [...bytes], x, y, footer });
  };
  expect((await sample('02_standard_map.png')).slice(0, 3)).not.toEqual([255, 255, 255]);
  expect((await sample('01_ortho_composite.png', .5, .99)).slice(0, 3)).toEqual([255, 255, 255]);
  expect((await sample('photo_001_01_reference.png', .5, .5, 58))[3]).toBeGreaterThan(0);
  expect((await sample('photo_001_02_after.png', .5, .5, 58))[3]).toBeGreaterThan(0);
  expect((await sample('photo_002_01_reference.png', .05, .05, 58))[3]).toBe(0);
  expect((await sample('photo_002_02_after.png', .05, .05, 58))[3]).toBe(0);
  const sourceEntry = entries.find((item) => item.filename === 'sources.txt')!;
  if (!('getData' in sourceEntry)) throw new Error('missing sources');
  const sourceText = await (await sourceEntry.getData(new BlobWriter())).text();
  expect(sourceText).toContain('災害前の写真とは限りません');
  expect(sourceText).toContain('主要道路（試験公開）：未取得');
  expect(sourceText).toContain('河川・水域（地理院地図Vector）：未取得');
  expect(sourceText).toContain('洪水浸水想定区域・想定最大規模：未取得');
  expect(sourceText).toContain('海域部は海上保安庁海洋情報部の資料を使用して作成');
  expect(sourceText).toContain('解析用色別標高図の配色範囲：9.5〜10.5 m');
  const getImageBytes = async (name: string) => {
    const entry = entries.find((item) => item.filename === name)!;
    if (!('getData' in entry)) throw new Error('missing image');
    return [...new Uint8Array(await (await entry.getData(new BlobWriter())).arrayBuffer())];
  };
  const hazardVisible = await page.evaluate(async ({ normal, hazard }) => {
    const read = async (bytes: number[]) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    };
    const a = await read(normal), b = await read(hazard);
    for (let y = 0; y < a.height * .7; y += 3) for (let x = 0; x < a.width; x += 3) {
      const i = (y * a.width + x) * 4;
      if (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 30) return true;
    }
    return false;
  }, { normal: await getImageBytes('02_standard_map.png'), hazard: await getImageBytes('05_flood_hazard_l2.png') });
  expect(hazardVisible).toBe(true);
  for (const name of ['08_relief.png', '09_relief_custom.png']) {
    const legendVisible = await page.evaluate(async ({ normal, relief }) => {
      const read = async (bytes: number[]) => {
        const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
        const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const a = await read(normal), b = await read(relief);
      let different = 0;
      for (let y = Math.floor(a.height * .08); y < a.height * .45; y += 2)
        for (let x = Math.floor(a.width * .02); x < a.width * .27; x += 2) {
          const i = (y * a.width + x) * 4;
          if (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!) > 60) different++;
        }
      return different;
    }, { normal: await getImageBytes('02_standard_map.png'), relief: await getImageBytes(name) });
    expect(legendVisible).toBeGreaterThan(10);
  }
  await expect(page.getByText(/取得に失敗したため、この画像から除外/)).toHaveCount(0);
  expect(outgoing.every((request) => request.method === 'GET' && request.body === null)).toBe(true);
  expect(outgoing.every((request) => !request.url.includes('合成写真'))).toBe(true);
  await reader.close();
});

test('画像書き出しの重畳濃度がプレビューへ反映され、写真を右クリックで整理できる', async ({ page }) => {
  let hazardRequests = 0;
  await page.route('**/01_flood_l2_shinsuishin_data/**', (route) => {
    hazardRequests++;
    return route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png(256, 256) });
  });
  const project = fixture(3);
  project.panes[0].baseLayerId = 'gsi-pale';
  project.panes[0].overlayLayerIds = ['hazard-flood-l2'];
  await openFixture(page, project);
  await page.getByRole('button', { name: 'オルソ画像エクスポート' }).click();
  await expect.poll(() => hazardRequests).toBeGreaterThan(0);
  const slider = page.locator('.pm-export-settings input[type="range"]').first();
  const mapImage = page.locator('.pm-export-map');
  await slider.fill('0');
  const hidden = await mapImage.screenshot();
  await slider.fill('1');
  await expect(page.locator('.pm-export-opacity-note')).toContainText('濃さ 100%');
  await expect.poll(async () => Buffer.compare(await mapImage.screenshot(), hidden)).not.toBe(0);
  const box = (await page.locator('.pm-export-preview').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  const menu = page.getByRole('menu', { name: '合成写真 3のレイヤー操作' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '前面に移動', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '背面に移動', exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '最前面に移動', exact: true })).toBeVisible();
  await menu.getByRole('menuitem', { name: '最背面に移動', exact: true }).click();
  await expect(page.locator('.pm-export-photo-row').last()).toContainText('合成写真 3');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  const nextMenu = page.getByRole('menu', { name: '合成写真 2のレイヤー操作' });
  await expect(nextMenu).toBeVisible();
  await nextMenu.getByRole('menuitem', { name: '非表示にする' }).click();
  await expect(page.locator('.pm-export-photo-row').filter({ hasText: '合成写真 2' }).locator('input[type="checkbox"]')).not.toBeChecked();
});

test('選択した河川中心線GeoJSONを近接写真へ逆投影する', async ({ page }) => {
  let requests = 0;
  await page.route('**/experimental_rvrcl/**', (route) => {
    requests++;
    return route.fulfill({
      status: 200,
      contentType: 'application/geo+json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { class: 'RvrCL', ftCode: '5311' },
          geometry: {
            type: 'LineString',
            coordinates: [[139.898, 35.9], [139.902, 35.9]],
          },
        }],
      }),
    });
  });
  const project = fixture();
  project.inverse.baseLayerId = null;
  project.inverse.overlayIds = [];
  await openFixture(page, project);
  await page.evaluate(() => {
    const local = window as typeof window & { __riverOverlays?: Blob[] };
    local.__riverOverlays = [];
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      if (blob.type === 'image/png') local.__riverOverlays!.push(blob);
      return create(blob);
    };
  });
  await page.getByRole('button', { name: '写真のレイヤー' }).click();
  await page
    .getByRole('dialog', { name: '写真のレイヤー設定' })
    .getByLabel('河川中心線（地図情報・試験公開）')
    .check();
  await page.waitForFunction(() =>
    Boolean((window as typeof window & { __riverOverlays?: Blob[] }).__riverOverlays?.length),
  );
  const opaque = await page.evaluate(async () => {
    const blob = (window as typeof window & { __riverOverlays?: Blob[] }).__riverOverlays![0]!;
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 100) count++;
    return count;
  });
  expect(requests).toBeGreaterThan(0);
  expect(opaque).toBeGreaterThan(100);
});

test('写真の一括表示、対応点の単独表示、写真の切替と地図からの選択', async ({ page }) => {
  const project = fixture(3);
  project.photos[1]!.registration = undefined;
  await openFixture(page, project);
  await expect(page.locator('.pm-photo-card.is-unregistered')).toHaveCount(1);
  await expect(page.locator('.pm-photo-card.is-registered')).toHaveCount(2);
  await page.getByRole('button', { name: '地図Aの写真をすべてオフ' }).click();
  await expect(page.getByRole('checkbox', { name: /を地図Aに表示/ })).toHaveCount(3);
  for (const box of await page.getByRole('checkbox', { name: /を地図Aに表示/ }).all())
    await expect(box).not.toBeChecked();
  await page.getByRole('button', { name: '地図Aの写真をすべてオン' }).click();
  for (const box of await page.getByRole('checkbox', { name: /を地図Aに表示/ }).all())
    await expect(box).toBeChecked();
  await page.getByRole('slider', { name: '全写真の透過度を一括変更' }).fill('0.42');
  await expect(page.getByText('全写真の透過度 42%')).toBeVisible();

  await page.getByRole('button', { name: '対応点', exact: true }).click();
  await expect(page.locator('.pm-surface-A .pm-map-photo-label')).toContainText('合成写真 1');
  await expect(page.getByRole('slider', { name: '位置合わせ後の写真の透過度' })).toBeVisible();
  await page.getByRole('slider', { name: '位置合わせ後の写真の透過度' }).fill('0.55');
  await page.getByRole('button', { name: '写真', exact: true }).click();
  for (const box of await page.getByRole('checkbox', { name: /を地図Aに表示/ }).all())
    await expect(box).toBeChecked();

  await page.getByRole('button', { name: '前の写真' }).click();
  await expect(page.locator('.pm-surface-photo .pm-surface-heading')).toContainText('合成写真 2');
  await expect(page.locator('.pm-photo-registration-warning')).toContainText('この写真は位置合わせ前');
  await page.getByRole('button', { name: '前の写真' }).click();
  await expect(page.locator('.pm-surface-A .pm-map-photo-label')).toContainText('合成写真 3');
  const box = (await page.locator('.pm-surface-A .pm-map').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('tooltip')).toContainText('合成写真 3');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await expect(page.getByRole('menu', { name: '合成写真 3の操作' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'この写真以外を非表示' }).click();
  await expect(page.getByRole('button', { name: '単独表示を解除' })).toBeVisible();
  await page.getByRole('button', { name: '単独表示を解除' }).click();
});

test('公開ルートから別タブで判読ツールを開ける', async ({ page }) => {
  await page.context().route(
    /https:\/\/(cyberjapandata\.gsi\.go\.jp|disaportaldata\.gsi\.go\.jp)\//,
    (route) => route.abort(),
  );
  const root = new URL('..', page.url());
  await page.goto(root.href);
  const link = page.getByRole('link', { name: '浸水域判読支援' });
  await expect(link).toHaveAttribute('href', `${root.pathname}photo-map/`);
  const opening = page.waitForEvent('popup');
  await link.click();
  const opened = await opening;
  await expect(opened.getByRole('heading', { name: '浸水域判読支援' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '地図表示ツール' })).toBeVisible();
  await opened.close();
});

test('斜め写真の行列を変更せずZIP保存・復元でき、実際の逆行列不一致は拒否する', async ({ page }) => {
  const project = fixture();
  const photo = project.photos[0]!;
  const h = multiply(
    [1, 0, 15570000, 0, 1, 4280000, 0, 0, 1],
    [4.3, 1.1, 23, 0.2, -3.9, 50, 0.0002, 0.022, 1],
  );
  photo.gcps = photo.gcps.map((g) => ({
    ...g, map: toLonLat(projectPoint(h, g.image!)!) as Point,
  }));
  photo.registration = { ...fitRegistration(photo.gcps), h, inverse: invert(h) };
  const product = multiply(h, photo.registration.inverse);
  expect(Math.abs(product[2] / product[8])).toBeGreaterThan(1e-5);
  // Confirmed data and un-applied GCP edits must both survive the archive.
  photo.gcps[0]!.image![0] += 1;
  await openFixture(page, project);
  const saved = await savedProject(page, true);
  expect(saved.project.photos[0]).toEqual(photo);
  expect(saved.project.drawings).toEqual(project.drawings);
  await page.reload();
  await page.getByLabel('プロジェクトZIP', { exact: true }).setInputFiles({
    name: 'saved-oblique.zip', mimeType: 'application/zip', buffer: saved.buffer,
  });
  await expect(page.getByText('ZIPを復元しました。続けて編集できます。')).toBeVisible();
  expect((await savedProject(page)).project.photos[0]).toEqual(photo);

  const corrupt = structuredClone(project);
  corrupt.photos[0]!.registration!.inverse = multiply(
    [1, 0, 0.1, 0, 1, 0, 0, 0, 1], photo.registration.inverse,
  );
  await page.getByLabel('プロジェクトZIP', { exact: true }).setInputFiles({
    name: 'corrupt.zip', mimeType: 'application/zip', buffer: await archive(corrupt, png()),
  });
  await expect(page.getByText(/の行列と逆行列が一致しません/)).toBeVisible();
  expect((await savedProject(page)).project.photos[0]).toEqual(photo);
});

test('フルHDと125%相当でレイアウトが収まり、地図2面と最大化を切り替えられる', async ({
  page,
}) => {
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
  ]) {
    await page.setViewportSize(size);
    for (const name of ['位置合わせ', '写真＋地図2面', '地図2面']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <= innerWidth &&
            document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
      const box = await page.getByTestId('map-0').boundingBox();
      expect(box!.width).toBeGreaterThan(450);
      expect(box!.height).toBeGreaterThan(280);
    }
  }
  await page.getByLabel('地図Aを最大化').click();
  await expect(page.getByTestId('map-1')).toHaveCount(0);
  await page.getByLabel('地図Aを元の大きさに戻す').click();
  await expect(page.getByTestId('map-1')).toBeVisible();
});

test('写真を読込み、4組のクリックから計算し、写真にポリゴンを描ける', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page
    .getByLabel('写真ファイル', { exact: true })
    .setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: png() });
  await page
    .getByRole('button', { name: '地図と位置合わせ（対応点）', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '計算・適用', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: '処理中', exact: true }),
  ).toHaveCount(0);
  const photo = page.getByTestId('photo-canvas'),
    map = page.getByTestId('map-0');
  await expect
    .poll(() =>
      photo.locator('canvas').evaluateAll((canvases) =>
        canvases.some((canvas) => {
          const c = canvas as HTMLCanvasElement,
            context = c.getContext('2d');
          if (!context) return false;
          const pixel = context.getImageData(
            Math.floor(c.width * 0.4),
            Math.floor(c.height * 0.4),
            1,
            1,
          ).data;
          return pixel[3] === 255;
        }),
      ),
    )
    .toBe(true);
  for (const [i, [x, y]] of [
    [0.25, 0.35],
    [0.75, 0.35],
    [0.75, 0.65],
    [0.25, 0.65],
  ].entries()) {
    const p = (await photo.boundingBox())!,
      m = (await map.boundingBox())!;
    await photo.click({ position: { x: p.width * x!, y: p.height * y! } });
    await expect(page.locator('.pm-gcp-list li')).toHaveCount(i + 1);
    await map.click({ position: { x: m.width * x!, y: m.height * y! } });
    await expect(page.locator('.pm-metric strong')).toHaveText(String(i + 1));
  }
  await page.getByRole('button', { name: '計算・適用', exact: true }).click();
  await expect(page.getByText('確定結果の残差 RMS')).toBeVisible();
  await page.getByRole('button', { name: '写真の作図', exact: true }).click();
  await page.getByRole('button', { name: '面を描く', exact: false }).click();
  const box = (await photo.boundingBox())!;
  await photo.click({
    position: { x: box.width * 0.35, y: box.height * 0.42 },
  });
  await photo.click({
    position: { x: box.width * 0.55, y: box.height * 0.42 },
  });
  await photo.dblclick({
    position: { x: box.width * 0.45, y: box.height * 0.57 },
  });
  await expect(page.getByLabel('名称', { exact: true })).toHaveValue(
    '浸水範囲 1',
  );
  const saved = await savedProject(page);
  expect(saved.project.photos[0]!.registration).toBeDefined();
  expect(saved.project.drawings[0]!.anchor).toBe('photo');
  expect(saved.project.drawings[0]!.points.length).toBeGreaterThanOrEqual(4);
  expect(errors).toEqual([]);
});

test('ZIP往復・変換画像・逆投影・機密データの外部送信なしを検証する', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const outgoing: { url: string; method: string; body: string | null }[] = [];
  page.on('request', (r) =>
    outgoing.push({ url: r.url(), method: r.method(), body: r.postData() }),
  );
  await openFixture(page);
  await expect(
    page.getByTestId('photo-canvas').locator('canvas'),
  ).not.toHaveCount(0);
  await expect
    .poll(() =>
      page
        .getByTestId('map-0')
        .locator('canvas')
        .evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const gl = (canvas as HTMLCanvasElement).getContext('webgl');
            if (!gl) return false;
            const pixel = new Uint8Array(4);
            gl.readPixels(
              Math.floor(canvas.width * 0.45),
              Math.floor(canvas.height * 0.55),
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixel,
            );
            return pixel[3] > 0;
          }),
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.getByTestId('photo-canvas').evaluate((host) =>
        Array.from(host.querySelectorAll('canvas')).map((canvas) => {
          // OpenLayers uses transformed backing canvases and may composite layers.
          const context = canvas.getContext('2d');
          if (!context) return [];
          const p = new DOMMatrix(canvas.style.transform || undefined)
            .inverse()
            .transformPoint(
              new DOMPoint(host.clientWidth * 0.25, host.clientHeight * 0.3),
            );
          return Array.from(
            context.getImageData(Math.floor(p.x), Math.floor(p.y), 1, 1).data,
          );
        }),
      ),
    )
    .toEqual(expect.arrayContaining([[150, 110, 73, 255]]));
  await page
    .getByRole('button', { name: '対応点', exact: true })
    .last()
    .click();
  await expect(page.getByText('確定結果の残差 RMS')).toBeVisible();
  await page.getByRole('button', { name: 'ZIPで保存', exact: true }).click();
  await page.getByLabel('表示中の比較画面PNGを含める').check();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'ZIPを書き出す' }).click();
  const download = await downloaded;
  const buffer = await readFile((await download.path())!);
  const reader = new ZipReader(
    new BlobReader(new Blob([new Uint8Array(buffer)])),
  );
  const entries = await reader.getEntries();
  expect(entries.map((e) => e.filename)).toEqual(
    expect.arrayContaining([
      'rectified/photo-0.png',
      'rectified/photo-0.pgw',
      'rectified/photo-0.prj',
      'rectified/photo-0.png.aux.xml',
      'screenshots/photo.png',
      'drawings.geojson',
    ]),
  );
  const worldEntry = entries.find(
    (e) => e.filename === 'rectified/photo-0.pgw',
  )!;
  if (!('getData' in worldEntry)) throw new Error('world');
  const world = (await (await worldEntry.getData(new BlobWriter())).text())
    .trim()
    .split('\n')
    .map(Number);
  expect(world).toHaveLength(6);
  expect(world[0]).toBeGreaterThan(0);
  expect(world[3]).toBe(-world[0]!);
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/photo-map-fixture.zip', buffer);
  await reader.close();
  const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    }),
    other = await context.newPage();
  await other.route(/https:\/\//, (r) =>
    r.fulfill({ status: 404, body: 'offline' }),
  );
  await other.goto(PHOTO_PATH);
  await other.getByLabel('プロジェクトZIP', { exact: true }).setInputFiles({
    name: 'roundtrip.zip',
    mimeType: 'application/zip',
    buffer,
  });
  await expect(other.locator('.pm-photo-card')).toHaveCount(1);
  await expect(other.getByRole('textbox', { name: 'プロジェクト名' })).toHaveValue(fixture().name);
  await other.getByRole('button', { name: '地図Aの作図', exact: true }).click();
  await expect(
    other.getByRole('button', { name: /写真で判読した範囲/ }),
  ).toBeVisible();
  await context.close();
  expect(
    outgoing
      .filter((r) => r.url.startsWith('http'))
      .every((r) => r.method === 'GET' && r.body === null),
  ).toBe(true);
  expect(
    outgoing.every(
      (r) =>
        !r.url.includes('合成') &&
        !r.url.includes('photo-0') &&
        !r.url.includes('gcp-'),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/photo-map-comparison.png' });
});

test('再計算・切抜き・マスクを保存し、不正なZIPで現在の作業を失わない', async ({
  page,
}) => {
  await openFixture(page);
  await page
    .getByRole('button', { name: '対応点', exact: true })
    .last()
    .click();
  await page.locator('.pm-gcp-list button').first().click();
  await page.getByLabel('GCP 経度', { exact: true }).fill('139.8975');
  await expect(
    page.getByText('未反映の編集があります。表示は前回の確定結果です。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '計算・適用', exact: true }).click();
  await page.getByRole('button', { name: '位置合わせ', exact: true }).click();
  await page.getByRole('button', { name: '写真', exact: true }).click();
  await page.getByRole('button', { name: /矩形で切り抜く/ }).click();
  const photo = page.getByTestId('photo-canvas'),
    box = (await photo.boundingBox())!;
  await photo.click({ position: { x: box.width * 0.3, y: box.height * 0.4 } });
  await photo.click({ position: { x: box.width * 0.7, y: box.height * 0.6 } });
  await page.getByRole('button', { name: /不要部分を隠す/ }).click();
  await photo.click({ position: { x: box.width * 0.4, y: box.height * 0.45 } });
  await photo.click({ position: { x: box.width * 0.5, y: box.height * 0.45 } });
  await photo.dblclick({
    position: { x: box.width * 0.45, y: box.height * 0.5 },
  });
  const saved = await savedProject(page);
  expect(saved.project.photos[0]!.masks).toHaveLength(1);
  expect(saved.project.photos[0]!.crop[0]).toBeGreaterThan(0);
  expect(saved.project.drawings[0]!.points).toEqual(
    fixture().drawings[0]!.points,
  );
  expect(saved.project.drawings[1]!.points).toEqual(
    fixture().drawings[1]!.points,
  );
  const bad = fixture();
  bad.schemaVersion = 99 as 1;
  await page.getByLabel('プロジェクトZIP', { exact: true }).setInputFiles({
    name: 'bad.zip',
    mimeType: 'application/zip',
    buffer: await archive(bad, png()),
  });
  await expect(
    page.getByText('このZIPのプロジェクト形式には対応していません。'),
  ).toBeVisible();
  expect(await page.getByLabel('プロジェクト名').inputValue()).toBe(
    saved.project.name,
  );
});

test('2400万画素30枚を逐次読込みして編集・ZIP保存できる', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const project = fixture(30, 6000, 4000);
  project.export.longEdge = 4096;
  project.inverse = { ...project.inverse, baseLayerId: null, overlayIds: [] };
  const start = Date.now();
  await openFixture(page, project, png(6000, 4000));
  await expect(page.locator('.pm-photo-card')).toHaveCount(30);
  await page.getByLabel('プロジェクト名').fill('30枚・編集後');
  const saved = await savedProject(page, true);
  expect(saved.project.photos).toHaveLength(30);
  expect(saved.project.name).toBe('30枚・編集後');
  expect(Date.now() - start).toBeLessThan(150000);
  expect(errors).toEqual([]);
});

test('EXIFの回転を適用し、元JPEGと元解像度の座標規約をZIPで保持する', async ({
  page,
}) => {
  const base64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e74930';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#258bbc';
    ctx.fillRect(100, 0, 100, 100);
    return c.toDataURL('image/jpeg', 0.95).split(',')[1]!;
  });
  const jpeg = Buffer.from(base64, 'base64'),
    exif = Buffer.alloc(32);
  exif.write('Exif\0\0', 0, 'ascii');
  exif.write('II', 6, 'ascii');
  exif.writeUInt16LE(42, 8);
  exif.writeUInt32LE(8, 10);
  exif.writeUInt16LE(1, 14);
  exif.writeUInt16LE(0x112, 16);
  exif.writeUInt16LE(3, 18);
  exif.writeUInt32LE(1, 20);
  exif.writeUInt16LE(6, 24);
  const header = Buffer.from([255, 225, 0, 34]),
    oriented = Buffer.concat([
      jpeg.subarray(0, 2),
      header,
      exif,
      jpeg.subarray(2),
    ]);
  await page.getByLabel('写真ファイル', { exact: true }).setInputFiles({
    name: 'rotated.jpg',
    mimeType: 'image/jpeg',
    buffer: oriented,
  });
  await page.getByText('写真の情報・名称', { exact: true }).click();
  await expect(page.getByText('100 × 200 px · 元画像を保持')).toBeVisible();
  const saved = await savedProject(page);
  expect(saved.project.photos[0]!.width).toBe(100);
  expect(saved.project.photos[0]!.height).toBe(200);
  const reader = new ZipReader(
      new BlobReader(new Blob([new Uint8Array(saved.buffer)])),
    ),
    entries = await reader.getEntries(),
    entry = entries.find((e) => e.filename.startsWith('originals/'))!;
  if (!('getData' in entry)) throw new Error('original');
  expect(
    Buffer.from(await (await entry.getData(new BlobWriter())).arrayBuffer()),
  ).toEqual(oriented);
  await reader.close();
});

test('WebGLが使えない環境でもWorkerの投影画像を地図上へ表示する', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: unknown[]
    ) {
      if (
        type === 'webgl' ||
        type === 'webgl2' ||
        type === 'experimental-webgl'
      )
        return null;
      return original.apply(this, [type, ...args] as Parameters<
        typeof original
      >);
    } as typeof original;
  });
  await page.reload();
  const project = fixture();
  project.inverse = { ...project.inverse, baseLayerId: null, overlayIds: [] };
  await openFixture(page, project);
  await expect
    .poll(() =>
      page
        .getByTestId('map-0')
        .locator('.ol-layers > canvas')
        .evaluateAll((canvases) =>
          canvases.some((canvas) => {
            const c = canvas as HTMLCanvasElement;
            return (
              c
                .getContext('2d')!
                .getImageData(
                  Math.floor(c.width * 0.45),
                  Math.floor(c.height * 0.55),
                  1,
                  1,
                ).data[3]! > 0
            );
          }),
        ),
    )
    .toBe(true);
});

test('レイヤー設定は各画面内で開き、左の写真管理を維持する', async ({
  page,
}) => {
  await openFixture(page);
  const sidebar = page.locator('.pm-sidebar');
  await expect(
    sidebar.getByRole('button', { name: '作図', exact: true }),
  ).toHaveCount(0);
  await expect(
    sidebar.getByRole('button', { name: 'レイヤー', exact: true }),
  ).toHaveCount(0);
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1536, height: 864 },
  ]) {
    await page.setViewportSize(size);
    for (const name of ['写真', '地図A', '地図B']) {
      await page
        .getByRole('button', { name: `${name}のレイヤー`, exact: true })
        .click();
      const dialog = page.getByRole('dialog', {
        name: `${name}のレイヤー設定`,
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await expect(page.locator('.pm-surface-popover')).toHaveCount(1);
      const box = (await dialog.boundingBox())!,
        pane = (await page
          .getByRole('region', { name: `${name}パネル`, exact: true })
          .boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(pane.x);
      expect(box.y + box.height).toBeLessThanOrEqual(pane.y + pane.height);
      await expect(
        sidebar.getByRole('button', { name: '地図と位置合わせ（対応点）' }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
      ).toBe(true);
    }
  }
  await page
    .getByRole('dialog', { name: '地図Bのレイヤー設定' })
    .getByLabel('背景地図', { exact: true })
    .selectOption('gsi-blank');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: '地図Bのレイヤー', exact: true }),
  ).toBeFocused();
  await page
    .getByRole('button', { name: '写真のレイヤー', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '写真のレイヤー設定' })
    .getByLabel('背景地図', { exact: true })
    .selectOption('gsi-std');
  await page.locator('.pm-status').click();
  await expect(page.locator('.pm-surface-popover')).toHaveCount(0);
  const saved = await savedProject(page);
  expect(saved.project.panes[0].baseLayerId).toBe('gsi-seamlessphoto');
  expect(saved.project.panes[1].baseLayerId).toBe('gsi-blank');
  expect(saved.project.inverse.baseLayerId).toBe('gsi-std');
});

test('写真一覧で表示・透過度を変更し、ドラッグ順を保存・取消しできる', async ({
  page,
}) => {
  await openFixture(page, fixture(3));
  const cards = page.locator('.pm-photo-card');
  const photo0 = page.locator('[data-photo-id="photo-0"]');
  const photo2 = page.locator('[data-photo-id="photo-2"]');
  await photo2.getByLabel('合成写真 3を地図Bに表示', { exact: true }).check();
  const slider = photo2.getByLabel('合成写真 3の地図Bの透過度', {
    exact: true,
  });
  await slider.press('Home');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('0.01');
  await expect(page.locator('.pm-edit-photo-name')).toHaveText('合成写真 1');
  await photo0
    .getByRole('button', { name: '合成写真 1の重なり順を変更' })
    .dragTo(photo2, { targetPosition: { x: 100, y: 4 } });
  await expect(cards.first()).toHaveAttribute('data-photo-id', 'photo-0');
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(cards.first()).toHaveAttribute('data-photo-id', 'photo-2');
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect(cards.first()).toHaveAttribute('data-photo-id', 'photo-0');
  const saved = await savedProject(page);
  expect(saved.project.photos.map((p) => p.id)).toEqual([
    'photo-1',
    'photo-2',
    'photo-0',
  ]);
  const changed = saved.project.photos.find((p) => p.id === 'photo-2')!;
  expect(changed.visible[1]).toBe(true);
  expect(changed.opacity[1]).toBeCloseTo(0.99);
  expect(saved.project.activePhotoId).toBe('photo-0');
  await page
    .getByRole('button', { name: '地図Aのレイヤー', exact: true })
    .click();
  await page.screenshot({ path: 'test-results/photo-map-local-controls.png' });
});

test('作図は選んだ画面だけで動作し、ほかの画面は移動操作のままになる', async ({
  page,
}) => {
  const project = fixture();
  project.drawings = [];
  await openFixture(page, project);
  await page.getByRole('button', { name: '地図Aの作図', exact: true }).click();
  await page
    .getByRole('dialog', { name: '地図Aの作図', exact: true })
    .getByRole('button', { name: /面を描く/ })
    .click();
  await expect(page.locator('.pm-surface-A .pm-local-mode')).toBeVisible();
  await expect(
    page.locator(
      '.pm-surface-photo .pm-local-mode, .pm-surface-B .pm-local-mode',
    ),
  ).toHaveCount(0);
  const b = page.getByTestId('map-1'),
    bb = (await b.boundingBox())!;
  await b.click({ position: { x: bb.width * 0.25, y: bb.height * 0.5 } });
  const a = page.getByTestId('map-0'),
    ab = (await a.boundingBox())!;
  await a.click({ position: { x: ab.width * 0.3, y: ab.height * 0.45 } });
  await a.click({ position: { x: ab.width * 0.5, y: ab.height * 0.45 } });
  await a.dblclick({ position: { x: ab.width * 0.4, y: ab.height * 0.7 } });
  const dialog = page.getByRole('dialog', { name: '地図Aの作図', exact: true });
  await expect(dialog.getByLabel('名称', { exact: true })).toHaveValue(
    '浸水範囲 1',
  );
  await expect(page.locator('.pm-local-mode')).toHaveCount(0);
  await page.getByRole('button', { name: '写真の作図', exact: true }).click();
  await page
    .getByRole('dialog', { name: '写真の作図', exact: true })
    .getByRole('button', { name: /線を描く/ })
    .click();
  await expect(page.locator('.pm-surface-photo .pm-local-mode')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.pm-local-mode')).toHaveCount(0);
  const saved = await savedProject(page);
  expect(saved.project.drawings).toHaveLength(1);
  expect(saved.project.drawings[0]!.anchor).toBe('map');
});
