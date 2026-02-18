# GTFS Generator

Una herramienta web completa para generar, editar y exportar archivos GTFS (General Transit Feed Specification). Diseñada para facilitar la creación de rutas de transporte público, paradas y horarios, con visualización de mapas y cálculo de rutas automático.

## Características Principales

*   **Editor de Mapas Interactivo**: Crea y mueve paradas (nodos) directamente sobre el mapa.
*   **Gestión de Segmentos**:
    *   Conecta paradas para crear tramos (segmentos).
    *   **Cálculo Automático**: Distancia y tiempo de viaje calculados automáticamente usando OSRM (Open Source Routing Machine).
    *   **Segmentos Vacíos (Deadheads)**: Soporte para tramos sin pasajeros (cocheras a inicio de ruta) con exportación CSV.
*   **Gestión de Rutas**:
    *   Editor visual de recorridos (unir segmentos).
    *   Soporte para múltiples agencias y tipos de ruta.
*   **Importación Avanzada GTFS**:
    *   **Selección Granular**: Elige qué Agencias, Rutas y Servicios importar.
    *   **Filtrado Estricto**: Solo importa paradas y segmentos utilizados, optimizando la base de datos.
    *   **Cálculo de Tiempos**: Estima tiempos de viaje automáticamente basado en datos GTFS y geometría.
*   **Editor de Horarios (Timetable)**:
    *   **Alertas de Duplicados**: Detecta visualmente viajes superpuestos.
    *   **Edición Manual Rápida**: Click derecho para "Saltar Parada" (Skip) o "Restaurar Tiempo" (Auto-cálculo).
    *   **Generación Automática**: Crea viajes masivos basados en frecuencia y tiempo de viaje.
*   **Optimización de Rendimiento**:
    *   **Renderizado WebGL**: Mapa optimizado capaz de visualizar miles de paradas a 60FPS.
    *   **Importación por Streaming**: Procesa archivos GTFS grandes sin saturar la memoria.
*   **Tipos de Parada Personalizados**: Soporte visual para paradas regulares, estaciones, parkings, etc.
*   **Persistencia Local**: Base de datos SQLite local (`gtfs.db`) que guarda todo tu progreso.
*   **Exportación GTFS**: Genera archivos `.zip` válidos y compatibles con el estándar GTFS.

---

## Prerrequisitos

Antes de instalar, asegúrate de tener instalado el siguiente software en tu sistema:

1.  **Node.js** (Versión 18 o superior)
    *   [Descargar Node.js](https://nodejs.org/)
2.  **Docker Desktop** (Requerido para el motor de mapas OSRM)
    *   [Descargar Docker](https://www.docker.com/products/docker-desktop/)
    *   *Nota*: Asegúrate de que Docker esté ejecutándose antes de usar la herramienta.

---

## Instalación

### 1. Clonar el Repositorio

Descarga el código fuente a tu máquina local.

```bash
git clone <url-del-repositorio>
cd GTFS_Generator
```

### 2. Instalar Dependencias

Ejecuta el siguiente comando en la raíz del proyecto para instalar las librerías necesarias tanto para el cliente (frontend) como para el servidor (backend).

**En macOS / Linux / Windows (PowerShell):**

```bash
npm run install:all
```

*Si el comando anterior falla, puedes instalar manualmente:*

```bash
# Raíz
npm install

# Cliente
cd client
npm install
cd ..

# Servidor
cd server
npm install
cd ..
```

---

## Configuración del Mapa (OSRM)

Para que el cálculo automático de rutas funcione, necesitas descargar y configurar el mapa de tu región. La herramienta incluye un script automatizado para esto.

**Importante**: Docker debe estar corriendo.

1.  Dirígete a la carpeta del servidor:
    ```bash
    cd server
    ```

2.  Ejecuta el script de configuración indicando tu ciudad o región (ej. `bogota`, `colombia`):
    ```bash
    npm run osrm:setup bogota
    ```
    *Este comando descargará los datos del mapa (OpenStreetMap), procesará el grafo de rutas y levantará un contenedor de Docker con el servidor OSRM.*

3.  Vuelve a la raíz del proyecto:
    ```bash
    cd ..
    ```

---

## Ejecución

Para iniciar la aplicación, ejecuta el siguiente comando desde la raíz del proyecto:

```bash
npm start
```

Este comando iniciará simultáneamente:
*   **Backend (API)**: `http://localhost:3000`
*   **Frontend (App)**: `http://localhost:5173`

Automáticamente se abrirá tu navegador predeterminado en `http://localhost:5173`.

---

## Guía de Uso Rápida

1.  **Crear Paradas**:
    *   Selecciona "Stops" en el menú lateral.
    *   Cambia al modo "Add Stop" (icono `+`).
    *   Haz clic en el mapa para colocar paradas.
    *   Edita los detalles (nombre, tipo) haciendo clic en la parada creada.

2.  **Crear Segmentos (Tramos)**:
    *   Selecciona "Segments".
    *   Modo "Revenue" (Tramos comerciales): Une dos paradas para crear un camino. OSRM calculará la ruta real por calle.
    *   Modo "Empty" (Tramos vacíos): Une dos paradas para conexiones internas (línea punteada).

3.  **Crear Rutas**:
    *   Selecciona "Routes".
    *   Crea una nueva ruta y define sus propiedades (nombre, color).
    *   Entra a "Edit Path" y selecciona los segmentos en orden secuencial para construir el recorrido.

4.  **Exportar**:
    *   Usa el botón de descarga en el menú lateral para generar el archivo `gtfs.zip` final.

---

## Solución de Problemas

*   **Error de Mapa/OSRM**: Si las rutas no se calculan (líneas rectas), verifica que el contenedor de Docker esté corriendo (`docker ps`) y que hayas ejecutado el setup (`npm run osrm:setup`).
*   **Base de Datos**: Si deseas reiniciar el proyecto desde cero, puedes borrar el archivo `server/gtfs.db`. Se creará uno nuevo automáticamente al reiniciar el servidor.
