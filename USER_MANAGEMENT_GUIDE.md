# Guía de Gestión de Usuarios

## Descripción General

El Centro de Control ahora permite la administración completa de usuarios con operaciones seguras y validadas:

### Operaciones Disponibles

| Operación | SuperAdmin | TenantAdmin | Notas |
|-----------|-----------|----------|-------|
| **Crear usuario** | ✅ | ✅ | Requiere username, email y contraseña temporal |
| **Editar usuario** | ✅ | ✅ | Cambiar email y contraseña de usuarios en sus proyectos |
| **Eliminar usuario** | ✅ | ❌ | Solo SuperAdmin puede eliminar cuentas (irreversible) |
| **Remover de proyecto** | ✅ | ✅ | Quita acceso a un proyecto específico (no elimina la cuenta) |
| **Asignar a proyecto** | ✅ | ✅ | Asigna usuario a un proyecto disponible |

---

## Funcionalidad Detallada

### 1. Editar Usuario (Pencil Icon)

**Campos editables:**
- **Email**: Debe ser válido (formato `usuario@dominio.com`)
- **Contraseña**: Opcional, mínimo 8 caracteres
  - Si dejas vacío, la contraseña **NO** cambia
  - Si ingresas, la contraseña se actualiza de inmediato

**Validaciones:**
- Email no puede estar duplicado en el sistema
- Contraseña requiere mínimo 8 caracteres
- Cambios se sincronizan con Keycloak automáticamente

**Permisos:**
- **SuperAdmin**: Puede editar cualquier usuario
- **TenantAdmin**: Solo puede editar usuarios que comparten un proyecto donde es admin

### 2. Eliminar Usuario (Trash Icon - Solo SuperAdmin)

⚠️ **Acción destructiva e irreversible**

**Qué sucede:**
1. Usuario se elimina de todos los proyectos
2. Cuenta se elimina de Keycloak
3. Registro se elimina de la base de datos local
4. El usuario NO puede volver a acceder

**Confirmación:**
- Modal de confirmación obligatoria
- Muestra el nombre de usuario a eliminar
- Requiere confirmación explícita

**Alternativa más segura:**
- En lugar de eliminar, usa **Remover de Proyecto** para revocar acceso específico
- La cuenta permanece en el sistema para auditoría

### 3. Remover de Proyecto (X en badges de proyectos)

**Qué sucede:**
- Usuario pierde acceso al proyecto específico
- La cuenta permanece en el sistema
- Usuario puede ser reasignado posteriormente

**Permisos:**
- **SuperAdmin**: Puede remover cualquier usuario
- **TenantAdmin**: Solo de sus propios proyectos

---

## Seguridad

### Validaciones de Entrada

#### Email
```
✓ usuario@dominio.com
✗ usuario@dominio (falta extensión)
✗ @dominio.com (falta usuario)
✗ usuario dominio.com (espacios)
```

#### Contraseña
```
✓ MiContraseña123! (8+ caracteres)
✗ corta (menos de 8)
✗ "" (campo vacío = no se cambia)
```

### Control de Permisos

**SuperAdmin** tiene acceso total a todas las operaciones.

**TenantAdmin** (admin de al menos un proyecto):
- ✅ Puede editar usuarios de sus proyectos
- ✅ Puede remover usuarios de sus proyectos
- ✅ Puede asignar usuarios a sus proyectos
- ❌ **NO puede eliminar usuarios** (solo SuperAdmin)
- ❌ **NO puede editar usuarios de proyectos ajenos**

---

## Flujos de Trabajo Comunes

### Cambiar Email de un Usuario

1. Click en ✏️ (Pencil icon)
2. Ingresa el nuevo email
3. Deja contraseña vacía (a menos que quieras cambiarla también)
4. Click en "Guardar Cambios"

### Forzar Reset de Contraseña

1. Click en ✏️ (Pencil icon)
2. Ingresa la nueva contraseña (mínimo 8 caracteres)
3. Deja email igual (sin cambios)
4. Click en "Guardar Cambios"
5. Comunica la nueva contraseña al usuario de forma segura

### Remover Acceso Gradual

**Objetivo:** Revocar acceso sin eliminar la cuenta

1. Click en la ✕ en los badges de proyectos asignados
2. Confirma la remoción
3. Usuario pierde acceso **solo** a ese proyecto
4. Si remuevas de todos los proyectos, usuario queda "huérfano"

### Eliminar Completamente (SuperAdmin Only)

1. Click en 🗑️ (Trash icon - solo visible para SuperAdmin)
2. Confirma la eliminación (modal destructiva)
3. Usuario se elimina:
   - De todos sus proyectos
   - De Keycloak
   - De la base de datos
4. **Operación irreversible**

---

## Sincronización con Keycloak

### Datos Sincronizados

Cuando editas un usuario, los siguientes datos se actualizan en Keycloak:
- ✅ Email
- ✅ Contraseña
- ✅ Username
- ✅ FirstName (si aplica)
- ✅ LastName (si aplica)

### Botón "Sincronizar Auth"

Si Keycloak y la BD local se desincronizaron:
1. Click en "Sincronizar Auth" (esquina superior derecha de Users)
2. Sistema obtiene todos los usuarios de Keycloak
3. Actualiza la BD local
4. Resuelve discrepancias automáticamente

---

## Troubleshooting

### "Email ya está en uso"
- Otro usuario tiene ese email
- Solución: Usa un email diferente o edita la otra cuenta primero

### "Nombre de usuario ya existe"
- El username está duplicado en Keycloak
- Solución: Contacta al administrador de Keycloak para resolver

### "No tienes permisos para actualizar este usuario"
- TenantAdmin intentando editar usuario que NO es de sus proyectos
- Solución: Asigna el usuario a uno de tus proyectos primero

### "No se puede eliminar la cuenta admin integrada"
- Intentaste eliminar el usuario 'admin' del sistema
- Solución: Crea otro SuperAdmin antes de eliminar 'admin'

### Usuario no aparece en la lista
- Sincronización incompleta
- Solución: Click en "Sincronizar Auth"

---

## Best Practices

1. **Usa "Remover de Proyecto" en lugar de eliminar**
   - Mantiene auditoría de quién fue usuario anteriormente
   - Reversible si necesitas reasignar

2. **Documenta cambios críticos**
   - Guarda quién pidió cambios de contraseña
   - Mantén un log de eliminaciones

3. **Comunica cambios al usuario**
   - Si cambias email o contraseña, notifica directamente
   - Usa canal seguro para nuevas contraseñas

4. **Revisa permisos regularmente**
   - Audit quién tiene acceso a qué proyectos
   - Remueve acceso de usuarios inactivos

5. **Usa TenantAdmins para delegación**
   - Asigna TenantAdmin en proyectos críticos
   - Descentraliza la gestión de usuarios
