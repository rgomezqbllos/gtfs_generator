# Guía de Usuario — GTFS Generator

Esta guía explica los flujos principales de la plataforma para planificadores de transporte. Asume que ya tienes la aplicación corriendo (ver [README](./README.md) e instrucciones de instalación según tu OS).

---

## Índice

1. [Primer Acceso y Login](#1-primer-acceso-y-login)
2. [Crear un Proyecto de Ciudad](#2-crear-un-proyecto-de-ciudad)
3. [Activar el Motor de Rutas (Map Hub)](#3-activar-el-motor-de-rutas-map-hub)
4. [Editor de Mapa: Crear Paradas](#4-editor-de-mapa-crear-paradas)
5. [Editor de Mapa: Crear Segmentos](#5-editor-de-mapa-crear-segmentos)
6. [Gestión de Agencias y Rutas](#6-gestión-de-agencias-y-rutas)
7. [Gestor de Horarios (Trips)](#7-gestor-de-horarios-trips)
8. [Importar un GTFS Existente](#8-importar-un-gtfs-existente)
9. [Exportar a GTFS](#9-exportar-a-gtfs)
10. [Simulación del Servicio](#10-simulación-del-servicio)
11. [Administración de Usuarios](#11-administración-de-usuarios)

---

## 1. Primer Acceso y Login

Al abrir la aplicación por primera vez, se presentará la pantalla de login de **Keycloak**.

```
URL de la aplicación:  http://localhost:5173  (modo dev)
                       http://localhost:3001  (modo Docker)

Credenciales iniciales:
  Usuario:    superadmin
  Contraseña: superadmin
```

> ⚠️ **Seguridad:** Cambia la contraseña del superadmin en el panel de Keycloak ([http://localhost:8080](http://localhost:8080)) especialmente si el servidor es accesible por otros usuarios.

---

## 2. Crear un Proyecto de Ciudad

Cada ciudad o red de transporte se gestiona como un **Proyecto independiente**.

1. En la pantalla principal, haz clic en **"Nuevo Proyecto"**.
2. Completa el formulario:
   - **Nombre:** nombre de la ciudad o red (ej. `Bogotá Norte`)
   - **Latitud / Longitud del Centro:** coordenadas del punto central de tu mapa. Puedes obtenerlas fácilmente en [maps.google.com](https://maps.google.com) → clic derecho → "¿Qué hay aquí?"
   - **Nivel de zoom inicial:** recomendado `13` para una ciudad, `11` para región

3. Haz clic en **"Crear"**.

Ahora verás tu proyecto en el listado. Haz clic para entrar a él.

---

## 3. Activar el Motor de Rutas (Map Hub)

El **Map Hub** gestiona el motor de enrutamiento OSRM para tu proyecto. Sin OSRM, los segmentos se dibujan como líneas rectas.

### Prerrequisito

Debes tener OSRM instalado y corriendo para tu ciudad:
```bash
npm run osrm:setup -- bogota 5001 "https://download.geofabrik.de/south-america/colombia-latest.osm.pbf"
```
Ver [README → Configurar OSRM](./README.md#-configurar-osrm-enrutamiento-por-calles).

### Configurar el proyecto

1. Dentro de tu proyecto, ve a la pestaña **"Map Hub"**.
2. En el campo **"URL del Motor de Enrutamiento"**, ingresa:
   ```
   http://localhost:5001/route/v1/driving
   ```
   (reemplaza `5001` con el puerto que usaste al configurar OSRM).
3. Haz clic en **"Probar Conexión"**. Debe mostrar ✅ para confirmar que funciona.
4. Guarda la configuración.

> 💡 Si estás usando la aplicación en modo Docker, usa `http://host.docker.internal:5001/route/v1/driving` en lugar de `localhost`.

---

## 4. Editor de Mapa: Crear Paradas

Las **Paradas** (stops) son los nodos de tu red: paraderos, estaciones, puntos de inicio/fin.

1. Dentro de tu proyecto, haz clic en **"Editor de Mapa"**.
2. Verás el mapa centrado en las coordenadas de tu proyecto.
3. Para crear una parada:
   - Activa el modo **"Crear Parada"** (ícono de pin / punto en la barra de herramientas).
   - Haz clic en el mapa en la ubicación exacta de la parada.
   - Se abrirá un formulario: completa el **nombre** y opcionalmente la descripción.
   - Haz clic en **"Guardar"**.

4. La parada aparecerá en el mapa como un punto y también en el **Catálogo de Paradas** (panel lateral).

> 💡 **Consejo:** Activa la capa de **calles base** de OpenStreetMap para ubicar con precisión las paradas en las esquinas correctas.

### Editar o eliminar una parada

- Haz clic sobre cualquier parada en el mapa o en el catálogo.
- Se abrirá el panel de detalles donde puedes editar su nombre o eliminarla.

---

## 5. Editor de Mapa: Crear Segmentos

Los **Segmentos** conectan dos paradas siguiendo la red vial real (si OSRM está activo).

1. En el **Editor de Mapa**, activa el modo **"Crear Segmento"**.
2. Haz clic en la parada de **origen**.
3. Haz clic en la parada de **destino**.
4. Si OSRM está activo, el segmento se dibujará siguiendo las calles reales con:
   - **Distancia** calculada en metros
   - **Tiempo de viaje** estimado en segundos
5. Haz clic en **"Guardar"**.

> ⚠️ Si el segmento aparece como **línea recta**, OSRM no está activo. Verifica la configuración en el Map Hub.

### Tipos de segmentos

| Tipo | Descripción |
|---|---|
| **Normal (Bus Mixto)** | El bus circula por vías compartidas con tráfico general |
| **Troncal** | Corredor de alta capacidad con prioridad semafórica |
| **Exclusivo (BRT)** | Carril exclusivo para buses, no comparte con autos |
| **Deadhead (Vacío)** | Desplazamiento vacío (sin pasajeros), ej. desde el depósito |

El perfil de ruta afecta la velocidad estimada y el trazado calculado.

---

## 6. Gestión de Agencias y Rutas

### Crear una Agencia

1. Ve a **"Agencias"** desde el menú lateral.
2. Haz clic en **"Nueva Agencia"** y completa: nombre, URL, zona horaria, idioma y número de contacto.
3. Guarda.

### Crear una Ruta

1. Ve a **"Rutas"** desde el menú lateral.
2. Haz clic en **"Nueva Ruta"**.
3. Completa:
   - **Nombre corto:** código de la ruta (ej. `C92`, `TM-A1`)
   - **Nombre largo:** nombre descriptivo (ej. `Calle 92 - Centro`)
   - **Tipo:** Bus, Metro, Tren, etc. (según el estándar GTFS `route_type`)
   - **Agencia:** selecciona la agencia creada anteriormente
   - **Color:** código hexadecimal para identificar la ruta en el mapa

4. Guarda la ruta.

### Definir Itinerario de una Ruta

1. Selecciona la ruta en el catálogo.
2. En el panel de detalles, ve a la pestaña **"Itinerario"**.
3. Agrega las paradas en orden usando el buscador de paradas.
4. Define la dirección (Ida / Vuelta) si aplica.

---

## 7. Gestor de Horarios (Trips)

El **Gestor de Horarios** permite crear los viajes (trips) con sus tiempos reales por parada.

### Paso 1: Crear un Servicio / Calendario

1. Ve a **"Calendarios"** desde el menú lateral.
2. Crea un calendario indicando los días de servicio (Lunes-Viernes, Fines de Semana, diario, etc.) y las fechas de vigencia.

### Paso 2: Crear Trips

1. Ve a **"Trips"** (o "Horarios") desde el menú lateral.
2. Selecciona la ruta y el servicio/calendario.
3. Haz clic en **"Nuevo Trip"**.
4. Define la hora de salida del primer viaje.
5. Los tiempos de llegada a cada parada se pueden:
   - **Calcular automáticamente** usando los tiempos de tránsito de los segmentos OSRM.
   - **Ingresar manualmente** parada por parada.

### Paso 3: Trips en serie (frecuencias)

Para crear múltiples trips con la misma frecuencia:

1. Usa la función **"Auto-generar Trips"** (botón en el panel superior).
2. Define:
   - Hora de inicio del servicio (ej. `05:00`)
   - Hora de fin del servicio (ej. `23:00`)
   - Frecuencia en minutos (ej. `10`)
3. La aplicación creará automáticamente todos los trips del día.

### Detección de Conflictos

La aplicación detecta automáticamente:
- **Trips duplicados** (mismo inicio, ruta y servicio)
- **Tiempos incoherentes** (llegada antes que salida)

---

## 8. Importar un GTFS Existente

Si ya tienes un feed GTFS (de otra ciudad o fuente), puedes importarlo para editarlo.

1. Ve a **"Importar"** desde el menú principal.
2. Selecciona tu archivo `.zip` GTFS.
3. La aplicación mostrará un resumen del contenido (agencias, rutas, paradas, viajes).
4. Usa el **filtro de importación** para seleccionar solo las rutas o agencias que deseas importar.
5. Haz clic en **"Importar Selección"**.

> ⚠️ La importación usa **streaming** para manejar archivos grandes. Feeds de más de 100MB son soportados, pero pueden tardar varios minutos.

---

## 9. Exportar a GTFS

Cuando tu red esté lista, genera el ZIP GTFS estándar.

1. Ve a **"Exportar"** desde el menú principal.
2. Selecciona qué proyectos o rutas incluir en el export.
3. Elige los archivos GTFS a generar (stops.txt, routes.txt, trips.txt, stop_times.txt, etc.).
4. Haz clic en **"Descargar ZIP"**.

El archivo resultante es compatible con:
- **Google Maps** (vía Google Transit Partners)
- **Transit App**
- **OpenTripPlanner**
- **Cualquier planificador de rutas compatible con GTFS**

---

## 10. Simulación del Servicio

La **Simulación** te permite visualizar la operación diaria de todas tus rutas.

1. Ve a **"Simulación"** desde el menú lateral.
2. Selecciona el proyecto y el servicio (calendario) a simular.
3. La pantalla mostrará un timeline de los viajes del día.
4. Puedes adelantar y retroceder en el tiempo para ver el estado de la flota en cualquier momento.

**Métricas disponibles:**
- Buses en operación en un momento dado
- Cobertura de paradas por hora
- Tiempo muerto (deadhead) entre viajes

---

## 11. Administración de Usuarios

> Solo disponible para el rol **superadmin** cuando el stack Docker (con Keycloak) está activo.

1. Accede al panel de administración de Keycloak: [http://localhost:8080](http://localhost:8080)
2. Las credenciales son `superadmin` / `superadmin` (cámbiala en producción).
3. Desde ahí puedes:
   - Crear nuevos usuarios
   - Asignar roles (`admin`, `planner`, `viewer`)
   - Asignar usuarios a proyectos específicos
   - Revocar accesos

> En **modo desarrollo** (`npm start`), no se requiere autenticación — la app funciona directamente sin login.

---

## 12. Preguntas Frecuentes

**¿Por qué mis segmentos aparecen como líneas rectas?**
→ OSRM no está corriendo o la URL del motor de enrutamiento está mal configurada en el Map Hub. Revisa que el contenedor Docker de OSRM esté activo con `docker ps`.

**¿Puedo tener múltiples ciudades al mismo tiempo?**
→ Sí. Cada ciudad usa un puerto diferente para su OSRM y se gestiona como un proyecto independiente.

**¿Dónde se guardan los datos?**
→ En `server/gtfs.db` (base de datos SQLite). Los proyectos, paradas, rutas y horarios están todos ahí.

**¿Cómo hago un backup de mis datos?**
→ Copia el archivo `server/gtfs.db` con el servidor detenido. Ver [Guía de Migración](./BACKUP_MIGRATION.md).

**¿El export GTFS es válido para subir a Google Maps?**
→ Sí, siempre que completes todos los campos requeridos por la especificación GTFS. El validador oficial de Google es [gtfs.org/tools](https://gtfs.org/tools/).
