# Guía de Migración y Respaldo de Base de Datos

Esta guía explica cómo mover tus datos (paradas, rutas, segmentos, horarios, etc.) de una instalación de **GTFS Generator** a otra sin perder información.

## 1. Localización de los Archivos

La base de datos del proyecto es **SQLite**, lo que significa que **toda tu información vive en archivos físicos** dentro de la carpeta del servidor. No necesitas exportar nada complejo, solo copiar estos archivos.

Los archivos se encuentran en:
`GTFS_Generator/server/`

Los archivos específicos que debes buscar son:
1.  **`gtfs.db`** (Archivo principal - Obligatorio)
2.  `gtfs.db-wal` (Archivo temporal de escritura - Si existe)
3.  `gtfs.db-shm` (Archivo de memoria compartida - Si existe)

---

## 2. Paso a Paso para Migración (Máquina A -> Máquina B)

### En la Máquina de Origen (A):
1.  Cierra la aplicación (presiona `Ctrl + C` en la terminal) para asegurar que no haya escrituras pendientes.
2.  Ve a la carpeta `GTFS_Generator/server/`.
3.  Copia el archivo `gtfs.db`. (Si ves los archivos `-wal` o `-shm`, es recomendable copiarlos también o simplemente asegurar que apagaste bien el servidor antes).
4.  Lleva el archivo a tu unidad USB, correo o nube.

### En la Máquina de Destino (B):
1.  Asegúrate de haber clonado el proyecto e instalado las dependencias (`npm run install:all`).
2.  Asegúrate de que el servidor **esté apagado**.
3.  Ve a la carpeta `GTFS_Generator/server/`.
4.  Pega tu archivo `gtfs.db` allí. (Si ya existía uno, simplemente cámbiale el nombre o sobrescríbelo si estás seguro de que no necesitas los datos que estaban en la Máquina B).
5.  Inicia el servidor normalmente con `npm start`.

---

## 3. Respaldo por Seguridad (Backup)

Es altamente recomendable hacer una copia de seguridad semanal. Para ello:

1.  Crea una carpeta llamada `backups` fuera del proyecto.
2.  Copia tu `gtfs.db` y renómbralo con la fecha, por ejemplo: `gtfs_respaldo_2024_02_24.db`.

---

## 4. Notas Importantes

-   **OSRM (Mapas):** Solo estás migrando los datos de tu generador (rutas/paradas). Si la Máquina B no tiene configurada la misma ciudad en OSRM, verás tiempos y distancias vacías en algunos tramos hasta que corras el comando `npm run osrm:setup -- ciudad` en la nueva máquina.
-   **Compatibilidad:** Como es SQLite, el archivo es 100% compatible entre **Windows, Mac y Linux**. Puedes copiar la base de datos de un Windows y pegarla en un Mac sin ningún problema.
-   **Imágenes/Archivos Externos:** Si en el futuro subes archivos multimedia o PDFs asociados a rutas, estos viven en carpetas de assets que también deberías copiar. Por ahora, todo lo esencial está en `gtfs.db`.
