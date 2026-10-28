-- Conserva IDs, números, correlativos y estados. Aplicar sin escritores activos.
ALTER TABLE `NUMERACION` ADD `Codigo` varchar(20), ADD `Caja` varchar(20);
--> statement-breakpoint
UPDATE `NUMERACION` SET `Codigo`=`Comprobante`;
--> statement-breakpoint
ALTER TABLE `NUMERACION` MODIFY `Codigo` varchar(20) NOT NULL,
 ADD CONSTRAINT `UQ_NUMERACION_Codigo` UNIQUE (`Codigo`),
 ADD CONSTRAINT `NUMERACION_Caja_CAJA_Codigo_fk` FOREIGN KEY (`Caja`) REFERENCES `CAJA` (`Codigo`);
--> statement-breakpoint
ALTER TABLE `COMPROBANTE` ADD `Numerador` varchar(20),
 ADD CONSTRAINT `COMPROBANTE_Numerador_NUMERACION_Codigo_fk` FOREIGN KEY (`Numerador`) REFERENCES `NUMERACION` (`Codigo`);
--> statement-breakpoint
UPDATE `COMPROBANTE` c JOIN `NUMERACION` n ON n.Comprobante=c.Codigo SET c.Numerador=n.Codigo;
--> statement-breakpoint
CREATE TABLE `NUMERACIONUSO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Numerador` bigint NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`NumeroComprobante` bigint unsigned NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `NUMERACIONUSO_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_NUMERACIONUSO_Numero` UNIQUE(`Numerador`,`NumeroComprobante`),
	CONSTRAINT `UQ_NUMERACIONUSO_Comprobante` UNIQUE(`Comprobante`,`NumeroComprobante`),
	CONSTRAINT `CK_NUMERACIONUSO_Numero` CHECK(`NUMERACIONUSO`.`NumeroComprobante` BETWEEN 1 AND 999999999999 AND MOD(`NUMERACIONUSO`.`NumeroComprobante`,100000000)>0)
) ENGINE=InnoDB AUTO_INCREMENT=100000001 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--> statement-breakpoint
ALTER TABLE `NUMERACIONUSO`
 ADD CONSTRAINT `NUMERACIONUSO_Numerador_NUMERACION_IDTabla_fk` FOREIGN KEY (`Numerador`) REFERENCES `NUMERACION` (`IDTabla`),
 ADD CONSTRAINT `NUMERACIONUSO_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE` (`Codigo`);
--> statement-breakpoint
-- Un cobro/pago y su asiento interno de Cuenta corriente consumen un solo número.
INSERT INTO `NUMERACIONUSO` (`Numerador`,`Comprobante`,`NumeroComprobante`,`CreadoEn`)
 SELECT n.IDTabla,a.Comprobante,a.NumeroComprobante,a.CreadoEn
 FROM CUENTACORRIENTE a JOIN NUMERACION n ON n.Comprobante=a.Comprobante
 WHERE a.NumeroComprobante IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM CAJAMOVIMIENTO m WHERE m.IDTabla=a.CajaMovimiento AND m.Comprobante=a.Comprobante AND m.NumeroComprobante=a.NumeroComprobante)
 UNION ALL
 SELECT n.IDTabla,m.Comprobante,m.NumeroComprobante,m.CreadoEn
 FROM CAJAMOVIMIENTO m JOIN NUMERACION n ON n.Comprobante=m.Comprobante;
--> statement-breakpoint
ALTER TABLE `NUMERACION` DROP FOREIGN KEY `NUMERACION_Comprobante_COMPROBANTE_Codigo_fk`;
--> statement-breakpoint
ALTER TABLE `NUMERACION` DROP INDEX `UQ_NUMERACION_Comprobante`, DROP COLUMN `Comprobante`;
