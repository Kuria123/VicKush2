'use client';

import { useRef, useState } from 'react';

import { Badge, Button, Card, CardHeader } from '@/components/ui';
import { BASIS_LABELS, type Proposal, type RecognitionResult } from '@/domain/recognition';

import { captureFrom, MAX_IMAGES, type CapturedImage } from './capture';
import type { VehicleFormDefaults } from './VehicleForm';

/**
 * Adding a vehicle from photographs.
 *
 * The screen is built around one distinction, because everything that could go
 * wrong here goes wrong by blurring it: what the model **read** off the
 * vehicle, and what it **guessed** from its shape. Each proposed field carries
 * its basis and the observation behind it, in the same weight of text as the
 * value — a confidence figure alone would be a number nobody can check.
 *
 * Nothing is saved from this panel. It fills the form below, which the owner
 * then reads, corrects and submits exactly as if they had typed it. That is
 * what keeps a model's guess from becoming a stored fact: a person has to
 * agree with it first, and can see what they are agreeing to.
 */

export interface RecognisePanelProps {
  /** Called with what the owner may accept into the form. */
  onProposed: (defaults: VehicleFormDefaults) => void;
}

type Phase =
  | { kind: 'IDLE' }
  | { kind: 'READING' }
  | { kind: 'EXAMINING' }
  | { kind: 'DONE'; result: RecognitionResult }
  | { kind: 'FAILED'; message: string; configured: boolean };

