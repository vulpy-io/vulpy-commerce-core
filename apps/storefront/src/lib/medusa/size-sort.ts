const LETTER_SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
];

const SIZE_OPTION_TITLES = new Set(["size"]);

const SIZE_PART_DELIMITER = /[/-]/;
const NUMBERED_XL_PATTERN = /^(\d+)XL$/;
const X_RUN_PATTERN = /^(X+)L$/;
const NUMERIC_SIZE_PATTERN = /^(\d+(?:[.,]\d+)?)/;

/** Maps alternate spellings to canonical tokens in LETTER_SIZE_ORDER. */
const SIZE_ALIASES: Record<string, string> = {
  XXXL: "3XL",
  XXXXL: "4XL",
  XXXXXL: "5XL",
  XXXXXXL: "6XL",
  XXXXXXXL: "7XL",
  XXXXXXXXL: "8XL",
  "ONE SIZE": "ONE SIZE",
  "ONE-SIZE": "ONE SIZE",
  OS: "ONE SIZE",
  "O/S": "ONE SIZE",
};

const ONE_SIZE_RANK = 10_000;

function normalizeSizeToken(token: string): string {
  const upper = token.trim().toUpperCase();
  return SIZE_ALIASES[upper] ?? upper;
}

function splitSizeParts(value: string): string[] {
  return value
    .split(SIZE_PART_DELIMITER)
    .map((part) => part.trim())
    .filter(Boolean);
}

function getLetterSizeRank(token: string): number | null {
  const upper = normalizeSizeToken(token);

  if (upper === "ONE SIZE") {
    return ONE_SIZE_RANK;
  }

  const direct = LETTER_SIZE_ORDER.indexOf(upper);
  if (direct !== -1) {
    return direct;
  }

  const numberedXl = upper.match(NUMBERED_XL_PATTERN);
  if (numberedXl) {
    const sizeNumber = Number(numberedXl[1]);
    const twoXlIndex = LETTER_SIZE_ORDER.indexOf("2XL");
    if (twoXlIndex !== -1 && sizeNumber >= 2) {
      return twoXlIndex + (sizeNumber - 2);
    }
    if (sizeNumber === 1) {
      return LETTER_SIZE_ORDER.indexOf("XL");
    }
  }

  const xRun = upper.match(X_RUN_PATTERN);
  if (xRun && xRun[1].length >= 2) {
    const xCount = xRun[1].length;
    const xxlIndex = LETTER_SIZE_ORDER.indexOf("XXL");
    if (xxlIndex !== -1) {
      return xxlIndex + (xCount - 2);
    }
  }

  return null;
}

function getNumericSizeRank(token: string): number | null {
  const match = token.trim().match(NUMERIC_SIZE_PATTERN);
  if (!match) {
    return null;
  }

  return Number.parseFloat(match[1].replace(",", "."));
}

export function getSizeSortKey(value: string): [number, number, string, string] {
  const parts = splitSizeParts(value);

  if (parts.length === 0) {
    return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, value, value];
  }

  const letterRanks = parts.map(getLetterSizeRank);
  if (letterRanks.every((rank) => rank !== null)) {
    const ranks = letterRanks as number[];
    const average = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
    const max = Math.max(...ranks);
    return [average, max, normalizeSizeToken(value), value];
  }

  const numericRanks = parts.map(getNumericSizeRank);
  if (numericRanks.every((rank) => rank !== null)) {
    const ranks = numericRanks as number[];
    const average = ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length;
    const max = Math.max(...ranks);
    return [1000 + average, 1000 + max, normalizeSizeToken(value), value];
  }

  return [20_000, 20_000, normalizeSizeToken(value), value];
}

export function compareSizeValues(a: string, b: string): number {
  const [aPrimary, aSecondary, aLabel, aDisplay] = getSizeSortKey(a);
  const [bPrimary, bSecondary, bLabel, bDisplay] = getSizeSortKey(b);

  if (aPrimary !== bPrimary) {
    return aPrimary - bPrimary;
  }
  if (aSecondary !== bSecondary) {
    return aSecondary - bSecondary;
  }
  if (aLabel !== bLabel) {
    return aLabel.localeCompare(bLabel);
  }
  return aDisplay.localeCompare(bDisplay, undefined, { sensitivity: "base" });
}

