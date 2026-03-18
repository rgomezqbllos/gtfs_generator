# Guía de Instalación — Linux (Ubuntu / Debian / Fedora)

Esta guía asume como base **Ubuntu 22.04 LTS** o **Debian 12**, pero los comandos son fácilmente adaptables a Fedora, Arch Linux y otras distribuciones sustituyendo `apt` por `dnf` o `pacman`.

---

## 1. Instalar Prerrequisitos

### 1.1 Actualizar el sistema y herramientas base

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y build-essential curl git unzip
```

> En **Fedora**: `sudo dnf groupinstall "Development Tools" && sudo dnf install curl git unzip`

---

### 1.2 Node.js (versión 20 LTS)

El repositorio oficial de Ubuntu/Debian suele incluir versiones desactualizadas de Node. Usa el repositorio oficial de NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

> En **Fedora**: `sudo dnf install nodejs` (suele tener versiones recientes) o usa `nvm`.

**Verificación:**
```bash
node -v   # v20.x.x
npm -v    # 10.x.x
```

---

### 1.3 Docker Engine (Requerido para OSRM)

Docker corre de forma nativa en Linux — sin virtualización, lo que lo hace más rápido que en Windows o macOS para el procesamiento OSRM.

**Instalación con el script oficial (más simple):**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**Agregar tu usuario al grupo `docker`** (evita usar `sudo` en cada comando Docker):
```bash
sudo usermod -aG docker $USER
newgrp docker
```

> ⚠️ **Importante:** Cierra sesión y vuelve a entrar (o reinicia la terminal) para que el cambio de grupo tenga efecto.

**Verificación:**
```bash
docker --version       # Docker version 24.x.x
docker run hello-world # Debe correr sin sudo
```

> En **Fedora**: Instala con `sudo dnf install docker-ce` después de agregar el repositorio oficial de Docker.

---

## 2. Descargar e Instalar el Proyecto

```bash
cd ~
git clone https://github.com/rgomezqbllos/gtfs_generator.git
cd gtfs_generator
npm run install:all
```

> Esto instala las dependencias del raíz, del servidor y del cliente. Tarda 2-5 minutos.

---

## 3. Configurar OSRM para tu Ciudad (Opcional pero Recomendado)

OSRM permite que los segmentos sigan las calles reales en lugar de líneas rectas.

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

> ⏳ La primera vez puede tardar **5-20 minutos**. Los datos se guardan en `gtfs_data/` y no se re-procesan en ejecuciones futuras.

> ⚡ **Linux** es la plataforma con mejor rendimiento para OSRM: sin capas de virtualización, Docker accede directamente al sistema de archivos del host.

Al terminar verás:
```
✅ OSRM is running for bogota!
URL: http://localhost:5001
```

Configura esa URL en el **Map Hub** de tu proyecto dentro de la aplicación.

---

## 4. Levantar la Aplicación

### Modo Desarrollo (sin Keycloak)

```bash
npm start
```

- 🖥️ **Frontend:** [http://localhost:5173](http://localhost:5173)
- 🔧 **API Backend:** [http://localhost:3001](http://localhost:3001)

Detener: `Ctrl + C`

---

### Modo Completo con Docker Compose (App + Keycloak + Postgres)

Para habilitar la autenticación completa de usuarios:

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

> OSRM **no** se levanta con `docker compose`. Ejecútalo por separado (paso 3).

---

## 5. Despliegue en Producción (VPS / Servidor)

Para correr la aplicación de forma permanente en un servidor Linux Ubuntu:

### Opción A: Compilar y usar PM2 (sin Docker)

```bash
# Compilar frontend y backend
npm run build

# Instalar PM2 globalmente si no lo tienes
npm install -g pm2

# Levantar el servidor como servicio
pm2 start npm --name "gtfs-generator" -- run start:prod
pm2 startup    # Configura auto-inicio al reiniciar el servidor
pm2 save
```

El servidor queda disponible en `http://tu-servidor:3001`.

### Opción B: Docker Compose en producción

```bash
docker compose up -d --build
```

Esto levanta App + Keycloak + Postgres en contenedores, con la app disponible en el puerto `3001`.

> Para ambas opciones: configura un **proxy reverso** (Nginx o Caddy) con SSL para exponer la aplicación en el puerto 443 (HTTPS).

---

## 6. Solución de Problemas en Linux

| Error | Solución |
|---|---|
| `docker: permission denied` | Ejecuta `sudo usermod -aG docker $USER && newgrp docker` |
| `node: command not found` | Verifica que NodeSource se instaló correctamente. Prueba `which node` |
| `EACCES: permission denied` en npm | Ejecuta `sudo chown -R $USER ~/.npm` |
| `GLIBC_x.xx not found` | Tu versión de Ubuntu/Debian es muy antigua. Actualiza a Ubuntu 22.04+ |
| OSRM download bloqueado por firewall | Descarga el `.osm.pbf` manualmente desde [geofabrik.de](https://download.geofabrik.de) y colócalo en `gtfs_data/` |
| Los segmentos son líneas rectas | OSRM no está corriendo. Verifica con `docker ps` |
