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

## Presupuestos con fotos (almacenamiento local)

- Los presupuestos finalizados, las fotos y la numeración se guardan en IndexedDB del navegador. El almacenamiento anterior se migra al iniciar; su copia en localStorage se conserva.
- La reserva del número y el documento se confirman juntos en una transacción, también al finalizar desde varias pestañas.
- Las fotos nuevas se ajustan a un máximo de 1600 píxeles en su lado mayor y se convierten a JPEG para reducir espacio y memoria.
- **Guardar** descarga un JSON con los datos y las fotos, incluso si el borrador está incompleto. **Abrir** recupera ese archivo.
- Si no se puede finalizar/guardar, **Generar PDF** permite descargar, previa confirmación, un documento marcado como **BORRADOR / DRAFT**. Esa acción no reserva un número nuevo.
- Sigue siendo almacenamiento del dispositivo y navegador actuales; no sincroniza con la NUC, el iPad ni otros equipos. Conservar copias JSON permite recuperar el trabajo si se borran los datos del sitio.
