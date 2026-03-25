# GTFS Generator

Herramienta web integral para planificadores de transporte público. Permite digitalizar redes de buses desde cero o editar feeds GTFS existentes con un editor de mapa geoespacial, cálculo de rutas automático vía OSRM y gestión completa de horarios.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-black)](https://fastify.dev)
[![Docker](https://img.shields.io/badge/Docker-Required_for_OSRM-blue)](https://docker.com)

---

## 🎯 ¿Qué hace esta herramienta?

| Capacidad | Descripción |
|---|---|
| 🗺️ **Editor de Mapa** | Crea paradas y segmentos que siguen la red vial real |
| 🛣️ **Enrutamiento OSRM** | Calcula distancias y tiempos de viaje por calles reales |
| 📋 **Gestión de Rutas** | Define agencias, rutas y su configuración operativa |
| 🕐 **Editor de Horarios** | Crea calendarios, trips y stop-times con auto-cálculo |
| 📦 **Importar GTFS** | Carga ZIPs GTFS existentes con filtrado selectivo |
| 📤 **Exportar GTFS** | Genera el ZIP GTFS final listo para Google Maps / Transit |
| 👥 **Multi-proyecto** | Gestiona múltiples ciudades con mapas y OSRM independientes |
| 🔐 **Autenticación** | Sistema de usuarios y roles vía Keycloak |

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + MapLibre + TailwindCSS) │
│              http://localhost:5173            │
└─────────────────┬───────────────────────────┘
                  │ /api
┌─────────────────▼───────────────────────────┐
│   Backend API (Fastify 5 + SQLite)           │
│              http://localhost:3001            │
└──────┬──────────────────────────────────────┘
       │              │
┌──────▼──────┐  ┌────▼────────────────────────┐
│  Keycloak   │  │  OSRM (Docker, por ciudad)  │
│  + Postgres │  │  http://localhost:500X       │
│  :8080/:5432│  └─────────────────────────────┘
└─────────────┘
```

**Datos persistidos en:** `server/gtfs.db` (SQLite) y `gtfs_data/` (mapas OSRM)

---

## ⚡ Inicio Rápido

> 📋 **Guías completas por sistema operativo:**
> - 🟦 [Windows 10/11](./INSTALL_WINDOWS.md)
> - 🍎 [macOS (Intel / Apple Silicon)](./INSTALL_MACOS.md)
> - 🐧 [Linux (Ubuntu / Debian / Fedora)](./INSTALL_LINUX.md)

### Requisitos mínimos

| Requisito | Versión | Para qué |
|---|---|---|
| **Node.js** | 20 LTS o superior | Ejecutar API y Frontend |
| **Git** | Cualquiera reciente | Clonar el repositorio |
| **Docker Desktop** | Última estable | OSRM (opcional en modo básico) |

### Instalación

```bash
git clone https://github.com/rgomezqbllos/gtfs_generator.git
cd gtfs_generator
npm run install:all
```

### Levantar en modo desarrollo

```bash
npm start
```

- 🖥️ **Frontend:** [http://localhost:5173](http://localhost:5173)
- 🔧 **API / Backend:** [http://localhost:3001](http://localhost:3001)

Detener: `Ctrl + C` en la terminal.

---

## 🔐 Autenticación (Keycloak)

La aplicación requiere autenticación cuando se ejecuta con Docker Compose (modo completo).

```bash
# Levanta el stack completo: App + Keycloak + Postgres
docker compose up --build
```

Accede a:
- **Aplicación:** [http://localhost:3001](http://localhost:3001)
- **Panel Admin Keycloak:** [http://localhost:8080](http://localhost:8080)

Credenciales por defecto para el superadministrador:
```
Usuario:    superadmin
Contraseña: superadmin
```

> ⚠️ **Cambia la contraseña por defecto** en entornos de producción o compartidos.

---

## 🗺️ Configurar OSRM (Enrutamiento por Calles)

OSRM permite que los segmentos entre paradas sigan las calles reales en lugar de líneas rectas.

### Comando (requiere Docker activo)

```bash
npm run osrm:setup -- <ciudad> <puerto> "<url-del-mapa-pbf>"
```

| Argumento | Descripción | Ejemplo |
|---|---|---|
| `<ciudad>` | Nombre/clave de la ciudad | `bogota` |
| `<puerto>` | Puerto local para el servidor OSRM | `5001` |
| `<url-del-mapa-pbf>` | URL del archivo OSM de Geofabrik | `https://download.geofabrik.de/...` |

### Ejemplos por ciudad

```bash
# Bogotá / Colombia
npm run osrm:setup -- bogota 5001 "https://download.geofabrik.de/south-america/colombia-latest.osm.pbf"

# Santiago / Chile
npm run osrm:setup -- santiago 5002 "https://download.geofabrik.de/south-america/chile-latest.osm.pbf"

# Ciudad de México
npm run osrm:setup -- mexico-city 5003 "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"

# Buenos Aires / Argentina
npm run osrm:setup -- buenos-aires 5004 "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf"

# Lima / Perú
npm run osrm:setup -- lima 5005 "https://download.geofabrik.de/south-america/peru-latest.osm.pbf"
```

> 💡 Puedes agregar cualquier región del mundo usando las URLs de [Geofabrik Downloads](https://download.geofabrik.de/).

Una vez levantado, configura la URL en el proyecto desde el **Map Hub** dentro de la aplicación (`http://localhost:<puerto>/route/v1/driving`).

### Notas importantes sobre OSRM

- La primera vez puede tardar **varios minutos** (descarga del mapa + procesamiento).
- Los archivos se guardan en `gtfs_data/` y **no se re-procesan** en ejecuciones futuras.
- Cada ciudad corre en un contenedor Docker con su propio puerto.
- Si el download de Geofabrik está bloqueado por tu red, descarga el `.osm.pbf` manualmente y colócalo en `gtfs_data/`.

---

## ⚙️ Variables de Entorno

Crea o edita el archivo `server/.env` para personalizar la configuración:

```env
# Puerto del servidor backend (default: 3001)
PORT=3001

# Ruta del archivo de base de datos SQLite
DB_PATH=./gtfs.db

# URL base del server Keycloak (para Docker Compose)
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_ADMIN=superadmin
KEYCLOAK_ADMIN_PASSWORD=superadmin

# URL OSRM (se configura por proyecto desde la UI, pero puede ser el fallback)
# Si no se define, la app usará el router OSRM público (con límites de peticiones)
OSRM_API_URL=http://localhost:5001/route/v1/driving
```

---

## 🏭 Producción sin Docker

Compila el frontend y backend, luego sirve todo desde el servidor:

```bash
npm run build
npm run start:prod
```

Accede en [http://localhost:3001](http://localhost:3001) — el backend sirve el frontend estático.

## 🐳 Producción con Docker Compose

```bash
docker compose up -d --build
```

- **App:** [http://localhost:3001](http://localhost:3001)
- **Keycloak:** [http://localhost:8080](http://localhost:8080)
- La base de datos persiste en `./gtfs_data/gtfs.db`

> OSRM **no** se levanta automáticamente con `docker compose`. Ejecútalo por separado con `npm run osrm:setup`.

---

## 🗑️ Reset de Datos

Con el servidor detenido:
```bash
# Borra la base de datos (paradas, rutas, horarios, proyectos)
rm server/gtfs.db server/gtfs.db-wal server/gtfs.db-shm

# Borra los mapas OSRM procesados (libera espacio en disco)
rm -rf gtfs_data/
```

---

## 🔧 Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| Segmentos son líneas rectas | OSRM no está corriendo o mal configurado | Verifica `docker ps` y la URL en Map Hub |
| `node: command not found` | Node.js no está instalado | Ver guía de tu OS |
| Error 401 en la API | Token de Keycloak expirado | Recarga la página |
| `docker: command not found` | Docker no instalado | Ver guía de tu OS |
| Download PBF falla | Red corporativa / firewall | Descarga el `.osm.pbf` manualmente |

---

## 💾 Copias de Seguridad y Migración

Para mover tus datos a otra computadora o hacer un respaldo, consulta la **[Guía de Migración](./BACKUP_MIGRATION.md)**.

---

## 📖 Documentación Adicional

- **[Guía de Usuario](./USER_GUIDE.md)** — Flujos paso a paso de la aplicación
- **[Instalación Windows](./INSTALL_WINDOWS.md)** — Instalación completa en Windows 10/11
- **[Instalación macOS](./INSTALL_MACOS.md)** — Instalación completa en Mac (Intel y Apple Silicon)
- **[Instalación Linux](./INSTALL_LINUX.md)** — Instalación completa en Ubuntu/Debian/Fedora
- **[Migración y Backups](./BACKUP_MIGRATION.md)** — Copia de seguridad de la base de datos
------
.env
# Credenciales base
KEYCLOAK_ADMIN=superadmin
KEYCLOAK_ADMIN_PASSWORD=superadmin
KC_DB_PASSWORD=keycloak
POSTGRES_USER=keycloak
# Configuración de Red
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
OSRM_DOCKER_NETWORK=gtfs_generator_default
# App
PORT=3001
DB_PATH=/data/gtfs.db
NODE_ENV=development
----