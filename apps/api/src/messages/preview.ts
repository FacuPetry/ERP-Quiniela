import {
  defaultMessageTemplate,
  renderMessageTemplate,
  type ClientMessageRow,
} from "@erp/shared";
import { balanceMessage } from "./text.js";
import { whatsappPhone } from "./phone.js";
export interface MessageClientData {
  Codigo: string;
  Nombre: string;
  Fantasia: string | null;
  Telefono: string | null;
  SaldoTotal: string;
}
/** El saldo ya fue calculado por la consulta común; aquí solo se prepara texto. */
export function prepareClientMessage(
  client: MessageClientData,
  until: string,
  consulted: string,
  template: string | null,
): ClientMessageRow {
  const text = balanceMessage(
    client.Nombre,
    client.SaldoTotal,
    until,
    defaultMessageTemplate,
    client.Fantasia,
  );
  let ErrorMensaje: string | null = null;
  try {
    text.Mensaje = renderMessageTemplate(
      template ?? defaultMessageTemplate,
      text.Variables,
    );
  } catch (error) {
    text.Mensaje = "";
    ErrorMensaje =
      error instanceof Error ? error.message : "Revisá el mensaje guardado.";
  }
  return {
    Cliente: client.Codigo,
    ClienteNombre: client.Nombre,
    SaldoTotal: client.SaldoTotal,
    FechaHasta: until,
    consultadoEn: consulted,
    ...text,
    ErrorMensaje,
    Telefono: client.Telefono,
    ...whatsappPhone(client.Telefono),
  };
}
