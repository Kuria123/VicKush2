import type { ReferralReport } from './types';

/**
 * The report as plain text.
 *
 * Plain text because of how it will actually travel: pasted into a message,
 * printed, or read off a phone at a counter. A layout that only survives in
 * this application would not reach the person it is for, and the whole value
 * of the feature is that it arrives with them intact.
 *
 * The section order is the order a mechanic reads in — vehicle, complaint,
 * what was measured, what was already tried — and the limits are not at the
 * bottom where a long document hides them: the simulation disclosure, when
 * there is one, is the first line on the page.
 */

export function formatReferralReport(report: ReferralReport): string {
  const out: string[] = [];

  const simulated = report.scan?.isSimulated ?? false;
  if (simulated) {
    out.push('*** SIMULATION MODE — NOT REAL VEHICLE DATA ***');
    out.push(
      'Every reading below was produced by a simulator. Do not use it to make a repair decision.',
    );
    out.push('');
  }

  out.push('VEHICLE DIAGNOSTIC REPORT');
  out.push(`Prepared ${report.preparedAt.toISOString().slice(0, 10)}`);
  out.push('');

  out.push('Vehicle:');
  out.push(`  ${report.vehicle.name}`);
  out.push(`  ${report.vehicle.spec}`);
  out.push(`  VIN: ${report.vehicle.vin ?? 'not recorded'}`);
  out.push('');

  out.push('Concern:');
  out.push(
    report.concern.stated ? `  ${report.concern.words}` : `  Not stated. ${report.concern.reason}`,
  );
  out.push('');

  if (report.scan) {
    out.push('Scan:');
    out.push(`  ${report.scan.at.toISOString().slice(0, 16).replace('T', ' ')}`);
    out.push(`  Source: ${report.scan.providerName}`);
    out.push(
      `  Conditions covered: ${report.scan.conditionsObserved.length > 0 ? report.scan.conditionsObserved.join(', ') : 'none recorded'}`,
    );
    out.push('');
  }

  out.push('Evidence:');
  if (report.observations.length === 0) {
    out.push('  Nothing was measured outside its normal range.');
  } else {
    for (const observation of report.observations) {
      out.push(`  [${observation.severity}] ${observation.finding}`);
      out.push(`      ${observation.observation}`);
    }
  }
  out.push('');

  out.push('Fault codes:');
  if (report.codes.length === 0) {
    out.push('  None stored at the time of the scan.');
  } else {
    for (const code of report.codes) out.push(`  ${code.code} (${code.status.toLowerCase()})`);
    out.push('  Codes are listed by identifier only; this report does not interpret them.');
  }
  out.push('');

  out.push('Candidate mechanisms:');
  if (report.candidates.length === 0) {
    out.push('  None. The measurements did not fit any mechanism this build reasons about.');
  } else {
    for (const candidate of report.candidates) {
      out.push(`  ${candidate.label} — evidence fit ${candidate.confidence}%`);
      out.push(`      ${candidate.mechanism}`);
      if (!candidate.keyObservationMade) {
        // The distinction that keeps this list honest: a mechanism can score
        // respectably on corroboration while the reading that would actually
        // argue for it was never taken.
        out.push('      The observation that would define this was not made during the scan.');
      }
    }
  }
  out.push('');

  out.push('Recommended confirmation:');
  if (report.recommendedConfirmation.length === 0) {
    out.push('  No further measurement in this build would narrow it.');
  } else {
    for (const test of report.recommendedConfirmation) {
      out.push(`  ${test.name}`);
      out.push(`      ${test.question}`);
    }
  }
  out.push('');

  out.push('Previous repairs:');
  if (report.previousRepairs.length === 0) {
    out.push('  None recorded in this application.');
  } else {
    for (const repair of report.previousRepairs) {
      out.push(`  ${repair.performedAt.toISOString().slice(0, 10)} — ${repair.summary}`);
      out.push(`      Result: ${repair.outcome}`);
    }
  }
  out.push('');

  out.push('What this report does not establish:');
  for (const limitation of report.limitations) out.push(`  - ${limitation}`);
  out.push('');

  out.push('Not claimed:');
  for (const claim of report.notClaiming) out.push(`  - ${claim}`);

  return out.join('\n');
}
