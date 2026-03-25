# Test Plan: Sistema de Gestión de Usuarios

## Precondiciones

- ✅ Aplicación corriendo (`npm start`)
- ✅ Autenticado como **SuperAdmin** (usuario 'admin')
- ✅ Al menos 2 usuarios creados en el sistema
- ✅ Al menos 1 proyecto creado

---

## Test Cases

### TC-001: Editar Email de Usuario

**Objetivo**: Verificar que TenantAdmin puede cambiar email

**Steps**:
1. En Centro de Control → Tab "Usuarios"
2. Ubicar un usuario en la tabla
3. Click en ✏️ (Pencil icon)
4. Modal "Editar Usuario" aparece
5. Cambiar email a: `nuevo_email@test.com`
6. Dejar contraseña vacía
7. Click "Guardar Cambios"
8. Alert "Usuario actualizado correctamente"
9. Cerrar modal
10. Verificar email actualizado en tabla

**Expected**:
- ✅ Modal abre correctamente
- ✅ Email se actualiza en tabla
- ✅ Cambio refleja en Keycloak
- ✅ Sin error 403 (TenantAdmin puede)

**Failures**:
- ❌ Modal no abre
- ❌ Email no se actualiza
- ❌ Error 403 (permiso denegado)
- ❌ "Email ya en uso" (email duplicado)

---

### TC-002: Cambiar Contraseña de Usuario

**Objetivo**: Verificar que se puede cambiar contraseña con validaciones

**Steps**:
1. En Centro de Control → Tab "Usuarios"
2. Click en ✏️ (Pencil) de un usuario
3. Dejar email igual (sin cambios)
4. En campo "Nueva Contraseña" escribir: `Nueva123`
5. Observar:
   - Indicador visual pasa a ✓ (verde)
   - Texto dice "Contraseña válida"
6. Click "Guardar Cambios"
7. Alert "Usuario actualizado correctamente"

**Expected**:
- ✅ Validación en tiempo real funciona
- ✅ Indicador ✓ aparece cuando >= 8 chars
- ✅ Contraseña se actualiza en Keycloak
- ✅ Usuario puede login con nueva contraseña

**Failures**:
- ❌ Indicador no cambia
- ❌ Contraseña rechazada sin razón
- ❌ Error "La contraseña debe tener al menos 8 caracteres"

---

### TC-003: Validación de Contraseña Corta

**Objetivo**: Verificar rechazo de contraseña insuficiente

**Steps**:
1. Click en ✏️ de un usuario
2. En "Nueva Contraseña" escribir: `corta`
3. Observar:
   - Indicador muestra ✗ (rojo)
   - Texto dice "Mínimo 8 caracteres requeridos"
4. Click en "Guardar Cambios"
5. Alert "La contraseña debe tener al menos 8 caracteres"
6. Modal permanece abierto

**Expected**:
- ✅ Validación rechaza contraseña corta
- ✅ Indicador visual muestra ✗
- ✅ Botón guardar deshabilitado (opcionalmente)
- ✅ Error descriptivo en alert

**Failures**:
- ❌ Contraseña corta es aceptada
- ❌ Indicador no se actualiza
- ❌ Modal se cierra sin guardar cambios

---

### TC-004: Validación de Email Inválido

**Objetivo**: Verificar rechazo de email malformado

**Steps**:
1. Click en ✏️ de un usuario
2. Cambiar email a: `email_sin_dominio`
3. Click "Guardar Cambios"
4. Alert "Email inválido"
5. Modal permanece abierto

**Expected**:
- ✅ Email inválido es rechazado en frontend
- ✅ Request no se envía a backend
- ✅ Modal permanece abierto para corrección

**Failures**:
- ❌ Email inválido es aceptado
- ❌ Request se envía al backend
- ❌ Modal se cierra

---

### TC-005: Detectar Email Duplicado

**Objetivo**: Verificar que no se puede asignar email ya usado

**Prerequisito**:
- Usuario A tiene email: `existing@test.com`
- Usuario B existe pero con diferente email

**Steps**:
1. Click en ✏️ de Usuario B
2. Cambiar email a: `existing@test.com` (del Usuario A)
3. Click "Guardar Cambios"
4. Error alert "Este email ya está en uso"
5. Modal permanece abierto

**Expected**:
- ✅ Duplicado detectado por backend
- ✅ Error 409 retornado
- ✅ Mensaje claro al usuario
- ✅ Cambios se reviertan

**Failures**:
- ❌ Email duplicado permitido
- ❌ Usuarios con mismo email
- ❌ Sin mensaje de error

---

### TC-006: Eliminar Usuario (SuperAdmin Only)

**Objetivo**: Verificar que solo SuperAdmin puede eliminar

**Setup**:
- Logueado como SuperAdmin (usuario 'admin')

**Steps**:
1. En Centro de Control → Tab "Usuarios"
2. Verificar que botón 🗑️ (Trash) es visible
3. Click en 🗑️ de un usuario (no 'admin')
4. Modal confirmación aparece:
   - Título: "Dar de Baja Usuario"
   - Mensaje: "¿Eliminar a username?"
5. Click "Confirmar" (botón rojo)
6. Usuario desaparece de tabla
7. Verificar usuario no puede hacer login

**Expected**:
- ✅ Botón delete visible para SuperAdmin
- ✅ Modal de confirmación obligatorio
- ✅ Usuario eliminado de tabla
- ✅ Usuario no existe en Keycloak
- ✅ Usuario no tiene acceso a proyectos

