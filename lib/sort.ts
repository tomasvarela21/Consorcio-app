type Segment =
  | { kind: "empty" }
  | { kind: "text"; value: string }
  | { kind: "number"; value: number; suffix: string };

type ParsedUnitCode = {
  base: Segment;
  rest: Segment;
  normalized: string;
};

function parseSegment(raw: string | undefined): Segment {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) {
    return { kind: "empty" };
  }
  const numberMatch = trimmed.match(/^\d+/);
  if (numberMatch) {
    const numberValue = Number.parseInt(numberMatch[0], 10);
    const suffix = trimmed.slice(numberMatch[0].length).trim();
    return { kind: "number", value: numberValue, suffix };
  }
  return { kind: "text", value: trimmed };
}

function parseUnitCode(value: string | null | undefined): ParsedUnitCode {
  const normalized = (value ?? "").trim().toUpperCase();
  const [baseRaw, ...restParts] = normalized.split("-");
  const restRaw = restParts.length ? restParts.join("-") : "";
  return {
    base: parseSegment(baseRaw),
    rest: parseSegment(restRaw),
    normalized,
  };
}

const basePriority: Record<Segment["kind"], number> = {
  text: 0,
  number: 1,
  empty: 2,
};

const restPriority: Record<Segment["kind"], number> = {
  empty: 0,
  text: 1,
  number: 2,
};

function compareBaseSegments(a: Segment, b: Segment) {
  if (a.kind !== b.kind) {
    return basePriority[a.kind] - basePriority[b.kind];
  }
  if (a.kind === "text" && b.kind === "text") {
    return a.value.localeCompare(b.value);
  }
  if (a.kind === "number" && b.kind === "number") {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return (a.suffix ?? "").localeCompare(b.suffix ?? "");
  }
  return 0;
}

function compareRestSegments(a: Segment, b: Segment) {
  if (a.kind !== b.kind) {
    return restPriority[a.kind] - restPriority[b.kind];
  }
  if (a.kind === "empty" && b.kind === "empty") {
    return 0;
  }
  if (a.kind === "text" && b.kind === "text") {
    return a.value.localeCompare(b.value);
  }
  if (a.kind === "number" && b.kind === "number") {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return (a.suffix ?? "").localeCompare(b.suffix ?? "");
  }
  return 0;
}

export function compareUnitCodes(a: string, b: string) {
  const parsedA = parseUnitCode(a);
  const parsedB = parseUnitCode(b);
  const baseComparison = compareBaseSegments(parsedA.base, parsedB.base);
  if (baseComparison !== 0) {
    return baseComparison;
  }
  const restComparison = compareRestSegments(parsedA.rest, parsedB.rest);
  if (restComparison !== 0) {
    return restComparison;
  }
  return parsedA.normalized.localeCompare(parsedB.normalized);
}
