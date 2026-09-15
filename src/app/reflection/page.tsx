import type { DiscoveryStreamItem } from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';

export const dynamic = 'force-dynamic';

export default async function ReflectionPage() {
  let discoveries: readonly DiscoveryStreamItem[] = [];

  try {
    discoveries = await (await getCoreComposition()).discovery.listStream({
      now: new Date(),
      relationLimit: 100,
    });
  } catch {
    // Preserve the existing empty-state experience while storage is unavailable.
  }

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置"><a href="/">见渊</a><span aria-hidden="true">→</span><strong>理解</strong></nav>
      <header className="route-hero"><span className="stage-label">理解</span><h1>把解释权留给你。</h1><p className="route-lede">这里会显示你已经写下的理解。当前还没有可回应的内容，你可以先从一条自己的记录开始。</p></header>
      <section className="route-workspace" aria-labelledby="reflection-empty-title">
        {discoveries.length === 0 ? (
          <div className="notice home-empty-state"><strong id="reflection-empty-title">暂时没有待回看的线索。</strong><p>没有线索时，不需要寻找结论。你的记录会在这里等待未来的回看。</p><a className="action-link" href="/capture">创建一条记录 <span aria-hidden="true">→</span></a></div>
        ) : (
          <div className="notice home-empty-state">
            {discoveries.map((item) => (
              <article key={item.projection.discovery.id}>
                <strong>
                  {item.kind === 'relation'
                    ? item.subject.comparisonAxis.question
                    : item.subject.explanation}
                </strong>
                <p>{item.kind === 'relation' ? item.subject.evidenceSummary : item.subject.mechanism}</p>
                {item.kind === 'relation' ? (
                  <a className="action-link" href={`/reflect/${encodeURIComponent(item.subject.id)}`}>回应这条线索 <span aria-hidden="true">→</span></a>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