export function RecognisePanel({ onProposed }: RecognisePanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'IDLE' });
  const [images, setImages] = useState<CapturedImage[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    setPhase({ kind: 'READING' });
    setImages([]);

    // Frames are cut from the video here, in the browser. The clip itself
    // never leaves the device — it is tens of megabytes of the owner's
    // driveway, their house and their number plate, and the model needs eight
    // stills out of it.
    const captured = await captureFrom(Array.from(files));
    if (!captured.ok) {
      setPhase({ kind: 'FAILED', message: captured.message, configured: true });
      return;
    }

    setImages(captured.images);
    setPhase({ kind: 'EXAMINING' });

    try {
      const response = await fetch('/api/v1/vehicles/recognise', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          images: captured.images.map((image) => ({
            base64: image.base64,
            mediaType: image.mediaType,
            ...(image.atSeconds === undefined ? {} : { atSeconds: image.atSeconds }),
          })),
        }),
      });

      const payload = (await response.json()) as {
        result?: RecognitionResult;
        error?: string;
        reason?: string;
      };

      if (!response.ok || !payload.result) {
        // Rule 3: "no vision model is configured" and "that photo was
        // unreadable" ask completely different things of the reader, so the
        // reason survives rather than becoming one generic failure.
        setPhase({
          kind: 'FAILED',
          message: payload.error ?? 'The images could not be examined.',
          configured: payload.reason !== 'NOT_CONFIGURED',
        });
        return;
      }

      setPhase({ kind: 'DONE', result: payload.result });
    } catch {
      setPhase({
        kind: 'FAILED',
        message: 'The images could not be sent. Check the connection and try again.',
        configured: true,
      });
    }
  }

  function accept(result: RecognitionResult) {
    const { proposed } = result;
    onProposed({
      make: valueOf(proposed.make),
      model: valueOf(proposed.model),
      year: valueOf(proposed.year),
      vin: valueOf(proposed.vin),
      fuelType: valueOf(proposed.fuelType),
      transmissionType: valueOf(proposed.transmissionType),
    });
  }

  return (
    <Card>
      <CardHeader
        title="Add from a photo or video"
        description="Photograph the vehicle, or record a slow walk around it. Whatever is recognised is filled into the form below for you to check — nothing is saved until you do."
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => void onFiles(event.target.files)}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          loading={phase.kind === 'READING' || phase.kind === 'EXAMINING'}
        >
          Choose photos or a video
        </Button>
        <span className="text-content-muted text-xs">
          Up to {MAX_IMAGES} images. A video is sampled into frames on this device; the video
          itself is never uploaded.
        </span>
      </div>

      {phase.kind === 'READING' && (
        <p role="status" className="text-content-secondary mt-4 text-sm">
          Reading the files…
        </p>
      )}

      {images.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <li key={`${image.preview.slice(-24)}-${index}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL from this device, never a remote asset */}
              <img
                src={image.preview}
                alt={
                  image.atSeconds === undefined
                    ? `Photo ${index + 1} being examined`
                    : `Frame at ${image.atSeconds} seconds being examined`
                }
                className="border-line h-16 w-24 rounded border object-cover"
              />
            </li>
          ))}
        </ul>
      )}

      {phase.kind === 'EXAMINING' && (
        <p role="status" className="text-content-secondary mt-4 text-sm">
          Examining {images.length} image{images.length === 1 ? '' : 's'}…
        </p>
      )}

      {phase.kind === 'FAILED' && (
        <div className="mt-4">
          <p role="alert" className="text-status-fault text-sm">
            {phase.message}
          </p>
          {!phase.configured && (
            <p className="text-content-secondary mt-2 text-sm">
              Recognition is an optional extra. Filling the form in by hand works exactly as it
              always has, and produces a better identification score than a photograph can.
            </p>
          )}
        </div>
      )}

      {phase.kind === 'DONE' && <Proposals result={phase.result} onAccept={accept} />}
    </Card>
  );
}

function Proposals({
  result,
  onAccept,
}: {
  result: RecognitionResult;
  onAccept: (result: RecognitionResult) => void;
}) {
  const rows = [
    ['Make', result.proposed.make],
    ['Model', result.proposed.model],
    ['Year', result.proposed.year],
    ['VIN', result.proposed.vin],
    ['Fuel', result.proposed.fuelType],
    ['Transmission', result.proposed.transmissionType],
    ['Registration', result.proposed.registrationPlate],
    ['Colour', result.proposed.bodyColour],
  ] as const;

  const anything = rows.some(([, proposal]) => proposal.established);

  return (
    <div className="mt-6">
      {!anything ? (
        // Eight rows of "not established" is a failure, not a result. Showing
        // it as one implies the vehicle was examined and found featureless.
        <p className="text-content-secondary text-sm">
          Nothing could be established from those images. A clearer photograph of the badge, or of
          the VIN plate in the door frame, gives it more to work with — or fill the form in below.
        </p>
      ) : (
        <>
          <dl className="divide-line divide-y">
            {rows.map(([label, proposal]) => (
              <ProposalRow key={label} label={label} proposal={proposal} />
            ))}
          </dl>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button onClick={() => onAccept(result)}>Use these in the form</Button>
            <span className="text-content-muted text-xs">
              You can change anything after it is filled in.
            </span>
          </div>
        </>
      )}

      <div className="border-line mt-6 border-t pt-4">
        <p className="label-technical">What this does not establish</p>
        <ul className="text-content-secondary mt-2 space-y-1 text-sm">
          {result.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </div>

      {result.rejected.length > 0 && (
        <details className="mt-4">
          <summary className="text-content-secondary cursor-pointer text-sm">
            {result.rejected.length} claim{result.rejected.length === 1 ? ' was' : 's were'} rejected
          </summary>
          {/* Kept visible rather than dropped: how often this happens is worth
              being able to see, and a silent discard hides it (Rule 3). */}
          <ul className="text-content-muted mt-2 space-y-2 text-xs">
            {result.rejected.map((claim, index) => (
              <li key={`${claim.field}-${index}`}>
                <span className="font-medium">{claim.field}</span>: “{claim.claimed}” — {claim.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ProposalRow({ label, proposal }: { label: string; proposal: Proposal<unknown> }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="text-content-secondary text-sm">{label}</dt>
      <dd className="min-w-0 text-sm">
        {proposal.established ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{String(proposal.value)}</span>
              <Badge
                technical
                tone={proposal.basis === 'INFERRED_FROM_APPEARANCE' ? 'warn' : 'neutral'}
              >
                {BASIS_LABELS[proposal.basis]}
              </Badge>
              <span className="text-content-muted text-xs">{proposal.confidence}%</span>
            </div>
            <p className="text-content-muted mt-1 text-xs">{proposal.observation}</p>
          </>
        ) : (
          <span className="text-content-muted">{proposal.reason}</span>
        )}
      </dd>
    </div>
  );
}

function valueOf<T>(proposal: Proposal<T>): T | null {
  return proposal.established ? proposal.value : null;
}
