-- Create coupons, coupon eligibility/redemption records and verified-purchase reviews.
ALTER TABLE `Order`
  ADD COLUMN `couponId` VARCHAR(191) NULL,
  ADD COLUMN `couponCodeSnapshot` VARCHAR(191) NULL,
  ADD INDEX `Order_couponId_idx` (`couponId`);

CREATE TABLE `Coupon` (
  `id` VARCHAR(191) NOT NULL,
  `code` VARCHAR(191) NOT NULL,
  `discountType` ENUM('FIXED_PAISE', 'PERCENT_BPS') NOT NULL,
  `value` INTEGER NOT NULL,
  `maxDiscountPaisa` INTEGER NULL,
  `minimumSubtotalPaisa` INTEGER NOT NULL DEFAULT 0,
  `startsAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `endsAt` DATETIME(3) NULL,
  `usageLimit` INTEGER NULL,
  `usageCount` INTEGER NOT NULL DEFAULT 0,
  `perUserLimit` INTEGER NOT NULL DEFAULT 1,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `merchantId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Coupon_code_key` (`code`),
  INDEX `Coupon_isActive_startsAt_endsAt_idx` (`isActive`, `startsAt`, `endsAt`),
  INDEX `Coupon_merchantId_idx` (`merchantId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CouponSociety` (
  `couponId` VARCHAR(191) NOT NULL,
  `societyId` VARCHAR(191) NOT NULL,
  INDEX `CouponSociety_societyId_idx` (`societyId`),
  PRIMARY KEY (`couponId`, `societyId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CouponRedemption` (
  `id` VARCHAR(191) NOT NULL,
  `couponId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `discountPaisa` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `CouponRedemption_orderId_key` (`orderId`),
  INDEX `CouponRedemption_couponId_userId_idx` (`couponId`, `userId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Review` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `merchantId` VARCHAR(191) NOT NULL,
  `rating` INTEGER NOT NULL,
  `comment` VARCHAR(2000) NULL,
  `isPublished` BOOLEAN NOT NULL DEFAULT false,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `Review_orderId_key` (`orderId`),
  INDEX `Review_merchantId_isPublished_createdAt_idx` (`merchantId`, `isPublished`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Order` ADD CONSTRAINT `Order_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `Coupon` ADD CONSTRAINT `Coupon_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CouponSociety` ADD CONSTRAINT `CouponSociety_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CouponSociety` ADD CONSTRAINT `CouponSociety_societyId_fkey` FOREIGN KEY (`societyId`) REFERENCES `Society`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `Coupon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `CouponRedemption` ADD CONSTRAINT `CouponRedemption_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Review` ADD CONSTRAINT `Review_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
