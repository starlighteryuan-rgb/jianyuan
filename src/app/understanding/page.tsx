import type { DiscoveryStreamItem } from '../../../packages/core/index';
import { getCoreComposition } from '@/server/capture-composition-root';

interface UnderstandingEntry {
  readonly id: string;
  readonly text: string;
  readonly createdAt: Date;
  readonly recordId: string;
  readonly relationId: string;
  readonly relationQuestion: string;
}

export const dynamic = 'force-dynamic';

export default async function UnderstandingPage() {
  let entries: readonly UnderstandingEntry[] = [];

  try {
    const core = await getCoreComposition();
    const stream = await core.discovery.listStream({ now: new Date(), relationLimit: 100 });
    const relationItems = stream.filter(
      (item): item is Extract<DiscoveryStreamItem, { readonly kind: 'relation' }> => item.kind === 'relation',
    );
    const targets = await Promise.all(
      relationItems.map(async (item) => ({
        item,
        target: await core.reflectionFlow.getRelationTarget(item.subject.id, new Date()),
      })),
    );
    entries = targets
      .flatMap(({ item, target }) =>
        target === null
          ? []
          : target.reflections.map((reflection) => ({
              id: reflection.id,
              text: reflection.verbatim ?? '（没有可显示的原话）',
              createdAt: reflection.createdAt,
              recordId: reflection.recordId,
              relationId: item.subject.id,
              relationQuestion: item.subject.comparisonAxis.question,
            })),
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  } catch {
    // Keep the Understanding surface available while local storage is unavailable.
  }

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置">
        <a href="/records">见渊</a>
        <span aria-hidden="true">→</span>
        <strong>理解</strong>
      </nav>
      <header className="route-hero">
        <span className="stage-label">理解</span>
        <h1>把你自己的理解留在这里。</h1>
        <p className="route-lede">
          这里属于你写下的理解。AI 的观察只是回看背景，不能代替你的表达。
        </p>
      </header>
      <section className="route-workspace" aria-labelledby="understanding-title">
        {entries.length === 0 ? (
          <div className="notice home-empty-state">
            <strong id="understanding-title">还没有可以集中展示的理解。</strong>
            <p>从一次觉察开始，写下你对经历的理解。你的原话会按时间保留在这里。</p>
            <a className="action-link" href="/awareness">
              去觉察中回看 <span aria-hidden="true">→</span>
            </a>
          </div>
        ) : (
          <ol className="user-reflection-list" aria-labelledby="understanding-title">
            <li className="understanding-list-heading" id="understanding-title">我的理解</li>
            {entries.map((entry) => (
              <li key={entry.id} className="understanding-entry">
                <blockquote>{entry.text}</blockquote>
                <p className="hint">
                  <time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toISOString()}</time>
                  {' · 来源记录 '}{entry.recordId}
                </p>
                <p className="hint">来自一次关于“{entry.relationQuestion}”的回看</p>
                <a className="action-link" href={`/reflect/${encodeURIComponent(entry.relationId)}`}>
                  查看这次回看 <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
