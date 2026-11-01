CREATE TABLE `RateLimitBucket` (
  `bucketKey` VARCHAR(64) NOT NULL,
  `hits` INTEGER NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `RateLimitBucket_expiresAt_idx` (`expiresAt`),
  PRIMARY KEY (`bucketKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
