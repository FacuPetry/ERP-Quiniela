import {
  bigint, boolean, char, check, date, datetime, decimal, foreignKey, index, int, json,
  mysqlTable, smallint, text, uniqueIndex, varchar, type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

const id = () => bigint('IDTabla', { mode: 'bigint' }).autoincrement().primaryKey();
const fk = (name: string) => bigint(name, { mode: 'bigint' });
const code = (name: string) => varchar(name, { length: 20 });
const amount = (name: string) => decimal(name, { precision: 18, scale: 2 });
const instant = (name: string) => datetime(name, { mode: 'date', fsp: 6 });
const day = (name: string) => date(name, { mode: 'string' });

export const rol = mysqlTable('ROL', {
  Codigo: code('Codigo').primaryKey(), Nombre: varchar('Nombre', { length: 100 }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
});
export const usuario = mysqlTable('USUARIO', {
  IDTabla: id(), Nombre: varchar('Nombre', { length: 100 }).notNull(),
  Email: varchar('Email', { length: 150 }).notNull(),
  ClaveHash: varchar('ClaveHash', { length: 255 }).notNull(),
  Rol: code('Rol').notNull().references(() => rol.Codigo),
  Activo: boolean('Activo').notNull().default(true), CreadoEn: instant('CreadoEn').notNull(),
}, t => [uniqueIndex('UQ_USUARIO_Email').on(t.Email)]);

export const comprobante = mysqlTable('COMPROBANTE', {
  Codigo: code('Codigo').primaryKey(), Descripcion: varchar('Descripcion', { length: 100 }).notNull(),
  ModuloOrigen: varchar('ModuloOrigen', { length: 30 }).notNull(),
  Cuenta: varchar('Cuenta', { length: 10 }).notNull(),
  Naturaleza: varchar('Naturaleza', { length: 10 }).notNull(),
  SentidoFondos: varchar('SentidoFondos', { length: 20 }).notNull(),
  EsReversion: boolean('EsReversion').notNull().default(false),
  Numerador: code('Numerador').references((): AnyMySqlColumn => numeracion.Codigo),
  ComprobanteReversion: code('ComprobanteReversion').references((): AnyMySqlColumn => comprobante.Codigo),
  Activo: boolean('Activo').notNull().default(true), Orden: int('Orden'),
});
export const numeracion = mysqlTable('NUMERACION', {
  IDTabla: id(), Codigo: code('Codigo').notNull(), Caja: code('Caja').references((): AnyMySqlColumn => caja.Codigo),
  ProximoNumero: bigint('ProximoNumero', { mode: 'bigint', unsigned: true }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
}, t => [uniqueIndex('UQ_NUMERACION_Codigo').on(t.Codigo),
  check('CK_NUMERACION_Numero', sql`${t.ProximoNumero} BETWEEN 1 AND 999999999999 AND MOD(${t.ProximoNumero}, 100000000) > 0`)]);
export const clienteTipo = mysqlTable('CLIENTETIPO', {
  Codigo: code('Codigo').primaryKey(), Descripcion: varchar('Descripcion', { length: 100 }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
});
export const cliente = mysqlTable('CLIENTE', {
  Codigo: code('Codigo').primaryKey(), ClienteTipo: code('ClienteTipo').notNull().references(() => clienteTipo.Codigo),
  Nombre: varchar('Nombre', { length: 150 }).notNull(), Fantasia: varchar('Fantasia', { length: 150 }),
  DocumentoTipo: varchar('DocumentoTipo', { length: 10 }), Documento: varchar('Documento', { length: 20 }),
  Telefono: varchar('Telefono', { length: 40 }), Email: varchar('Email', { length: 150 }),
  Domicilio: varchar('Domicilio', { length: 250 }), Observacion: text('Observacion'),
  Activo: boolean('Activo').notNull().default(true),
}, t => [index('IX_CLIENTE_Nombre').on(t.Nombre), index('IX_CLIENTE_Documento').on(t.Documento)]);
export const concepto = mysqlTable('CONCEPTO', {
  Codigo: code('Codigo').primaryKey(), Descripcion: varchar('Descripcion', { length: 100 }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
});
export const caja = mysqlTable('CAJA', {
  Codigo: code('Codigo').primaryKey(), Nombre: varchar('Nombre', { length: 100 }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
});
export const cajaSaldo = mysqlTable('CAJASALDO', {
  IDTabla: id(), Caja: code('Caja').notNull().references(() => caja.Codigo),
  AperturaEn: instant('AperturaEn').notNull(), SaldoInicial: amount('SaldoInicial').notNull(),
  UsuarioApertura: fk('UsuarioApertura').notNull().references(() => usuario.IDTabla),
  Estado: varchar('Estado', { length: 15 }).notNull(), CierreEn: instant('CierreEn'),
  SaldoTeorico: amount('SaldoTeorico'), SaldoContado: amount('SaldoContado'),
  UsuarioCierre: fk('UsuarioCierre').references(() => usuario.IDTabla), Observacion: text('Observacion'),
}, t => [index('IX_CAJASALDO_Caja_Apertura').on(t.Caja, t.AperturaEn)]);
export const cajaMovimiento = mysqlTable('CAJAMOVIMIENTO', {
  CajaMovimientoOrigen: fk('CajaMovimientoOrigen').references((): AnyMySqlColumn => cajaMovimiento.IDTabla),
  ImporteACuenta: amount('ImporteACuenta').notNull().default('0.00'),
  IDTabla: id(), Comprobante: code('Comprobante').notNull().references(() => comprobante.Codigo),
  NumeroComprobante: bigint('NumeroComprobante', { mode: 'bigint', unsigned: true }).notNull(),
  Cliente: code('Cliente').references(() => cliente.Codigo), FechaOrigen: day('FechaOrigen').notNull(),
  CajaSaldo: fk('CajaSaldo').references(() => cajaSaldo.IDTabla),
  Concepto: code('Concepto').references(() => concepto.Codigo),
  ImporteEfectivo: amount('ImporteEfectivo').notNull().default('0.00'),
  ImporteTotal: amount('ImporteTotal').notNull(), Sentido: varchar('Sentido', { length: 10 }).notNull(),
  Observacion: text('Observacion'), Estado: varchar('Estado', { length: 15 }).notNull(),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
  UsuarioAnulacion: fk('UsuarioAnulacion').references(() => usuario.IDTabla),
  AnuladoEn: instant('AnuladoEn'), MotivoAnulacion: varchar('MotivoAnulacion', { length: 500 }),
}, t => [uniqueIndex('UQ_CAJAMOVIMIENTO_Origen').on(t.CajaMovimientoOrigen), uniqueIndex('UQ_CAJAMOVIMIENTO_Numero').on(t.Comprobante, t.NumeroComprobante),
  check('CK_CAJAMOVIMIENTO_Numero', sql`${t.NumeroComprobante} BETWEEN 1 AND 999999999999 AND MOD(${t.NumeroComprobante}, 100000000) > 0`),
  index('IX_CAJAMOVIMIENTO_Cliente_Fecha').on(t.Cliente, t.FechaOrigen)]);
export const cuentaCorriente = mysqlTable('CUENTACORRIENTE', {
  IDTabla: id(), Cliente: code('Cliente').notNull().references(() => cliente.Codigo),
  Concepto: code('Concepto').references(() => concepto.Codigo),
  Comprobante: code('Comprobante').notNull().references(() => comprobante.Codigo),
  CajaMovimiento: fk('CajaMovimiento').references(() => cajaMovimiento.IDTabla),
  NumeroComprobante: bigint('NumeroComprobante', { mode: 'bigint', unsigned: true }),
  FechaOrigen: day('FechaOrigen').notNull(), Vencimiento: day('Vencimiento'),
  Cuenta: varchar('Cuenta', { length: 10 }).notNull(), Naturaleza: varchar('Naturaleza', { length: 10 }).notNull(),
  Importe: amount('Importe').notNull(), Observacion: text('Observacion'),
  Estado: varchar('Estado', { length: 15 }).notNull(),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
  UsuarioAnulacion: fk('UsuarioAnulacion').references(() => usuario.IDTabla),
  AnuladoEn: instant('AnuladoEn'), MotivoAnulacion: varchar('MotivoAnulacion', { length: 500 }),
}, t => [uniqueIndex('UQ_CUENTACORRIENTE_CajaMovimiento').on(t.CajaMovimiento),
  uniqueIndex('UQ_CUENTACORRIENTE_Numero').on(t.Comprobante, t.NumeroComprobante),
  check('CK_CUENTACORRIENTE_Numero', sql`${t.NumeroComprobante} IS NULL OR (${t.NumeroComprobante} BETWEEN 1 AND 999999999999 AND MOD(${t.NumeroComprobante}, 100000000) > 0)`),
  index('IX_CUENTACORRIENTE_Cliente_Cuenta_Fecha').on(t.Cliente, t.Cuenta, t.FechaOrigen)]);
export const cajaMovimientoAfectacion = mysqlTable('CAJAMOVIMIENTOAFECTACION', {
  CreadoEn: instant('CreadoEn'), Usuario: fk('Usuario').references(() => usuario.IDTabla),
  IDTabla: id(), CajaMovimiento: fk('CajaMovimiento').notNull(),
  CuentaCorriente: fk('CuentaCorriente').notNull(),
  Importe: amount('Importe').notNull(),
}, t => [uniqueIndex('UQ_AFECTACION_Movimiento_Cuenta').on(t.CajaMovimiento, t.CuentaCorriente),
  foreignKey({ name: 'FK_AFECTACION_CajaMovimiento', columns: [t.CajaMovimiento], foreignColumns: [cajaMovimiento.IDTabla] }),
  foreignKey({ name: 'FK_AFECTACION_CuentaCorriente', columns: [t.CuentaCorriente], foreignColumns: [cuentaCorriente.IDTabla] }),
]);

export const banco = mysqlTable('BANCO', {
  Codigo: code('Codigo').primaryKey(), Nombre: varchar('Nombre', { length: 100 }).notNull(),
  Activo: boolean('Activo').notNull().default(true),
});
export const bancoCuenta = mysqlTable('BANCOCUENTA', {
  Codigo: code('Codigo').primaryKey(), Banco: code('Banco').notNull().references(() => banco.Codigo),
  Nombre: varchar('Nombre', { length: 100 }).notNull(), Titular: varchar('Titular', { length: 150 }).notNull(),
  Numero: varchar('Numero', { length: 50 }), CBU: varchar('CBU', { length: 22 }), Alias: varchar('Alias', { length: 100 }),
  Activo: boolean('Activo').notNull().default(true),
});
export const cheque = mysqlTable('CHEQUE', {
  CuentaLibradora: varchar('CuentaLibradora', { length: 50 }),
  IDTabla: id(), Comprobante: code('Comprobante').notNull().references(() => comprobante.Codigo),
  Tipo: varchar('Tipo', { length: 10 }).notNull(), Numero: varchar('Numero', { length: 30 }).notNull(),
  Banco: code('Banco').notNull().references(() => banco.Codigo),
  BancoCuenta: code('BancoCuenta').references(() => bancoCuenta.Codigo),
  Librador: varchar('Librador', { length: 150 }), Documento: varchar('Documento', { length: 20 }),
  Emision: day('Emision').notNull(), Vencimiento: day('Vencimiento').notNull(),
  Importe: amount('Importe').notNull(), Estado: varchar('Estado', { length: 20 }).notNull(),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
}, t => [uniqueIndex('UQ_CHEQUE_Propio').on(t.Tipo,t.BancoCuenta,t.Numero), uniqueIndex('UQ_CHEQUE_Tercero').on(t.Tipo,t.Banco,t.CuentaLibradora,t.Numero), index('IX_CHEQUE_Estado_Vencimiento').on(t.Estado, t.Vencimiento)]);
export const chequeEvento = mysqlTable('CHEQUEEVENTO', {
  IDTabla: id(), Cheque: fk('Cheque').notNull().references(() => cheque.IDTabla),
  Tipo: varchar('Tipo', { length: 30 }).notNull(), Fecha: day('Fecha').notNull(),
  CajaMovimiento: fk('CajaMovimiento').references(() => cajaMovimiento.IDTabla),
  BancoCuenta: code('BancoCuenta').references(() => bancoCuenta.Codigo),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
  Observacion: text('Observacion'),
}, t => [index('IX_CHEQUEEVENTO_Cheque_Fecha').on(t.Cheque, t.Fecha)]);
export const transferencia = mysqlTable('TRANSFERENCIA', {
  IDTabla: id(), Comprobante: code('Comprobante').notNull().references(() => comprobante.Codigo),
  CajaMovimiento: fk('CajaMovimiento').notNull().references(() => cajaMovimiento.IDTabla),
  BancoCuenta: code('BancoCuenta').notNull().references(() => bancoCuenta.Codigo),
  Fecha: day('Fecha').notNull(), Importe: amount('Importe').notNull(),
  Referencia: varchar('Referencia', { length: 100 }), Observacion: text('Observacion'),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
}, t => [index('IX_TRANSFERENCIA_Cuenta_Fecha').on(t.BancoCuenta, t.Fecha)]);
export const bancoMovimiento = mysqlTable('BANCOMOVIMIENTO', {
  IDTabla: id(), BancoCuenta: code('BancoCuenta').notNull().references(() => bancoCuenta.Codigo),
  Fecha: day('Fecha').notNull(), Sentido: varchar('Sentido', { length: 10 }).notNull(),
  Importe: amount('Importe').notNull(), Origen: varchar('Origen', { length: 20 }).notNull(),
  Transferencia: fk('Transferencia').references(() => transferencia.IDTabla),
  ChequeEvento: fk('ChequeEvento').references(() => chequeEvento.IDTabla),
  Concepto: code('Concepto').references(() => concepto.Codigo), Observacion: text('Observacion'),
  Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla), CreadoEn: instant('CreadoEn').notNull(),
}, t => [uniqueIndex('UQ_BANCOMOVIMIENTO_Transferencia').on(t.Transferencia),
  uniqueIndex('UQ_BANCOMOVIMIENTO_ChequeEvento').on(t.ChequeEvento),
  index('IX_BANCOMOVIMIENTO_Cuenta_Fecha').on(t.BancoCuenta, t.Fecha)]);
export const sesion = mysqlTable('SESION', {
  IDTabla: id(), Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla),
  TokenHash: char('TokenHash', { length: 64 }).notNull(), CreadoEn: instant('CreadoEn').notNull(),
  VenceEn: instant('VenceEn').notNull(), RevocadoEn: instant('RevocadoEn'),
}, t => [uniqueIndex('UQ_SESION_TokenHash').on(t.TokenHash), index('IX_SESION_VenceEn').on(t.VenceEn)]);
export const auditoria = mysqlTable('AUDITORIA', {
  IDTabla: id(), Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla),
  Accion: varchar('Accion', { length: 50 }).notNull(), Tabla: varchar('Tabla', { length: 50 }).notNull(),
  Registro: varchar('Registro', { length: 100 }).notNull(), Fecha: instant('Fecha').notNull(),
  Motivo: text('Motivo'), Detalle: json('Detalle'),
}, t => [index('IX_AUDITORIA_Tabla_Registro').on(t.Tabla, t.Registro), index('IX_AUDITORIA_Fecha').on(t.Fecha)]);
export const solicitud = mysqlTable('SOLICITUD', {
  IDTabla: id(), Usuario: fk('Usuario').notNull().references(() => usuario.IDTabla),
  Accion: varchar('Accion', { length: 50 }).notNull(), Clave: varchar('Clave', { length: 100 }).notNull(),
  Huella: char('Huella', { length: 64 }).notNull(), Estado: varchar('Estado', { length: 15 }).notNull(),
  CodigoRespuesta: smallint('CodigoRespuesta'), Resultado: json('Resultado'), CreadoEn: instant('CreadoEn').notNull(),
}, t => [uniqueIndex('UQ_SOLICITUD_Usuario_Accion_Clave').on(t.Usuario, t.Accion, t.Clave)]);
