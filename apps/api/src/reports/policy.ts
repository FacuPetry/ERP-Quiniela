/** Criterio común de Informes: los anulados permanecen en las operaciones y
 * auditoría, pero nunca forman parte de filas, saldos ni relaciones del informe.
 * El alias es una constante del código, nunca un parámetro recibido del usuario. */
export const reportMovement = (alias: string) => `${alias}.Estado <> 'ANULADO'`;
