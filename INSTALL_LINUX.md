# Guía de Instalación para Linux

Esta guía asume como base una distribución basada en **Debian / Ubuntu**, sin embargo, los comandos son fácilmente portables a Fedora o Arch Linux intercambiando el gestor de paquetes (`apt` por `dnf` o `pacman`).

## 1. Prerrequisitos

Actualiza tu lista de paquetes local:
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.1 Git, Curl y compiladores básicos
GTFS Generator compila módulos que requieren algunas herramientas elementales de Linux (como dependencias nativas para SQLite).
```bash
sudo apt install build-essential curl git unzip -y
```

### 1.2 Node.js (v18+)
Por lo regular, el repositorio oficial de Debian/Ubuntu trae versiones desactualizadas de Node. Instalaremos la versión de NodeSource LTS directamente:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```
Verifica su funcionamiento:
```bash
node -v
npm -v
```

### 1.3 Docker Engine (Opcional pero recomendado)
Si vas a requerir OSRM localmente, instalarás el Motor Docker directo en tu entorno Linux. Docker corre de manera nativa en Linux, por lo cual es la mejor plataforma de rendimiento absoluto para el OSRM.

Instalar Docker usando el script oficial:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

Añade tu usuario actual al grupo `docker` para que no tengas que usar `sudo` para cada comando (requiere que cierres sesión y vuelvas a entrar, o reinicies el terminal para aplicar los cambios):
```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 2. Descarga y Dependencias

Navega a un directorio donde desees alojar la app y clónala:
```bash
cd ~
git clone <URL_DEL_REPOSITORIO>
cd GTFS_Generator
```

Procede a instalar los paquetes (Frontend, Backend principal):
```bash
npm run install:all
```

---

## 3. Configuración Inicial (OSRM)

(Opcional, si usarás la generación de rutas automáticas siguiendo vías).

Al estar libre de capas de virtualización como WSL o HyperKit, Docker en Linux usa el sistema de archivos completo del anfitrión (host). Ejecuta el comando para descargar tu ciudad, por ejemplo **bogota**:

```bash
npm run osrm:setup -- bogota
```
El script creará un contenedor transitorio de `osrm-backend` que extraerá los grafos vehiculares en la carpeta base `osrm-data/`. Al concluir, levantará de fondo el servicio escuchando en `http://localhost:5001`.

---

## 4. Ejecutar GTFS Generator 

Simplemente levanta los flujos de Desarrollo:

```bash
npm start
```

Entra en tu navegador nativo a `http://localhost:5173`. Tu gestor GTFS está vivo interactuando con tu API en `http://localhost:3001`.

---

## 5. Despliegue en Servidores de Producción (VPS Linux)

Si planeas montar esto de manera perpetua para tu equipo utilizando Ubuntu Server:

Puedes compilar la aplicación completa y desplegarla utilizando PM2. O, alternativamente, utilizar el archivo `docker-compose.yml` que empaqueta ya sea tu frontend y backend:

```bash
# Compilar ambos perfiles
npm run build 

# Si tienes pm2 instalado (npm i -g pm2)
pm2 start npm --name "gtfs-api" -- run start:prod
```
> O si clonas y construyes Docker:
```bash
docker compose up -d --build
```
> (Recuerda que OSRM va por otro lado corriendo por su propia cuenta como explicamos en el paso 3).
