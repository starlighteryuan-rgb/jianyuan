'use client';

import { type FormEvent, useEffect, useState } from 'react';

export function DemoCaptureJourney() {
  const [draft, setDraft] = useState('');
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    const savedDraft = window.sessionStorage.getItem('personal-awareness-demo-draft');
    if (savedDraft) setDraft(savedDraft);
  }, []);

  function captureWords(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const words = draft.trim();
    if (!words) return;

    window.sessionStorage.setItem('personal-awareness-demo-draft', words);
    setDraft(words);
    setCaptured(true);
  }

  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前演示路径">
        <a href="/">Start</a><span aria-hidden="true">→</span><strong>Capture</strong>
      </nav>

      <header className="route-hero">
        <span className="stage-label">1.0 · Capture</span>
        <h1>先留下原话，不急着解释。</h1>
        <p className="route-lede">
          Capture 只接住你愿意记录的表达。它不是聊天，不追问，也不会自动把一句话变成关于你的判断。
        </p>
      </header>

      <section className="route-workspace" aria-labelledby="capture-workspace-title">
        {!captured ? (
          <>
            <div className="panel-heading">
              <span>Demo capture</span>
              <h2 id="capture-workspace-title">写下想在以后重新看见的一句话</h2>
            </div>
            <form className="demo-capture-form" onSubmit={captureWords}>
              <label htmlFor="capture-demo-words">你的原话</label>
              <textarea
                className="demo-textarea"
                id="capture-demo-words"
                maxLength={800}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="事实、感受，或一句还没想清楚的话……"
                value={draft}
              />
              <p className="demo-helper">这一页不会分析内容。演示文字只保留在当前浏览器会话。</p>
              <div className="demo-form-actions">
                <p className="privacy-note">No upload · No AI call · No account</p>
                <button className="action-button action-button-primary" disabled={!draft.trim()} type="submit">保存这句原话</button>
              </div>
            </form>
          </>
        ) : (
          <div className="capture-result" aria-live="polite">
            <span className="result-label">Captured in this demo</span>
            <h2 id="capture-workspace-title">这句话被留在了原处。</h2>
            <blockquote className="captured-words">{draft}</blockquote>
            <ul className="capture-boundaries">
              <li><strong>已经发生</strong><span>原话保留在当前演示会话中。</span></li>
              <li><strong>尚未发生</strong><span>没有分析、归因，也没有身份判断。</span></li>
            </ul>
          </div>
        )}
      </section>

      <div className="route-next">
        <p>下一步不是给你答案，而是看看多条记录之间是否出现了值得回看的结构。</p>
        <a className="action-link" href="/#awareness">继续到 Awareness <span aria-hidden="true">→</span></a>
      </div>
    </main>
  );
}
