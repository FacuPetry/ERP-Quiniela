-- Convertir solo mediante db:migrate: primero se verifica la compatibilidad. Detener las escrituras y respaldar antes.
ALTER TABLE `CUENTACORRIENTE` ADD `NumeroComprobante` bigint unsigned;
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD `NumeroComprobante` bigint unsigned;
--> statement-breakpoint
UPDATE `CUENTACORRIENTE` c LEFT JOIN `NUMERACION` n ON n.IDTabla = c.Numeracion SET c.NumeroComprobante = CASE WHEN c.Numero IS NULL THEN NULL ELSE CAST(COALESCE(n.Serie, '0') AS UNSIGNED) * 100000000 + c.Numero END;
--> statement-breakpoint
UPDATE `CAJAMOVIMIENTO` c JOIN `NUMERACION` n ON n.IDTabla = c.Numeracion SET c.NumeroComprobante = CAST(n.Serie AS UNSIGNED) * 100000000 + c.Numero;
--> statement-breakpoint
UPDATE `NUMERACION` SET ProximoNumero = CAST(Serie AS UNSIGNED) * 100000000 + ProximoNumero;
--> statement-breakpoint
ALTER TABLE `NUMERACION` MODIFY COLUMN `ProximoNumero` bigint unsigned NOT NULL;
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` MODIFY COLUMN `NumeroComprobante` bigint unsigned NOT NULL;
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` DROP FOREIGN KEY `CAJAMOVIMIENTO_Numeracion_NUMERACION_IDTabla_fk`;
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` DROP FOREIGN KEY `CUENTACORRIENTE_Numeracion_NUMERACION_IDTabla_fk`;
--> statement-breakpoint
ALTER TABLE `NUMERACION` ADD CONSTRAINT `UQ_NUMERACION_Comprobante` UNIQUE(`Comprobante`);
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` DROP INDEX `UQ_CAJAMOVIMIENTO_Numero`;
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` DROP INDEX `UQ_CUENTACORRIENTE_Numero`;
--> statement-breakpoint
ALTER TABLE `NUMERACION` DROP INDEX `UQ_NUMERACION_Comprobante_Serie`;
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `UQ_CAJAMOVIMIENTO_Numero` UNIQUE(`Comprobante`,`NumeroComprobante`);
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `UQ_CUENTACORRIENTE_Numero` UNIQUE(`Comprobante`,`NumeroComprobante`);
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CK_CAJAMOVIMIENTO_Numero` CHECK (`CAJAMOVIMIENTO`.`NumeroComprobante` BETWEEN 1 AND 999999999999 AND MOD(`CAJAMOVIMIENTO`.`NumeroComprobante`, 100000000) > 0);
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CK_CUENTACORRIENTE_Numero` CHECK (`CUENTACORRIENTE`.`NumeroComprobante` IS NULL OR (`CUENTACORRIENTE`.`NumeroComprobante` BETWEEN 1 AND 999999999999 AND MOD(`CUENTACORRIENTE`.`NumeroComprobante`, 100000000) > 0));
--> statement-breakpoint
ALTER TABLE `NUMERACION` ADD CONSTRAINT `CK_NUMERACION_Numero` CHECK (`NUMERACION`.`ProximoNumero` BETWEEN 1 AND 999999999999 AND MOD(`NUMERACION`.`ProximoNumero`, 100000000) > 0);
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` DROP COLUMN `Numeracion`;
--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` DROP COLUMN `Numero`;
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` DROP COLUMN `Numeracion`;
--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` DROP COLUMN `Numero`;
--> statement-breakpoint
ALTER TABLE `NUMERACION` DROP COLUMN `Serie`;
