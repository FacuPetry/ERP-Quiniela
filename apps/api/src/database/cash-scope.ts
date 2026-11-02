/** Clasificación histórica por los datos de la operación, no por el maestro
 * mutable de comprobantes. Solo recibir alias constantes del código. */
export const treasuryMovement = (alias: string) =>
  `${alias}.Cliente IS NULL AND NOT EXISTS (SELECT 1 FROM CUENTACORRIENTE scope_cc WHERE scope_cc.CajaMovimiento=${alias}.IDTabla)`;
