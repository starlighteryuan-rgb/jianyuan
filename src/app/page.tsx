import { CaptureForm } from './capture/capture-form';
import { getCoreComposition } from '@/server/capture-composition-root';
import type { RecordReadModel } from '../../packages/core/index';

export const dynamic = 'force-dynamic';

export default async function AwarenessStreamPage() {
  let recentRecords: readonly RecordReadModel[] = [];

  try {
    const core = await getCoreComposition();
    recentRecords = await core.records.listRecent({ limit: 3 });
  } catch {
    // Preserve the existing empty-state experience while storage is unavailable.
  }

  return (
    <main className="product-home" aria-labelledby="home-title">
      <header className="product-home-hero">
        <span className="stage-label">见渊 · Personal Awareness</span>
        <h1 id="home-title">从自己的话开始，看见值得回看的地方。</h1>
        <p className="hero-definition">
          见渊保存你愿意留下的原话，帮助你在长期记录中发现可能值得重访的线索。系统只提出可能性，意义始终由你决定。
        </p>
      </header>
      <section className="home-capture" aria-labelledby="capture-title">
        <div className="panel-heading"><span>记录</span><h2 id="capture-title">记录此刻想留下的一句话</h2></div>
        <CaptureForm />
      </section>
      <section className="home-section" aria-labelledby="recent-title">
        <div className="section-heading"><div><span className="stage-label">记录 / 时间线</span><h2 id="recent-title">最近记录</h2></div><a className="action-link" href="/history">查看全部记录 <span aria-hidden="true">→</span></a></div>
        {recentRecords.length === 0 ? (
          <div className="notice home-empty-state"><strong>还没有记录。</strong><p>你的第一条原话会从这里开始，按原样保留。</p><a className="action-link" href="/capture">创建第一条记录 <span aria-hidden="true">→</span></a></div>
        ) : (
          <div className="notice home-empty-state">
            {recentRecords.map((record) => (
              <article key={record.id}>
                <strong>{record.verbatim ?? '（没有可显示的原话）'}</strong>
                <p><time dateTime={record.createdAt.toISOString()}>{record.createdAt.toISOString()}</time></p>
              </article>
            ))}
          </div>
        )}
      </section>
      <section className="home-section" aria-labelledby="awareness-link-title">
        <div className="section-heading"><div><span className="stage-label">觉察</span><h2 id="awareness-link-title">想重新观察过去的记录？</h2></div><a className="action-link" href="/awareness">进入觉察 <span aria-hidden="true">→</span></a></div>
        <div className="notice home-empty-state"><p>觉察是主动发起的回看空间。记录保存后不会自动启动 AI。</p></div>
      </section>
    </main>
  );
}
