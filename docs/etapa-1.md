# Etapa 1: base técnica

## Entrega

- npm workspaces, Node.js 24 y TypeScript estricto.
- React/Vite/Tailwind con pantalla inicial y verificación de servicios.
- Express 5 con contratos compartidos y respuestas de disponibilidad.
- Conexión MySQL con pool, TLS configurable y cierre de conexiones al detener el servidor.
- Esquema de 21 tablas y migración inicial, con PK IDTabla desde 100000001.
- Docker Compose solo para desarrollo.
- Construcción conjunta y servidor único de producción.
- Pruebas HTTP y MySQL aislado.

Los componentes visuales compartidos, el menú lateral, la autenticación, los ABM y los servicios financieros pertenecen a próximas etapas. La pantalla de esta entrega no simula módulos ni saldos reales.

## Cómo revisar

1. Seguir la instalación del README.
2. Abrir el frontend en el puerto 5173 y comprobar los tres estados.
3. Ejecutar `npm run check` y `npm run test:integration`.
4. Detener MySQL con `npm run db:stop`: la verificación de base debe fallar, aunque la API siga respondiendo.
5. Recuperarlo con `npm run db:up` y volver a verificar.
6. Detener desarrollo, construir y arrancar en modo producción. La misma aplicación Express debe servir React y la API.

Los comandos anteriores no requieren credenciales de Hostinger. Los datos de prueba se crean en el contenedor efímero; la base local de la aplicación queda sin datos de negocio.

## Migraciones siguientes

Modificar el esquema únicamente por una necesidad acordada, ejecutar `npm run db:generate -- --name=nombre_descriptivo`, revisar el SQL generado y probarlo sobre una base aislada. No editar migraciones ya aplicadas a instalaciones reales. No usar `drizzle-kit push` para sustituir el historial.

La migración inicial fuerza InnoDB y utf8mb4. La segunda configura las secuencias numéricas; no altera PK Codigo ni numeración comercial. MySQL puede dejar saltos en AUTO_INCREMENT.

## Próxima etapa

Acceso de usuarios, sesiones y estructura visual con menú lateral. Cada entrega debe incluir explicación, archivos afectados y pruebas antes de avanzar.

## Verificación de esta entrega

Se verificaron instalación con `npm ci`, TypeScript y build de producción, cinco escenarios HTTP y seis escenarios de integración sobre MySQL 8.4 real. El runner de Node contabiliza trece pruebas al incluir sus dos pruebas contenedoras.

También se comprobó en Chromium la página de desarrollo y la aplicación servida por Express, una vista móvil de 375 px sin desbordamiento horizontal y la desconexión/recuperación real de MySQL reflejada en React. No aparecieron errores de JavaScript.

La base local tiene las 21 tablas y permanece sin datos de negocio. El historial técnico de Drizzle agrega su propia tabla `__drizzle_migrations`; no reemplaza ni amplía el modelo comercial.

El arranque de producción fue validado en este entorno. No se publicó en Hostinger ni se validaron allí sus variables, credenciales o ejecución de migraciones.
