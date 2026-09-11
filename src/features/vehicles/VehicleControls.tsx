'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button, Modal } from '@/components/ui';
import { deleteVehicleAction, setPrimaryVehicleAction } from './actions';

function PendingButton({
  label,
  pendingLabel,
  variant = 'secondary',
}: {
  label: string;
  pendingLabel: string;
  variant?: 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} loading={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function SetPrimaryButton({ vehicleId }: { vehicleId: string }) {
  return (
    <form action={setPrimaryVehicleAction}>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <PendingButton label="Make primary" pendingLabel="Saving…" />
    </form>
  );
}

/**
 * Deleting a vehicle will eventually hide its diagnostic history, so it asks
 * first and says plainly what is kept.
 */
export function DeleteVehicleButton({
  vehicleId,
  vehicleName,
}: {
  vehicleId: string;
  vehicleName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Remove
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Remove ${vehicleName}?`}
        description="It will no longer appear in your vehicles."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <form action={deleteVehicleAction}>
              <input type="hidden" name="vehicleId" value={vehicleId} />
              <PendingButton label="Remove vehicle" pendingLabel="Removing…" variant="danger" />
            </form>
          </>
        }
      >
        <p className="text-content-secondary">
          The record is retained rather than erased, so any diagnostic history recorded against it
          stays intact. The VIN is released, so you can add the vehicle again later.
        </p>
      </Modal>
    </>
  );
}
