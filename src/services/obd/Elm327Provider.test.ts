import { describe, expect, it } from 'vitest';

import { Elm327Provider } from './Elm327Provider';
import { IDLING_VEHICLE_SCRIPT, ScriptedObdLink } from './ScriptedObdLink';
import { describeProviderContract } from './provider-contract';

/**
 * The real OBD provider, driven against recorded adapter responses.
 *
 * It passes the same contract suite the simulator does, unchanged — which was
 * the point of building the provider architecture in Stage 5 before there was
 * any hardware to plug into it.
 *
 * What this does NOT establish is that the Bluetooth or serial transports
 * work. Those need an adapter and a vehicle. Everything above the link is
 * covered here; the link itself is the only unverified part, and it is
 * deliberately a few dozen lines behind a seam.
 */

function provider() {
  return new Elm327Provider({
    link: new ScriptedObdLink({ responses: IDLING_VEHICLE_SCRIPT }),
  });
}

describeProviderContract('ELM327 (scripted)', provider);

describe('Elm327Provider — specifics', () => {
  it('is never simulated', () => {
    // Rule 2 in the other direction: real data must not claim to be synthetic
    // any more than synthetic data may claim to be real.
    expect(provider().describe().isSimulated).toBe(false);
  });

  it('initialises the adapter in order, with echo off and headers on', async () => {
    const link = new ScriptedObdLink({ responses: IDLING_VEHICLE_SCRIPT });
    const subject = new Elm327Provider({ link });

    await subject.connect();

    expect(link.sent.slice(0, 6)).toEqual(['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0']);
    await subject.disconnect();
  });

  it('claims no live data before the vehicle has said what it supports', () => {
    // Listing everything and failing at request time would make the UI offer
    // actions that cannot work.
    const descriptor = provider().describe();
    expect(descriptor.capabilities).not.toContain('LIVE_DATA');
    expect(descriptor.capabilities).toContain('READ_DTCS');
  });

  it('claims live data once the vehicle has answered the bitmap', async () => {
    const subject = provider();
    await subject.connect();

    expect(subject.describe().capabilities).toContain('LIVE_DATA');
    expect(subject.describe().capabilities).toContain('STREAMING');
    await subject.disconnect();
  });

  it('reports only the parameters the vehicle listed', async () => {
    const subject = provider();
    await subject.connect();

    const supported = await subject.getSupportedParameters();
    expect(supported.ok).toBe(true);
    if (!supported.ok) return;

    expect(supported.value).toContain('ENGINE_RPM');
    expect(supported.value).toContain('COOLANT_TEMP');
    // 0x5C is not set in this vehicle's bitmap.
    expect(supported.value).not.toContain('OIL_TEMP');

    await subject.disconnect();
  });

  it('decodes a live reading end to end, from adapter string to value', async () => {
    const subject = provider();
    await subject.connect();

    const result = await subject.getLiveData(['ENGINE_RPM', 'COOLANT_TEMP']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rpm = result.value.find((r) => r.parameterId === 'ENGINE_RPM');
    expect(rpm?.state).toBe('AVAILABLE');
    if (rpm?.state === 'AVAILABLE') expect(rpm.value).toBe(750);

    const coolant = result.value.find((r) => r.parameterId === 'COOLANT_TEMP');
    if (coolant?.state === 'AVAILABLE') expect(coolant.value).toBe(83);

    await subject.disconnect();
  });

  it('marks an unsupported parameter rather than reporting it as empty', async () => {
    const subject = provider();
    await subject.connect();

    const result = await subject.getLiveData(['OIL_TEMP']);
    if (!result.ok) throw new Error('expected ok');

    // Absent and unsupported are different facts.
    expect(result.value[0]?.state).toBe('UNSUPPORTED');
    await subject.disconnect();
  });

  it('reads no fault codes from an empty mode 03 response', async () => {
    const subject = provider();
    await subject.connect();

    const result = await subject.getDtcs();
    if (!result.ok) throw new Error('expected ok');

    // 43 00 is "no codes", not one code of P0000.
    expect(result.value).toHaveLength(0);
    await subject.disconnect();
  });

  it('reads stored and pending codes without inventing descriptions', async () => {
    const link = new ScriptedObdLink({
      responses: {
        ...IDLING_VEHICLE_SCRIPT,
        '03': '7E8 06 43 01 71 03 02\r>',
        '07': '7E8 04 47 01 33\r>',
      },
    });
    const subject = new Elm327Provider({ link });
    await subject.connect();

    const result = await subject.getDtcs();
    if (!result.ok) throw new Error('expected ok');

    expect(result.value.map((d) => d.code)).toEqual(['P0171', 'P0302', 'P0133']);
    // No authoritative table exists, so no wording is invented (Rule 1).
    expect(result.value.every((d) => d.description === null)).toBe(true);
    // The responding ECU is carried through from the header.
    expect(result.value[0]?.moduleAddress).toBe('7E8');

    await subject.disconnect();
  });

  it('reads a VIN across multiple frames', async () => {
    const subject = provider();
    await subject.connect();

    const result = await subject.identifyVehicle();
    if (!result.ok) throw new Error('expected ok');

    expect(result.value.vin).toBe('1M8GDM9AXKP042788');
    expect(result.value.protocol).toBe('ISO_15765_4_CAN_11B_500K');

    await subject.disconnect();
  });

  it('reports no VIN rather than a partial one', async () => {
    const link = new ScriptedObdLink({
      responses: { ...IDLING_VEHICLE_SCRIPT, '0902': '7E8 06 49 02 01 31 4D 38\r>' },
    });
    const subject = new Elm327Provider({ link });
    await subject.connect();

    const result = await subject.identifyVehicle();
    if (!result.ok) throw new Error('expected ok');

    // A short VIN would reach the identification score as evidence.
    expect(result.value.vin).toBeNull();
    await subject.disconnect();
  });

  it('reports the ECUs that answered, and claims no discovery beyond them', async () => {
    const subject = provider();
    await subject.connect();

    const result = await subject.getModules();
    if (!result.ok) throw new Error('expected ok');

    // Observed from response headers, not assumed. 7E8 is in the range ISO
    // 15765-4 reserves for emissions-related powertrain ECUs.
    expect(result.value.map((m) => m.address)).toEqual(['7E8']);
    expect(result.value[0]?.system).toBe('ENGINE');

    // Reaching anything beyond the legislated range needs manufacturer
    // addressing this build has no table for, so the capability is not claimed.
    expect(subject.describe().capabilities).not.toContain('DISCOVER_MODULES');

    await subject.disconnect();
  });

  it('reports a slower stream rate than requested when it cannot keep up', async () => {
    const subject = provider();
    await subject.connect();

    // An ELM327 answers one command at a time, so ten parameters cannot be
    // read at 100 ms. The achievable rate is reported, not the requested one.
    const stream = await subject.startStream({
      parameterIds: Array.from({ length: 10 }, () => 'ENGINE_RPM'),
      intervalMs: 100,
      onSample: () => {},
    });

    if (!stream.ok) throw new Error('expected ok');
    expect(stream.value.intervalMs).toBeGreaterThan(100);

    stream.value.stop();
    await subject.disconnect();
  });

  it('refuses to read when not connected', async () => {
    const result = await provider().getLiveData(['ENGINE_RPM']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_CONNECTED');
  });

  it('reports an unavailable link rather than failing silently', async () => {
    const subject = new Elm327Provider({
      link: new ScriptedObdLink({ responses: {}, available: false }),
    });

    const result = await subject.connect();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_SUPPORTED');
  });
});
