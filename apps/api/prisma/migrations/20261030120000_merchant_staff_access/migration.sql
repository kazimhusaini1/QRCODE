CREATE TABLE `MerchantStaffAccess` (
    `id` VARCHAR(191) NOT NULL,
    `merchantId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `previousRole` ENUM('CUSTOMER', 'MERCHANT_ADMIN', 'STAFF', 'SUPER_ADMIN') NOT NULL,
    `role` ENUM('MANAGER', 'ORDERS', 'CATALOG', 'INVENTORY') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `MerchantStaffAccess_merchantId_userId_key`(`merchantId`, `userId`),
    UNIQUE INDEX `MerchantStaffAccess_userId_key`(`userId`),
    INDEX `MerchantStaffAccess_role_idx`(`role`),
    PRIMARY KEY (`id`),
    CONSTRAINT `MerchantStaffAccess_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `MerchantStaffAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
