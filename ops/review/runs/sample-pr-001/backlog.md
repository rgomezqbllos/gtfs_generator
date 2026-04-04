# Backlog Consolidado PR sample-pr-001

Generado: 2026-04-04T04:57:22.152Z

| ID | Severidad | Dominio | Agentes | Impacto | Riesgo | Dueño sugerido | Criterio de aceptación |
|---|---|---|---|---|---|---|---|
| sample-pr-001-01 | P1 | security | architect | El control de permisos puede ser inconsistente en actualización de usuarios. | Posible escalada de privilegios en administración multi-tenant. | backend | Usuarios sin permisos válidos reciben 403 y no se persiste ningún cambio. |
| sample-pr-001-02 | P1 | security | qa | No hay evidencia de prueba negativa para actualización de usuarios sin permisos. | Regresión de seguridad no detectada antes de despliegue. | qa-backend | Suite falla si un usuario sin permisos actualiza datos de terceros. |
| sample-pr-001-03 | P2 | transport | map-dev-controller | Cambios de auth podrían bloquear edición de segmentos para usuarios válidos en proyectos asignados. | Interrupción operativa en digitalización de red de transporte. | backend-maps | Usuarios operadores autorizados mantienen acceso normal a edición de red en su proyecto. |
| sample-pr-001-04 | P2 | transport | po-transporte | Si falla la asignación correcta de roles, se frena la operación de equipos de planificación. | Retrasos de operación y soporte manual para habilitar equipos. | product-backend | El onboarding de usuario queda completo en una sola operación verificable. |
| sample-pr-001-05 | P2 | ux | ux | Mensajes de error de permisos pueden no guiar al usuario administrador en la resolución. | Aumento de fricción y tickets de soporte por fallas de alta de usuarios. | frontend-ux | Errores de permisos muestran instrucción clara y reducen reintentos fallidos. |

## Evidencia y recomendación por ítem

### sample-pr-001-01 (P1)
- Evidencia: server/src/routes/admin.ts: PUT /admin/users/:id con validación parcial por rol/proyecto.
- Recomendación: Unificar verificación de pertenencia y rol antes de operaciones en Keycloak y DB.
- Estado inicial: OPEN

### sample-pr-001-02 (P1)
- Evidencia: Falta caso API/E2E para PUT /admin/users/:id con tenant admin sin acceso.
- Recomendación: Agregar test automatizado para rechazo 403 en escenarios sin pertenencia.
- Estado inicial: OPEN

### sample-pr-001-03 (P2)
- Evidencia: Dependencia de roles en endpoints de administración con impacto transversal en flujo de mapas.
- Recomendación: Verificar permisos diferenciados entre administración global y operaciones de edición geoespacial.
- Estado inicial: OPEN

### sample-pr-001-04 (P2)
- Evidencia: Flujo de alta de usuarios es prerequisito para asignación a proyectos urbanos e interurbanos.
- Recomendación: Definir criterio operativo de alta: usuario creado + rol correcto + asignación a proyecto en un solo flujo.
- Estado inicial: OPEN

### sample-pr-001-05 (P2)
- Evidencia: Modal actual reporta 403 con texto técnico sin siguiente paso accionable estandarizado.
- Recomendación: Estandarizar mensajes con causa, acción sugerida y referencia de responsable.
- Estado inicial: OPEN

## Gate de cierre

PR bloqueado: 2 hallazgo(s) P0/P1 abiertos.