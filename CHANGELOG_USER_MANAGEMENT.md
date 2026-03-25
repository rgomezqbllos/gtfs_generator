# Changelog: Sistema de Gestión de Usuarios

**Fecha**: 2026-03-25
**Versión**: 2.1.0
**Tipo**: Feature Enhancement

---

## Resumen de Cambios

Se implementó un sistema completo y seguro de gestión de usuarios en el Centro de Control, permitiendo a administradores:
- ✏️ Editar usuarios (email, contraseña)
- 🗑️ Eliminar usuarios (SuperAdmin only)
- 🔍 Validaciones robustas en tiempo real

---

## Cambios Frontend

### `client/src/components/AdminPanel.tsx`

#### Nuevos Estados
```typescript
- editingUser: usuario siendo editado
- editEmail: email en el formulario de edición
- editPassword: contraseña en el formulario de edición
- userToDelete: ID del usuario a eliminar
- loading: indicador de operación en progreso
```

#### Nuevos Iconos
- `Pencil`: editar usuario
- `Mail`: campo de email
- `Lock`: campo de contraseña

#### Nuevas Funciones
```typescript
handleEditUser()    // PUT /admin/users/:id
handleDeleteUser()  // DELETE /admin/users/:id
```

#### Cambios en Tabla de Usuarios
- ✅ Nueva columna "Acciones"
- ✅ Botón Editar (pencil) - siempre visible
- ✅ Botón Eliminar (trash) - solo para SuperAdmin
- ✅ Validación de permisos en UI

#### Nuevos Modales
1. **User Editor Modal** (Modal de edición)
   - Email (requerido, validado)
   - Contraseña (opcional, mínimo 8 chars)
   - Indicador visual de validación
   - Botones: Guardar / Cancelar

2. **Delete Confirmation Modal** (Confirmación destructiva)
   - Muestra nombre de usuario a eliminar
   - Botones: Confirmar / Cancelar

#### UI/UX Improvements
- ✅ Validación en tiempo real de contraseña
- ✅ Indicadores visuales (✓/✗) para password strength
- ✅ Mensajes de error descriptivos
- ✅ Deshabilitar botón guardar si datos inválidos
- ✅ Toast/alert con resultado de operación

---

## Cambios Backend

### `server/src/routes/admin.ts`

#### Endpoint PUT (Updated)
**Path**: `PUT /admin/users/:id`

**Validaciones Nuevas**:
- ✅ Validación de email (regex)
- ✅ Validación de contraseña (mínimo 8 chars)
- ✅ Validación de permiso TenantAdmin (compartir proyecto)
- ✅ Detección de email duplicado
- ✅ Detección de username duplicado

**Mejoras de Seguridad**:
- Valida email antes de enviar a Keycloak
- Valida longitud mínima de contraseña
- Mensajes de error en español más claros
- Better error categorization (409 para conflictos)

**Response**:
```json
{
  "success": true,
  "message": "Usuario actualizado correctamente"
}
```

#### Endpoint DELETE (Improved)
**Path**: `DELETE /admin/users/:id`

**Validaciones Nuevas**:
- ✅ SuperAdmin-only check (sin cambio)
- ✅ Protección de cuenta 'admin' (sin cambio)
- ✅ Validación de usuario existe
- ✅ Transacción atómica (user_projects primero)
- ✅ Mejor manejo de errores Keycloak

**Cambios**:
- Transacción: elimina user_projects → users
- Mensajes descriptivos en español
- Mejor detección de errores 404
- Response con nombre de usuario eliminado

**Behaviors**:
```
Orden de eliminación:
1. Remover de user_projects (proyectos)
2. Remover de users (tabla principal)
3. Eliminar de Keycloak
4. Si falla Keycloak, BD ya está consistente
```

**Response**:
```json
{
  "success": true,
  "message": "Usuario username123 eliminado correctamente"
}
```

---

## Matriz de Permisos

### Editar Usuario (PUT)
| Quien | Puede | Limitaciones |
|------|-------|--------------|
| SuperAdmin | ✅ Cualquiera | Ninguna |
| TenantAdmin | ✅ De sus proyectos | Comparte al menos un proyecto |
| Normal User | ❌ Nadie | N/A |

### Eliminar Usuario (DELETE)
| Quien | Puede | Limitaciones |
|------|-------|--------------|
| SuperAdmin | ✅ Cualquiera | No puede eliminar 'admin' |
| TenantAdmin | ❌ Nadie | Solo pueden remover de proyectos |
| Normal User | ❌ Nadie | N/A |

---

## Validaciones

### Email
```
Patrón: ^[^\s@]+@[^\s@]+\.[^\s@]+$
Ejemplos válidos:
✓ usuario@ejemplo.com
✓ john.doe@company.co.uk
✓ test+tag@domain.org

Ejemplos inválidos:
✗ usuario@dominio (falta extensión)
✗ @dominio.com (falta usuario)
✗ usuario dominio.com (contiene espacio)
```

### Contraseña
```
Requisitos:
- Mínimo 8 caracteres
- Si está vacío, no se cambia
- Sin requisitos adicionales de complejidad (para facilidad)

Validación:
- Frontend: en tiempo real con indicador visual
- Backend: validación antes de enviar a Keycloak
```

---

## Testing Checklist

### Editar Usuario
- [ ] SuperAdmin puede editar cualquier usuario
- [ ] TenantAdmin solo puede editar de sus proyectos
- [ ] Email válido requerido
- [ ] Contraseña opcional, mínimo 8 chars
- [ ] Cambios aparecen inmediatamente en tabla
- [ ] Cambios sincronizados en Keycloak

### Eliminar Usuario
- [ ] Botón delete solo visible para SuperAdmin
- [ ] Modal de confirmación aparece
- [ ] Usuario no puede ser 'admin'
- [ ] Eliminación es completa (BD + Keycloak)
- [ ] Usuario desaparece de lista
- [ ] Remover de proyecto sigue funcionando

### Validaciones
- [ ] Email inválido rechazado
- [ ] Contraseña corta rechazada (< 8)
- [ ] Email duplicado detectado
- [ ] Mensajes de error claros
- [ ] Indicadores visuales de validación

### Permisos
- [ ] TenantAdmin no puede ver botón delete
- [ ] TenantAdmin no puede editar otro usuario
- [ ] SuperAdmin ve opciones completas
- [ ] Errores 403 manejados correctamente

---

## Breaking Changes

🔓 **Ninguno** - Cambios son aditivos, compatible con versiones anteriores.

---

## Performance Impact

- ✅ Mínimo: Una consulta SQL adicional para verificar permiso TenantAdmin
- ✅ Caching no afectado
- ✅ Queries optimizadas con índices existentes

---

## Documentation

Nueva documentación creada:
- `USER_MANAGEMENT_GUIDE.md` - Guía completa para administradores
- `CHANGELOG_USER_MANAGEMENT.md` - Este archivo

---

## Roadmap Futuro

### Fase 2 (v2.2)
- [ ] Desactivar usuario sin eliminar (soft delete)
- [ ] Auditoría de cambios (quién cambió qué y cuándo)
- [ ] Bulk operations (editar múltiples usuarios)
- [ ] MFA enforcement para SuperAdmin

### Fase 3 (v2.3)
- [ ] Self-service password reset
- [ ] Email verification para nuevos emails
- [ ] Password history (no reutilizar últimas N)
- [ ] Expiración de contraseña configurable
