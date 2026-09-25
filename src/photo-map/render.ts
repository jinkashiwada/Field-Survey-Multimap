import Layer from 'ol/layer/Layer.js';
import type { FrameState } from 'ol/Map.js';
import type { Photo, Matrix3 } from './model';
import { bounds, footprint, multiply } from './homography';
import { ImagePool } from './media';
import { photoWarp, rasterGrid, warp } from './warp';

const vertex = `attribute vec2 a; void main(){gl_Position=vec4(a,0.0,1.0);}`;
const fragment = `precision highp float;
uniform sampler2D image; uniform mat3 matrix; uniform vec2 viewport; uniform vec2 sourceSize; uniform float opacity;
void main(){vec2 p=vec2(gl_FragCoord.x-0.5,viewport.y-gl_FragCoord.y-0.5);vec3 q=matrix*vec3(p,1.0);
if(abs(q.z)<1.e-12) discard;vec2 uv=(q.xy/q.z+vec2(0.5))/sourceSize;
if(uv.x<0.0||uv.y<0.0||uv.x>1.0||uv.y>1.0) discard;
vec4 c=texture2D(image,uv);gl_FragColor=vec4(c.rgb,c.a*opacity);}`;
/** Exact projective texture lookup, one GL context per visible pane. */
export class WarpCanvas {
  readonly canvas = document.createElement('canvas');
  private gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private textures = new Map<
    string,
    { texture: WebGLTexture; bytes: number }
  >();
  constructor() {
    this.gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
    const gl = this.gl;
    if (!gl) return;
    const shader = (type: number, code: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, code);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error('shader');
      return s;
    };
    try {
      const program = gl.createProgram()!;
      gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex));
      gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error('shader');
      this.program = program;
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const location = gl.getAttribLocation(program, 'a');
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(
        gl.SRC_ALPHA,
        gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
    } catch {
      this.gl = null;
    }
  }
  get supported() {
    return !!this.gl && !!this.program && !this.gl.isContextLost();
  }
  has(key: string) {
    return this.textures.has(key);
  }
  upload(key: string, image: TexImageSource, width: number, height: number) {
    const gl = this.gl;
    if (!gl) return;
    const existing = this.textures.get(key);
    if (existing) {
      gl.deleteTexture(existing.texture);
      this.textures.delete(key);
    }
    let size = [...this.textures.values()].reduce((sum, v) => sum + v.bytes, 0);
    while (
      size + width * height * 4 > 128 * 1024 * 1024 &&
      this.textures.size
    ) {
      const k = this.textures.keys().next().value!;
      const v = this.textures.get(k)!;
      size -= v.bytes;
      gl.deleteTexture(v.texture);
      this.textures.delete(k);
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.textures.set(key, { texture, bytes: width * height * 4 });
  }
  begin(width: number, height: number) {
    this.canvas.width = Math.max(1, Math.round(width));
    this.canvas.height = Math.max(1, Math.round(height));
    const gl = this.gl;
    if (!gl) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  draw(
    key: string,
    matrix: Matrix3,
    width: number,
    height: number,
    opacity: number,
  ) {
    const gl = this.gl,
      program = this.program,
      entry = this.textures.get(key);
    if (!gl || !program || !entry) return;
    this.textures.delete(key);
    this.textures.set(key, entry);
    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    const m = matrix.map((v) => v / Math.max(...matrix.map(Math.abs)));
    gl.uniformMatrix3fv(
      gl.getUniformLocation(program, 'matrix'),
      false,
      new Float32Array([
        m[0]!,
        m[3]!,
        m[6]!,
        m[1]!,
        m[4]!,
        m[7]!,
        m[2]!,
        m[5]!,
        m[8]!,
      ]),
    );
    gl.uniform2f(
      gl.getUniformLocation(program, 'viewport'),
      this.canvas.width,
      this.canvas.height,
    );
    gl.uniform2f(gl.getUniformLocation(program, 'sourceSize'), width, height);
    gl.uniform1f(gl.getUniformLocation(program, 'opacity'), opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  dispose() {
    this.textures.forEach((v) => this.gl?.deleteTexture(v.texture));
    this.textures.clear();
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
function maskedBitmap(bitmap: ImageBitmap, photo: Photo): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!,
    sx = bitmap.width / photo.width,
    sy = bitmap.height / photo.height;
  const [x0, y0, x1, y1] = photo.crop;
  ctx.save();
  ctx.beginPath();
  ctx.rect((x0 + 0.5) * sx, (y0 + 0.5) * sy, (x1 - x0) * sx, (y1 - y0) * sy);
  ctx.clip();
  ctx.drawImage(bitmap, 0, 0);
  ctx.restore();
  ctx.globalCompositeOperation = 'destination-out';
  for (const ring of photo.masks) {
    ctx.beginPath();
    ring.forEach(([x, y], i) => {
      if (i) ctx.lineTo((x + 0.5) * sx, (y + 0.5) * sy);
      else ctx.moveTo((x + 0.5) * sx, (y + 0.5) * sy);
    });
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}
export function createPhotoLayer(
  pool: ImagePool,
  pane: 0 | 1,
  onError: (message: string) => void,
) {
  const gpu = new WarpCanvas();
  let canvas = gpu.supported ? gpu.canvas : document.createElement('canvas');
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  let photos: Photo[] = [],
    disposed = false;
  const pending = new Set<string>(),
    failures = new Set<string>();
  const rasters = new Map<string, { bitmap: ImageBitmap; extent: number[] }>();
  const abort = new AbortController();
  let renderQueue: Promise<void> = Promise.resolve();
  const keyFor = (p: Photo) =>
    JSON.stringify([
      p.id,
      p.crop,
      p.masks,
      ...(!gpu.supported ? [p.registration?.h] : []),
    ]);
  const layer = new Layer({
    zIndex: 10,
    render: (frame: FrameState) => {
      if (!gpu.supported && canvas === gpu.canvas) {
        canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;left:0;top:0';
      }
      const width = frame.size[0]!,
        height = frame.size[1]!;
      if (gpu.supported) gpu.begin(width, height);
      else {
        canvas.width = width;
        canvas.height = height;
      }
      const t = frame.pixelToCoordinateTransform;
      const toWorld: Matrix3 = [
        t[0]!,
        t[2]!,
        t[4]!,
        t[1]!,
        t[3]!,
        t[5]!,
        0,
        0,
        1,
      ];
      for (const p of photos) {
        const area = footprint(p);
        if (!p.visible[pane] || !p.registration || !area) continue;
        const extent = bounds(area),
          visible = frame.extent;
        if (
          visible &&
          (extent[2] < visible[0]! ||
            extent[0] > visible[2]! ||
            extent[3] < visible[1]! ||
            extent[1] > visible[3]!)
        )
          continue;
        const key = keyFor(p);
        if (gpu.supported && gpu.has(key))
          gpu.draw(
            key,
            multiply(p.registration.inverse, toWorld),
            p.width,
            p.height,
            p.opacity[pane],
          );
        else if (!gpu.supported && rasters.has(key)) {
          const raster = rasters.get(key)!,
            ctx = canvas.getContext('2d')!,
            a = frame.coordinateToPixelTransform,
            e = raster.extent;
          rasters.delete(key);
          rasters.set(key, raster);
          const sx = (e[2]! - e[0]!) / raster.bitmap.width,
            sy = -(e[3]! - e[1]!) / raster.bitmap.height;
          ctx.setTransform(
            a[0]! * sx,
            a[1]! * sx,
            a[2]! * sy,
            a[3]! * sy,
            a[0]! * e[0]! + a[2]! * e[3]! + a[4]!,
            a[1]! * e[0]! + a[3]! * e[3]! + a[5]!,
          );
          ctx.globalAlpha = p.opacity[pane];
          ctx.drawImage(raster.bitmap, 0, 0);
        } else if (!pending.has(key) && !failures.has(key)) {
          pending.add(key);
          renderQueue = renderQueue
            .then(async () => {
              if (disposed || !photos.some((photo) => keyFor(photo) === key))
                return;
              const bitmap = await pool.bitmap(p, 1024);
              if (disposed) return;
              if (gpu.supported) {
                const masked = maskedBitmap(bitmap, p);
                gpu.upload(key, masked, masked.width, masked.height);
              } else {
                const grid = rasterGrid(p, 1024);
                const copy = await createImageBitmap(bitmap);
                const blob = await warp(photoWarp(p, grid, copy), abort.signal);
                const result = await createImageBitmap(blob);
                if (disposed) {
                  result.close();
                  return;
                }
                const bytes = result.width * result.height * 4;
                let size = [...rasters.values()].reduce(
                  (sum, r) => sum + r.bitmap.width * r.bitmap.height * 4,
                  0,
                );
                while (size + bytes > 128 * 1024 * 1024 && rasters.size) {
                  const oldest = rasters.keys().next().value!;
                  const old = rasters.get(oldest)!;
                  size -= old.bitmap.width * old.bitmap.height * 4;
                  old.bitmap.close();
                  rasters.delete(oldest);
                }
                rasters.set(key, { bitmap: result, extent: grid.bounds });
              }
              layer.changed();
            })
            .catch(() => {
              if (!disposed) {
                failures.add(key);
                onError(
                  '写真の投影表示に失敗しました。切抜き範囲を確認してください。',
                );
              }
            })
            .finally(() => pending.delete(key));
        }
      }
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      return canvas;
    },
  });
  return {
    layer,
    update(next: Photo[]) {
      photos = next;
      const keys = new Set(next.map(keyFor));
      for (const [k, r] of rasters)
        if (!keys.has(k)) {
          r.bitmap.close();
          rasters.delete(k);
        }
      layer.changed();
    },
    dispose() {
      disposed = true;
      abort.abort();
      gpu.dispose();
      rasters.forEach((v) => v.bitmap.close());
    },
  };
}