**Failures**:
- ❌ Botón no visible
- ❌ Modal no aparece
- ❌ Usuario no se elimina

---

### TC-007: TenantAdmin No Puede Eliminar

**Objetivo**: Verificar restricción de permisos

**Setup**:
- Logueado como TenantAdmin (admin de 1+ proyecto)
- NO es SuperAdmin

**Steps**:
1. En Centro de Control → Tab "Usuarios"
2. Observar tabla de usuarios
3. Verificar que botón 🗑️ (Trash) **NO es visible**
4. Solo botón ✏️ (Edit) está presente
5. Si intentas acceso directo API:
   - DELETE /api/admin/users/[id]
   - Error 403: "Solo SuperAdmin puede eliminar usuarios"

**Expected**:
- ✅ Botón delete no visible
- ✅ Edit button visible
- ✅ API rechaza con 403
- ✅ Seguridad por niveles funcionando

**Failures**:
- ❌ Botón delete visible para TenantAdmin
- ❌ API permite DELETE
- ❌ Usuario logra eliminar

---

### TC-008: Remover de Proyecto vs Eliminar

**Objetivo**: Demostrar diferencia entre operaciones

**Setup**:
- Usuario asignado a 2 proyectos

**Steps A - Remover de Proyecto** (conserva cuenta):
1. En tabla, ubicar badge de proyecto
2. Hover sobre badge
3. Click en ✕ (X icon)
4. Confirmación rápida
5. Badge desaparece
6. Usuario aún en tabla
7. Usuario aún existe en sistema

**Steps B - Eliminar Usuario** (destruye cuenta):
1. Click en 🗑️ (Trash)
2. Modal confirmación
3. Click "Confirmar"
4. Usuario desaparece de tabla completamente
5. Usuario no existe en Keycloak
6. Usuario no puede hacer login

**Expected**:
- ✅ Remover de proyecto = reversible
- ✅ Eliminar usuario = irreversible
- ✅ Cuenta permanece en auditoría

**Use Case**:
- Empleado se cambia de equipo → Remover de proyecto
- Empleado se va de la empresa → Eliminar usuario

---

### TC-009: Sincronizar con Keycloak

**Objetivo**: Verificar sincronización manual

**Setup**:
- Usuarios creados externamente en Keycloak
- BD local desincronizada

**Steps**:
1. En Centro de Control → Tab "Usuarios"
2. Click botón "Sincronizar Auth" (esquina superior derecha)
3. Botón muestra spinner animado
4. Alert: "Se han sincronizado N usuarios desde Keycloak"
5. Nuevos usuarios aparecen en tabla

**Expected**:
- ✅ Sincronización funciona
- ✅ Nuevos usuarios aparecen
- ✅ Campos actualizados (email, username)
- ✅ No hay duplicados

**Failures**:
- ❌ Botón no funciona
- ❌ Usuarios no aparecen
- ❌ Duplicados en tabla

---

### TC-010: Error Handling - Keycloak Down

**Objetivo**: Verificar comportamiento cuando Keycloak falla

**Setup**:
- Detener Keycloak (docker compose down)

**Steps**:
1. Intentar editar usuario
2. Click "Guardar Cambios"
3. Sistema intenta conectar a Keycloak
4. Error: "Error al actualizar usuario"
5. Modal permanece abierto
6. BD local **NO** se modifica (transacción rollback)

**Expected**:
- ✅ Error manejado gracefully
- ✅ Sin corrupta datos
- ✅ Mensaje descriptivo
- ✅ Modal permanece para reintentar

**Failures**:
- ❌ Crash de aplicación
- ❌ BD corrupta
- ❌ Sin mensaje de error

---

## Smoke Tests (Rápidos)

### S-001: Crear y Editar
```
1. Crear nuevo usuario: "test_user"
2. Editar: cambiar email a "test@new.com"
3. Verificar en tabla
4. ✅ PASS
```

### S-002: Permisos
```
1. TenantAdmin intenta eliminar usuario
2. Botón no visible
3. ✅ PASS
```

### S-003: Validaciones
```
1. Escribir password de 7 caracteres
2. Indicador muestra ✗
3. ✅ PASS
```

---

## Test Results Template

```markdown
# Test Execution: [FECHA]

| TC | Nombre | Resultado | Notas |
|----|--------|-----------|-------|
| 001 | Editar Email | ✅ PASS / ❌ FAIL | |
| 002 | Cambiar Contraseña | ✅ PASS / ❌ FAIL | |
| 003 | Validación Corta | ✅ PASS / ❌ FAIL | |
| 004 | Email Inválido | ✅ PASS / ❌ FAIL | |
| 005 | Duplicado | ✅ PASS / ❌ FAIL | |
| 006 | Eliminar (SuperAdmin) | ✅ PASS / ❌ FAIL | |
| 007 | TenantAdmin No Elimina | ✅ PASS / ❌ FAIL | |
| 008 | Remover vs Eliminar | ✅ PASS / ❌ FAIL | |
| 009 | Sincronizar | ✅ PASS / ❌ FAIL | |
| 010 | Keycloak Down | ✅ PASS / ❌ FAIL | |

**Ejecutor**: [Nombre]
**Fecha**: [YYYY-MM-DD]
**Versión**: [v2.1.0]
**Ambiente**: [Dev/Staging/Prod]

**Críticos Fallidos**: [0]
**Mayores Fallidos**: [0]
**Menores Fallidos**: [0]

**Recomendación**: ✅ READY FOR PRODUCTION
```
