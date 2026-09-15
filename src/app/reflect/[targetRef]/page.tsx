/**
 * Reflection panel (ENGINEERING_CONTRACT §15, §21, §22, §23, §33, §36).
 *
 * A Server Component. The most contract-sensitive of the three surfaces, because
 * this is where the user answers back — and the shape of the form decides what
 * their answer can become.
 *
 * FOUR CONSTRAINTS THAT LIVE IN THIS MARKUP:
 *
 *   1. TWO SEPARATE FORMS. The position buttons post to `submitPosition`; the
 *      prose box posts to `submitReflection`. §21 treats a click and free text as
 *      different acts, so they do not share an endpoint and a click has no field
 *      it could travel in as prose (§15 — agreement is not evidence).
 *
 *   2. POSITIONS COME FROM THE DOMAIN. The buttons are rendered by mapping over
 *      the domain's own response constant rather than hardcoded labels, so the
 *      UI cannot offer a position the routing logic does not recognise.
 *
 *   3. HYPOTHESES ARE PREFERENCE-GATED AND CAPPED. §33's `hypothesisVisibility`
 *      decides whether they appear at all; the domain's cap decides how many.
 *
 *   4. NO SCORES, NO RANKING. As on the stream: support is categorical, and
 *      nothing is ordered by it (§36, INV-09).
 */

import {
  submitLeaveForNow,
  submitPosition,
  submitProse,
} from '../../actions/reflection';
import {
  REFLECTION_SUBMIT_CODES,
  type ReflectionSubmitCode,
} from '../../actions/reflection-submit-code';
import { REFLECTION_RESPONSES } from '../../../../packages/core/index';
import {
  getCoreComposition,
  type CoreComposition,
} from '@/server/capture-composition-root';
import {
  createAIReflectionInvitation,
  type AIReflectionInvitation,
} from '@/server/ai-core-experience';

const label = (value: string): string => value.replace(/_/g, ' ');

/**
 * What each submission outcome means to the user.
 *
 * The action reports only a code; the wording lives here. Failures get their
 * own entries because a storage failure that looked like a save is how a user
 * loses words they already wrote.
 */
const SUBMITTED_MESSAGES: Readonly<Record<ReflectionSubmitCode, {
  readonly message: string;
  readonly tone: 'success' | 'notice' | 'alert';
}>> = {
  'reflection-saved': {
    message: '已保存。你写的这段话已按原样存入记录，刷新后仍能读回。',
    tone: 'success',
  },
  'position-recorded': {
    message: '已记下你的选择。点击不会创建记录，也不会形成长期联系。',
    tone: 'success',
  },
  'left-for-now': {
    message: '已先放下。这不是一种判断，也没有产生任何结论。',
    tone: 'notice',
  },
  rejected: {
    message: '这个选项无法识别，没有保存任何立场。',
    tone: 'alert',
  },
  'target-missing': {
    message: '这条回看线索已不存在，没有保存任何内容。',
    tone: 'alert',
  },
  'not-stored': {
    message: '没有可保存的内容，因此没有创建记录。',
    tone: 'notice',
  },
  unavailable: {
    message: '保存未完成。你写的内容没有存储，请重试。',
    tone: 'alert',
  },
};

