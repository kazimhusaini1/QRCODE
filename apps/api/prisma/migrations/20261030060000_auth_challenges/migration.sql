ALTER TABLE `User`
  ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL,
  ADD COLUMN `phoneVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `AuthChallenge` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `purpose` ENUM('VERIFY_CONTACT', 'PASSWORD_RESET') NOT NULL,
  `channel` ENUM('EMAIL', 'SMS') NOT NULL,
  `recipient` VARCHAR(320) NOT NULL,
  `codeHash` VARCHAR(64) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `consumedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AuthChallenge_userId_purpose_createdAt_idx` (`userId`, `purpose`, `createdAt`),
  INDEX `AuthChallenge_expiresAt_consumedAt_idx` (`expiresAt`, `consumedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AuthChallenge` ADD CONSTRAINT `AuthChallenge_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;