import {
  BlobReader,
  BlobWriter,
  ZipReader,
  ZipWriter,
  configure,
} from '@zip.js/zip.js/index-native.js';
import type { Project } from './model';
import { validateProject } from './validation';
import { decodePhoto, headerDimensions, MAX_IMAGE_BYTES } from './media';

configure({ useWebWorkers: false });
let writer: ZipWriter<Blob> | undefined;
const LIMIT = 2 * 1024 * 1024 * 1024;
self.onmessage = async (
  event: MessageEvent<{
    requestId: number;
    command: 'begin' | 'add' | 'close' | 'read';
    path?: string;
    blob?: Blob;
    file?: Blob;
  }>,
) => {
  const { requestId, command } = event.data;
  try {
    if (command === 'begin') {
      writer = new ZipWriter(new BlobWriter('application/zip'));
      self.postMessage({ requestId, done: true });
    } else if (command === 'add') {
      await writer!.add(event.data.path!, new BlobReader(event.data.blob!), {
        level: 0,
      });
      self.postMessage({ requestId, done: true });
    } else if (command === 'close') {
      const blob = await writer!.close();
      writer = undefined;
      self.postMessage({ requestId, blob });
    } else {
      const file = event.data.file!;
      if (file.size > LIMIT) throw new Error('ZIPは2 GB以下にしてください。');
      const reader = new ZipReader(new BlobReader(file));
      try {
        const entries = await reader.getEntries();
        if (entries.length > 2000)
          throw new Error('ZIP内のファイル数が多すぎます。');
        let total = 0;
        const names = new Set<string>();
        for (const e of entries) {
          if (
            e.filename.startsWith('/') ||
            e.filename.includes('\\') ||
            e.filename.split('/').includes('..') ||
            names.has(e.filename) ||
            e.encrypted
          )
            throw new Error('ZIP内のパスまたは形式が不正です。');
          names.add(e.filename);
          total += e.uncompressedSize;
          if (total > LIMIT)
            throw new Error('ZIPの展開サイズが2 GBを超えています。');
        }
        const manifest = entries.find((e) => e.filename === 'project.json');
        if (
          !manifest ||
          !('getData' in manifest) ||
          manifest.uncompressedSize > 30 * 1024 * 1024
        )
          throw new Error('プロジェクト定義がありません。');
        const definition = await manifest.getData(new BlobWriter(), {
          checkSignature: true,
        });
        const parsed = JSON.parse(await definition.text()) as {
          format: string;
          project: Project;
        };
        if (parsed.format !== 'flood-photo-map')
          throw new Error('浸水域判読支援ツールのZIPではありません。');
        const project = validateProject(parsed.project),
          assets: [string, Blob][] = [];
        for (const [index, photo] of project.photos.entries()) {
          const entry = entries.find(
            (e) => e.filename === `originals/${photo.id}`,
          );
          if (
            !entry ||
            !('getData' in entry) ||
            entry.uncompressedSize > MAX_IMAGE_BYTES
          )
            throw new Error('元画像が不足しているか大きすぎます。');
          const data = await entry.getData(new BlobWriter(photo.mime), {
            checkSignature: true,
            onprogress: (bytes: number) => {
              if (bytes > MAX_IMAGE_BYTES)
                throw new Error('元画像が大きすぎます。');
            },
          });
          const dimensions = headerDimensions(
            new Uint8Array(await data.slice(0, 1024 * 1024).arrayBuffer()),
            photo.mime,
          );
          if (
            !dimensions ||
            dimensions[0] * dimensions[1] !== photo.width * photo.height
          )
            throw new Error('元画像と登録寸法が一致しません。');
          const bitmap = await decodePhoto(data);
          const matches =
            bitmap.width === photo.width && bitmap.height === photo.height;
          bitmap.close();
          if (!matches) throw new Error('元画像の向き・寸法が一致しません。');
          assets.push([photo.id, data]);
          self.postMessage({
            requestId,
            progress: (index + 1) / Math.max(1, project.photos.length),
          });
        }
        self.postMessage({ requestId, project, assets });
      } finally {
        await reader.close();
      }
    }
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : 'ZIP処理に失敗しました。',
    });
  }
};
