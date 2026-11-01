ALTER TABLE `User` ADD COLUMN `referralCode` VARCHAR(20) NULL;
UPDATE `User` SET `referralCode` = UPPER(HEX(RANDOM_BYTES(5))) WHERE `referralCode` IS NULL;
ALTER TABLE `User` MODIFY `referralCode` VARCHAR(20) NOT NULL;
CREATE UNIQUE INDEX `User_referralCode_key` ON `User`(`referralCode`);

CREATE TABLE `Referral` (
  `id` VARCHAR(191) NOT NULL,
  `referrerId` VARCHAR(191) NOT NULL,
  `referredUserId` VARCHAR(191) NOT NULL,
  `codeSnapshot` VARCHAR(191) NOT NULL,
  `status` ENUM('PENDING', 'QUALIFIED', 'REWARDED') NOT NULL DEFAULT 'PENDING',
  `rewardCouponId` VARCHAR(191) NULL,
  `qualifiedAt` DATETIME(3) NULL,
  `rewardedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `Referral_referredUserId_key` (`referredUserId`),
  UNIQUE INDEX `Referral_rewardCouponId_key` (`rewardCouponId`),
  INDEX `Referral_referrerId_createdAt_idx` (`referrerId`, `createdAt`),
  INDEX `Referral_status_createdAt_idx` (`status`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Referral` ADD CONSTRAINT `Referral_referrerId_fkey` FOREIGN KEY (`referrerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Referral` ADD CONSTRAINT `Referral_referredUserId_fkey` FOREIGN KEY (`referredUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Referral` ADD CONSTRAINT `Referral_rewardCouponId_fkey` FOREIGN KEY (`rewardCouponId`) REFERENCES `Coupon`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
