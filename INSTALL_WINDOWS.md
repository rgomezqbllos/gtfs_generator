# Guía de Instalación para Windows

Esta guía te llevará paso a paso para instalar y ejecutar **GTFS Generator** en un sistema Windows 10 o Windows 11.

## 1. Prerrequisitos

Antes de comenzar, asegúrate de instalar las siguientes herramientas fundamentales:

### 1.1 Git
Usaremos Git para clonar el repositorio de código.
- Descarga el instalador desde la [página oficial de Git para Windows](https://git-scm.com/download/win).
- Durante la instalación, puedes dejar todas las opciones por defecto y hacer clic en "Siguiente" hasta finalizar.

### 1.2 Node.js
Requerimos Node.js en su versión 18 o superior para ejecutar tanto la API (Backend) como el panel de control (Frontend).
- Descarga la versión **LTS (Recommended for Most Users)** desde [nodejs.org](https://nodejs.org/es/).
- Ejecuta el instalador, acepta los términos y deja las opciones predeterminadas. (Asegúrate de que la opción que agrega Node al "PATH" esté marcada, habitualmente lo está por defecto).

> **Verificación:** Abre la consola `Símbolo del sistema` (CMD) o `PowerShell` y escribe `node -v`. Debería devolver la versión instalada (ej. `v20.x.x`).

### 1.3 Docker Desktop (Opcional pero recomendado para OSRM)
Si vas a utilizar el enrutamiento de calles inteligente (OSRM) de manera local (para calcular distancias exactas y sugerencias por las vías), requieres Docker.
- Windows requiere el subsistema de Linux para una mejor experiencia. Antes de Docker, instala [WSL 2](https://learn.microsoft.com/es-es/windows/wsl/install) abriendo un PowerShell como administrador y ejecutando: `wsl --install`. (Si pide reiniciar, hazlo).
- Ve a la página de [Docker Desktop para Windows](https://docs.docker.com/desktop/install/windows-install/) y descarga el instalador.
- Ejecútalo, asegúrate de marcar la opción "Use WSL 2 instead of Hyper-V" (Recomendado).
- Una vez instalado, ábrelo. Es posible que tarde un momento en arrancar el motor de Docker por primera vez.

---

## 2. Descarga e Instalación del Proyecto

1. Abre el menú inicio, busca **Git Bash** o **PowerShell** y ábrelo.
2. Navega a la carpeta donde deseas guardar el proyecto, por ejemplo:
   ```bash
   cd Documentos
   ```
3. Clona el repositorio:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd GTFS_Generator
   ```
4. Instala todas las dependencias del proyecto de manera automática ejecutando:
   ```bash
   npm run install:all
   ```
   *(Este comando instalará los paquetes principales, los del servidor y los del cliente. Puede tardar un par de minutos dependiendo de la velocidad de tu internet)*.

---

## 3. Configuración Inicial (OSRM)

Si **no** vas a usar OSRM local, puedes saltar este paso.
Si **sí** lo vas a utilizar, necesitamos descargar el mapa de tu ciudad base y montar el servidor OSRM.

1. Asegúrate de que **Docker Desktop** esté abierto y ejecutándose (busca el icono de la ballena en la barra de tareas abajo a la derecha).
2. En tu terminal (dentro de la carpeta `GTFS_Generator`), ejecuta el configurador pasándole el nombre de tu región (ej. `bogota`, `santiago`, `mexico-city`):
   ```bash
   npm run osrm:setup -- bogota
   ```
   *(La primera vez, Docker descargará su imagen de OSRM lo cual tomará un par de minutos. Luego descargará el mapa de Colombia y lo procesará. Este proceso final consumirá CPU y tiempo)*.

---

## 4. Ejecución de la Aplicación en Modo Desarrollo

Para arrancar tanto el Servidor (Backend en el puerto 3001) como el Cliente Visivo (Frontend en el puerto 5173), hay un comando unificado:

```bash
npm start
```

1. Verás mensajes en la consola arrancando dependencias compiladas.
2. Finalmente verás un mensaje verde indicando: `➜  Local:   http://localhost:5173/`.
3. Abre tu navegador web favorito (Edge, Chrome, Firefox) y entra a `http://localhost:5173`.

> **¿Cómo detenerlo?** En la consola donde está corriendo, simplemente presiona `Ctrl + C` y confirma con `S` si te lo solicita.

---

## 5. Solución a Errores Comunes en Windows

- **"El comando 'npm' o 'node' no se reconoce...":** Esto significa que Node.js no se instaló correctamente o que requieres reiniciar tu consola/computadora para que Windows detecte el cambio en las Variables de Entorno.
- **"Error conectando a Docker" en `npm run osrm:setup`:** Docker Desktop no está iniciado. Ábrelo desde tu menú inicio, espera a que el icono de la ballena esté fijo sin moverse, y vuelve a intentarlo.
- **Rutas y barras inversas:** En algunos comandos de Windows Command Prompt (CMD), las barras de directorios (`\`) frente a las (`/`) pueden dar problemas en scripts de node muy viejos. Es altamente recomendado usar la consola `Git Bash` integrada al instalar Git o el nuevo Windows Terminal con `PowerShell`.
