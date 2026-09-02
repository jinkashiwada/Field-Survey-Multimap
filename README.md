# 水害調査マルチマップ

水害時の痕跡調査、事前調査、現地踏査を行う研究者・学生・技術者向けに、国土地理院とハザードマップポータルの地理空間情報を複数画面で同期比較する静的Webアプリケーションです。Version 0.1はバックエンド、認証、APIキーを使用せず、GitHub Pagesだけで動作します。

## 主な機能

- 1画面、同期2画面、PC・広いタブレットでの同期4画面
- ペインごとに独立した背景地図、重畳レイヤー、透明度、凡例・出典
- 現在地と位置精度円、中心座標、国土地理院DEMによる概算標高
- localStorageへ保存する調査ピンの追加・編集・移動・削除
- ローカルKML・GeoJSONの読込み、ドラッグ＆ドロップ、KML・GeoJSON出力
- 表示状態を保存したhash URLの共有（ピン、現在地、読込みGISは含めない）

## 動作環境

iPhone・iPad・Android・Windows・macOS上の、現在サポートされているSafari、Chrome、Edge、Firefoxを対象にします。現在地にはHTTPSまたはlocalhostとブラウザー権限が必要です。4画面は1024×700 CSS px以上で利用できます。

## 開発を始める

Node.js 24（CIと同じメジャーバージョン）とnpmを用意します。Gitから取得した直後やCIでは、`package-lock.json`どおりに再現するため `npm install` ではなく次を使います。

```sh
npm ci
npm run dev
```

開発サーバーが表示するlocalhostのURLを開きます。変更前後の一括検証と本番ビルドは次のとおりです。

```sh
npm run check
npm run test:e2e
npm run build
```

`npm run check` はlint、型検査、単体テスト、buildを順番に実行します。E2Eを初めて実行する端末では、先に `npx playwright install chromium` を実行してください。本番成果物は `dist/` に生成されます。

## 使い方

ツールバーから画面数またはプリセットを選び、各画面の「レイヤー」で背景・重畳・透明度を設定します。2画面は端末の向きに合わせて上下または左右へ切り替わります。狭い画面で4画面URLや「痕跡調査総覧」を開くと、先頭2画面へ安全に縮退します。

「現在地」は押した時だけ `getCurrentPosition` を呼び、常時追跡しません。位置は外部へ送らず、URLにも保存しません。中心標高は概況確認用であり、現地測量値ではありません。

「ピン追加」で地図中心にピンを作成します。ピンはこのブラウザーの `flood-multimap:pins:v1` に保存されます。ブラウザーデータを消すと失われます。

「ファイル読込み」または表示パネルへのドロップで、EPSG:4326のKML・GeoJSONを読み込みます。最大20 MB・50,000地物で、KMZと外部URLは対象外です。「全地物へ移動」は読込み後に利用者が選択します。KML／GeoJSON出力は、保存ピンと読み込んだ地物をまとめてEPSG:4326で保存します。

## GitHub Pagesへ公開する

1. GitHubへリポジトリを作成し、このブランチをpushしてmainへ反映します。
2. GitHubの **Settings → Pages → Source → GitHub Actions** を選択します。
3. mainへpushするか、Actionsの「Deploy GitHub Pages」を手動実行します。
4. 通常は `https://<username>.github.io/<repository-name>/`、`username.github.io` リポジトリは `https://<username>.github.io/` で公開されます。

Actionsでは `GITHUB_REPOSITORY` からViteのbaseを決めます。リポジトリ名を変更した場合は再デプロイしてください。独自ドメインではRepository Variable `PAGES_BASE_PATH` を `/` に設定します。明示設定する場合は先頭・末尾 `/` を含む `/<repository-name>/` 形式を推奨します。

## データ出典

- 背景・地形：国土地理院「[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html)」
- 浸水想定等：ハザードマップポータルサイト「[重ねるハザードマップのデータについて](https://disaportal.gsi.go.jp/hazardmapportal/hazardmap/copyright/opendata.html)」
- 概算標高：国土地理院「[標高タイルの詳細仕様](https://maps.gsi.go.jp/development/demtile.html)」

出典は地図内のOpenLayers Attributionと「設定・出典」でも確認できます。各データの利用条件は提供元の最新情報に従ってください。

## 利用上の注意・免責

本ツールは公式の避難判断、防災情報、安全判断、現地測量を代替しません。生命・財産に関する判断には、自治体・気象庁・国土交通省等の最新の公式情報を確認してください。外部データは地域・縮尺・整備時期が異なり、最新性・完全性・可用性を保証しません。通信障害時もUIは操作できますが、未取得タイルは表示されません。

## 今後のロードマップ

観測所やリアルタイム情報は、公式で安定した公開仕様と利用条件を確認できたものだけを将来追加します。外部URL GIS読込み、KMZ、静的河川データの地域別配布候補は [docs/roadmap.md](docs/roadmap.md) を参照してください。コードの著作権者とライセンスは未決定のため、LICENSEはまだ置いていません。
