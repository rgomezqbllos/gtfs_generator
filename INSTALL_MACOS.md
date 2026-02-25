# Guía de Instalación para macOS

Esta guía te detallará cómo configurar tu entorno para ejecutar **GTFS Generator** en sistemas Apple (Macs con Intel o los nuevos Apple Silicon M1/M2/M3).

## 1. Prerrequisitos

Para macOS, el gestor de paquetes **Homebrew** hace el proceso infinitamente más fácil.

### 1.1 Command Line Tools & Homebrew
1. Abre tu aplicación **Terminal** (presiona `Cmd + Espacio`, escribe "Terminal" y presiona Enter).
2. Primero, instala las herramientas de consola de Apple (Git vendrá incluido):
   ```bash
   xcode-select --install
   ```
3. Luego, instala Homebrew copiando y pegando el siguiente código en la terminal:
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
   *(Sigue las instrucciones en pantalla, al finalizar normalmente te pedirá correr dos líneas de código para agregarlo a tu `.zprofile` o `.zprofile`. Cópialas y córrelas)*.

### 1.2 Node.js
Usa Homebrew para instalar Node (versión 18 o superior).
En la terminal, ejecuta:
```bash
brew install node
```
Confirma tu instalación con `node -v`. Debería responder con tu versión, ej. `v22.x.x`.

### 1.3 Docker Desktop (Opcional pero recomendado para OSRM)
Docker es necesario si vas a levantar tu propio servidor local de distancias de vías (OSRM) para que el editor de rutas calcule trazados automáticamente en las calles.
1. Descarga Docker Desktop para Mac desde [este enlace](https://docs.docker.com/desktop/install/mac-install/).
   > **Ojo:** Si posees una Mac M1/M2/M3, asegúrate de descargar la versión **"Mac with Apple silicon"**.
2. Abre el archivo `.dmg` y arrastra el icono de Docker a la carpeta de Aplicaciones.
3. Abre Docker desde tus Aplicaciones, dale los permisos necesarios cuando te los pida, y espera a que el icono de la barra superior esté estático.

---

## 2. Descarga e Instalación del Proyecto

1. Desde tu terminal, posiciónate en la carpeta donde trabajarás:
   ```bash
   cd ~/Documents
   ```
2. Clona el proyecto:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd GTFS_Generator
   ```
3. Instala todas las dependencias necesarias. Ejecuta:
   ```bash
   npm run install:all
   ```

---

## 3. Configuración Inicial (OSRM)

**(Omitir si no vas a usar el cálculo de tramos automáticos vía OSRM)**.

1. Verifica que tu **Docker Desktop** esté corriendo en la barra de menú superior.
2. Ejecuta el inicializador de base de datos geográfica:
   ```bash
   npm run osrm:setup -- bogota
   ```
   *(Puedes cambiar `bogota` por el nombre de tu setup/región programado en `osrm_manager.ts`. Esto comenzará la descarga de datos OSM de tu ciudad y el procesamiento de vías, puede tardar y calentar tu Mac por un par de minutos, esto es completamente normal)*.

---

## 4. Servir la Aplicación en Modo Desarrollo

Ya tienes todo instalado. Ahora, para levantar el proyecto:

```bash
npm start
```

- Este comando utiliza `concurrently` para lanzar la base de datos (Backend corriendo en `localhost:3001`) y el servicio de pantallas visuales (Frontend corriendo en `localhost:5173`).
- Visita [http://localhost:5173](http://localhost:5173) en Safari, Chrome, o tu navegador principal para empezar a utilizar la aplicación.
- Puedes apagar todo regresando a la terminal y pulsando `Control + C`.

---

## 5. Notas Adicionales en Mac

- **Base de Datos:** El proyecto utiliza `sqlite3` de manera nativa embebida, la cual se guardará como un archivo físico bajo `server/gtfs.db`.
- **Compatibilidad npm arm64:** Si estás en procesadores serie M, los módulos más recientes compilan de forma completamente nativa, lo cual hace que los cálculos de nodos en el backend vuelen en comparación a CPUs antiguos.
