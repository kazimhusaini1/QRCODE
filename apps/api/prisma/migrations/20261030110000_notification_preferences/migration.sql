ALTER TABLE `User`
    ADD COLUMN `emailOrderNotifications` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `smsOrderNotifications` BOOLEAN NOT NULL DEFAULT true;
