# Guía de Instalación — macOS (Intel & Apple Silicon)

Esta guía cubre la instalación de **GTFS Generator** en equipos Apple con procesadores **Intel** y **Apple Silicon (M1, M2, M3, M4)**.

---

## 1. Instalar Prerrequisitos

### 1.1 Xcode Command Line Tools y Homebrew

Las Command Line Tools incluyen Git y los compiladores necesarios para módulos nativos (como SQLite). Homebrew es el gestor de paquetes recomendado para macOS.

1. Abre la **Terminal** (`Cmd + Espacio` → escribe "Terminal" → Enter).

2. Instala las herramientas de línea de comandos:
   ```bash
   xcode-select --install
   ```
   Aparecerá una ventana — haz clic en **"Instalar"** y espera a que termine (tarda unos minutos).

3. Instala Homebrew:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   Al finalizar, Homebrew te mostrará dos líneas que debes copiar y ejecutar para agregarlo a tu shell (algo como `eval "$(/opt/homebrew/bin/brew shellenv)"`). **Ejecútalas antes de continuar.**

**Verificación:**
```bash
git --version     # git version 2.x.x
brew --version    # Homebrew x.x.x
```

---

### 1.2 Node.js (versión 20 LTS)

```bash
brew install node@20
brew link --overwrite node@20
```

**Verificación:**
```bash
node -v   # v20.x.x
npm -v    # 10.x.x
```

> 💡 Si ya tienes otra versión de Node instalada, puedes usar `nvm` para gestionar múltiples versiones: `brew install nvm`.

---

### 1.3 Docker Desktop (Requerido para OSRM)

Docker es necesario para procesar y servir los mapas de calles (OSRM).

1. Descarga Docker Desktop desde [docs.docker.com/desktop/install/mac-install](https://docs.docker.com/desktop/install/mac-install/).
   > ⚠️ **Apple Silicon:** asegúrate de descargar la versión **"Mac with Apple silicon"** (archivo `.dmg` para ARM).
2. Abre el `.dmg` descargado y arrastra Docker a la carpeta **Aplicaciones**.
3. Abre Docker desde Launchpad o Aplicaciones.
4. Dale los permisos que solicite y espera a que el ícono 🐳 en la barra de menú superior quede **fijo** (puede tardar 30-60 segundos).

**Verificación:**
```bash
docker --version
# Docker version 24.x.x o superior
```

---

## 2. Descargar e Instalar el Proyecto

```bash
cd ~/Documents
git clone https://github.com/rgomezqbllos/gtfs_generator.git
cd gtfs_generator
npm run install:all
```

> Esto instala las dependencias del raíz, del servidor y del cliente. Tarda 2-5 minutos.

---

## 3. Configurar OSRM para tu Ciudad (Opcional pero Recomendado)

OSRM permite que los segmentos sigan las calles reales. Requiere Docker activo.

```bash
# Sintaxis:
npm run osrm:setup -- <ciudad> <puerto> "<url-del-mapa>"

# Ejemplos:
npm run osrm:setup -- bogota 5001 "https://download.geofabrik.de/south-america/colombia-latest.osm.pbf"
npm run osrm:setup -- santiago 5002 "https://download.geofabrik.de/south-america/chile-latest.osm.pbf"
npm run osrm:setup -- mexico-city 5003 "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"
npm run osrm:setup -- buenos-aires 5004 "https://download.geofabrik.de/south-america/argentina-latest.osm.pbf"
npm run osrm:setup -- lima 5005 "https://download.geofabrik.de/south-america/peru-latest.osm.pbf"
```

> ⏳ La primera vez puede tardar **5-20 minutos**. El mapa se guarda en `gtfs_data/` y no se re-procesa en ejecuciones posteriores.

> 🌡️ **Normal en Mac:** La CPU puede calentarse y los ventiladores pueden activarse durante el procesamiento. Esto es completamente normal.

Al terminar verás:
```
✅ OSRM is running for bogota!
URL: http://localhost:5001
```

---

## 4. Levantar la Aplicación

### Modo Desarrollo (sin Keycloak)

```bash
npm start
```

- 🖥️ **Frontend:** [http://localhost:5173](http://localhost:5173)
- 🔧 **API Backend:** [http://localhost:3001](http://localhost:3001)

Detener: `Control + C`

---

### Modo Completo con Docker (App + Keycloak + Postgres)

```bash
docker compose up --build
```

- **Aplicación:** [http://localhost:3001](http://localhost:3001)
- **Panel Keycloak:** [http://localhost:8080](http://localhost:8080)

**Credenciales de primer acceso:**
```
Usuario:    superadmin
Contraseña: superadmin
```

---

## 5. Notas Específicas para macOS

### Apple Silicon (M1/M2/M3/M4)

- **Rendimiento:** Los módulos nativos (SQLite, etc.) compilan de forma nativa para ARM64, lo cual puede resultar en mejor rendimiento que en equipos Intel.
- **Docker:** Los contenedores de OSRM (`osrm/osrm-backend`) tienen imágenes multi-arquitectura. En Apple Silicon, Docker usa la emulación de AMD64. El procesamiento es más lento que en un servidor Linux nativo, pero funciona correctamente.
- **Rosetta:** No es necesaria para este proyecto al usar las versiones correctas de Node y Docker.

### Permisos de Terminal

Si ves errores de permisos al ejecutar `npm run install:all`, puede ser necesario ajustar los permisos de la carpeta:
```bash
sudo chown -R $(whoami) ~/.npm
```

### Solución de Problemas

| Error | Solución |
|---|---|
| `zsh: command not found: brew` | Ejecuta las líneas de configuración que Homebrew mostró al instalarse |
| `zsh: command not found: node` | Ejecuta `brew link --overwrite node@20` y abre una nueva terminal |
| Docker no inicia | Ve a Aplicaciones → Docker → Abrirlo manualmente |
| Error de permisos en `npm install` | `sudo chown -R $(whoami) ~/.npm` |
| OSRM download bloqueado | Descarga el `.osm.pbf` manualmente desde [geofabrik.de](https://download.geofabrik.de) y colócalo en `gtfs_data/` |
