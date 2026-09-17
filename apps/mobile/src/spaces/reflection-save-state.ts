/**
 * Reflection save-feedback state machine.
 *
 * Kept as a pure reducer so the exact transition that drives the visible label
 * is deterministic and directly testable. The visible label must never be
 * derived from more than one boolean.
 */

export type ReflectionSaveState = 'idle' | 'saving' | 'saved' | 'settled' | 'error';

export type ReflectionSaveAction =
  | { readonly type: 'begin' }
  | {
      /**
       * A runtime outcome. `persisted` is the only success signal that matters:
       * Core already durably stored the user's Reflection, so an unexpected or
       * missing payload must not leave the UI on `saving`.
       */
      readonly type: 'outcome';
      readonly persisted: boolean;
      readonly validationFailed: boolean;
    }
  | { readonly type: 'settled' };

export const reflectionSaveReducer = (
  state: ReflectionSaveState,
  action: ReflectionSaveAction,
): ReflectionSaveState => {
  switch (action.type) {
    case 'begin':
      return state === 'saving' ? state : 'saving';
    case 'outcome':
      if (state !== 'saving') return state;
      if (action.persisted) return 'saved';
      return action.validationFailed ? 'idle' : 'error';
    case 'settled':
      return state === 'saved' ? 'settled' : state;
    default:
      return state;
  }
};

/** The single visible label derived from the one state source. */
export const reflectionSaveLabel = (state: ReflectionSaveState): string => {
  switch (state) {
    case 'saving':
      return '正在保存……';
    case 'saved':
      return '已保存到「理解」';
    default:
      return '确认我的回应';
  }
};
