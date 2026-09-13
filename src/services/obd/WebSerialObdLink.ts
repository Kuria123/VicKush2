import { PROMPT } from '@/domain/obd';
import type { ObdLink, ObdLinkDescriptor, ObdLinkResult } from '@/domain/telemetry';

/**
 * A link over Web Serial, for a USB or Bluetooth-serial ELM327.
 *
 * **This has never been run against an adapter.** It is written from the Web
 * Serial specification and the ELM327 datasheet, and it is the only part of
 * real OBD support this project cannot test: doing so needs a physical
 * adapter and a vehicle, and there is neither here.
 *
 * That is declared on the descriptor rather than left in a comment, so the
 * connection screen can say it before anyone relies on a reading. The
 * alternative — shipping it silently alongside code that *has* been tested —
 * would make an untested path indistinguishable from a verified one, which is
 * the kind of quiet claim this whole project has been built to avoid.
 *
 * Everything above this file is tested: command construction, response
 * parsing, byte decoding and capability negotiation all run against recorded
 * adapter output. The unverified surface is deliberately confined to these few
 * dozen lines.
 */

/** Web Serial is not in the DOM lib, so the shape used here is declared. */
interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

function serial(): SerialLike | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as Navigator & { serial?: SerialLike }).serial;
  return candidate ?? null;
}

/** ELM327 clones are near-universally 38400; some are 9600. */
const DEFAULT_BAUD_RATE = 38_400;

export class WebSerialObdLink implements ObdLink {
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;

  constructor(private readonly baudRate: number = DEFAULT_BAUD_RATE) {}

  describe(): ObdLinkDescriptor {
    return {
      id: 'web-serial',
      name: 'USB or serial adapter',
      kind: 'USB_SERIAL',
      verifiedAgainstHardware: false,
      verificationNote:
        'This connection has never been tested against a physical adapter. It is written from the Web Serial specification and the ELM327 datasheet. The protocol and decoding above it are fully tested; this layer is not.',
    };
  }

  isAvailable(): boolean {
    return serial() !== null;
  }

  async open(): Promise<ObdLinkResult<void>> {
    const api = serial();
    if (!api) {
      return {
        ok: false,
        error: {
          code: 'UNAVAILABLE',
          message: 'This browser does not support Web Serial. Chrome or Edge on desktop does.',
        },
      };
    }

    try {
      // Must be called from a user gesture; the browser shows a port chooser.
      this.port = await api.requestPort();
      await this.port.open({ baudRate: this.baudRate });

      if (!this.port.readable || !this.port.writable) {
        return {
          ok: false,
          error: { code: 'IO_ERROR', message: 'The port opened without a readable stream.' },
        };
      }

      this.reader = this.port.readable.getReader();
      this.writer = this.port.writable.getWriter();

      return { ok: true, value: undefined };
    } catch (cause) {
      // A user dismissing the chooser throws, and is not an error worth
      // reporting as a fault (Rule 3 applies to real faults, not to choices).
      const message = cause instanceof Error ? cause.message : String(cause);
      return {
        ok: false,
        error: {
          code: /denied|cancel|no port/i.test(message) ? 'PERMISSION_DENIED' : 'IO_ERROR',
          message,
        },
      };
    }
  }

  async exchange(command: string, timeoutMs: number): Promise<ObdLinkResult<string>> {
    if (!this.reader || !this.writer) {
      return { ok: false, error: { code: 'NOT_CONNECTED', message: 'The port is not open.' } };
    }

    try {
      await this.writer.write(new TextEncoder().encode(`${command}\r`));
    } catch (cause) {
      return {
        ok: false,
        error: { code: 'IO_ERROR', message: `Could not write to the adapter: ${String(cause)}` },
      };
    }

    /*
     * Read until the adapter prints its prompt.
     *
     * The prompt, not a line break: an ELM327 sends several lines for one
     * response and only the prompt marks the end. Stopping at the first
     * newline would truncate every multi-frame reply, which is exactly the
     * case that matters for a VIN.
     */
    const deadline = Date.now() + timeoutMs;
    let buffer = '';

    while (!buffer.includes(PROMPT)) {
      if (Date.now() > deadline) {
        return {
          ok: false,
          error: {
            code: 'TIMEOUT',
            message: `The adapter did not answer "${command}" within ${timeoutMs / 1000} seconds.`,
          },
        };
      }

      try {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) buffer += new TextDecoder().decode(value);
      } catch (cause) {
        return {
          ok: false,
          error: { code: 'IO_ERROR', message: `Read failed: ${String(cause)}` },
        };
      }
    }

    return { ok: true, value: buffer };
  }

  async close(): Promise<void> {
    // Each step is guarded: a half-open port must still release what it can.
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
    } catch {
      // Already released.
    }
    try {
      await this.writer?.close();
    } catch {
      // Already closed.
    }
    try {
      await this.port?.close();
    } catch {
      // Already closed.
    }

    this.reader = null;
    this.writer = null;
    this.port = null;
  }
}
