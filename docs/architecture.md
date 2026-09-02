# アーキテクチャ

## 全体

React 19、TypeScript、Vite、OpenLayers本体、CSS Gridで構成する1ページの静的Webアプリケーションである。React RouterやOpenLayers用Reactラッパーは使わない。`AppContext` と `useReducer` が表示レイアウト・レイヤー状態・通知を管理し、ViewやVectorSourceのようなOpenLayersオブジェクトはContext内で一度だけ生成する。

## OpenLayers

- ペインごとに別の `Map`、TileLayer、VectorLayerを作る。
- 全Mapが同じ `View` を参照して中心、解像度、ズーム、回転を完全同期する。
- XYZ SourceはレイヤーID単位のキャッシュで共有し、4画面時の同一タイル要求を再利用する。
- ピン、現在地、読込みGISは用途別の共有VectorSourceを持ち、Mapごとに別のVectorLayerから描画する。
- ペインのResizeObserverで `updateSize()` を呼び、unmount時はobserver・イベントを解除して `setTarget(undefined)` とする。
- Raster、GIS、ピン、現在地はz-index順の別レイヤーとし、一つのタイル障害が他を止めない。

## 状態とデータフロー

表示状態はReducerからUIとペインへ一方向に渡す。View移動はOpenLayers内部で同期し、moveend後だけReactの中心ステータスを更新する。hash更新は250ms、DEMは300msデバウンスし、`history.replaceState` で履歴を増やさない。

ピンは `flood-multimap:pins:v1` へJSON保存する。破損・旧形式は空配列へフォールバックする。KML・GeoJSONはメモリー上だけに保持し、ページ再読込み時には消える。現在地・ピン・GIS地物はhashへ保存しない。

## DEM

中心緯度経度からWeb MercatorのXYZ・256px内座標を求め、DEM1A、5A、5B、5C、10Bの順でPNGを取得する。RGBを公式式で復号し、NA・HTTP・CORS・画像復号失敗は次候補または「取得不可」へフォールバックする。AbortControllerが古い移動の要求を破棄し、タイルPromiseキャッシュが同一取得を再利用する。

## 責務分離

`config/` は公式レイヤーとプリセット、`domain/` は永続可能な型、`components/` はUI、`hooks/` はブラウザー・Reactライフサイクル、`services/` はOpenLayers生成・DEM・保存・ファイル変換・URL codecを担当する。外部データの可用性をCIの前提にしない。
