'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  hasCapability,
  supportsFaultInjection,
  type ProviderError,
  type VehicleDataProvider,
} from '@/domain/telemetry';
// Protocol labels belong to the vehicle domain, which owns that vocabulary.
import { OBD_PROTOCOL_LABELS, type ObdProtocol } from '@/domain/vehicles';
import { SIMULATED_PROVIDER_ID, createProvider } from '@/services/obd/registry';

import {
  initialPhases,
  type ConnectionPhaseId,
  type ConnectionState,
  type ConnectionSummary,
  type PhaseState,
} from './types';

/**
 * Drives the connection sequence against a real provider.
 *
 * The provider lives in the browser. That is not a convenience: Web Bluetooth
 * and WebUSB are browser APIs, so when real adapters arrive they sit in this
 * same place. The server never handles raw telemetry; it will only persist
 * finished sessions, from Stage 15.
 *
 * Every phase performs an actual operation and reports what came back. The
 * only pause in the whole sequence is the provider's own connect handshake,
 * which stands in for an adapter initialising — there are no delays added to
 * make the screen look busy.
 */

export interface UseVehicleConnectionResult extends ConnectionState {
  connect: () => void;
  disconnect: () => void;
  /** Exposed so Stage 8 can stream from the same live session. */
  provider: VehicleDataProvider | null;
  scenarios: readonly string[];
  activeScenario: string | null;
  setScenario: (scenario: string) => void;
  injectDtc: (code: string) => string | null;
  clearFaults: () => void;
  /** Null when the provider does not model a driver, so the UI can omit it. */
  setThrottle: ((percent: number) => void) | null;
}

