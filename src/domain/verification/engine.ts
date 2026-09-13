import type {
  ChangeDirection,
  ScanFinding,
  DtcChange,
  FindingChange,
  ParameterChange,
  RepairEvent,
  ScanSnapshot,
  VerificationResult,
  VerificationVerdict,
} from './types';

/**
 * Comparing a before scan with an after scan.
 *
 * Two rules keep this honest.
 *
 * **Like must be compared with like.** A parameter is only compared within the
 * same operating condition. Fuel trim at idle and fuel trim under load are
 * different measurements, and a repair that is judged by comparing one against
 * the other has not been judged at all. Where the after-scan did not revisit a
 * condition, that pair is simply absent — never substituted.
 *
 * **A cleared code proves nothing on its own.** Codes clear on command and
 * take a full drive cycle to return. Their absence is reported, and it is
 * explicitly excluded from driving a positive verdict.
 */

/* --- What "better" means, per parameter ----------------------------------- */

type Polarity =
  /** Closer to zero is better. Fuel trims: both directions are faults. */
  | 'TOWARD_ZERO'
  /** Lower is better once it is high. Coolant temperature. */
  | 'LOWER'
  /** Higher is better. Voltage, rail pressure. */
  | 'HIGHER';

interface ParameterRule {
  label: string;
  polarity: Polarity;
  /** Movement below this is scan-to-scan variation, not a result. */
  noiseFloor: number;
}

/**
 * The parameters a repair can be judged by.
 *
 * Restricted on purpose. Engine speed changes between scans for reasons that
 * have nothing to do with a repair, and including it would let noise decide a
 * verdict. Only parameters with a defensible direction are here.
 */
const RULES: Record<string, ParameterRule> = {
  SHORT_FUEL_TRIM_1: { label: 'Short term fuel trim', polarity: 'TOWARD_ZERO', noiseFloor: 3 },
  LONG_FUEL_TRIM_1: { label: 'Long term fuel trim', polarity: 'TOWARD_ZERO', noiseFloor: 3 },
  COOLANT_TEMP: { label: 'Coolant temperature', polarity: 'LOWER', noiseFloor: 5 },
  CONTROL_MODULE_VOLTAGE: { label: 'System voltage', polarity: 'HIGHER', noiseFloor: 0.3 },
  FUEL_PRESSURE: { label: 'Fuel rail pressure', polarity: 'HIGHER', noiseFloor: 25 },
};

export interface CompareInput {
  before: ScanSnapshot;
  after: ScanSnapshot;
  repair: RepairEvent;
}

export function verifyRepair({ before, after, repair }: CompareInput): VerificationResult {
  const parameters = compareParameters(before, after);
  const findings = compareFindings(before, after);
  const dtcs = compareDtcs(before, after);
  const caveats = buildCaveats(before, after, repair, parameters);

  /* --- Can these two scans be compared at all? ----------------------- */
  const sharedConditions = before.conditionsObserved.filter((condition) =>
    after.conditionsObserved.includes(condition),
  );

  if (sharedConditions.length === 0 || parameters.length === 0) {
    return {
      verdict: 'INCONCLUSIVE',
      summary:
        'These two scans cannot be compared. The second did not revisit the conditions the first was taken under, so any difference between them could be the change in conditions rather than the repair.',
      reasoning: [
        `The first scan covered ${describeList(before.conditionsObserved)}; the second covered ${describeList(after.conditionsObserved)}.`,
        'Comparing a reading taken at idle against one taken under load answers a different question from the one being asked.',
      ],
      parameters,
      findings,
      dtcs,
      healthBefore: before.healthScore,
      healthAfter: after.healthScore,
      caveats,
    };
  }

  /* --- What actually moved ------------------------------------------- */
  const improved = parameters.filter((p) => p.significant && p.direction === 'IMPROVED');
  const worsened = parameters.filter((p) => p.significant && p.direction === 'WORSENED');
  const resolved = findings.filter((f) => f.status === 'RESOLVED');
  const persisted = findings.filter((f) => f.status === 'PERSISTED');
  const newFindings = findings.filter((f) => f.status === 'NEW');

  const reasoning: string[] = [];

  for (const change of improved) {
    reasoning.push(
      `${change.label} at ${humanCondition(change.condition)} moved from ${format(change.before, change.unit)} to ${format(change.after, change.unit)}.`,
    );
  }
  for (const change of worsened) {
    reasoning.push(
      `${change.label} at ${humanCondition(change.condition)} moved the wrong way, from ${format(change.before, change.unit)} to ${format(change.after, change.unit)}.`,
    );
  }
  for (const change of resolved) {
    reasoning.push(`“${change.finding.title}” was raised before the work and was not raised after.`);
  }
  for (const change of persisted) {
    reasoning.push(`“${change.finding.title}” is still present after the work.`);
  }
  for (const change of newFindings) {
    reasoning.push(`“${change.finding.title}” was not present before the work and is now.`);
  }

  const verdict = decide({ improved, worsened, resolved, persisted, newFindings });

  return {
    verdict,
    summary: summarise(verdict, repair, improved.length, resolved.length),
    reasoning:
      reasoning.length > 0
        ? reasoning
        : ['Nothing measured moved beyond ordinary scan-to-scan variation.'],
    parameters,
    findings,
    dtcs,
    healthBefore: before.healthScore,
    healthAfter: after.healthScore,
    caveats,
  };
}

