import type { RecordReadModel } from '../../../packages/core/index';
import { getCaptureComposition } from '@/server/capture-composition-root';
import { CaptureForm } from '../capture/capture-form';

export const dynamic = 'force-dynamic';

export default async function RecordsPage() {
  let records: readonly RecordReadModel[] = [];

  try {
    records = await (await getCaptureComposition()).records.listRecent({ limit: 100 });
  } catch {
    // Keep the Record surface usable while local storage is unavailable.
  }

  return (
    <main className="route-shell records-page">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/records">见渊</a>
        <span aria-hidden="true">→</span>
        <strong>记录</strong>
      </nav>
      <header className="route-hero">
        <span className="stage-label">记录</span>
        <h1>先留下自己的经历。</h1>
        <p className="route-lede">
          这里保存你愿意留下的原话。记录页只处理事实，不在保存时替你解释。
        </p>
      </header>
      <section className="route-workspace" aria-labelledby="record-capture-title">
        <div className="panel-heading">
          <span>新建记录</span>
          <h2 id="record-capture-title">写下此刻想保留的一句话</h2>
        </div>
        <CaptureForm />
      </section>
      <section className="route-workspace" aria-labelledby="record-timeline-title">
        <div className="panel-heading">
          <span>时间线</span>
          <h2 id="record-timeline-title">按时间回到自己的原话</h2>
        </div>
        {records.length === 0 ? (
          <div className="notice home-empty-state">
            <strong>还没有记录。</strong>
            <p>先写下此刻发生的一件事，它会按原样保留在这里。</p>
          </div>
        ) : (
          <div className="notice home-empty-state">
            {records.map((record) => (
              <article key={record.id}>
                <strong>{record.verbatim ?? '（没有可显示的原话）'}</strong>
                <p><time dateTime={record.createdAt.toISOString()}>{record.createdAt.toISOString()}</time></p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
