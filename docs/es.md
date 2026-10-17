# Pushbullet

## Presentación

Esta integración envía las notificaciones de Gladys como pushes de
[Pushbullet](https://www.pushbullet.com) a los teléfonos, ordenadores y
navegadores donde está instalado Pushbullet. Cada usuario de Gladys introduce el
correo de su cuenta de Pushbullet; el administrador introduce una sola vez el
token de acceso de una cuenta de Pushbullet para la casa. Una imagen de cámara
adjuntada por Gladys llega como imagen.

También ofrece:

- tres **disparadores de escena**: push recibido, notificación del teléfono
  (una notificación de Android reflejada por Pushbullet), push no enviado;
- dos **acciones de escena**: enviar un push de Pushbullet (nota o enlace, a
  cualquier destino), enviar un SMS a través de un teléfono Android;
- dos **widgets de panel**: la cuenta y los pushes recibidos.

![Los dos widgets de la integración: la cuenta de Pushbullet con sus pushes del mes, y los últimos pushes y notificaciones recibidos (ilustración generada, no una captura de pantalla)](https://raw.githubusercontent.com/William-De71/gladys-pushbullet/main/docs/assets/widgets.es.png)

Transporte: **nube**. El texto de las notificaciones, los pushes recibidos y,
si están activadas, las notificaciones reflejadas pasan por los servidores de
Pushbullet (`api.pushbullet.com`, `stream.pushbullet.com`).

## Requisitos

- Gladys Assistant **5.1.0** o posterior.
- Una cuenta de Pushbullet y la aplicación Pushbullet en los dispositivos que
  deben recibir las notificaciones (Android, iPhone, Windows, extensiones de
  navegador).
- Una cuenta gratuita envía **500 pushes al mes**, sumando todas las
  aplicaciones y servicios; Pushbullet Pro elimina el límite. Las cuentas
  gratuitas también tienen un límite mensual de SMS.
- Opcional: un teléfono **Android** con la aplicación Pushbullet, para enviar
  SMS y reflejar sus notificaciones.

## Configuración

1. En [pushbullet.com](https://www.pushbullet.com/#settings/account), abra
   **Settings → Account** y pulse **Create Access Token**. El token empieza por
   `o.`.
2. En Gladys, abra **Integraciones → Pushbullet → Configuración**, pegue el
   token y guarde.
3. Pulse **Probar la conexión**: se muestran la cuenta, sus dispositivos y los
   teléfonos que pueden enviar SMS. **Enviar un push de prueba** comprueba toda
   la cadena.
4. Cada usuario abre el bloque **Mi cuenta** de la misma pantalla e introduce
   el **correo de su cuenta de Pushbullet** (y, si quiere, uno de sus
   dispositivos).

| Campo                                       | Uso                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Token de acceso                             | Desde Pushbullet → Settings → Account, se guarda cifrado                              |
| Título de las notificaciones                | Se muestra encima de cada mensaje de Gladys (`Gladys` por defecto)                    |
| Idioma del push de prueba                   | El idioma del push de prueba (inglés por defecto)                                     |
| Añadir un dispositivo «Gladys»              | Añade a la cuenta un dispositivo llamado «Gladys» (activado por defecto)              |
| Nombre del dispositivo                      | Se usa al crear el dispositivo (`Gladys` por defecto)                                 |
| Pushes recibidos                            | Activa «Push recibido» con cada push nuevo (activado por defecto)                     |
| Notificaciones reflejadas                   | Activa «Notificación del teléfono» con cada notificación de Android (desactivado)     |
| Contraseña del cifrado de extremo a extremo | Solo si el cifrado está activado en las aplicaciones de Pushbullet: la misma          |
| Mi cuenta → correo                          | Por usuario: la cuenta de Pushbullet de sus notificaciones                            |
| Mi cuenta → dispositivo                     | Por usuario, opcional: un dispositivo, solo si el correo es el de la cuenta de Gladys |

El token da acceso completo a la cuenta de Pushbullet. La integración solo
envía pushes y SMS, lee los pushes recibidos y añade el dispositivo «Gladys».

## Uso

### Notificaciones

Cada notificación de Gladys dirigida a un usuario que ha introducido un correo
sale como push: alarmas, acciones de escena «Enviar un mensaje», respuestas de
Gladys.

- Si el correo es el de la cuenta del token, el push va a todos sus
  dispositivos, o al dispositivo del bloque «Mi cuenta».
- Otro correo: el push va a ese usuario de Pushbullet; si la dirección no
  tiene cuenta de Pushbullet, Pushbullet envía un correo en su lugar.
- Una imagen adjunta al mensaje (acción de escena «Enviar una imagen de
  cámara») se sube y llega como imagen.

### El dispositivo «Gladys»

La integración añade a la cuenta un dispositivo llamado **Gladys**. Envíele un
push (desde el menú Compartir del teléfono, o desde la aplicación Pushbullet)
para hablar con sus escenas sin molestar a sus otros dispositivos. Los pushes
de Gladys lo muestran como origen. Desactivar la opción no lo elimina: quítelo
en Pushbullet. Para cambiarle el nombre, hágalo en Pushbullet.

### Disparadores de escena

| Disparador                | Cuándo se activa                                                                                                   | Variables                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Push recibido             | Cada push nuevo en la cuenta, salvo los de Gladys; filtros: destino, procedencia, primera palabra, remitente, tipo | título, texto, enlace, nombre del archivo, primera palabra, tipo, procedencia, destino, remitente, dispositivo, fecha |
| Notificación del teléfono | Cada notificación reflejada por un teléfono Android; filtros: aplicación, teléfono, primera palabra                | aplicación, paquete, título, texto, primera palabra, teléfono, fecha                                                  |
| Push no enviado           | El primer fallo de una notificación, y de nuevo solo después de un push correcto (nunca en bucle)                  | motivo, estado HTTP, error, correo oculto                                                                             |

La primera palabra va en mayúsculas sin acentos: un push titulado «Garaje
abierto» da `GARAJE`. Un push de más de 15 minutos encontrado tras una
interrupción nunca activa nada, y los pushes que ya estaban en la cuenta al
empezar la recepción se ignoran.

**Otro usuario de Pushbullet puede enviar pushes a su correo**: antes de abrir
una puerta o desarmar una alarma, filtre por la procedencia «Uno de mis
dispositivos» o por su propio correo de remitente.

### Acciones de escena

- **Enviar un push de Pushbullet**: un título, un texto y, si hace falta, un
  enlace; a todos los dispositivos de la cuenta, a un dispositivo (por su
  nombre), a otra persona (por su correo) o a un canal propio. Devuelve el
  identificador del push y el destino.
- **Enviar un SMS con Pushbullet**: uno o varios números y un texto. Su
  teléfono Android lo envía con su propia tarifa en cuanto se sincroniza;
  Pushbullet lo cancela pasada una hora. Devuelve el identificador del SMS y
  el teléfono.

### Ejemplos de escenas

- _Cuando llega al dispositivo «Gladys» un push que empieza por GARAJE desde
  uno de mis dispositivos_ → cerrar la puerta del garaje.
- _Cuando el teléfono muestra una notificación de la aplicación de reparto_ →
  encender la luz de la entrada.
- _Cuando salta la alarma_ → enviar un push con un enlace al panel de las
  cámaras, y un SMS al vecino.

### Widgets de panel

- **Pushbullet**: los pushes enviados por Gladys este mes (naranja desde 400,
  rojo desde 500, el límite gratuito), los pushes y notificaciones recibidos,
  los dispositivos, el estado de la cuenta y del enlace en tiempo real, el
  dispositivo «Gladys», los SMS del mes, el último fallo y un botón **Enviar
  prueba**.
- **Pushes recibidos**: los últimos pushes y notificaciones del teléfono;
  toque uno para leerlo entero.

## Solución de problemas

- **«Pushbullet rechaza el token de acceso»**: el token está mal escrito o se
  revocó (Pushbullet → Settings → Account). Cree uno nuevo y péguelo.
- **«Límite mensual de pushes alcanzado»**: la cuenta gratuita ha enviado 500
  pushes este mes (sumando todas las aplicaciones). Espere al mes siguiente o
  contrate Pushbullet Pro.
- **«Dispositivo, correo o canal desconocido»**: compruebe el nombre del
  dispositivo en Pushbullet («Probar la conexión» los enumera). Solo se puede
  elegir un dispositivo si el correo es el de la cuenta del token.
- **No se recibe nada**: compruebe que «Pushes recibidos» está activado y que
  la fila «Tiempo real» del widget indica «escuchando». Los pushes enviados
  por Gladys nunca activan nada.
- **Ninguna notificación del teléfono**: active la duplicación de
  notificaciones en la aplicación Pushbullet del teléfono, y «Notificaciones
  reflejadas» en la configuración. Con cifrado de extremo a extremo,
  introduzca la misma contraseña.
- **SMS no enviado**: el teléfono debe estar encendido, conectado y permitir
  que Pushbullet funcione en segundo plano.
- **Registros**: Integraciones → Pushbullet → pestaña Supervisión. Las
  direcciones de correo están ocultas; el token nunca aparece.
