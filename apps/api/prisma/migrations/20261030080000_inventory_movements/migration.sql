CREATE TABLE `InventoryMovement` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NULL,
    `quantityDelta` INTEGER NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `referenceId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `InventoryMovement_productId_createdAt_idx`(`productId`, `createdAt`),
    INDEX `InventoryMovement_reason_createdAt_idx`(`reason`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `InventoryMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
