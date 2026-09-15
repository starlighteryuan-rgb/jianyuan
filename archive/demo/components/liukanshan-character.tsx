import Image from 'next/image';

/**
 * Presentation-only animation states for 刘看山.
 *
 * Callers choose a state explicitly. This mapping reads no user data and must
 * never be used as an inference, recommendation, or identity signal.
 */
export const LIUKANSHAN_ANIMATION_BY_STATE = {
  welcome: '/characters/liukanshan/greeting.gif',
  idle: '/characters/liukanshan/idle.gif',
  processing: '/characters/liukanshan/thinking.gif',
  exploring: '/characters/liukanshan/exploring.gif',
  resting: '/characters/liukanshan/resting.gif',
  celebrating: '/characters/liukanshan/celebrating.gif',
} as const;

export type LiukanshanPresentationState =
  keyof typeof LIUKANSHAN_ANIMATION_BY_STATE;

export type LiukanshanCharacterSize = 'small' | 'medium' | 'large';

export interface LiukanshanCharacterProps {
  readonly state: LiukanshanPresentationState;
  readonly size?: LiukanshanCharacterSize;
  readonly priority?: boolean;
}

/** Decorative character renderer. Text next to it remains the accessible state. */
export function LiukanshanCharacter({
  state,
  size = 'medium',
  priority = false,
}: LiukanshanCharacterProps) {
  return (
    <span
      aria-hidden="true"
      className={`liukanshan-character liukanshan-character-${size}`}
      data-presentation-state={state}
    >
      <Image
        alt=""
        draggable={false}
        height={320}
        priority={priority}
        src={LIUKANSHAN_ANIMATION_BY_STATE[state]}
        unoptimized
        width={320}
      />
    </span>
  );
}
