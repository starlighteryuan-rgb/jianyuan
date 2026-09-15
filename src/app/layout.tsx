import type { Metadata } from 'next';

import { ProductNavigation } from './_components/product-navigation';
import './globals.css';

export const metadata: Metadata = {
  title: '见渊（Personal Awareness）',
  description: '从自己的话出发，看见值得重访的可能线索，并把意义留给自己。',
};

/** Product shell. Navigation remains explicit and user-led. */
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
          <div className="product-shell">
            <ProductNavigation />
            <div className="shell">{children}</div>
          </div>
          <footer className="site-footer">
            <p className="footer-statement">线索可以由系统提出，意义始终由你决定。</p>
            <div className="footer-meta">
              <span>见渊（Personal Awareness）</span>
              <nav className="footer-links" aria-label="产品导航">
                <a className="footer-link" href="/records">记录</a>
                <a className="footer-link" href="/awareness">觉察</a>
                <a className="footer-link" href="/understanding">理解</a>
                <a className="footer-link" href="/exploration">探索</a>
                <a className="footer-link" href="/settings">设置</a>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
