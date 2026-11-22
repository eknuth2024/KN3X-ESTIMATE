# KN3X Estimate

Herramienta de presupuestos de KN3X Project LLC.

## Acceso privado y usuarios

El repositorio incluye una pantalla de inicio de sesión y un servidor Node.js para ejecutarlo en la NUC. El administrador puede crear y suspender usuarios normales; esas cuentas no tienen permisos para administrar usuarios.

Lee [ACCESO-NUC.md](ACCESO-NUC.md) para crear tu cuenta principal y activar el servidor. Requiere Node.js 22 o posterior y no usa paquetes adicionales.

```text
npm run create-admin
npm start
```

GitHub Pages no ejecuta el servidor. La herramienta pública sigue disponible hasta activar el acceso privado desde la NUC. Los clientes y presupuestos siguen usando el almacenamiento local actual; esta entrega no añade sincronización central.

Pruebas: `npm test` (o `node --test server/auth.test.mjs`).
