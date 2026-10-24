CREATE TABLE `AUDITORIA` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Usuario` bigint NOT NULL,
	`Accion` varchar(50) NOT NULL,
	`Tabla` varchar(50) NOT NULL,
	`Registro` varchar(100) NOT NULL,
	`Fecha` datetime(6) NOT NULL,
	`Motivo` text,
	`Detalle` json,
	CONSTRAINT `AUDITORIA_IDTabla` PRIMARY KEY(`IDTabla`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `BANCO` (
	`Codigo` varchar(20) NOT NULL,
	`Nombre` varchar(100) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `BANCO_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `BANCOCUENTA` (
	`Codigo` varchar(20) NOT NULL,
	`Banco` varchar(20) NOT NULL,
	`Nombre` varchar(100) NOT NULL,
	`Titular` varchar(150) NOT NULL,
	`Numero` varchar(50),
	`CBU` varchar(22),
	`Alias` varchar(100),
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `BANCOCUENTA_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `BANCOMOVIMIENTO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`BancoCuenta` varchar(20) NOT NULL,
	`Fecha` date NOT NULL,
	`Sentido` varchar(10) NOT NULL,
	`Importe` decimal(18,2) NOT NULL,
	`Origen` varchar(20) NOT NULL,
	`Transferencia` bigint,
	`ChequeEvento` bigint,
	`Concepto` varchar(20),
	`Observacion` text,
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `BANCOMOVIMIENTO_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_BANCOMOVIMIENTO_Transferencia` UNIQUE(`Transferencia`),
	CONSTRAINT `UQ_BANCOMOVIMIENTO_ChequeEvento` UNIQUE(`ChequeEvento`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CAJA` (
	`Codigo` varchar(20) NOT NULL,
	`Nombre` varchar(100) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `CAJA_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CAJAMOVIMIENTO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`Numeracion` bigint NOT NULL,
	`Numero` bigint NOT NULL,
	`Cliente` varchar(20),
	`FechaOrigen` date NOT NULL,
	`CajaSaldo` bigint,
	`Concepto` varchar(20),
	`ImporteEfectivo` decimal(18,2) NOT NULL DEFAULT '0.00',
	`ImporteTotal` decimal(18,2) NOT NULL,
	`Sentido` varchar(10) NOT NULL,
	`Observacion` text,
	`Estado` varchar(15) NOT NULL,
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	`UsuarioAnulacion` bigint,
	`AnuladoEn` datetime(6),
	`MotivoAnulacion` varchar(500),
	CONSTRAINT `CAJAMOVIMIENTO_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_CAJAMOVIMIENTO_Numero` UNIQUE(`Numeracion`,`Numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CAJAMOVIMIENTOAFECTACION` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`CajaMovimiento` bigint NOT NULL,
	`CuentaCorriente` bigint NOT NULL,
	`Importe` decimal(18,2) NOT NULL,
	CONSTRAINT `CAJAMOVIMIENTOAFECTACION_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_AFECTACION_Movimiento_Cuenta` UNIQUE(`CajaMovimiento`,`CuentaCorriente`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CAJASALDO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Caja` varchar(20) NOT NULL,
	`AperturaEn` datetime(6) NOT NULL,
	`SaldoInicial` decimal(18,2) NOT NULL,
	`UsuarioApertura` bigint NOT NULL,
	`Estado` varchar(15) NOT NULL,
	`CierreEn` datetime(6),
	`SaldoTeorico` decimal(18,2),
	`SaldoContado` decimal(18,2),
	`UsuarioCierre` bigint,
	`Observacion` text,
	CONSTRAINT `CAJASALDO_IDTabla` PRIMARY KEY(`IDTabla`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CHEQUE` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`Tipo` varchar(10) NOT NULL,
	`Numero` varchar(30) NOT NULL,
	`Banco` varchar(20) NOT NULL,
	`BancoCuenta` varchar(20),
	`Librador` varchar(150),
	`Documento` varchar(20),
	`Emision` date NOT NULL,
	`Vencimiento` date NOT NULL,
	`Importe` decimal(18,2) NOT NULL,
	`Estado` varchar(20) NOT NULL,
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `CHEQUE_IDTabla` PRIMARY KEY(`IDTabla`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CHEQUEEVENTO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Cheque` bigint NOT NULL,
	`Tipo` varchar(30) NOT NULL,
	`Fecha` date NOT NULL,
	`CajaMovimiento` bigint,
	`BancoCuenta` varchar(20),
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	`Observacion` text,
	CONSTRAINT `CHEQUEEVENTO_IDTabla` PRIMARY KEY(`IDTabla`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CLIENTE` (
	`Codigo` varchar(20) NOT NULL,
	`ClienteTipo` varchar(20) NOT NULL,
	`Nombre` varchar(150) NOT NULL,
	`Fantasia` varchar(150),
	`DocumentoTipo` varchar(10),
	`Documento` varchar(20),
	`Telefono` varchar(40),
	`Email` varchar(150),
	`Domicilio` varchar(250),
	`Observacion` text,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `CLIENTE_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CLIENTETIPO` (
	`Codigo` varchar(20) NOT NULL,
	`Descripcion` varchar(100) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `CLIENTETIPO_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `COMPROBANTE` (
	`Codigo` varchar(20) NOT NULL,
	`Descripcion` varchar(100) NOT NULL,
	`ModuloOrigen` varchar(30) NOT NULL,
	`Cuenta` varchar(10) NOT NULL,
	`Naturaleza` varchar(10) NOT NULL,
	`SentidoFondos` varchar(20) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	`Orden` int,
	CONSTRAINT `COMPROBANTE_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CONCEPTO` (
	`Codigo` varchar(20) NOT NULL,
	`Descripcion` varchar(100) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `CONCEPTO_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `CUENTACORRIENTE` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Cliente` varchar(20) NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`CajaMovimiento` bigint,
	`Numeracion` bigint,
	`Numero` bigint,
	`FechaOrigen` date NOT NULL,
	`Vencimiento` date,
	`Cuenta` varchar(10) NOT NULL,
	`Naturaleza` varchar(10) NOT NULL,
	`Importe` decimal(18,2) NOT NULL,
	`Observacion` text,
	`Estado` varchar(15) NOT NULL,
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	`UsuarioAnulacion` bigint,
	`AnuladoEn` datetime(6),
	`MotivoAnulacion` varchar(500),
	CONSTRAINT `CUENTACORRIENTE_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_CUENTACORRIENTE_CajaMovimiento` UNIQUE(`CajaMovimiento`),
	CONSTRAINT `UQ_CUENTACORRIENTE_Numero` UNIQUE(`Numeracion`,`Numero`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `NUMERACION` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`Serie` varchar(10) NOT NULL,
	`ProximoNumero` bigint NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `NUMERACION_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_NUMERACION_Comprobante_Serie` UNIQUE(`Comprobante`,`Serie`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `ROL` (
	`Codigo` varchar(20) NOT NULL,
	`Nombre` varchar(100) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `ROL_Codigo` PRIMARY KEY(`Codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `SESION` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Usuario` bigint NOT NULL,
	`TokenHash` char(64) NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	`VenceEn` datetime(6) NOT NULL,
	`RevocadoEn` datetime(6),
	CONSTRAINT `SESION_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_SESION_TokenHash` UNIQUE(`TokenHash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `SOLICITUD` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Usuario` bigint NOT NULL,
	`Accion` varchar(50) NOT NULL,
	`Clave` varchar(100) NOT NULL,
	`Huella` char(64) NOT NULL,
	`Estado` varchar(15) NOT NULL,
	`CodigoRespuesta` smallint,
	`Resultado` json,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `SOLICITUD_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_SOLICITUD_Usuario_Accion_Clave` UNIQUE(`Usuario`,`Accion`,`Clave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `TRANSFERENCIA` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Comprobante` varchar(20) NOT NULL,
	`CajaMovimiento` bigint NOT NULL,
	`BancoCuenta` varchar(20) NOT NULL,
	`Fecha` date NOT NULL,
	`Importe` decimal(18,2) NOT NULL,
	`Referencia` varchar(100),
	`Observacion` text,
	`Usuario` bigint NOT NULL,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `TRANSFERENCIA_IDTabla` PRIMARY KEY(`IDTabla`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `USUARIO` (
	`IDTabla` bigint AUTO_INCREMENT NOT NULL,
	`Nombre` varchar(100) NOT NULL,
	`Email` varchar(150) NOT NULL,
	`ClaveHash` varchar(255) NOT NULL,
	`Rol` varchar(20) NOT NULL,
	`Activo` boolean NOT NULL DEFAULT true,
	`CreadoEn` datetime(6) NOT NULL,
	CONSTRAINT `USUARIO_IDTabla` PRIMARY KEY(`IDTabla`),
	CONSTRAINT `UQ_USUARIO_Email` UNIQUE(`Email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `AUDITORIA` ADD CONSTRAINT `AUDITORIA_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOCUENTA` ADD CONSTRAINT `BANCOCUENTA_Banco_BANCO_Codigo_fk` FOREIGN KEY (`Banco`) REFERENCES `BANCO`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOMOVIMIENTO` ADD CONSTRAINT `BANCOMOVIMIENTO_BancoCuenta_BANCOCUENTA_Codigo_fk` FOREIGN KEY (`BancoCuenta`) REFERENCES `BANCOCUENTA`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOMOVIMIENTO` ADD CONSTRAINT `BANCOMOVIMIENTO_Transferencia_TRANSFERENCIA_IDTabla_fk` FOREIGN KEY (`Transferencia`) REFERENCES `TRANSFERENCIA`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOMOVIMIENTO` ADD CONSTRAINT `BANCOMOVIMIENTO_ChequeEvento_CHEQUEEVENTO_IDTabla_fk` FOREIGN KEY (`ChequeEvento`) REFERENCES `CHEQUEEVENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOMOVIMIENTO` ADD CONSTRAINT `BANCOMOVIMIENTO_Concepto_CONCEPTO_Codigo_fk` FOREIGN KEY (`Concepto`) REFERENCES `CONCEPTO`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `BANCOMOVIMIENTO` ADD CONSTRAINT `BANCOMOVIMIENTO_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_Numeracion_NUMERACION_IDTabla_fk` FOREIGN KEY (`Numeracion`) REFERENCES `NUMERACION`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_Cliente_CLIENTE_Codigo_fk` FOREIGN KEY (`Cliente`) REFERENCES `CLIENTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_CajaSaldo_CAJASALDO_IDTabla_fk` FOREIGN KEY (`CajaSaldo`) REFERENCES `CAJASALDO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_Concepto_CONCEPTO_Codigo_fk` FOREIGN KEY (`Concepto`) REFERENCES `CONCEPTO`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTO` ADD CONSTRAINT `CAJAMOVIMIENTO_UsuarioAnulacion_USUARIO_IDTabla_fk` FOREIGN KEY (`UsuarioAnulacion`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTOAFECTACION` ADD CONSTRAINT `FK_AFECTACION_CajaMovimiento` FOREIGN KEY (`CajaMovimiento`) REFERENCES `CAJAMOVIMIENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJAMOVIMIENTOAFECTACION` ADD CONSTRAINT `FK_AFECTACION_CuentaCorriente` FOREIGN KEY (`CuentaCorriente`) REFERENCES `CUENTACORRIENTE`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJASALDO` ADD CONSTRAINT `CAJASALDO_Caja_CAJA_Codigo_fk` FOREIGN KEY (`Caja`) REFERENCES `CAJA`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJASALDO` ADD CONSTRAINT `CAJASALDO_UsuarioApertura_USUARIO_IDTabla_fk` FOREIGN KEY (`UsuarioApertura`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CAJASALDO` ADD CONSTRAINT `CAJASALDO_UsuarioCierre_USUARIO_IDTabla_fk` FOREIGN KEY (`UsuarioCierre`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `CHEQUE_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `CHEQUE_Banco_BANCO_Codigo_fk` FOREIGN KEY (`Banco`) REFERENCES `BANCO`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `CHEQUE_BancoCuenta_BANCOCUENTA_Codigo_fk` FOREIGN KEY (`BancoCuenta`) REFERENCES `BANCOCUENTA`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUE` ADD CONSTRAINT `CHEQUE_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUEEVENTO` ADD CONSTRAINT `CHEQUEEVENTO_Cheque_CHEQUE_IDTabla_fk` FOREIGN KEY (`Cheque`) REFERENCES `CHEQUE`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUEEVENTO` ADD CONSTRAINT `CHEQUEEVENTO_CajaMovimiento_CAJAMOVIMIENTO_IDTabla_fk` FOREIGN KEY (`CajaMovimiento`) REFERENCES `CAJAMOVIMIENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUEEVENTO` ADD CONSTRAINT `CHEQUEEVENTO_BancoCuenta_BANCOCUENTA_Codigo_fk` FOREIGN KEY (`BancoCuenta`) REFERENCES `BANCOCUENTA`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CHEQUEEVENTO` ADD CONSTRAINT `CHEQUEEVENTO_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CLIENTE` ADD CONSTRAINT `CLIENTE_ClienteTipo_CLIENTETIPO_Codigo_fk` FOREIGN KEY (`ClienteTipo`) REFERENCES `CLIENTETIPO`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_Cliente_CLIENTE_Codigo_fk` FOREIGN KEY (`Cliente`) REFERENCES `CLIENTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_CajaMovimiento_CAJAMOVIMIENTO_IDTabla_fk` FOREIGN KEY (`CajaMovimiento`) REFERENCES `CAJAMOVIMIENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_Numeracion_NUMERACION_IDTabla_fk` FOREIGN KEY (`Numeracion`) REFERENCES `NUMERACION`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `CUENTACORRIENTE` ADD CONSTRAINT `CUENTACORRIENTE_UsuarioAnulacion_USUARIO_IDTabla_fk` FOREIGN KEY (`UsuarioAnulacion`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `NUMERACION` ADD CONSTRAINT `NUMERACION_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SESION` ADD CONSTRAINT `SESION_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `SOLICITUD` ADD CONSTRAINT `SOLICITUD_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TRANSFERENCIA` ADD CONSTRAINT `TRANSFERENCIA_Comprobante_COMPROBANTE_Codigo_fk` FOREIGN KEY (`Comprobante`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TRANSFERENCIA` ADD CONSTRAINT `TRANSFERENCIA_CajaMovimiento_CAJAMOVIMIENTO_IDTabla_fk` FOREIGN KEY (`CajaMovimiento`) REFERENCES `CAJAMOVIMIENTO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TRANSFERENCIA` ADD CONSTRAINT `TRANSFERENCIA_BancoCuenta_BANCOCUENTA_Codigo_fk` FOREIGN KEY (`BancoCuenta`) REFERENCES `BANCOCUENTA`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `TRANSFERENCIA` ADD CONSTRAINT `TRANSFERENCIA_Usuario_USUARIO_IDTabla_fk` FOREIGN KEY (`Usuario`) REFERENCES `USUARIO`(`IDTabla`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `USUARIO` ADD CONSTRAINT `USUARIO_Rol_ROL_Codigo_fk` FOREIGN KEY (`Rol`) REFERENCES `ROL`(`Codigo`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `IX_AUDITORIA_Tabla_Registro` ON `AUDITORIA` (`Tabla`,`Registro`);--> statement-breakpoint
CREATE INDEX `IX_AUDITORIA_Fecha` ON `AUDITORIA` (`Fecha`);--> statement-breakpoint
CREATE INDEX `IX_BANCOMOVIMIENTO_Cuenta_Fecha` ON `BANCOMOVIMIENTO` (`BancoCuenta`,`Fecha`);--> statement-breakpoint
CREATE INDEX `IX_CAJAMOVIMIENTO_Cliente_Fecha` ON `CAJAMOVIMIENTO` (`Cliente`,`FechaOrigen`);--> statement-breakpoint
CREATE INDEX `IX_CAJASALDO_Caja_Apertura` ON `CAJASALDO` (`Caja`,`AperturaEn`);--> statement-breakpoint
CREATE INDEX `IX_CHEQUE_Estado_Vencimiento` ON `CHEQUE` (`Estado`,`Vencimiento`);--> statement-breakpoint
CREATE INDEX `IX_CHEQUEEVENTO_Cheque_Fecha` ON `CHEQUEEVENTO` (`Cheque`,`Fecha`);--> statement-breakpoint
CREATE INDEX `IX_CLIENTE_Nombre` ON `CLIENTE` (`Nombre`);--> statement-breakpoint
CREATE INDEX `IX_CLIENTE_Documento` ON `CLIENTE` (`Documento`);--> statement-breakpoint
CREATE INDEX `IX_CUENTACORRIENTE_Cliente_Cuenta_Fecha` ON `CUENTACORRIENTE` (`Cliente`,`Cuenta`,`FechaOrigen`);--> statement-breakpoint
CREATE INDEX `IX_SESION_VenceEn` ON `SESION` (`VenceEn`);--> statement-breakpoint
CREATE INDEX `IX_TRANSFERENCIA_Cuenta_Fecha` ON `TRANSFERENCIA` (`BancoCuenta`,`Fecha`);