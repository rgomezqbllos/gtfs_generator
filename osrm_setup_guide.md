# Guía de Uso: OSRM Local con Docker

He configurado un script automatizado para gestionar tu servidor OSRM local. Esto te permitirá obtener rutas reales (no líneas rectas) incluso si los servidores públicos están bloqueados en tu red.

## 1. Requisitos Previos

*   **Docker Desktop** debe estar ejecutándose.
*   **Node.js** (ya instalado).

## 2. Iniciar el Servidor OSRM

Para configurar y ejecutar OSRM para una ciudad específica, simplemente ejecuta el siguiente comando en la terminal:

```bash
npm run osrm:setup <ciudad>
```

**Ciudades Disponibles:**
*   `bogota` (Colombia)
*   `medellin`
*   `cali`
*   `buenos-aires`
*   `cuiaba`
*   `mexico-city`
*   `montreal`
*   `new-york`
*   `sao-paulo`
*   `santiago`

### Ejemplo:
```bash
npm run osrm:setup bogota
```

El script automáticamente:
1.  Descargará el mapa necesario (intentando múltiples fuentes si alguna está bloqueada).
2.  Procesará los datos para el enrutamiento (puede tardar unos minutos la primera vez).
3.  Iniciará el servidor en el puerto **5001**.
    *(Usamos el 5001 porque el 5000 suele estar ocupado por AirPlay en Mac)*.

## 3. Verificación

Una vez que veas el mensaje `✅ OSRM is running for <ciudad>!`, el servidor estará listo.

Tu aplicación ya está configurada para usarlo automáticamente gracias al archivo `.env` que he creado:
```env
OSRM_API_URL=http://localhost:5001/route/v1/driving
```

## 4. Notas Importantes

*   **Primera ejecución:** La primera vez que ejecutas una ciudad, tardará unos minutos en descargar y procesar. Las siguientes veces será instantáneo.
*   **Cambiar de ciudad:** Si ejecutas el comando para otra ciudad (ej. `npm run osrm:setup mexico-city`), el servidor anterior se detendrá y se iniciará el nuevo con los datos correspondientes.
*   **Error de Puerto:** Si ves un error de puerto ocupado, asegúrate de no tener otro contenedor corriendo en el puerto 5001. El script intenta limpiar automáticamente, pero si fallara, puedes reiniciar Docker.
