import { DEMO_EXTERNAL_REFERENCES } from '../_components/demo-fixtures';

export default function ReferencesPage() {
  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前演示路径">
        <a href="/">Start</a><span aria-hidden="true">→</span><a href="/#awareness">Awareness</a><span aria-hidden="true">→</span><strong>References</strong>
      </nav>

      <header className="route-hero">
        <span className="stage-label">3.0 · References</span>
        <h1>借一个角度，不借一个定义。</h1>
        <p className="route-lede">
          外部参考帮助你理解更大的语境。它们不会成为你的个人经历，也不会自动进入关于你的观察。
        </p>
      </header>

      <section className="route-workspace reference-workspace" aria-labelledby="reference-workspace-title">
        <div className="panel-heading">
          <span>External perspectives</span>
          <h2 id="reference-workspace-title">与这次主题相邻的两种视角</h2>
        </div>
        <div className="reference-story-grid">
          {DEMO_EXTERNAL_REFERENCES.map((reference) => (
            <article className="reference-card" key={reference.id}>
              <div className="reference-source"><span className="source-icon">知</span>{reference.source}</div>
              <h3>{reference.title}</h3>
              <p>{reference.excerpt}</p>
              <p className="card-boundary">{reference.perspective}</p>
              <div className="reference-footer"><span>{reference.meta}</span><span>保留为参考</span></div>
            </article>
          ))}
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
        <p>看完外部世界的角度，再回到自己的感受：这条可能的观察，对你来说成立吗？</p>
        <a className="action-link" href="/reflection">继续到 Reflection <span aria-hidden="true">→</span></a>
      </div>
    </main>
  );
}
