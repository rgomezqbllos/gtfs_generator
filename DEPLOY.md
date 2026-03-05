# Guía de Despliegue (Producción / Local)

Este proyecto está completamente "Dockerizado", lo que significa que puedes desplegarlo fácilmente en **cualquier servidor** (Linux, Windows, macOS) que tenga Docker y Docker Compose instalados, utilizando un solo comando.

## Requisitos Previos
1. [Docker](https://docs.docker.com/get-docker/) instalado.
2. [Docker Compose](https://docs.docker.com/compose/install/) instalado (usualmente viene incluido con Docker Desktop).

## Desplegar el Proyecto

Abre una terminal o consola de comandos en la carpeta raíz del proyecto y ejecuta el siguiente comando:

```bash
docker compose up -d --build
```

> **Nota:** La primera vez que ejecutes esto, puede tardar un par de minutos ya que Docker descargará las imágenes de base (PostgreSQL, Keycloak, Node) y compilará todo el Frontend y Backend del proyecto desde cero.

### ¿Qué hace este comando?
1. **app:** Compila el Frontend (React) y Backend (Fastify) y levanta el servidor web en el puerto `3001`.
2. **postgres:** Levanta la base de datos necesaria para el sistema de identidades (Keycloak).
3. **keycloak:** Levanta el sistema de login en el puerto `8080` e importa automáticamente los roles y usuarios (`gtfs` realm).

## Acceder a la Aplicación

Una vez finalizado el build y con los contenedores corriendo, abre tu navegador web:

* **Si lo corres localmente:** Ingresa a `http://localhost:3001`
* **Si lo corres en un servidor remoto:** Ingresa a `http://<IP-DEL-SERVIDOR>:3001`

*(El sistema detectará automáticamente en qué IP está corriendo y configurará el Single Sign-On de Keycloak para esa IP).*

### Credenciales de Administrador por defecto:

* **Usuario:** `admin`
* **Contraseña:** `admin123`

---

## Mantenimiento y Comandos Útiles

**Ver los logs (para encontrar errores):**
```bash
docker compose logs -f
```

**Detener la aplicación:**
```bash
docker compose down
```

**Borrar toda la base de datos y empezar de cero (¡Peligro!):**
```bash
docker compose down -v
# Borrar la base de datos SQLite de la aplicación
rm -rf gtfs_data/
```

## Solución de Problemas Comunes

1. **Error "Client not found" al intentar iniciar sesión:** 
   Ocurre si Keycloak arrancó más rápido de lo esperado en la primera limpieza y no cargó la configuración.
   **Solución:** Ve a la consola y ejecuta `docker compose restart keycloak`

2. **La app no guarda cambios o se reinician (SQLite Database locked):**
   Asegúrate de que la carpeta `./gtfs_data` en tu servidor físico tiene permisos de lectura y escritura para Docker.

3. **No carga OSRM (Motor de ruteo):**
   El sistema está diseñado para apuntar a un motor de ruteo por proyecto. Asegúrate de configurar la IP correcta de tu servicio OSRM desde el **Panel de Control** de administrador dentro de la app web.