export function useVehicleConnection(): UseVehicleConnectionResult {
  /**
   * The instance is held twice on purpose. The ref is what the async
   * callbacks and the unmount cleanup read, because those run outside render
   * and need the latest value without re-subscribing. The state copy is what
   * is handed to callers, because reading a ref during render is not allowed
   * and would not re-render a consumer when the provider appeared.
   */
  const providerRef = useRef<VehicleDataProvider | null>(null);
  const [provider, setProvider] = useState<VehicleDataProvider | null>(null);
  const cancelledRef = useRef(false);

  const [phases, setPhases] = useState<PhaseState[]>(initialPhases);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState<ConnectionSummary | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [transport, setTransport] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<readonly string[]>([]);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);

  const update = useCallback((id: ConnectionPhaseId, patch: Partial<PhaseState>) => {
    setPhases((current) =>
      current.map((phase) => (phase.id === id ? { ...phase, ...patch } : phase)),
    );
  }, []);

  /**
   * Selects the provider on mount so its nature is known before anything is
   * connected.
   *
   * Reading `isSimulated` inside `connect()` meant the SIMULATION MODE banner
   * only appeared once a connection had succeeded — the disclosure arriving
   * after the thing it discloses. The descriptor is static and safe to read
   * at any time, so it is read immediately.
   */
  useEffect(() => {
    cancelledRef.current = false;

    if (!providerRef.current) {
      providerRef.current = createProvider(SIMULATED_PROVIDER_ID);
      setProvider(providerRef.current);
    }
    const instance = providerRef.current;
    if (instance) {
      const descriptor = instance.describe();
      setIsSimulated(descriptor.isSimulated);
      setProviderName(descriptor.name);
      setTransport(descriptor.transport);
      if (supportsFaultInjection(instance)) {
        setScenarios(instance.listScenarios());
        setActiveScenario(instance.listScenarios()[0] ?? null);
      }
    }

    return () => {
      cancelledRef.current = true;
      void providerRef.current?.disconnect();
    };
  }, []);

  const connect = useCallback(async () => {
    cancelledRef.current = false;
    setPhases(initialPhases());
    setSummary(null);
    setReady(false);
    setRunning(true);

    const instance = providerRef.current ?? createProvider(SIMULATED_PROVIDER_ID);
    if (!instance) {
      setRunning(false);
      update('CONNECT', {
        status: 'FAILED',
        error: {
          code: 'DEVICE_ERROR',
          message: 'No vehicle data provider is registered.',
          retryable: false,
        },
      });
      return;
    }

    providerRef.current = instance;
    setProvider(instance);
    const descriptor = instance.describe();
    setIsSimulated(descriptor.isSimulated);
    setProviderName(descriptor.name);
    setTransport(descriptor.transport);

    if (supportsFaultInjection(instance)) {
      setScenarios(instance.listScenarios());
      setActiveScenario(instance.listScenarios()[0] ?? null);
    }

    const fail = (id: ConnectionPhaseId, error: ProviderError) => {
      update(id, { status: 'FAILED', error, detail: error.message });
      setRunning(false);
    };

    /* --- CONNECT ------------------------------------------------------- */
    update('CONNECT', { status: 'ACTIVE' });
    const connected = await instance.connect();
    if (cancelledRef.current) return;
    if (!connected.ok) return fail('CONNECT', connected.error);
    update('CONNECT', { status: 'DONE', detail: 'Link established' });

    /* --- DEVICE -------------------------------------------------------- */
    update('DEVICE', {
      status: 'DONE',
      detail: `${descriptor.name} · ${descriptor.transport.toLowerCase()}`,
    });

    /* --- IDENTIFY ------------------------------------------------------ */
    update('IDENTIFY', { status: 'ACTIVE' });
    const identity = await instance.identifyVehicle();
    if (cancelledRef.current) return;
    if (!identity.ok) return fail('IDENTIFY', identity.error);

    const report = identity.value;
    update('IDENTIFY', {
      status: 'DONE',
      // A provider that cannot read a VIN says so, rather than the screen
      // implying it found one.
      detail: report.vin
        ? `VIN ${report.vin}`
        : hasCapability(descriptor, 'READ_VIN')
          ? 'No VIN returned'
          : 'VIN not supported by this adapter',
    });

    /* --- ECU ----------------------------------------------------------- */
    update('ECU', {
      status: report.ecuName ? 'DONE' : 'SKIPPED',
      detail: report.ecuName
        ? `${report.ecuName}${
            report.protocol
              ? ` · ${OBD_PROTOCOL_LABELS[report.protocol as ObdProtocol] ?? report.protocol}`
              : ''
          }`
        : 'No ECU information returned',
    });

    /* --- MODULES ------------------------------------------------------- */
    update('MODULES', { status: 'ACTIVE' });
    const modules = await instance.getModules();
    if (cancelledRef.current) return;
    if (!modules.ok) return fail('MODULES', modules.error);

    const responding = modules.value.filter((m) => m.responding).length;
    const silent = modules.value.length - responding;
    update('MODULES', {
      status: 'DONE',
      // Silent modules are reported, not hidden: "3 found" when one cannot be
      // reached would overstate what is actually available.
      detail:
        silent > 0
          ? `${responding} responding, ${silent} not responding`
          : `${responding} responding`,
    });

    /* --- DATA ---------------------------------------------------------- */
    update('DATA', { status: 'ACTIVE' });
    const parameters = await instance.getSupportedParameters();
    if (cancelledRef.current) return;
    if (!parameters.ok) return fail('DATA', parameters.error);

    const dtcs = hasCapability(descriptor, 'READ_DTCS') ? await instance.getDtcs() : null;
    if (cancelledRef.current) return;
    if (dtcs && !dtcs.ok) return fail('DATA', dtcs.error);

    const stored = dtcs?.ok ? dtcs.value.filter((d) => d.status === 'STORED').length : 0;

    update('DATA', {
      status: 'DONE',
      detail: `${parameters.value.length} parameters available${
        dtcs ? `, ${stored} stored fault${stored === 1 ? '' : 's'}` : ''
      }`,
    });

    /* --- READY --------------------------------------------------------- */
    update('READY', { status: 'DONE', detail: 'Vehicle ready' });

    setSummary({
      vin: report.vin,
      ecuName: report.ecuName,
      protocol: report.protocol,
      supportsObd2: report.supportsObd2,
      modulesResponding: responding,
      modulesFound: modules.value.length,
      supportedParameterCount: parameters.value.length,
      storedDtcCount: stored,
    });
    setReady(true);
    setRunning(false);
  }, [update]);

  const disconnect = useCallback(async () => {
    cancelledRef.current = true;
    await providerRef.current?.disconnect();
    // The provider instance is kept so the descriptor — and therefore the
    // simulation disclosure — survives a disconnect.
    setPhases(initialPhases());
    setSummary(null);
    setReady(false);
    setRunning(false);
  }, []);

  const setScenario = useCallback((scenario: string) => {
    const provider = providerRef.current;
    if (!provider || !supportsFaultInjection(provider)) return;
    if (provider.setScenario(scenario).ok) setActiveScenario(scenario);
  }, []);

  /** Returns an error message, or null on success. */
  const injectDtc = useCallback((code: string): string | null => {
    const provider = providerRef.current;
    if (!provider || !supportsFaultInjection(provider)) {
      return 'This provider cannot inject faults.';
    }
    const result = provider.injectDtc(code);
    return result.ok ? null : result.error.message;
  }, []);

  const clearFaults = useCallback(() => {
    const provider = providerRef.current;
    if (provider && supportsFaultInjection(provider)) provider.clearInjectedFaults();
  }, []);

  const setThrottle = useCallback((percent: number) => {
    const instance = providerRef.current;
    if (instance && supportsFaultInjection(instance)) instance.setThrottle?.(percent);
  }, []);

  // Read from state rather than the ref: this decides whether a control is
  // rendered, and reading a ref during render is not allowed.
  const canThrottle =
    provider !== null &&
    supportsFaultInjection(provider) &&
    typeof provider.setThrottle === 'function';

  return {
    phases,
    ready,
    running,
    summary,
    isSimulated,
    providerName,
    transport,
    provider,
    scenarios,
    activeScenario,
    connect: () => void connect(),
    disconnect: () => void disconnect(),
    setScenario,
    injectDtc,
    clearFaults,
    setThrottle: canThrottle ? setThrottle : null,
  };
}