/* -------------------------------------------------------------------------
 * The verdict
 * ---------------------------------------------------------------------- */

function decide(input: {
  improved: readonly ParameterChange[];
  worsened: readonly ParameterChange[];
  resolved: readonly FindingChange[];
  persisted: readonly FindingChange[];
  newFindings: readonly FindingChange[];
}): VerificationVerdict {
  // Something new or worse outranks any improvement elsewhere. A repair that
  // fixed one thing and broke another has not succeeded.
  if (input.worsened.length > 0 || input.newFindings.length > 0) return 'WORSENED';

  // A finding that survived the work is the clearest evidence the work did not
  // address it, whatever the numbers did.
  if (input.persisted.length > 0) return 'NOT_DEMONSTRATED';

  // Note what is NOT sufficient here: a cleared fault code. Codes clear on
  // command, so their absence carries no weight on its own.
  if (input.improved.length > 0 && input.resolved.length > 0) return 'CONSISTENT_WITH_REPAIR';
  if (input.improved.length > 0) return 'CONSISTENT_WITH_REPAIR';

  return 'NOT_DEMONSTRATED';
}

function summarise(
  verdict: VerificationVerdict,
  repair: RepairEvent,
  improvedCount: number,
  resolvedCount: number,
): string {
  switch (verdict) {
    case 'CONSISTENT_WITH_REPAIR':
      return (
        `The readings after “${repair.summary}” moved the way a successful repair would move them: ` +
        `${improvedCount} measurement${improvedCount === 1 ? '' : 's'} improved` +
        `${resolvedCount > 0 ? ` and ${resolvedCount} finding${resolvedCount === 1 ? '' : 's'} is no longer raised` : ''}. ` +
        'This is consistent with the repair having worked. It is not proof that the fault will not return.'
      );
    case 'WORSENED':
      return `Something is measurably worse after “${repair.summary}” than it was before. This needs looking at before the vehicle is considered repaired.`;
    case 'NOT_DEMONSTRATED':
      return `The scans do not show that “${repair.summary}” changed anything. That is not the same as the work having been done badly — the fault may be intermittent, or the readings may not have had time to settle.`;
    case 'INCONCLUSIVE':
      return 'These two scans cannot be compared usefully.';
  }
}

/* -------------------------------------------------------------------------
 * Comparisons
 * ---------------------------------------------------------------------- */

function compareParameters(before: ScanSnapshot, after: ScanSnapshot): ParameterChange[] {
  const afterByKey = new Map(
    after.parameters.map((stat) => [`${stat.parameterId}|${stat.condition}`, stat]),
  );

  const changes: ParameterChange[] = [];

  for (const stat of before.parameters) {
    const rule = RULES[stat.parameterId];
    if (!rule) continue;

    // Same parameter, same condition, or no comparison at all.
    const match = afterByKey.get(`${stat.parameterId}|${stat.condition}`);
    if (!match) continue;

    const delta = match.mean - stat.mean;
    const movement = magnitude(rule.polarity, stat.mean, match.mean);

    changes.push({
      parameterId: stat.parameterId,
      label: rule.label,
      condition: stat.condition,
      unit: stat.unit,
      before: round(stat.mean),
      after: round(match.mean),
      delta: round(delta),
      direction: directionOf(movement, rule.noiseFloor),
      significant: Math.abs(movement) >= rule.noiseFloor,
    });
  }

  return changes;
}

/**
 * How far the reading moved in the "better" direction, signed.
 *
 * Positive means improved. Expressing every polarity as one signed number is
 * what lets the caller treat fuel trim, temperature and voltage identically
 * without a branch per parameter at every call site.
 */
function magnitude(polarity: Polarity, before: number, after: number): number {
  switch (polarity) {
    case 'TOWARD_ZERO':
      return Math.abs(before) - Math.abs(after);
    case 'LOWER':
      return before - after;
    case 'HIGHER':
      return after - before;
  }
}

function directionOf(movement: number, noiseFloor: number): ChangeDirection {
  if (Math.abs(movement) < noiseFloor) return 'UNCHANGED';
  return movement > 0 ? 'IMPROVED' : 'WORSENED';
}

