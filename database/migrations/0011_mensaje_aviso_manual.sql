CREATE TABLE `MENSAJEAVISO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Cliente` varchar(20) NOT NULL,
	`Usuario` bigint NOT NULL,
	`Clave` char(36) NOT NULL,
	`Huella` char(64) NOT NULL,
	`RegistradoEn` datetime(6) NOT NULL,
	`FechaSaldo` date NOT NULL,
	`SaldoTotal` decimal(65,2) NOT NULL,
	`ClienteNombre` varchar(150) NOT NULL,
	`Telefono` varchar(40),
	`WhatsAppNumero` varchar(20),
	`Mensaje` text NOT NULL,
	`Canal` varchar(20) NOT NULL,
	CONSTRAINT `MENSAJEAVISO_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_MENSAJEAVISO_Usuario_Clave` UNIQUE(`Usuario`,`Clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `MENSAJEAVISO` ADD CONSTRAINT `MENSAJEAVISO_Cliente_CLIENTE_Codigo_fk` FOREIGN KEY (`Cliente`) REFERENCES `CLIENTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `MENSAJEAVISO` ADD CONSTRAINT `MENSAJEAVISO_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `IX_MENSAJEAVISO_Cliente_Fecha` ON `MENSAJEAVISO` (`Cliente`,`RegistradoEn`,`IDTabla`);
--> statement-breakpoint
ALTER TABLE `MENSAJEAVISO` AUTO_INCREMENT = 100000001;
