import { CaptureForm } from './capture-form';

/**
 * Capture surface shell.
 *
 * The page owns presentation only. CaptureForm submits through the dedicated
 * Server Action, while validation, permissions, identity, and persistence stay
 * behind the existing ingestion interface.
 */
export default function CapturePage() {
  return (
    <main className="route-shell">
      <nav className="route-trail" aria-label="当前位置"><a href="/">见渊</a><span aria-hidden="true">→</span><strong>记录</strong></nav>
      <header className="route-hero"><span className="stage-label">记录</span><h1>先留下原话，不急着解释。</h1><p className="route-lede">记录只接住你愿意留下的表达。它不会追问，也不会自动把一句话变成关于你的判断。</p></header>
      <section className="route-workspace" aria-labelledby="capture-workspace-title"><div className="panel-heading"><span>你的记录</span><h2 id="capture-workspace-title">写下想在以后重新看见的一句话</h2></div><CaptureForm /></section>
    </main>
  );
}
