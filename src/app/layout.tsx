import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Personal Awareness',
  description: 'A record of what happened, and what you make of it.',
};

/**
 * App shell.
 *
 * Four surfaces, all pull. Nothing here surfaces anything on the system's own
 * initiative: L3 proactive presentation is off by default
 * (`L3_ENABLED_BY_DEFAULT = false`), and §27 keeps outside material behind an
 * explicit request.
 */
export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hans">
      <body>
        <div className="shell">
          <nav className="nav">
            <span className="nav-brand">Personal Awareness</span>
            <a className="nav-link" href="/capture">
              Capture
            </a>
            <a className="nav-link" href="/">
              Awareness
            </a>
            <a className="nav-link" href="/settings">
              Directives
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
