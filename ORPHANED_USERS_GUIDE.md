# Guía: Limpieza de Usuarios Huérfanos

## ¿Qué son Usuarios Huérfanos?

**Usuarios huérfanos** = Existen en la BD local pero NO en Keycloak

### Cómo sucede
```
Escenario 1: Testing
- Creas usuarios en tests
- Tests fallan antes de sincronizar con Keycloak
- Usuario en BD, pero no en Keycloak

Escenario 2: Eliminación Manual
- Alguien elimina usuario de Keycloak manualmente
- BD local aún lo tiene
- Desincronización

Escenario 3: Migración
- Error durante importación/migración
- Usuario parcialmente creado
- Inconsistencia
```

---

## Cómo Detectarlos

### Paso 1: Ir a Centro de Control
```
Centro de Control → Tab "Usuarios"
```

### Paso 2: Click en "Detectar Huérfanos"
```
Botón amarillo en esquina superior derecha
Junto a "Sincronizar Auth"
```

### Paso 3: Ver Resultados
```
┌────────────────────────────────┐
│ Total en BD: 25                │
│ Total en Keycloak: 23          │
│ Huérfanos: 2                   │
└────────────────────────────────┘
```

---

## Entender el Reporte

### Ejemplo Real

```
📊 ESTADÍSTICAS
├─ En BD: 25 usuarios
├─ En Keycloak: 23 usuarios
└─ Huérfanos: 2 usuarios

📋 USUARIOS HUÉRFANOS
├─ test_user_001
│  └─ test_user_001@test.local
├─ test_user_002
│  └─ test_user_002@test.local
```

### Qué significa

| Métrica | Significado |
|---------|-------------|
| En BD | Total en base de datos |
| En Keycloak | Total en servidor de autenticación |
| Huérfanos | BD - Keycloak (inconsistencia) |

---

## Cuándo Limpiar

### ✅ Deberías limpiar si

```
1. Testing/Development
   └─ Usuarios creados en tests que fallaron

2. Desincronización conocida
   └─ Sabes que se eliminaron en Keycloak

3. Migración fallida
   └─ Importación incompleta de usuarios

4. Cleanup de datos
   └─ Después de problemas de Keycloak
```

### ❌ NO deberías limpiar si

```
1. Usuarios legítimos
   └─ Sincronización simplemente atrasada

2. Keycloak está down
   └─ Espera a que se recupere

3. No sabes por qué existen
   └─ Investiga primero
```

---

## Cómo Limpiar

### Paso 1: Click en "Limpiar Usuarios"
```
Botón rojo en modal de huérfanos
Muestra: "🗑️ Limpiar 2 Usuarios"
```

### Paso 2: Confirmación Primera
```
Modal muestra:
- Lista de usuarios a eliminar
- Advertencia sobre destructividad
- Botón "🗑️ Limpiar" (rojo)
- Botón "Cancelar"
```

### Paso 3: Confirmación Segunda
```
Modal muestra:
⚠️ CONFIRMAR ELIMINACIÓN

Se eliminarán permanentemente 2 usuarios de la
base de datos. Esta acción no se puede deshacer.

[✓ Confirmar Eliminación] (rojo)
[Volver]
```

### Paso 4: Completado
```
Alert mostrará:
✅ Se eliminaron 2 usuarios huérfanos

Borrados:
- test_user_001 (uuid...)
- test_user_002 (uuid...)
```

---

## Qué Sucede al Limpiar

### En la Base de Datos

```
1. Remover de user_projects
   ├─ test_user_001 → removido de todos sus proyectos
   └─ test_user_002 → removido de todos sus proyectos

2. Remover de users
   ├─ test_user_001 → BORRADO de tabla
   └─ test_user_002 → BORRADO de tabla

3. Transacción atómica
   └─ Todo o nada (consistencia garantizada)
```

### Auditoría

```
logs muestran:
"Cleaned up 2 orphaned users:
  - test_user_001 (uuid1...)
  - test_user_002 (uuid2...)"
```

### No afecta Keycloak

```
Keycloak NO se modifica
└─ Solo limpia inconsistencia en BD local
```

---

## Diferencia: Sincronizar vs Limpiar

### Sincronizar Auth (Existing)
```
GET usuarios de Keycloak
↓
Actualiza BD local
↓
Resultado: BD ← Keycloak (trusted source)
```

**Útil cuando**: Keycloak tiene la verdad

