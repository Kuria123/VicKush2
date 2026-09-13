-- CreateTable
CREATE TABLE `audit_events` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` ENUM('VEHICLE_CREATED', 'VEHICLE_UPDATED', 'VEHICLE_DELETED', 'SESSION_SAVED', 'DTCS_CLEARED', 'REPAIR_RECORDED', 'REPAIR_VERIFIED', 'QUOTE_RECORDED', 'AI_EXPLANATION_REQUESTED', 'AI_MECHANIC_REQUESTED', 'RATE_LIMITED') NOT NULL,
    `vehicleId` VARCHAR(191) NULL,
    `detail` VARCHAR(300) NULL,
    `succeeded` BOOLEAN NOT NULL DEFAULT true,
    `occurredAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_events_userId_occurredAt_idx`(`userId`, `occurredAt`),
    INDEX `audit_events_vehicleId_occurredAt_idx`(`vehicleId`, `occurredAt`),
    INDEX `audit_events_action_occurredAt_idx`(`action`, `occurredAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
