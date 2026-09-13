'use client';

import { type FormEvent, useEffect, useState } from 'react';

import { DEMO_DISCOVERIES } from './demo-fixtures';

const reflectionOptions = ['有共鸣', '不确定', '暂时不适用', '先放一放'] as const;

export function DemoReflectionJourney() {
  const [capturedWords, setCapturedWords] = useState('');
  const [selected, setSelected] = useState<(typeof reflectionOptions)[number] | null>(null);
  const [note, setNote] = useState('');
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setCapturedWords(window.sessionStorage.getItem('personal-awareness-demo-draft') ?? '');
  }, []);

  function submitReflection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected && !note.trim()) return;
    setComplete(true);
  }

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前演示路径">
        <a href="/">Start</a><span aria-hidden="true">→</span><a href="/#awareness">Awareness</a><span aria-hidden="true">→</span><a href="/references">References</a><span aria-hidden="true">→</span><strong>Reflection</strong>
      </nav>

      <header className="route-hero">
        <span className="stage-label">4.0 · Reflection</span>
        <h1>最后一段解释，留给你。</h1>
        <p className="route-lede">
          系统可以提出一个可能的观察，但只有你能判断它此刻是否有意义。没有标准答案，也不要求立即回应。
        </p>
      </header>

      <section className="route-workspace" aria-labelledby="reflection-workspace-title">
        {!complete ? (
          <>
            <div className="panel-heading">
              <span>Possible pattern</span>
              <h2 id="reflection-workspace-title">{DEMO_DISCOVERIES[0].title}</h2>
            </div>
            <div className="reflection-context">
              <p>{DEMO_DISCOVERIES[0].summary}</p>
              {capturedWords ? <blockquote className="captured-words">{capturedWords}</blockquote> : null}
            </div>
            <form className="demo-reflection-form" onSubmit={submitReflection}>
              <label htmlFor="reflection-demo-note">回应这条线索</label>
              <textarea
                aria-describedby="reflection-demo-guardrail"
                className="demo-textarea"
                id="reflection-demo-note"
                onChange={(event) => setNote(event.target.value)}
                placeholder="写下你此刻想到的回应……"
                value={note}
              />
              <p className="reflection-guardrail" id="reflection-demo-guardrail">
                你的回应由你表达。页面不会自动分析，也不会把“可能”升级成“事实”。
              </p>
              <fieldset className="reflection-choice-set">
                <legend>也可以先标记此刻的位置</legend>
                <div className="reflection-options">
                  {reflectionOptions.map((option) => (
                    <button
                      aria-pressed={selected === option}
                      className="selection-button"
                      key={option}
                      onClick={() => setSelected(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button className="action-button action-button-primary" disabled={!selected && !note.trim()} type="submit">保存回应</button>
            </form>
          </>
        ) : (
          <div className="reflection-result" aria-live="polite">
            <span className="result-label">Personal Reflection · Demo only</span>
            <h2 id="reflection-workspace-title">回应已记录。</h2>
            <p>这不是结论，而是你此刻对这条线索的理解。</p>
            {selected ? <p><strong>当前感受：</strong>{selected}</p> : null}
            {note.trim() ? <blockquote className="captured-words">{note.trim()}</blockquote> : null}
            <p className="reflection-guardrail">这是当前页面内的演示状态，不会发送请求或保存到数据库。</p>
          </div>
        )}
      </section>

      <div className="route-next">
        <p>一次回应可以结束，也可以成为以后继续观察的起点。产品不会替你决定何时继续。</p>
        <a className="action-link" href="/">回到开始 <span aria-hidden="true">→</span></a>
      </div>
    </main>
  );
}
