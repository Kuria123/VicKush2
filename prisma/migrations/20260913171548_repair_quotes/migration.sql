-- CreateTable
CREATE TABLE `repair_quotes` (
    `id` VARCHAR(191) NOT NULL,
    `vehicleId` VARCHAR(191) NOT NULL,
    `source` ENUM('MECHANIC', 'OWNER', 'SUPPLIER') NOT NULL,
    `providedBy` VARCHAR(120) NOT NULL,
    `description` VARCHAR(300) NOT NULL,
    `totalMinor` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `partsMinor` INTEGER NULL,
    `labourMinor` INTEGER NULL,
    `receivedAt` DATETIME(3) NOT NULL,
    `notes` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `repair_quotes_vehicleId_receivedAt_idx`(`vehicleId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `repair_quotes` ADD CONSTRAINT `repair_quotes_vehicleId_fkey` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