### Limpiar Huérfanos (NEW)
```
Encuentra: BD - Keycloak (diferencia)
↓
Elimina diferencia de BD
↓
Resultado: BD = Keycloak (consistencia)
```

**Útil cuando**: BD tiene "basura" que debe eliminarse

---

## Flujo Visual

```
┌─────────────────────────────────┐
│ Centro de Control - Usuarios     │
├─────────────────────────────────┤
│                                 │
│ [Detectar Huérfanos] [Sincronizar Auth]
│
│ Si hay huérfanos:
│ ┌──────────────────────────────┐
│ │ Usuarios Huérfanos Modal     │
│ │                              │
│ │ En BD: 25  |  KC: 23         │
│ │ Huérfanos: 2                 │
│ │                              │
│ │ [Usuario 1] ─ HUÉRFANO       │
│ │ [Usuario 2] ─ HUÉRFANO       │
│ │                              │
│ │ [🗑️ Limpiar 2] [Cancelar]    │
│ │        ↓                      │
│ │    Confirmación 1             │
│ │        ↓                      │
│ │    Confirmación 2             │
│ │        ↓                      │
│ │ ✅ Eliminado                 │
│ └──────────────────────────────┘
│
└─────────────────────────────────┘
```

---

## API Endpoints

### GET /admin/maintenance/orphaned-users

**Descripción**: Detectar usuarios huérfanos

**Respuesta**:
```json
{
  "success": true,
  "totalInDb": 25,
  "totalInKeycloak": 23,
  "orphanedCount": 2,
  "orphaned": [
    {
      "id": "uuid1",
      "username": "test_user_001",
      "email": "test_user_001@test.local"
    },
    {
      "id": "uuid2",
      "username": "test_user_002",
      "email": "test_user_002@test.local"
    }
  ]
}
```

---

### POST /admin/maintenance/cleanup-orphaned

**Descripción**: Eliminar usuarios huérfanos

**Respuesta si hay huérfanos**:
```json
{
  "success": true,
  "cleaned": 2,
  "deletedUsers": [
    "test_user_001 (uuid1...)",
    "test_user_002 (uuid2...)"
  ],
  "message": "Se eliminaron 2 usuarios huérfanos (en BD pero no en Keycloak)"
}
```

**Respuesta si NO hay huérfanos**:
```json
{
  "success": true,
  "cleaned": 0,
  "message": "No hay usuarios huérfanos para limpiar"
}
```

---

## Permisos

### ¿Quién puede limpiar?
```
✅ SuperAdmin (usuario 'admin')
❌ TenantAdmin
❌ Usuario Normal
```

### En el UI

```
SuperAdmin:
└─ Ve botón "Detectar Huérfanos" (amarillo)

TenantAdmin:
└─ NO ve botón "Detectar Huérfanos"

Normal User:
└─ No tiene acceso a Admin Panel
```

### En la API

```
GET  /admin/maintenance/orphaned-users  → 403 si no SuperAdmin
POST /admin/maintenance/cleanup-orphaned → 403 si no SuperAdmin
```

---

## Casos de Uso

### Caso 1: Cleanup después de Testing

```
Situación:
- Ejecutaste 100 tests
- Algunos fallos en setup
- 15 usuarios "sucios" en BD

Solución:
1. Click "Detectar Huérfanos"
2. Ves: 15 huérfanos
3. Click "Limpiar 15"
4. Confirmar 2x
5. ✅ BD limpia
```

### Caso 2: Recuperación de Desincronización

```
Situación:
- Alguien eliminó usuarios de Keycloak
- BD local aún los tiene
- Sistema inconsistente

Solución:
1. Click "Detectar Huérfanos"
2. Ves: 3 usuarios que ya no existen
3. Click "Limpiar 3"
4. Confirmar 2x
5. ✅ Sistema consistente
```

### Caso 3: Post-Migración Cleanup

```
Situación:
- Importaste usuarios de sistema antiguo
- Algunos registros quedaron incompletos
- 8 usuarios sin datos de Keycloak

Solución:
1. Click "Detectar Huérfanos"
2. Ves: 8 huérfanos
3. Revisar lista
4. Click "Limpiar 8"
5. Confirmar 2x
6. ✅ Datos migrados limpios
```

---

## Troubleshooting

### Botón no visible
```
Problema: No ves "Detectar Huérfanos"
Solución:
  1. ¿Eres SuperAdmin? (Usuario 'admin')
  2. ¿En la tab de "Usuarios"?
  3. Refresca la página (F5)
  4. Revisa logs del browser (F12)
```

