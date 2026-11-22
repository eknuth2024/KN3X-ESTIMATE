# Acceso privado de KN3X Estimate

Este cambio añade usuario y contraseña reales al servidor y una pantalla de administración de usuarios. El sitio de GitHub Pages sigue siendo una herramienta pública hasta activar el servidor privado; pulsar **Acceso privado** allí explica que debes entrar desde la NUC. Una pantalla de login por sí sola en GitHub Pages no protegería la aplicación.

## Preparación en la NUC (Windows 11)

1. Actualiza la copia de `eknuth2024/KN3X-ESTIMATE` en la NUC. Necesita Node.js 22 o posterior. No requiere instalar paquetes ni contratar servicios.
2. Abre una terminal dentro de esa carpeta y ejecuta `npm run create-admin` **una sola vez, antes de arrancar el servidor**. Introduce tu nombre, usuario y una contraseña de al menos 12 caracteres. La contraseña no se muestra ni se incluye en el repositorio.
3. Ejecuta `npm start`.
4. En esa misma NUC abre `http://127.0.0.1:3080`. Verás la pantalla de acceso. Al entrar, abre **Mi cuenta y usuarios** en el menú lateral.

La primera cuenta es el administrador. Desde la aplicación solo pueden crearse usuarios normales. No existe registro público, contraseña predeterminada ni botón para convertirse en administrador.

## Agregar al asistente

En **Mi cuenta y usuarios → Agregar usuario**, escribe nombre, usuario y contraseña temporal. La persona deberá cambiar esa contraseña antes de abrir los presupuestos. Los usuarios normales no pueden listar, agregar, activar ni desactivar cuentas, incluso si intentan llamar directamente al servidor. El administrador puede suspender o reactivar usuarios; suspenderlos cierra sus sesiones.

Todos pueden cambiar su propia contraseña y cerrar sesión. Si alguien olvida su contraseña, por ahora necesita ayuda del administrador; no se ha añadido recuperación por correo ni una clave universal. No elimines el archivo de usuarios para recuperar una cuenta: primero conserva una copia y solicita asistencia.

## Datos y copias

Las cuentas se guardan en `%USERPROFILE%\.kn3x-estimate\users.json`, fuera del sitio web. Se guardan hashes de contraseña con sal aleatoria; el servidor no sirve ese archivo. Puedes elegir otra carpeta con `DATA_DIR`. Guarda una copia privada de esa carpeta en el Synology. Mantén `DATA_DIR` en un disco local de la NUC para las escrituras, y copia al NAS como respaldo. Nunca subas ese archivo a GitHub.

**Esta entrega añade acceso y permisos de usuarios; todavía no sincroniza clientes, empleados ni presupuestos.** La herramienta mantiene su almacenamiento actual del navegador y sus botones Cargar/Guardar. Crear cuentas no migra esos datos al servidor ni cambia la numeración de presupuestos. No borres los datos del navegador; exporta antes con Guardar. Si cambias de dirección web, el navegador no comparte automáticamente los datos de la dirección anterior.

## iPhone, iPad y otras computadoras

Para usarlos deben abrir la dirección del servidor privado, no la de GitHub Pages. Falta confirmar la dirección y el acceso remoto existente en la NUC antes de configurar esto. No abras puertos del router directamente para este servidor.

El servidor arranca solo en la propia NUC (`127.0.0.1`). Para conectarlo a una entrada HTTPS ya configurada, define `HOST`, `PORT` y `PUBLIC_ORIGIN` con la dirección exacta. Por ejemplo, en PowerShell, **solo cuando ya exista ese HTTPS**:

```powershell
$env:HOST = '127.0.0.1'
$env:PORT = '3080'
$env:PUBLIC_ORIGIN = 'https://TU-DIRECCION-PRIVADA'
npm start
```

`PUBLIC_ORIGIN` debe coincidir con la dirección visible en el navegador y el proxy debe conservar ese Host. El proxy debe apuntar a la NUC y estar configurado antes de utilizar este ejemplo. Las cookies son HttpOnly, SameSite=Strict y Secure cuando la dirección es HTTPS. Las solicitudes que cambian datos verifican el origen. Las sesiones duran hasta 12 horas con límite de una hora de inactividad; se cierran al reiniciar el servidor.

Para una prueba **solo en una red local de confianza**, se puede definir `HOST=0.0.0.0`, `PUBLIC_ORIGIN=http://IP-DE-LA-NUC:3080` y `ALLOW_INSECURE_LAN=true`. Esto usa HTTP sin cifrado; no es la configuración para internet. Se recomienda terminar primero la entrada privada HTTPS.

## Comprobaciones

Ejecuta `npm test`. Prueba además:

- Sin sesión, `/` e `/index.html` llevan al login; no se sirven archivos del servidor ni cuentas.
- Tu cuenta puede agregar un usuario normal.
- La cuenta nueva cambia su contraseña, abre presupuestos y no ve administración de usuarios.
- Al suspender esa cuenta, pierde el acceso incluso en una pestaña ya abierta al recargar.
- Cerrar sesión y volver atrás no recupera acceso al servidor.

La activación en la NUC y la dirección HTTPS son pasos pendientes fuera del repositorio. No se han creado cuentas reales durante el desarrollo.
