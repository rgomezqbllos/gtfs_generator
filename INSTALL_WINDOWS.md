# Guía de Instalación — Windows 10 / 11

Esta guía te lleva paso a paso para instalar y ejecutar **GTFS Generator** en Windows 10 o Windows 11. No necesitas experiencia previa con programación.

---

## 1. Instalar Prerrequisitos

### 1.1 Git

Git te permitirá descargar el código fuente del proyecto.

1. Descarga el instalador desde [git-scm.com/download/win](https://git-scm.com/download/win).
2. Ejecuta el instalador y deja **todas las opciones por defecto**. Haz clic en "Next" hasta finalizar.

**Verificación:** Abre `PowerShell` y escribe:
```powershell
git --version
# Debería mostrar: git version 2.x.x
```

---

### 1.2 Node.js (versión 20 LTS)

Node.js es el motor que ejecuta tanto el servidor (API) como el frontend.

1. Ve a [nodejs.org](https://nodejs.org/es/) y descarga la versión **LTS (Long Term Support)**.
2. Ejecuta el instalador. En la pantalla "Tools for Native Modules", **marca la casilla** para instalar herramientas de compilación (necesaria para SQLite).
3. Acepta reiniciar si se lo solicita.

**Verificación:**
```powershell
node -v   # v20.x.x o superior
npm -v    # 10.x.x o superior
```

> ⚠️ Si `npm` o `node` no se reconocen después de instalarlo, **cierra y vuelve a abrir** PowerShell.

---

### 1.3 Docker Desktop (Requerido para OSRM)

Docker es necesario para procesar los mapas de calles (OSRM). Sin Docker, la aplicación funciona pero los segmentos aparecerán como líneas rectas.

1. **Instalar WSL 2** (requerido por Docker en Windows):
   - Abre `PowerShell` como Administrador (clic derecho → "Ejecutar como administrador").
   - Ejecuta:
     ```powershell
     wsl --install
     ```
   - Reinicia tu computadora cuando se lo solicite.

2. **Instalar Docker Desktop:**
   - Descarga desde [docs.docker.com/desktop/install/windows-install](https://docs.docker.com/desktop/install/windows-install/).
   - Ejecuta el instalador. Asegúrate de marcar **"Use WSL 2 instead of Hyper-V"**.
   - Al terminar, abre Docker Desktop desde el menú inicio y espera a que el ícono de la ballena 🐳 en la barra de tareas quede **fijo sin animación** (tardará un minuto la primera vez).

**Verificación:**
```powershell
docker --version
# Docker version 24.x.x o superior
```

---

## 2. Descargar e Instalar el Proyecto

1. Abre **PowerShell** (o Git Bash) y navega a donde quieras guardar el proyecto:
   ```powershell
   cd $HOME\Documents
   ```

2. Clona el repositorio:
   ```powershell
   git clone https://github.com/rgomezqbllos/gtfs_generator.git
   cd gtfs_generator
   ```

3. Instala todas las dependencias (frontend + backend):
   ```powershell
   npm run install:all
   ```
   > Este proceso tarda 2-5 minutos dependiendo de tu conexión a internet.

---

## 3. Configurar OSRM para tu Ciudad (Opcional pero Recomendado)

OSRM permite que los trazados de segmentos sigan las calles reales en lugar de líneas rectas.

> **Requisito:** Docker Desktop debe estar abierto y corriendo (ícono de ballena fijo en la barra de tareas).

El comando requiere **3 argumentos**: el nombre de tu ciudad, el puerto que usará, y la URL del mapa OSM.

```powershell
# Sintaxis:
npm run osrm:setup -- <ciudad> <puerto> "<url-del-mapa>"

# Ejemplo para Bogotá:
npm run osrm:setup -- bogota 5001 "https://download.geofabrik.de/south-america/colombia-latest.osm.pbf"

# Ejemplo para Santiago:
npm run osrm:setup -- santiago 5002 "https://download.geofabrik.de/south-america/chile-latest.osm.pbf"

# Ejemplo para Ciudad de México:
npm run osrm:setup -- mexico-city 5003 "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"
```

> ⏳ La primera vez descargará y procesará el mapa. Puede tardar **5-20 minutos** según el tamaño de la región. Los datos quedan guardados en `gtfs_data/` y no se re-procesan en ejecuciones futuras.

Cuando termine, verás:
```
✅ OSRM is running for bogota!
URL: http://localhost:5001
```

Luego, en la aplicación, configura esa URL en el **Map Hub** de tu proyecto.

---

## 4. Levantar la Aplicación

### Modo Desarrollo (más sencillo, sin Keycloak)

```powershell
npm start
```

Se abrirán dos procesos:
- 🖥️ **Frontend:** [http://localhost:5173](http://localhost:5173)
- 🔧 **API Backend:** [http://localhost:3001](http://localhost:3001)

Abre tu navegador (Chrome, Edge o Firefox) y ve a [http://localhost:5173](http://localhost:5173).

Para detener: presiona `Ctrl + C` en la terminal.

---

### Modo Completo con Docker (App + Keycloak + Postgres)

Para habilitar la autenticación de usuarios completa:

```powershell
docker compose up --build
```

Accede en [http://localhost:3001](http://localhost:3001).

**Credenciales de primer acceso:**
```
Usuario:    superadmin
Contraseña: superadmin
```

Panel de administración de usuarios: [http://localhost:8080](http://localhost:8080)

---

## 5. Solución de Problemas Comunes en Windows

| Error | Causa | Solución |
|---|---|---|
| `'npm' no se reconoce como comando` | Node.js no está en el PATH | Cierra y abre PowerShell nuevamente, o reinstala Node.js marcando "Add to PATH" |
| `Error connecting to Docker` en osrm:setup | Docker Desktop no está iniciado | Ábrelo desde el menú Inicio y espera a que el ícono quede fijo |
| `wsl: command not found` | WSL no instalado | Ejecuta `wsl --install` como Administrador y reinicia |
| Segmentos en línea recta | OSRM no está corriendo | Ejecuta `docker ps` para verificar el contenedor OSRM activo |
| `EACCES: permission denied` en npm install | Permisos insuficientes | Usa PowerShell como Administrador |
| Download del mapa PBF falla | Firewall corporativo bloqueando descarga | Descarga el `.osm.pbf` manualmente desde [geofabrik.de](https://download.geofabrik.de) y colócalo en `gtfs_data/` |

> 💡 **Consejo:** Usa siempre **PowerShell** o **Git Bash** en lugar del antiguo CMD (Símbolo del sistema) para evitar problemas de compatibilidad de rutas.
