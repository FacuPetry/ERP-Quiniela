import logo from "../assets/brand/quingest-logo-fondo-claro.svg";
import mark from "../assets/brand/quingest-q-verde-transparente.svg";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={compact ? "brand brand-compact" : "brand"}
      src={compact ? mark : logo}
      alt={compact ? "QuinGest" : "QuinGest · ERP Quiniela"}
      width={compact ? 512 : 1910}
      height={compact ? 512 : 535}
    />
  );
}
