ALTER TABLE `CAJAMOVIMIENTO` ADD `CajaMovimientoOrigen` bigint;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD `ImporteACuenta` decimal(18,2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTOAFECTACION` ADD `CreadoEn` datetime(6);--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTOAFECTACION` ADD `Usuario` bigint;--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD `CuentaLibradora` varchar(50);--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `UQ_CAJAMOVIMIENTO_Origen` UNIQUE(`CajaMovimientoOrigen`);--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `UQ_CHEQUE_Propio` UNIQUE(`Tipo`,`BancoCuenta`,`Numero`);--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `UQ_CHEQUE_Tercero` UNIQUE(`Tipo`,`Banco`,`CuentaLibradora`,`Numero`);--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_CajaMovimientoOrigen_CAJAMOVIMIENTO_IDTabla_fk` FOREIGN KEY (`CajaMovimientoOrigen`) REFERENCES `CAJAMOVIMIENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTOAFECTACION` ADD CONSTRAINT `CAJAMOVIMIENTOAFECTACION_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE CAJAMOVIMIENTO m LEFT JOIN (SELECT CajaMovimiento,SUM(Importe) AS Aplicado FROM CAJAMOVIMIENTOAFECTACION GROUP BY CajaMovimiento) x ON x.CajaMovimiento=m.IDTabla SET m.ImporteACuenta=m.ImporteTotal-COALESCE(x.Aplicado,0);
--> statement-breakpoint
UPDATE CAJAMOVIMIENTOAFECTACION x JOIN CAJAMOVIMIENTO m ON m.IDTabla=x.CajaMovimiento SET x.CreadoEn=m.CreadoEn,x.Usuario=m.Usuario;
