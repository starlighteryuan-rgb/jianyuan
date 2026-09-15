/**
 * Shared user-facing Awareness copy checks.
 *
 * These checks are deliberately about presentation safety, not Core semantics.
 * Core still receives its own candidate fields and remains the only layer that
 * can admit a Relation.
 */

const INTERNAL_AWARENESS_LABEL =
  /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|(?:comparisonAxis|evidenceSummary|relationType|assertsTemporalOrdering|activityDomain|timeContext|recordedTimeProximity|calendarDateCoOccurrence|semanticSimilarity|generality|concreteness)\b/iu;

const HAN_CHARACTER = /[\u3400-\u4dbf\u4e00-\u9fff]/gu;

export const countHanCharacters = (value: string): number =>
  value.match(HAN_CHARACTER)?.length ?? 0;

export const containsInternalAwarenessLabel = (value: string): boolean =>
  INTERNAL_AWARENESS_LABEL.test(value);

/** User-facing Awareness copy must be simplified Chinese, never a mixed title. */
export const isSimplifiedChineseCopy = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length === 0 || countHanCharacters(trimmed) === 0) return false;
  const latinWords = trimmed.match(/[A-Za-z]{2,}/gu)?.length ?? 0;
  const hanCharacters = countHanCharacters(trimmed);
  return latinWords === 0 || hanCharacters >= latinWords * 3;
};

export const containsIdentityOrDiagnosisClaim = (value: string): boolean =>
  /\b(?:you are|your personality|your identity|diagnos(?:e|is)|proves? that you)\b/i.test(
    value,
  ) ||
  /你就是|说明你|证明你|你的人格|你的身份|心理诊断|本质上是|你本质上|你(?:总是|永远|天生|一定是)|你(?:害怕|担心|在逃避|逃避|潜意识|内心)/.test(
    value,
  );

export const isAwarenessCopyWithin = (value: string, maxHanCharacters: number): boolean =>
  countHanCharacters(value) <= maxHanCharacters;
