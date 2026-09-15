import type { RecordReadModel } from '../../../packages/core/index';
import { getCaptureComposition } from '@/server/capture-composition-root';

export const dynamic = 'force-dynamic';

export default async function HistoryPage() {
  let records: readonly RecordReadModel[] = [];

  try {
    records = await (await getCaptureComposition()).records.listRecent({
      limit: 100,
    });
  } catch {
    // Preserve the existing empty-state experience while storage is unavailable.
  }

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/">见渊</a><span aria-hidden="true">→</span><strong>记录</strong>
      </nav>
      <header className="route-hero">
        <span className="stage-label">记录 / 时间线</span>
        <h1>按时间回到自己的原话。</h1>
        <p className="route-lede">这里会呈现你长期保存的记录。原始表达保持原样，后续线索和回应与它分开显示。</p>
      </header>
      <section className="route-workspace" aria-labelledby="history-records-title">
        {records.length === 0 ? (
          <div className="notice home-empty-state">
            <strong id="history-records-title">还没有记录。</strong>
            <p>创建第一条记录后，它会出现在这里。</p>
            <a className="action-link" href="/capture">创建第一条记录 <span aria-hidden="true">→</span></a>
          </div>
        ) : (
          <div className="notice home-empty-state">
            <strong id="history-records-title">已保存的原话</strong>
            {records.map((record) => (
              <article key={record.id}>
                <p>{record.verbatim ?? '（没有可显示的原话）'}</p>
                <p><time dateTime={record.createdAt.toISOString()}>{record.createdAt.toISOString()}</time></p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
