import type { DiscoveryStreamItem } from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';

export const dynamic = 'force-dynamic';

export default async function ExplorationPage() {
  let discoveries: readonly DiscoveryStreamItem[] = [];
  let relationTargets: Readonly<Record<string, {
    readonly records: readonly { readonly id: string; readonly verbatim: string | null }[];
    readonly reflections: readonly { readonly id: string; readonly text: string; readonly createdAt: Date }[];
  }>> = {};

  try {
    const core = await getCoreComposition();
    discoveries = await core.discovery.listStream({
      now: new Date(),
      relationLimit: 100,
    });
    const relations = discoveries.filter((item) => item.kind === 'relation');
    relationTargets = Object.fromEntries(
      await Promise.all(
        relations.map(async (item) => {
          const target = await core.reflectionFlow.getRelationTarget(item.subject.id, new Date());
          const records = await Promise.all(
            item.subject.recordRefs.map(async (recordId) => {
              const record = await core.records.getById(recordId);
              return record === null ? null : { id: record.id, verbatim: record.verbatim };
            }),
          );
          return [item.subject.id, {
            records: records.filter((record): record is { readonly id: string; readonly verbatim: string | null } => record !== null),
            reflections: target?.reflections.map((reflection) => ({
              id: reflection.id,
              text: reflection.verbatim ?? '（没有可显示的原话）',
              createdAt: reflection.createdAt,
            })) ?? [],
          }];
        }),
      ),
    );
  } catch {
    // Keep the product shell available while local storage is unavailable.
  }

  const relations = discoveries.filter((item) => item.kind === 'relation');

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/records">见渊</a>
        <span aria-hidden="true">→</span>
        <strong>探索</strong>
      </nav>
      <header className="route-hero">
        <span className="stage-label">探索</span>
        <h1>回看已经形成的长期联系。</h1>
        <p className="route-lede">
          这里只呈现经过你参与后形成的联系。它们是继续观察的方向，不是关于你的定义。
        </p>
      </header>
      <section className="route-workspace" aria-labelledby="exploration-title">
        {relations.length === 0 ? (
          <div className="notice home-empty-state">
            <strong id="exploration-title">还没有可回看的长期联系。</strong>
            <p>当你写下自己的理解，并形成值得长期关注的联系后，它会出现在这里。</p>
            <a className="action-link" href="/awareness">
              去觉察中回看 <span aria-hidden="true">→</span>
            </a>
          </div>
        ) : (
          <div className="notice home-empty-state">
            <strong id="exploration-title">已形成的长期联系</strong>
            {relations.map((item) => (
              <article key={item.projection.discovery.id}>
                <div className="exploration-provenance">
                  {relationTargets[item.subject.id]?.reflections.map((reflection) => (
                    <blockquote key={reflection.id}>
                      <strong>我的理解</strong>
                      <span>{reflection.text}</span>
                      <time dateTime={reflection.createdAt.toISOString()}>{reflection.createdAt.toISOString()}</time>
                    </blockquote>
                  ))}
                  <span>来源记录</span>
                  {relationTargets[item.subject.id]?.records.map((record) => (
                    <blockquote key={record.id}>{record.verbatim ?? '（没有可显示的原话）'}</blockquote>
                  ))}
                </div>
                <strong>{item.subject.comparisonAxis.question}</strong>
                <p>{item.subject.evidenceSummary}</p>
                <a
                  className="action-link"
                  href={`/reflect/${encodeURIComponent(item.subject.id)}`}
                >
                  回看这条联系 <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
