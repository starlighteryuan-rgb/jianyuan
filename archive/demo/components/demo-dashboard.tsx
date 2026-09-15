'use client';

import { type FormEvent, useState } from 'react';

import {
  LIUKANSHAN_ANIMATION_BY_STATE,
  type LiukanshanPresentationState,
} from './liukanshan-character';
import { DEMO_DISCOVERIES, DEMO_EXTERNAL_REFERENCES } from './demo-fixtures';

const mascotStates: readonly {
  readonly value: LiukanshanPresentationState;
  readonly label: string;
}[] = [
  { value: 'welcome', label: '欢迎' },
  { value: 'idle', label: '待机' },
  { value: 'processing', label: '整理' },
  { value: 'exploring', label: '探索' },
  { value: 'resting', label: '停一停' },
  { value: 'celebrating', label: '完成' },
];

const agentMessages: Record<LiukanshanPresentationState, string> = {
  welcome: '从一句你真正想留下的话开始。',
  idle: '这里不催促你，也不会替你下结论。',
  processing: '演示状态：把已有记录整理成可回看的线索。',
  exploring: '演示状态：看看外部世界提供了哪些角度。',
  resting: '先停一下。没有任何结论需要现在做。',
  celebrating: '演示状态：路径走完了，意义仍由你决定。',
};

