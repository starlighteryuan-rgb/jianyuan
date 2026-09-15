/**
 * Product spaces.
 *
 * Five spaces exist; four are Bottom Tabs and Settings is a separate entry, per
 * the M1 spec ("不要把 Settings 强行放进 Bottom Tab"). The distinction is
 * structural, not cosmetic: `TAB_SPACES` drives the tab bar and `SETTINGS_SPACE`
 * is reached from the header, so a future refactor cannot silently promote
 * Settings into the tab bar.
 */

export const TAB_SPACES = ['records', 'awareness', 'reflection', 'exploration'] as const;

export type TabSpace = (typeof TAB_SPACES)[number];

export const SETTINGS_SPACE = 'settings' as const;

export type SpaceId = TabSpace | typeof SETTINGS_SPACE;

export const SPACE_LABELS: Readonly<Record<SpaceId, string>> = {
  records: '记录',
  awareness: '觉察',
  reflection: '理解',
  exploration: '探索',
  settings: '设置',
};

/** Single-line description used by each space's empty state. */
export const SPACE_EMPTY_STATE: Readonly<Record<SpaceId, string>> = {
  records: '还没有记录。写下此刻的一句话，它会留在这里。',
  awareness: '还没有可以觉察的内容。记录积累之后，这里会呈现值得回看的线索。',
  reflection: '还没有可以理解的内容。当记录之间出现值得对照的关系时，这里会邀请你确认。',
  exploration: '还没有可以探索的内容。这里用于查看更远的联系与外部参照。',
  settings: '设置',
};

export const isTabSpace = (value: SpaceId): value is TabSpace =>
  (TAB_SPACES as readonly string[]).includes(value);
