export function App() {
  return (
    <main className="app-shell">
      <header className="app-titlebar">
        <div>
          <p className="eyebrow">Version 0.1</p>
          <h1>水害調査マルチマップ</h1>
        </div>
      </header>
      <section className="empty-state" aria-label="地図読み込み準備中">
        <h2>地図ビューアーを準備しています</h2>
        <p>複数の公式地図を同期して比較する静的Webアプリケーションです。</p>
      </section>
    </main>
  );
}