export function DemoDashboard() {
  const [draft, setDraft] = useState('');
  const [mascotState, setMascotState] = useState<LiukanshanPresentationState>('welcome');

  function beginJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const words = draft.trim();
    if (!words) return;

    window.sessionStorage.setItem('personal-awareness-demo-draft', words);
    window.location.assign('/capture');
  }

  return (
    <main className="experience-shell">
      <section className="journey-hero" aria-labelledby="journey-title">
        <div className="journey-hero-copy">
          <span className="stage-label">1.0 · Capture</span>
          <h1 id="journey-title">从自己的话开始。</h1>
          <p className="hero-definition">
            见渊（Personal Awareness）保存你愿意留下的原话，在记录之间提出可能值得回看的线索，再把解释权交还给你。
          </p>
          <ul className="hero-principles" aria-label="产品边界">
            <li>不是聊天机器人，而是一条从表达走向反思的路径。</li>
            <li>不判断你是什么样的人，只提示什么也许值得重看。</li>
            <li>外部材料提供视角，不会成为你的身份或个人证据。</li>
          </ul>
        </div>

        <div className="hero-start-panel">
          <div className="panel-heading">
            <span>Start with your words</span>
            <h2>写下一句你想在以后重新看见的话</h2>
          </div>
          <form className="demo-capture-form" onSubmit={beginJourney}>
            <label htmlFor="home-demo-capture">你的原话</label>
            <textarea
              className="demo-textarea"
              id="home-demo-capture"
              maxLength={800}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="例如：我发现自己面对一个很大的任务时，总会先把第一步写得非常具体……"
              value={draft}
            />
            <p className="demo-helper">写事实、感受或一句没想清楚的话都可以。</p>
            <div className="demo-form-actions">
              <p className="privacy-note">竞赛演示 · 文字只保留在当前浏览器会话</p>
              <button className="action-button action-button-primary" disabled={!draft.trim()} type="submit">
                开始这次回看 <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>

          <div className="hero-companion">
            <img
              alt=""
              draggable={false}
              height={144}
              src={LIUKANSHAN_ANIMATION_BY_STATE[mascotState]}
              width={144}
            />
            <p><strong>刘看山 · 演示向导</strong>{agentMessages[mascotState]}</p>
            <div className="companion-controls" aria-label="刘看山演示状态">
              {mascotStates.map((option) => (
                <button
                  aria-pressed={option.value === mascotState}
                  className="state-button"
                  key={option.value}
                  onClick={() => setMascotState(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <ol className="journey-index" aria-label="完整产品路径">
        <li><a href="/capture"><span>01</span><strong>Capture</strong><small>保存你愿意留下的原话</small></a></li>
        <li><a href="#awareness"><span>02</span><strong>Awareness</strong><small>看见可能值得回看的线索</small></a></li>
        <li><a href="/references"><span>03</span><strong>References</strong><small>引入外部视角与背景</small></a></li>
        <li><a href="/reflection"><span>04</span><strong>Reflection</strong><small>由你决定这意味着什么</small></a></li>
      </ol>

      <section className="story-section" id="awareness" aria-labelledby="awareness-title">
        <div className="story-heading">
          <span className="stage-label">2.0 · Awareness</span>
          <h2 id="awareness-title">系统可以指出值得回看的地方。</h2>
          <p>下面是保留给评委理解产品的演示快照。它展示可能的观察与待检验解释，而不是对一个人的诊断。</p>
        </div>

        <dl className="demo-snapshot-strip" aria-label="演示数据快照">
          <div><dt>可能的观察</dt><dd>02</dd></div>
          <div><dt>演示记录</dt><dd>05</dd></div>
          <div><dt>外部参考</dt><dd>02</dd></div>
          <div><dt>呈现上限</dt><dd>L1</dd></div>
        </dl>
        <p className="snapshot-disclaimer">Competition fixture · 数量用于说明产品结构，不代表真实用户分析。</p>

        <div className="discovery-story">
          {DEMO_DISCOVERIES.map((discovery) => (
            <article className="discovery-card" key={discovery.id}>
              <div className="card-topline"><span>{discovery.eyebrow}</span><span aria-hidden="true">↗</span></div>
              <h3>{discovery.title}</h3>
              <p>{discovery.summary}</p>
              <p className="card-boundary">{discovery.boundary}</p>
              <div className="card-action-row">
                <span className={'state-pill ' + discovery.state}>{discovery.stateLabel}</span>
                <a href="/reflection">由我回应</a>
              </div>
            </article>
          ))}
        </div>
        <div className="section-action"><a className="action-link" href="/references">看看外部视角 <span aria-hidden="true">→</span></a></div>
      </section>

      <section className="story-section" id="references" aria-labelledby="references-title">
        <div className="story-heading">
          <span className="stage-label">3.0 · References</span>
          <h2 id="references-title">外部观点可以靠近，但不会越过边界。</h2>
          <p>参考材料帮助你换一个角度提问。它和个人记录分开保存，也不会定义你是谁。</p>
        </div>

        <div className="reference-story-layout">
          <div className="reference-story-grid">
            {DEMO_EXTERNAL_REFERENCES.map((reference) => (
              <article className="reference-card" key={reference.id}>
                <div className="reference-source"><span className="source-icon">知</span>{reference.source}</div>
                <h3>{reference.title}</h3>
                <p>{reference.excerpt}</p>
                <p className="card-boundary">{reference.perspective}</p>
                <div className="reference-footer"><span>{reference.meta}</span><a href="/references">查看参考</a></div>
              </article>
            ))}
          </div>
          <aside className="boundary-panel" aria-labelledby="boundary-title">
            <h3 id="boundary-title">两种材料，不同位置</h3>
            <dl className="boundary-comparison">
              <div><dt>External Reference</dt><dd>来自外部世界的背景、观点与提问方式。</dd></div>
              <div><dt>Personal Reflection</dt><dd>由你表达的回应，只代表你此刻愿意给出的理解。</dd></div>
            </dl>
          </aside>
        </div>
        <div className="section-action"><a className="action-link" href="/references">进入 References <span aria-hidden="true">→</span></a></div>
      </section>

      <section className="reflection-callout" aria-labelledby="reflection-title">
        <img
          alt=""
          className="reflection-mascot"
          draggable={false}
          height={220}
          src={LIUKANSHAN_ANIMATION_BY_STATE.resting}
          width={220}
        />
        <div>
          <span className="stage-label">4.0 · Reflection</span>
          <h2 id="reflection-title">线索到这里结束。接下来由你回答。</h2>
          <p>你可以认同、不确定、暂时不适用，或先放一放。回应不会把可能性变成事实。</p>
          <a className="action-link" href="/reflection">回应这条线索 <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  );
}
