-- Relación opcional: los movimientos existentes conservan todos sus datos y quedan sin concepto.
-- Un solo ALTER evita dejar la columna sin FK si falla la definición de la restricción.
ALTER TABLE `CUENTACORRIENTE`
  ADD `Concepto` varchar(20) NULL,
  ADD CONSTRAINT `CUENTACORRIENTE_Concepto_CONCEPTO_Codigo_fk`
    FOREIGN KEY (`Concepto`) REFERENCES `CONCEPTO`(`Codigo`)
    ON DELETE no action ON UPDATE no action;
