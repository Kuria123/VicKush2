-- AlterTable
ALTER TABLE `vehicle_events` ADD COLUMN `repairId` VARCHAR(191) NULL,
    MODIFY `kind` ENUM('SCAN_RECORDED', 'DTC_OBSERVED', 'FINDING_RAISED', 'DIAGNOSIS_REACHED', 'TEST_PERFORMED', 'MAINTENANCE_LOGGED', 'REPAIR_RECORDED', 'VERIFICATION_COMPLETED') NOT NULL;

-- CreateTable
CREATE TABLE `repair_events` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `performedAt` DATETIME(3) NOT NULL,
    `summary` VARCHAR(160) NOT NULL,
    `notes` VARCHAR(1000) NULL,
    `guideId` VARCHAR(64) NULL,
    `causeId` VARCHAR(64) NULL,
    `beforeSessionId` VARCHAR(191) NOT NULL,
    `afterSessionId` VARCHAR(191) NULL,
    `verdict` ENUM('CONSISTENT_WITH_REPAIR', 'NOT_DEMONSTRATED', 'WORSENED', 'INCONCLUSIVE') NULL,
    `verifiedAt` DATETIME(3) NULL,
    `comparison` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `repair_events_vehicleId_performedAt_idx`(`vehicleId`, `performedAt`),
    INDEX `repair_events_beforeSessionId_idx`(`beforeSessionId`),
    INDEX `repair_events_afterSessionId_idx`(`afterSessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `vehicle_events_repairId_idx` ON `vehicle_events`(`repairId`);

-- AddForeignKey
ALTER TABLE `repair_events` ADD CONSTRAINT `repair_events_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_events` ADD CONSTRAINT `repair_events_beforeSessionId_fkey` FOREIGN KEY (`beforeSessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `repair_events` ADD CONSTRAINT `repair_events_afterSessionId_fkey` FOREIGN KEY (`afterSessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_events` ADD CONSTRAINT `vehicle_events_repairId_fkey` FOREIGN KEY (`repairId`) REFERENCES `repair_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