### Error al detectar
```
Problema: "Error al verificar usuarios huérfanos"
Solución:
  1. ¿Keycloak está activo?
  2. ¿Tienes conexión?
  3. Revisa logs del servidor
  4. Intenta "Sincronizar Auth" primero
```

### Error al limpiar
```
Problema: "Error al limpiar usuarios"
Solución:
  1. Cierra modal y reintenta
  2. Asegúrate de estar conectado
  3. Verifica logs del servidor
  4. Si persiste, contacta admin
```

### Usuarios no desaparecen
```
Problema: Limpié pero siguen en tabla
Solución:
  1. Refresca página (F5)
  2. Intenta navegar a otra tab y volver
  3. Limpia cache del navegador
  4. Revisa que realmente fue exitoso (alert)
```

---

## Best Practices

### ✅ HACER

```
1. Detectar antes de limpiar
   └─ Siempre revisa qué vas a eliminar

2. Revisar los nombres
   └─ Asegúrate de que son realmente huérfanos

3. Documentar
   └─ Nota qué limpiaste y por qué

4. Sincronizar después
   └─ Ejecuta "Sincronizar Auth" para confirmar
```

### ❌ NO HACER

```
1. Limpiar sin revisar
   └─ Podrías eliminar usuarios legítimos

2. Ignorar confirmaciones
   └─ Las 2x confirmación existen por razón

3. Limpiar mientras Keycloak está down
   └─ Podría causar más inconsistencias

4. Limpiar sin documentar
   └─ No sabrás por qué desaparecieron usuarios
```

---

## Auditoría

### Logs

```
Servidor guarda:
- Quién ejecutó limpieza (usuario SuperAdmin)
- Cuándo (timestamp)
- Cuántos usuarios (count)
- Qué usuarios (usernames + IDs)

Búsqueda:
grep "Cleaned up" server.log
```

### Base de Datos

```
No hay tabla de auditoría especial
Pero puedes ver en git history si commiteas

Recomendación:
Después de limpiar:
1. Toma screenshot de alert
2. Guarda en documentación de proyecto
3. Nota razón en commit message
```

---

## Seguridad

### Validaciones

```
✅ SuperAdmin check (API + UI)
✅ Transacción atómica (BD consistency)
✅ No deletes Keycloak (solo BD)
✅ 2x confirmación (previene accidentes)
✅ Logs de auditoría
```

### Datos Eliminados

```
Cuando limpias usuario:
├─ Eliminado de user_projects
├─ Eliminado de users
└─ NO eliminado de Keycloak

Si necesitas restaurar:
├─ Restaurar backup de BD
└─ O re-sincronizar desde Keycloak
```

---

## Status del Sistema Después

### Si todo OK
```
✅ Usuarios huérfanos: 0
✅ BD == Keycloak
✅ Sin inconsistencias
```

### Si aún hay inconsistencias
```
1. Click "Sincronizar Auth"
   └─ Actualiza BD desde Keycloak
2. Click "Detectar Huérfanos"
   └─ Verifica de nuevo
3. Si persiste:
   └─ Revisar logs
   └─ Contactar admin
```

---

## FAQ

**P: ¿Se elimina de Keycloak también?**
R: No. Solo se elimina de la BD local. Keycloak no se toca.

**P: ¿Se puede deshacer?**
R: No. Es permanente. Por eso hay 2 confirmaciones.

**P: ¿Afecta a proyectos del usuario?**
R: Sí. El usuario se remueve de user_projects (transaccionalmente).

**P: ¿Qué pasa si Keycloak se recupera después?**
R: Si el usuario vuelve a existir en KC, puedes sincronizar (no lo readd a BD).

**P: ¿Puedo limpiar desde API?**
R: Sí. POST /admin/maintenance/cleanup-orphaned (SuperAdmin only).

**P: ¿Cuándo debo sincronizar vs limpiar?**
R:
- Sincronizar: KC tiene cambios, actualiza BD
- Limpiar: BD tiene basura, elimina de BD

---

## Changelog

| Versión | Cambios |
|---------|---------|
| v2.1.0+ | Feature agregada |
| | GET /orphaned-users endpoint |
| | POST /cleanup-orphaned endpoint |
| | "Detectar Huérfanos" button |
| | Orphaned users modal |
| | 2x confirmation flow |

---

**Última actualización**: 2026-03-25
**Versión**: v2.1.0
**Status**: ✅ Producción Ready para SuperAdmin only
