-- CreateTable
CREATE TABLE `scan_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `providerName` VARCHAR(64) NOT NULL,
    `isSimulated` BOOLEAN NOT NULL,
    `scenario` VARCHAR(48) NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `sampleCount` INTEGER NOT NULL DEFAULT 0,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `conditionsObserved` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `scan_sessions_vehicleId_startedAt_idx`(`vehicleId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session_dtcs` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(8) NOT NULL,
    `status` ENUM('STORED', 'PENDING', 'PERMANENT') NOT NULL DEFAULT 'STORED',
    `moduleAddress` VARCHAR(8) NULL,
    `firstSeenAt` DATETIME(3) NOT NULL,

    INDEX `session_dtcs_sessionId_idx`(`sessionId`),
    UNIQUE INDEX `session_dtcs_sessionId_code_key`(`sessionId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parameter_stats` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `parameterId` VARCHAR(48) NOT NULL,
    `condition` VARCHAR(24) NOT NULL,
    `samples` INTEGER NOT NULL,
    `mean` DOUBLE NOT NULL,
    `min` DOUBLE NOT NULL,
    `max` DOUBLE NOT NULL,
    `unit` VARCHAR(16) NULL,

    INDEX `parameter_stats_sessionId_idx`(`sessionId`),
    INDEX `parameter_stats_parameterId_idx`(`parameterId`),
    UNIQUE INDEX `parameter_stats_sessionId_parameterId_condition_key`(`sessionId`, `parameterId`, `condition`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnoses` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NOT NULL,
    `verdict` ENUM('SINGLE_LEADING', 'AMBIGUOUS', 'INSUFFICIENT') NOT NULL,
    `limitations` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `diagnoses_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnosis_findings` (
    `id` VARCHAR(191) NOT NULL,
    `diagnosisId` VARCHAR(191) NOT NULL,
    `findingId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `system` ENUM('FUEL', 'AIR', 'IGNITION', 'COOLING', 'ELECTRICAL', 'TRANSMISSION', 'EMISSIONS', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `severity` ENUM('INFO', 'ADVISORY', 'SIGNIFICANT', 'SEVERE') NOT NULL DEFAULT 'INFO',
    `supporting` JSON NOT NULL,
    `opposing` JSON NOT NULL,

    INDEX `diagnosis_findings_diagnosisId_idx`(`diagnosisId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diagnosis_causes` (
    `id` VARCHAR(191) NOT NULL,
    `diagnosisId` VARCHAR(191) NOT NULL,
    `causeId` VARCHAR(64) NOT NULL,
    `label` VARCHAR(160) NOT NULL,
    `system` ENUM('FUEL', 'AIR', 'IGNITION', 'COOLING', 'ELECTRICAL', 'TRANSMISSION', 'EMISSIONS', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `mechanism` TEXT NOT NULL,
    `status` ENUM('SUPPORTED', 'POSSIBLE', 'RULED_OUT') NOT NULL,
    `confidence` INTEGER NOT NULL,
    `pointsEarned` INTEGER NOT NULL,
    `pointsAvailable` INTEGER NOT NULL,
    `keyObservationMade` BOOLEAN NOT NULL DEFAULT false,
    `contributions` JSON NOT NULL,
    `exclusions` JSON NOT NULL,

    INDEX `diagnosis_causes_diagnosisId_idx`(`diagnosisId`),
    INDEX `diagnosis_causes_causeId_idx`(`causeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `confirmation_test_runs` (
    `id` VARCHAR(191) NOT NULL,
    `diagnosisId` VARCHAR(191) NOT NULL,
    `testId` VARCHAR(64) NOT NULL,
    `outcome` ENUM('PASS', 'FAIL', 'NORMAL', 'ABNORMAL', 'UNABLE_TO_PERFORM', 'SKIP') NOT NULL,
    `note` VARCHAR(500) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `confirmation_test_runs_diagnosisId_idx`(`diagnosisId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_records` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `performedAt` DATETIME(3) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `notes` VARCHAR(1000) NULL,
    `odometerKm` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `maintenance_records_vehicleId_performedAt_idx`(`vehicleId`, `performedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_interactions` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `kind` ENUM('EXPLANATION', 'CONVERSATION') NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `context` TEXT NOT NULL,
    `output` TEXT NULL,
    `grounded` BOOLEAN NOT NULL DEFAULT true,
    `violations` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ai_interactions_vehicleId_createdAt_idx`(`vehicleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vehicle_events` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `kind` ENUM('SCAN_RECORDED', 'DTC_OBSERVED', 'FINDING_RAISED', 'DIAGNOSIS_REACHED', 'TEST_PERFORMED', 'MAINTENANCE_LOGGED') NOT NULL,
    `occurredAt` DATETIME(3) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `detail` VARCHAR(1000) NULL,
    `severity` ENUM('INFO', 'ADVISORY', 'SIGNIFICANT', 'SEVERE') NULL,
    `system` ENUM('FUEL', 'AIR', 'IGNITION', 'COOLING', 'ELECTRICAL', 'TRANSMISSION', 'EMISSIONS', 'UNKNOWN') NULL,
    `sessionId` VARCHAR(191) NULL,
    `maintenanceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `vehicle_events_vehicleId_occurredAt_idx`(`vehicleId`, `occurredAt`),
    INDEX `vehicle_events_sessionId_idx`(`sessionId`),
    INDEX `vehicle_events_maintenanceId_idx`(`maintenanceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `scan_sessions` ADD CONSTRAINT `scan_sessions_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `session_dtcs` ADD CONSTRAINT `session_dtcs_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `parameter_stats` ADD CONSTRAINT `parameter_stats_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnoses` ADD CONSTRAINT `diagnoses_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnosis_findings` ADD CONSTRAINT `diagnosis_findings_diagnosisId_fkey` FOREIGN KEY (`diagnosisId`) REFERENCES `diagnoses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diagnosis_causes` ADD CONSTRAINT `diagnosis_causes_diagnosisId_fkey` FOREIGN KEY (`diagnosisId`) REFERENCES `diagnoses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `confirmation_test_runs` ADD CONSTRAINT `confirmation_test_runs_diagnosisId_fkey` FOREIGN KEY (`diagnosisId`) REFERENCES `diagnoses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_records` ADD CONSTRAINT `maintenance_records_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_interactions` ADD CONSTRAINT `ai_interactions_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_events` ADD CONSTRAINT `vehicle_events_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_events` ADD CONSTRAINT `vehicle_events_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `scan_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `vehicle_events` ADD CONSTRAINT `vehicle_events_maintenanceId_fkey` FOREIGN KEY (`maintenanceId`) REFERENCES `maintenance_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
