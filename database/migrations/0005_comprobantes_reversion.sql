ALTER TABLE `COMPROBANTE`
  ADD `EsReversion` boolean DEFAULT false NOT NULL,
  ADD `ComprobanteReversion` varchar(20),
  ADD CONSTRAINT `COMPROBANTE_ComprobanteReversion_COMPROBANTE_Codigo_fk`
    FOREIGN KEY (`ComprobanteReversion`) REFERENCES `COMPROBANTE`(`Codigo`) ON DELETE no action ON UPDATE no action;
