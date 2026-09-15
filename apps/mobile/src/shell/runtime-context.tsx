/**
 * Runtime context — the single place UI code obtains the MobileRuntime.
 *
 * No component constructs a repository, service, or adapter. The runtime is
 * built once during startup (src/runtime/bootstrap.ts) and injected here, which is
 * what keeps one composition and one set of platform semantics for the whole app.
 */

import { createContext, useContext, type ReactNode } from 'react';

import type { MobileRuntime } from '../runtime/mobile-runtime';

const RuntimeContext = createContext<MobileRuntime | null>(null);

export const RuntimeProvider = ({
  runtime,
  children,
}: {
  readonly runtime: MobileRuntime;
  readonly children: ReactNode;
}) => <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;

export const useRuntime = (): MobileRuntime => {
  const runtime = useContext(RuntimeContext);
  if (runtime === null) {
    throw new Error('useRuntime must be used inside a RuntimeProvider');
  }
  return runtime;
};
