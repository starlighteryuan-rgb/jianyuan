import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: '见渊（Personal Awareness）',
  description: '从自己的话出发，看见值得重访的可能线索，并把意义留给自己。',
};

/** Competition demo shell. Navigation remains explicit and user-led. */
export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hans">
      <body>
        <div className="app-frame">
          <header className="site-header">
            <a className="site-brand" href="/" aria-label="见渊（Personal Awareness）首页">
              <span className="site-brand-mark" aria-hidden="true">见</span>
              <span className="site-brand-name">见渊（Personal Awareness）</span>
            </a>
            <a className="site-start-link" href="/capture">
              从自己的话开始 <span aria-hidden="true">→</span>
            </a>
          </header>
          <div className="shell">{children}</div>
          <footer className="site-footer">
            <p className="footer-statement">线索可以由系统提出，意义始终由你决定。</p>
            <div className="footer-meta">
              <span>见渊（Personal Awareness）· Competition demo</span>
              <nav className="footer-links" aria-label="演示路径">
                <a className="footer-link" href="/#awareness">Awareness</a>
                <a className="footer-link" href="/references">References</a>
                <a className="footer-link" href="/reflection">Reflection</a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
