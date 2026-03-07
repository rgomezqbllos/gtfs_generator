# GTFS Generator

Aplicación web para generar, editar e importar/exportar feeds **GTFS** (General Transit Feed Specification) con editor de mapa, gestor de segmentos y horarios, y cálculo de rutas/tiempos vía **OSRM**.

## 🎯 Overview Funcional

Este proyecto es una herramienta para planificadores de transporte (como Rafael o Ralf) que necesitan digitalizar redes de buses en ciudades de cualquier parte del mundo.

### ¿Qué puede hacer el usuario actual?

1.  **Gestionar Proyectos Independientes:** Cada ciudad (Bogotá, Curitiba, Santiago) se gestiona como un proyecto con su propio centro de mapa y motor de enrutamiento (OSRM).
2.  **Digitalizar Infraestructura:** Crear paradas (Stops) y unirlas con segmentos (Segments) que siguen las calles reales, calculando distancias y tiempos de viaje automáticamente.
3.  **Configurar Operación:** Definir agencias, rutas y servicios (calendarios).
4.  **Editor de Horarios (Trips/Stop Times):** Crear viajes con secuencias de paradas y tiempos estimados, evitando la carga manual tediosa.
5.  **Multiperfiles:** Diferenciar si un bus circula por vía mixta, exclusiva o troncal para que el cálculo de rutas sea realista para el transporte público.
6.  **Importar/Exportar:** Cargar ZIPs existentes de GTFS para editarlos o generar el resultado final listo para usar en planificadores como Google Maps o Transit.

### Visión de Mejora Continua

Mantenemos el archivo `AGENTS.md` para documentar cómo los agentes de IA ayudan a evolucionar estas capacidades y cómo garantizamos la calidad técnica y funcional del transporte.

## Quickstart (desde cero)

Requisitos: **Node.js 18+**, **Git**, y **Docker** (solo si vas a usar OSRM local).

```bash
git clone <url-del-repositorio>
cd gtfs_generator
npm run install:all
```

Terminal 1 (opcional, OSRM local para tu ciudad):

```bash
npm run osrm:setup -- bogota
```

Terminal 2 (dev: API + frontend con hot-reload):

```bash
npm start
```

- Frontend (Vite): `http://localhost:5173`
- Backend/API: `http://localhost:3001` (por defecto)

## Características

- Editor de mapa interactivo (paradas/nodos)
- Segmentos con distancia/tiempo calculado vía OSRM + soporte “deadheads”
- Editor visual de rutas (recorridos)
- Importación GTFS selectiva (agencias/rutas/servicios) + filtrado estricto
- Editor de horarios (detección de duplicados, skip/auto-cálculo)
- Rendimiento: WebGL + importación por streaming
- Persistencia local en SQLite (`server/gtfs.db` por defecto)
- Exportación a `.zip` GTFS

## Prerrequisitos y Guías de Instalación Completas

Hemos preparado guías paso a paso detalladas según tu sistema operativo. **Por favor, lee la guía correspondiente a tu máquina antes de comenzar** para asegurar que dependencias clave como Node.js, Git y Docker se integren perfectamente:

- 🟦 **[Guía para Windows (10/11)](./INSTALL_WINDOWS.md)**
- 🍎 **[Guía para macOS (Intel/M1/M2)](./INSTALL_MACOS.md)**
- 🐧 **[Guía para Linux (Ubuntu/Debian/etc)](./INSTALL_LINUX.md)**

## Configuración (variables de entorno)

El servidor carga variables desde `server/.env` (opcional). Ejemplo:

```env
PORT=3001
OSRM_API_URL=http://localhost:5001/route/v1/driving
DB_PATH=./gtfs.db
```

- `PORT`: puerto del backend (default `3001`)
- `OSRM_API_URL`: endpoint OSRM. Si no lo defines, usa el OSRM público (`https://router.project-osrm.org/...`)
- `DB_PATH`: ruta del SQLite (default: `server/gtfs.db`). Útil para Docker/volúmenes

## OSRM local (recomendado en redes corporativas)

El script descarga datos de OpenStreetMap (PBF), los procesa y levanta un contenedor OSRM escuchando en `http://localhost:5001`.

```bash
npm run osrm:setup -- bogota
```

Ciudades/regiones disponibles (ver `server/scripts/osrm_manager.ts`): `bogota`, `santiago`, `chile`, `buenos-aires`, `mexico-city`.

Notas:

- La primera vez puede tardar varios minutos y ocupar bastante disco en `osrm-data/`.
- Si cambias de ciudad, el script detiene el contenedor anterior y levanta el nuevo.

## Desarrollo (hot reload)

1. (Opcional) OSRM local:

```bash
npm run osrm:setup -- bogota
```

2. App en desarrollo (Vite + API):

```bash
npm start
```

En dev, el frontend proxya `/api` hacia `http://localhost:3001` (ver `client/vite.config.ts`).

## Producción (sin Docker)

Compila frontend + backend y ejecuta el servidor (sirve el frontend estático):

```bash
npm run build
npm run start:prod
```

Accede en `http://localhost:3001` (o el `PORT` que definas).

## Producción con Docker (opcional)

El `Dockerfile` construye cliente+servidor y ejecuta el backend sirviendo `client/dist`.

```bash
docker compose up --build
```

- App: `http://localhost:3001`
- La base de datos persiste en `./gtfs_data/` (vía `DB_PATH`)

> OSRM local **no** se levanta automáticamente con `docker compose` porque requiere elegir ciudad/región y preprocesar el mapa. Puedes ejecutarlo en tu host con `npm run osrm:setup -- <ciudad>`.

## Reset de datos

- Borra `server/gtfs.db` (y `server/gtfs.db-wal`, `server/gtfs.db-shm` si existen) con el servidor apagado.

## Troubleshooting

- Si ves líneas rectas o tiempos “raros”, revisa `OSRM_API_URL` y que el contenedor OSRM esté arriba (`docker ps`).
- Si el download de Geofabrik está bloqueado, el script te pedirá descargar manualmente el `.osm.pbf` y dejarlo en `osrm-data/`.

## Copias de Seguridad y Migración

¿Necesitas mover tus datos a otra computadora o hacer un respaldo? Consulta nuestra **[Guía de Migración y Respaldo](./BACKUP_MIGRATION.md)** para gestionar tu base de datos SQLite de forma segura.
