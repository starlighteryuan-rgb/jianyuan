'use client';

import { usePathname } from 'next/navigation';

interface ProductDestination {
  readonly href: string;
  readonly label: string;
  readonly description: string;
  readonly matches: (pathname: string) => boolean;
}

const primaryDestinations: readonly ProductDestination[] = [
  {
    href: '/records',
    label: '记录',
    description: '我经历了什么',
    matches: (pathname) =>
      pathname === '/' ||
      pathname.startsWith('/records') ||
      pathname.startsWith('/capture') ||
      pathname.startsWith('/history'),
  },
  {
    href: '/awareness',
    label: '觉察',
    description: '有什么值得重新观察',
    matches: (pathname) =>
      pathname.startsWith('/awareness') || pathname === '/reflection',
  },
  {
    href: '/understanding',
    label: '理解',
    description: '我如何理解这些经历',
    matches: (pathname) =>
      pathname.startsWith('/understanding') || pathname.startsWith('/reflect/'),
  },
  {
    href: '/exploration',
    label: '探索',
    description: '长期来看值得关注什么',
    matches: (pathname) => pathname.startsWith('/exploration'),
  },
];

const settingsDestination: ProductDestination = {
  href: '/settings',
  label: '设置',
  description: '服务、数据与隐私',
  matches: (pathname) => pathname.startsWith('/settings'),
};

const DestinationLink = ({
  destination,
  pathname,
  compact = false,
}: {
  readonly destination: ProductDestination;
  readonly pathname: string;
  readonly compact?: boolean;
}) => {
  const active = destination.matches(pathname);

  return (
    <a
      className={compact ? 'product-nav-mobile-link' : 'product-nav-link'}
      data-active={active ? 'true' : 'false'}
      href={destination.href}
      aria-current={active ? 'page' : undefined}
    >
      <strong>{destination.label}</strong>
      {compact ? null : <span>{destination.description}</span>}
    </a>
  );
};

export function ProductNavigation() {
  const pathname = usePathname();

  return (
    <>
      <aside className="product-nav-desktop" aria-label="主要导航">
        <nav className="product-nav-primary">
          {primaryDestinations.map((destination) => (
            <DestinationLink
              key={destination.href}
              destination={destination}
              pathname={pathname}
            />
          ))}
        </nav>
        <nav className="product-nav-secondary" aria-label="次级导航">
          <DestinationLink
            destination={settingsDestination}
            pathname={pathname}
          />
        </nav>
      </aside>

      <nav className="product-nav-mobile" aria-label="主要导航">
        {primaryDestinations.map((destination) => (
          <DestinationLink
            key={destination.href}
            destination={destination}
            pathname={pathname}
            compact
          />
        ))}
        <a
          className="product-nav-mobile-more"
          href="/settings"
          aria-label="打开设置"
          aria-current={settingsDestination.matches(pathname) ? 'page' : undefined}
        >
          <span aria-hidden="true">•••</span>
          <strong>更多</strong>
        </a>
      </nav>
    </>
  );
}
