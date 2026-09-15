export default function ReferencesPage() {
  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/">见渊</a><span aria-hidden="true">→</span><strong>参考资料</strong>
      </nav>

      <header className="route-hero">
        <span className="stage-label">参考资料</span>
        <h1>借一个角度，不借一个定义。</h1>
        <p className="route-lede">
          外部参考帮助你理解更大的语境。它们不会成为你的个人经历，也不会自动进入关于你的观察。
        </p>
      </header>

      <section className="route-workspace reference-workspace" aria-labelledby="reference-workspace-title">
        <div className="panel-heading">
          <span>外部参考</span>
          <h2 id="reference-workspace-title">外部视角会在你主动需要时出现</h2>
        </div>
        <div className="notice home-empty-state">
          <strong>还没有外部参考。</strong>
          <p>当你主动选择一个资料来源并导入内容时，参考资料会与个人记录分开保存。</p>
        </div>

        <aside className="boundary-panel" aria-labelledby="reference-boundary-title">
          <h3 id="reference-boundary-title">边界保持可见</h3>
          <dl className="boundary-comparison">
            <div><dt>它们可以</dt><dd>提供背景、相似经验和新的提问方式。</dd></div>
            <div><dt>它们不可以</dt><dd>替你解释经历、定义身份，或成为个人证据。</dd></div>
          </dl>
        </aside>
      </section>

      <div className="route-next">
        <p>外部参考不是使用见渊的前提。你可以继续记录，或回看已经出现的线索。</p>
        <a className="action-link" href="/capture">创建一条记录 <span aria-hidden="true">→</span></a>
      </div>
    </main>
  );
}
