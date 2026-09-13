/**
 * A byte pipe to an OBD adapter.
 *
 * Named `ObdLink` rather than `Transport`, which this domain already uses for
 * the *name* of a connection kind. Two meanings of one word in the same
 * namespace is how the wrong one gets imported.
 *
 * Deliberately tiny: open, send a line, read until the prompt, close. Every
 * adapter this build targets — Bluetooth, USB serial, Wi-Fi — is a serial link
 * underneath, and an abstraction that admitted more than this would be
 * modelling differences that do not exist.
 *
 * Keeping it this small is also what makes the untestable surface small. The
 * protocol above it is pure and fully tested; a transport is a few dozen lines
 * of browser API calls, and confining the unverifiable part to those lines is
 * the point of the seam.
 */

export type ObdLinkKind = 'BLUETOOTH' | 'USB_SERIAL' | 'WIFI';

export interface ObdLinkDescriptor {
  id: string;
  name: string;
  kind: ObdLinkKind;
  /**
   * Whether this transport has ever been exercised against real hardware by
   * this project.
   *
   * Stated rather than assumed. A transport written from a datasheet and never
   * run against a device is not the same thing as one that has been, and a
   * user relying on a diagnosis is entitled to know which they have.
   */
  verifiedAgainstHardware: boolean;
  /** Why it is unverified, when it is. Shown to the user. */
  verificationNote: string | null;
}

export interface ObdLinkError {
  code: 'UNAVAILABLE' | 'PERMISSION_DENIED' | 'NOT_CONNECTED' | 'TIMEOUT' | 'IO_ERROR';
  message: string;
}

export type ObdLinkResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ObdLinkError };

export interface ObdLink {
  describe(): ObdLinkDescriptor;
  /** Whether this environment offers the underlying API at all. */
  isAvailable(): boolean;
  open(): Promise<ObdLinkResult<void>>;
  /**
   * Sends a command and returns everything up to the adapter's prompt.
   *
   * One call, one exchange. An adapter answers one command at a time, so
   * anything else would need a correlation scheme the hardware does not
   * provide.
   */
  exchange(command: string, timeoutMs: number): Promise<ObdLinkResult<string>>;
  close(): Promise<void>;
}