/**
 * Findings that describe a condition the vehicle has.
 *
 * INFO findings are excluded, and this is load-bearing rather than tidying.
 * The diagnostic engine expresses "nothing was wrong" as a finding titled
 * "No abnormal readings in this session" — so a scan after a *successful*
 * repair raises an INFO finding the before-scan did not have. Counted as new,
 * that made a clean result read as a regression: every trim improved, every
 * real finding resolved, and the verdict came back WORSENED.
 *
 * An INFO finding is the absence of a condition expressed as a finding. It is
 * not a condition, so it takes no part in the comparison.
 */
function isCondition(finding: ScanFinding): boolean {
  return finding.severity !== 'INFO';
}

function compareFindings(before: ScanSnapshot, after: ScanSnapshot): FindingChange[] {
  const beforeConditions = before.findings.filter(isCondition);
  const afterConditions = after.findings.filter(isCondition);

  const afterIds = new Set(afterConditions.map((f) => f.findingId));
  const beforeIds = new Set(beforeConditions.map((f) => f.findingId));

  const changes: FindingChange[] = beforeConditions.map((finding) => ({
    finding,
    status: afterIds.has(finding.findingId) ? ('PERSISTED' as const) : ('RESOLVED' as const),
  }));

  for (const finding of afterConditions) {
    if (!beforeIds.has(finding.findingId)) {
      changes.push({ finding, status: 'NEW' });
    }
  }

  return changes;
}

function compareDtcs(before: ScanSnapshot, after: ScanSnapshot): DtcChange[] {
  const afterCodes = new Set(after.dtcCodes);
  const beforeCodes = new Set(before.dtcCodes);

  const changes: DtcChange[] = before.dtcCodes.map((code) => ({
    code,
    status: afterCodes.has(code) ? ('PERSISTED' as const) : ('CLEARED' as const),
  }));

  for (const code of after.dtcCodes) {
    if (!beforeCodes.has(code)) changes.push({ code, status: 'NEW' });
  }

  return changes;
}

/* -------------------------------------------------------------------------
 * Caveats
 * ---------------------------------------------------------------------- */

/**
 * What could make this comparison misleading.
 *
 * Always populated, and longest on a positive verdict. A conclusion the reader
 * is most likely to act on is the one that most needs its limits stated.
 */
function buildCaveats(
  before: ScanSnapshot,
  after: ScanSnapshot,
  repair: RepairEvent,
  parameters: readonly ParameterChange[],
): readonly [string, ...string[]] {
  const caveats: string[] = [
    'A scan shows how the vehicle behaved while it was being scanned. It cannot show that a fault will not return, and an intermittent fault that happened not to occur will read as an improvement.',
  ];

  if (before.isSimulated || after.isSimulated) {
    caveats.push(
      'At least one of these scans came from a simulated vehicle, so this comparison describes the simulation rather than a real repair.',
    );
  }

  const clearedCodes = before.dtcCodes.filter((code) => !after.dtcCodes.includes(code));
  if (clearedCodes.length > 0) {
    caveats.push(
      `${clearedCodes.length} fault code${clearedCodes.length === 1 ? '' : 's'} present before the work ${clearedCodes.length === 1 ? 'is' : 'are'} absent now. Codes clear on command and take a full drive cycle to return, so their absence on its own carries no weight and was not used to reach this conclusion.`,
    );
  }

  if (parameters.some((p) => p.parameterId.includes('FUEL_TRIM'))) {
    caveats.push(
      'Long term fuel trim is learned slowly. If it was reset or the vehicle has been driven only briefly since the work, it may not yet have settled at its true value.',
    );
  }

  const minutesApart = Math.abs(after.at.getTime() - before.at.getTime()) / 60_000;
  if (minutesApart < 30) {
    caveats.push(
      `The two scans were taken ${Math.round(minutesApart)} minutes apart. A short interval leaves little opportunity for a fault to reappear.`,
    );
  }

  const missing = before.conditionsObserved.filter(
    (condition) => !after.conditionsObserved.includes(condition),
  );
  if (missing.length > 0) {
    caveats.push(
      `The second scan did not revisit ${describeList(missing)}, so nothing is known about how the vehicle now behaves there.`,
    );
  }

  caveats.push(
    `“${repair.summary}” is recorded as described by whoever carried out the work. This build does not verify what was actually done.`,
  );

  return caveats as [string, ...string[]];
}

/* -------------------------------------------------------------------------
 * Formatting
 * ---------------------------------------------------------------------- */

function format(value: number, unit: string | null): string {
  const sign = value > 0 && unit === '%' ? '+' : '';
  return `${sign}${round(value)}${unit ? `${unit === '%' ? '' : ' '}${unit}` : ''}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function humanCondition(condition: string): string {
  return condition.toLowerCase().replace(/_/g, ' ');
}

function describeList(items: readonly string[]): string {
  if (items.length === 0) return 'nothing';
  return items.map(humanCondition).join(', ');
}
