/**
 * Runtime context — the single place UI code obtains the MobileRuntime.
 *
 * No component constructs a repository, service, or adapter. The runtime is
 * built once during startup (src/runtime/bootstrap.ts) and injected here, which is
 * what keeps one composition and one set of platform semantics for the whole app.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import type { MobileRuntime } from '../runtime/mobile-runtime';

const RuntimeContext = createContext<MobileRuntime | null>(null);

export const RuntimeProvider = ({
  runtime,
  children,
}: {
  readonly runtime: MobileRuntime;
  readonly children: ReactNode;
}) => <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;

/** Minimal external store so the Tab badge re-renders from runtime truth. */
export const useAwarenessUnreadCount = (): number => {
  const runtime = useRuntime();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void runtime.unreadAwarenessCount().then((next) => {
        if (!cancelled) setCount(next);
      });
    };
    const unsubscribe = runtime.subscribeAwareness(refresh);
    refresh();
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [runtime]);

  return count;
};
export const useRuntime = (): MobileRuntime => {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error('useRuntime must be used inside a RuntimeProvider');
  }
  return runtime;
};
