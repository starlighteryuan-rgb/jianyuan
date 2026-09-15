const DATE_TAG = '$jianyuan.date';

type JsonScalar = string | number | boolean | null;
type EncodedValue =
  | JsonScalar
  | readonly EncodedValue[]
  | { readonly [key: string]: EncodedValue };

const encodeValue = (value: unknown): EncodedValue => {
  if (value instanceof Date) return { [DATE_TAG]: value.toISOString() };
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, encodeValue(entry)]),
    );
  }
  throw new TypeError(`Unsupported SQLite payload value: ${typeof value}`);
};

const decodeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    if (
      Object.keys(object).length === 1 &&
      typeof object[DATE_TAG] === 'string'
    ) {
      const date = new Date(object[DATE_TAG]);
      if (Number.isNaN(date.getTime())) throw new Error('Invalid encoded date');
      return date;
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, entry]) => [key, decodeValue(entry)]),
    );
  }
  return value;
};

export const encodeEntity = (value: unknown): string =>
  JSON.stringify(encodeValue(value));

export const decodeEntity = <T>(payload: string): T =>
  decodeValue(JSON.parse(payload)) as T;
