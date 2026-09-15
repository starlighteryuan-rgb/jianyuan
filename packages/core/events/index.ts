/**
 * Transport-neutral event envelope. Phase 3.1 defines the seam only; Core
 * services do not publish events until an outbox/dispatcher is introduced.
 */
export interface CoreEvent<
  TType extends string = string,
  TPayload = Readonly<Record<string, unknown>>,
> {
  readonly id: string;
  readonly type: TType;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export interface CoreEventSink {
  publish(events: readonly CoreEvent[]): Promise<void>;
}
