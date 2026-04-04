# Piloto de Validación (3 PR)

Objetivo: validar que el proceso multiagente es consistente, deduplica correctamente y deja trazabilidad completa.

## PR Piloto 1 (Auth/Usuarios)

- Esperado: hallazgos `security` y `stability`.
- Validar gate de cierre con `P0/P1`.

## PR Piloto 2 (Mapas/OSRM)

- Esperado: hallazgos `transport` y `stability`.
- Confirmar elevación de riesgo operacional GTFS al mismo nivel de criticidad técnica.

## PR Piloto 3 (UX/Flujos)

- Esperado: hallazgos `ux` y compatibilidad funcional.
- Validar resolución de conflicto UX vs operación con decisión PM+PO.

## Criterios de aprobación del piloto

- Cada agente produce JSON válido según schema.
- PM genera backlog único sin duplicados.
- Cada ítem tiene dueño sugerido y criterio de aceptación verificable.
- Trazabilidad completa: hallazgo -> acción -> verificación -> estado.
