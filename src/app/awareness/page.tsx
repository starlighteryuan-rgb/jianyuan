import type { RecordReadModel } from '../../../packages/core/index';
import { getCaptureComposition } from '@/server/capture-composition-root';
import { AwarenessWorkbench } from './awareness-workbench';

export const dynamic = 'force-dynamic';

export default async function AwarenessPage() {
  let records: readonly RecordReadModel[] = [];

  try {
    records = await (await getCaptureComposition()).records.listRecent({ limit: 100 });
  } catch {
    // Keep the Awareness entry available while local storage is unavailable.
  }

  return (
    <main className="route-shell awareness-page">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/records">见渊</a>
        <span aria-hidden="true">→</span>
        <strong>觉察</strong>
      </nav>
      <header className="route-hero">
        <span className="stage-label">觉察</span>
        <h1>回看一些可能的联系。</h1>
        <p className="route-lede">
          AI 只提供临时观察。相关记录、不确定性和回看邀请会留在这里，是否有意义由你决定。
        </p>
      </header>
      <section className="route-workspace" aria-labelledby="awareness-workspace-title">
        <div className="panel-heading">
          <span>主动回看</span>
          <h2 id="awareness-workspace-title">选择一条记录开始觉察</h2>
        </div>
        <AwarenessWorkbench
          records={records.map((record) => ({
            id: record.id,
            verbatim: record.verbatim ?? '（没有可显示的原话）',
            createdAt: record.createdAt.toISOString(),
          }))}
        />
      </section>
    </main>
  );
}