export function sortSizeValues(values: string[]): string[] {
  return [...values].sort(compareSizeValues);
}

export function isSizeOptionTitle(title: string): boolean {
  return SIZE_OPTION_TITLES.has(title.trim().toLowerCase());
}

const MAX_RANGE_STEPS = 30;
const DASH_NORMALIZE = /[\u2010-\u2015\u2212]/g; // hyphen variants / minus

function normalizeSizeRaw(value: string): string {
  return value.trim().replace(DASH_NORMALIZE, "-");
}

function formatNumericSize(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n);
}

function expandNumericRange(start: number, end: number): string[] | null {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const useHalf =
    !(Number.isInteger(lo) && Number.isInteger(hi) ) || lo % 1 !== 0 || hi % 1 !== 0;
  const step = useHalf ? 0.5 : 1;
  const count = Math.floor((hi - lo) / step) + 1;
  if (count > MAX_RANGE_STEPS || count < 1) {
    return null;
  }
  const out: string[] = [];
  for (let n = lo; n <= hi + 1e-9; n += step) {
    out.push(formatNumericSize(Math.round(n * 100) / 100));
  }
  return out;
}

function expandLetterRange(a: string, b: string): string[] | null {
  const rankA = getLetterSizeRank(a);
  const rankB = getLetterSizeRank(b);
  if (rankA === null || rankB === null) {
    return null;
  }
  if (rankA === ONE_SIZE_RANK || rankB === ONE_SIZE_RANK) {
    return null;
  }
  const lo = Math.min(rankA, rankB);
  const hi = Math.max(rankA, rankB);
  if (hi - lo + 1 > MAX_RANGE_STEPS) {
    return null;
  }
  return LETTER_SIZE_ORDER.filter((_, index) => index >= lo && index <= hi);
}

function isPureNumericPart(part: string): boolean {
  return part.match(NUMERIC_SIZE_PATTERN)?.[0] === part.trim();
}

function expandSingleSizeToken(token: string): string[] {
  const letter = getLetterSizeRank(token);
  if (letter !== null) {
    const canonical = normalizeSizeToken(token);
    return canonical === "ONE SIZE" ? ["ONE SIZE"] : [token];
  }
  return [token];
}

function expandTwoPartSize(parts: [string, string]): string[] | null {
  const numericA = getNumericSizeRank(parts[0]);
  const numericB = getNumericSizeRank(parts[1]);
  if (
    numericA !== null &&
    numericB !== null &&
    isPureNumericPart(parts[0]) &&
    isPureNumericPart(parts[1])
  ) {
    return expandNumericRange(numericA, numericB);
  }
  return expandLetterRange(parts[0], parts[1]);
}

function expandPartsList(parts: string[], fallback: string): string[] {
  const expanded = new Set<string>();
  for (const part of parts) {
    for (const token of expandSizeForFilter(part)) {
      expanded.add(token);
    }
  }
  if (expanded.size === 0) {
    expanded.add(fallback);
  }
  return Array.from(expanded);
}

/**
 * Expand a Medusa Size option for filter facets/matching.
 * Display (PDP/cards) keeps the raw label; filters use discrete tokens.
 * Document contract for any search engine: index as `filter_sizes`.
 */
export function expandSizeForFilter(raw: string): string[] {
  const normalized = normalizeSizeRaw(raw);
  if (!normalized) {
    return [];
  }

  const parts = splitSizeParts(normalized);
  if (parts.length === 0) {
    return [normalized];
  }
  if (parts.length === 1) {
    return expandSingleSizeToken(parts[0]);
  }
  if (parts.length === 2) {
    const pair = expandTwoPartSize([parts[0], parts[1]]);
    if (pair) {
      return pair;
    }
  }
  return expandPartsList(parts, normalized);
}

export function expandSizesForFilter(values: string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    for (const token of expandSizeForFilter(value)) {
      out.add(token);
    }
  }
  return Array.from(out);
}
