-- AlterTable
ALTER TABLE `vehicles` ADD COLUMN `displayName` VARCHAR(80) NULL,
    ADD COLUMN `vin` VARCHAR(17) NULL,
    MODIFY `make` VARCHAR(64) NULL,
    MODIFY `model` VARCHAR(64) NULL,
    MODIFY `year` SMALLINT NULL;

-- CreateTable
CREATE TABLE `vehicle_identifications` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `status` ENUM('UNIDENTIFIED', 'PARTIALLY_IDENTIFIED', 'IDENTIFIED', 'CONFLICTED') NOT NULL DEFAULT 'UNIDENTIFIED',
    `confidence` INTEGER NOT NULL DEFAULT 0,
    `source` ENUM('USER_ENTERED', 'VIN_DECODED', 'OBD_REPORTED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `vinStructurallyValid` BOOLEAN NULL,
    `vinCheckDigitValid` BOOLEAN NULL,
    `hasConflict` BOOLEAN NOT NULL DEFAULT false,
    `assessedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicle_identifications_vehicleId_key`(`vehicleId`),
    INDEX `vehicle_identifications_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_configurations` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `engineCode` VARCHAR(32) NULL,
    `engineDisplacementCc` SMALLINT NULL,
    `engineCylinders` TINYINT NULL,
    `fuelType` ENUM('PETROL', 'DIESEL', 'HYBRID_PETROL', 'HYBRID_DIESEL', 'PLUG_IN_HYBRID', 'ELECTRIC', 'LPG', 'CNG', 'OTHER') NULL,
    `transmissionType` ENUM('MANUAL', 'AUTOMATIC', 'CVT', 'DUAL_CLUTCH', 'AUTOMATED_MANUAL', 'REDUCTION_GEAR', 'OTHER') NULL,
    `transmissionGears` TINYINT NULL,
    `driveType` ENUM('FWD', 'RWD', 'AWD', 'FOUR_WD') NULL,
    `ecuName` VARCHAR(64) NULL,
    `obdProtocol` ENUM('SAE_J1850_PWM', 'SAE_J1850_VPW', 'ISO_9141_2', 'ISO_14230_4_KWP_5BAUD', 'ISO_14230_4_KWP_FAST', 'ISO_15765_4_CAN_11B_500K', 'ISO_15765_4_CAN_29B_500K', 'ISO_15765_4_CAN_11B_250K', 'ISO_15765_4_CAN_29B_250K', 'SAE_J1939_CAN', 'UNKNOWN') NULL,
    `supportsObd2` BOOLEAN NULL,
    `source` ENUM('USER_ENTERED', 'VIN_DECODED', 'OBD_REPORTED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `vehicle_configurations_vehicleId_key`(`vehicleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_modules` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `system` ENUM('ENGINE', 'TRANSMISSION', 'ABS', 'SRS', 'BODY', 'CLIMATE', 'INSTRUMENT_CLUSTER', 'STEERING', 'IMMOBILISER', 'HYBRID_BATTERY', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `address` VARCHAR(8) NULL,
    `protocol` ENUM('SAE_J1850_PWM', 'SAE_J1850_VPW', 'ISO_9141_2', 'ISO_14230_4_KWP_5BAUD', 'ISO_14230_4_KWP_FAST', 'ISO_15765_4_CAN_11B_500K', 'ISO_15765_4_CAN_29B_500K', 'ISO_15765_4_CAN_11B_250K', 'ISO_15765_4_CAN_29B_250K', 'SAE_J1939_CAN', 'UNKNOWN') NULL,
    `status` ENUM('DETECTED', 'NOT_RESPONDING', 'NOT_SUPPORTED', 'ERROR', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `discoveredAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `vehicle_modules_vehicleId_idx`(`vehicleId`),
    INDEX `vehicle_modules_vehicleId_system_idx`(`vehicleId`, `system`),
    UNIQUE INDEX `vehicle_modules_vehicleId_address_key`(`vehicleId`, `address`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `vehicles_ownerId_vin_key` ON `vehicles`(`ownerId`, `vin`);

-- AddForeignKey
ALTER TABLE `vehicle_identifications` ADD CONSTRAINT `vehicle_identifications_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_configurations` ADD CONSTRAINT `vehicle_configurations_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_modules` ADD CONSTRAINT `vehicle_modules_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