export default async function ReflectionPanelPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly targetRef: string }>;
  readonly searchParams?: Promise<{
    readonly submitted?: string | readonly string[];
  }>;
}) {
  const { targetRef: raw } = await params;
  const targetRef = decodeURIComponent(raw);

  let services: CoreComposition;

  try {
    services = await getCoreComposition();
  } catch {
    return (
      <main>
        <h1>理解</h1>
        <div className="notice">
          <p>
            <strong>本地数据暂时不可用。</strong> 现在无法读取或保存内容。
          </p>
        </div>
      </main>
    );
  }

  const target = await services.reflectionFlow.getRelationTarget(
    targetRef,
    new Date(),
  );

  if (target === null) {
    return (
      <main>
        <h1>理解</h1>
        <div className="notice">
          <p>
            <strong>没有找到这条联系。</strong> 当前没有可以查看的内容：{' '}
            <code>{targetRef}</code>.
          </p>
          <p className="faint">
            <a href="/awareness">回到觉察</a>
          </p>
        </div>
      </main>
    );
  }

  const { relation: claim, preference } = target;

  // Read back through Core, never from React state: a reload must show what is
  // actually persisted. `Array.isArray` keeps the explicit legacy fallback
  // graph (whose adapter predates these fields) from crashing the page —
  // degrading to "nothing to show" rather than misreporting stored words.
  const reflections = Array.isArray(target.reflections)
    ? target.reflections
    : [];
  const userPosition = target.userPosition ?? 'none';

  const submitted = await searchParams;
  const submittedCode = Array.isArray(submitted?.submitted)
    ? submitted.submitted[0]
    : submitted?.submitted;
  // Only a code this page knows can produce wording, so an invented or stale
  // query value renders no banner at all rather than a misleading one.
  const submittedOutcome =
    submittedCode !== undefined &&
    (REFLECTION_SUBMIT_CODES as readonly string[]).includes(submittedCode)
      ? SUBMITTED_MESSAGES[submittedCode as ReflectionSubmitCode]
      : null;

  let aiInvitation: AIReflectionInvitation;

  try {
    aiInvitation = await createAIReflectionInvitation(services, claim.id);
  } catch {
    aiInvitation = {
      status: 'unavailable',
      question: null,
      message: 'AI 回看问题暂时不可用。你仍可直接写下自己的理解。',
    };
  }

  return (
      <main className="understanding-detail">
        <h1>理解</h1>
        <p className="lede">
        这里先放你自己的话。系统提供的观察只是背景，是否继续理解这段经历由你决定。
      </p>

      {submittedOutcome === null ? null : (
        <div
          className="notice"
          data-tone={submittedOutcome.tone}
          role={submittedOutcome.tone === 'alert' ? 'alert' : 'status'}
        >
          <p>{submittedOutcome.message}</p>
        </div>
      )}

      <article className="card understanding-context">
        <div className="card-head">
          <strong>这次回看：{claim.question}</strong>
          <span
            className={
              claim.supportLevel === null
                ? 'tag tag-unscored'
                : 'tag tag-level'
            }
          >
            {claim.supportLevel === null
              ? '暂未评估'
              : `当前状态：${label(claim.supportLevel)}`}
          </span>
        </div>
        <p className="card-body">{claim.evidenceSummary}</p>
        {claim.supportLevel === null ? (
          <p className="hint">
            这里还没有评估，不代表这段经历没有意义。
          </p>
        ) : null}
      </article>

      <section
        className="ai-reflection-invitation"
        aria-labelledby="ai-reflection-title"
      >
        <div className="ai-reflection-invitation-head">
          <p className="eyebrow">觉察邀请</p>
          <h2 id="ai-reflection-title">一个可以继续思考的问题</h2>
        </div>
        {aiInvitation.status === 'ready' ? (
          <blockquote>{aiInvitation.question}</blockquote>
        ) : null}
          <p className="hint">{aiInvitation.message}</p>
      </section>

      {/*
        THE USER'S OWN REFLECTIONS — kept in a separate section from the AI
        invitation above, because they are different kinds of thing: a question
        the system offered, versus words the user wrote (§21, §22). Read back
        from persisted storage through Core, so a reload shows them and History
        shows the same single fact.
      */}
      <section
        className="user-reflections"
        aria-labelledby="user-reflections-title"
      >
        <div className="ai-reflection-invitation-head">
          <p className="eyebrow">我的理解</p>
          <h2 id="user-reflections-title">你已经写下的理解</h2>
        </div>
        {reflections.length === 0 ? (
          <p className="hint">
            还没有。写下你自己的话之后，它会保存在这里，刷新后仍然能读回。
          </p>
        ) : (
          <ol className="user-reflection-list">
            {reflections.map((reflection) => (
              <li key={reflection.id}>
                <blockquote>
                  {reflection.verbatim ?? '（没有可显示的原话）'}
                </blockquote>
                <p className="hint">
                  <time dateTime={reflection.createdAt.toISOString()}>
                    {reflection.createdAt.toISOString()}
                  </time>
                  {' · '}
                  {label(reflection.meaningCommitment)}
                  {reflection.currentEffect === 'superseded' ? (
                    <span className="tag tag-unscored">
                      {' · '}
                      {label(reflection.currentEffect)}
                    </span>
                  ) : null}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/*
        FORM ONE — a position. Creates no Record; adjusts state only (§21).
        One button per domain-recognised response, so the UI cannot invent one.
      */}
      <h2>这段回看与你的经历接近吗？</h2>
      {/*
        The position is shown as a recorded stance rather than as a pressed
        button. §16 projects four responses onto four positions LOSSILY:
        `questioned` and `uncertain` both become `uncertain`, so the stored
        value cannot say which of the two was clicked. Highlighting either
        would state something the data does not support.
      */}
      <p
        className="hint"
        data-tone="recorded-position"
        aria-live="polite"
      >
        {userPosition === 'none'
          ? '还没有记下立场。'
          : `当前记下的态度：${label(userPosition)}。它只表示你的态度，不会替你形成结论。`}
      </p>
      <form action={submitPosition}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <div className="button-row">
          {REFLECTION_RESPONSES.map((response) => (
            <button key={response} name="response" value={response} type="submit">
              {label(response)}
            </button>
          ))}
        </div>
        <p className="hint">
          这里记录你当下的态度，不会把一次点击变成长期联系。
        </p>
      </form>

      {/*
        A third form, and a separate action again. §21 requires that stepping
        away not read as a verdict, so deferral carries no `response` at all
        rather than a "neutral" one — there is no such position.
      */}
      <form action={submitLeaveForNow}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <div className="button-row">
          <button type="submit">先放在这里</button>
        </div>
        <p className="hint">
          这不是判断，也不会因为暂时离开就形成结论。
        </p>
      </form>

      {/*
        FORM TWO — the user's own words. A separate endpoint entirely, so a click
        can never arrive as prose (§15, §21).
      */}
      <h2>你还想补充什么？</h2>
      <form action={submitProse}>
        <input type="hidden" name="targetRef" value={claim.id} />
        <label htmlFor="freeText">
          <span className="faint">
             按你的原话保存，不由系统替你改写。
          </span>
          <textarea
            id="freeText"
            name="freeText"
             placeholder="写下你自己的理解（可选）"
          />
        </label>
        <div className="button-row">
          <button className="primary" type="submit">
             保存我的理解
          </button>
        </div>
      </form>

      <div className="card-foot">
        <span className="faint">
           回看设置：{label(preference.hypothesisVisibility)}
        </span>
         <a href="/awareness">回到觉察</a>
      </div>
    </main>
  );
}
