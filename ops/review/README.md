# Equipo de 6 Agentes - Operación por PR

Este módulo implementa el esquema de revisión orquestado por PM para GTFS Generator:

- `pm-orchestrator`
- `architect`
- `qa`
- `map-dev-controller`
- `po-transporte`
- `ux`

## Objetivo

Ejecutar revisión por cada PR y producir un **backlog único priorizado** con trazabilidad completa:

`hallazgo -> acción -> verificación -> estado`

## Estructura

- `agents/`: prompts y límites de decisión por rol.
- `templates/`: contrato único de hallazgos y plantilla de intake por PR.
- `scripts/consolidate-findings.mjs`: consolidación PM (deduplicación + priorización).
- `runs/`: carpeta sugerida para entradas/salidas de cada revisión.

## Flujo operativo por PR

1. PM crea intake del PR con `templates/pr-intake-template.md`.
2. PM solicita a cada agente entregar JSON con formato `templates/findings.schema.json`.
3. PM consolida:

```bash
node ops/review/scripts/consolidate-findings.mjs \
  --input ops/review/runs/<pr-id>/findings \
  --output ops/review/runs/<pr-id>/backlog.md \
  --pr <pr-id>
```

Atajo con npm:

```bash
npm run review:consolidate -- \
  --input ops/review/runs/<pr-id>/findings \
  --output ops/review/runs/<pr-id>/backlog.md \
  --pr <pr-id>
```

4. PM publica backlog consolidado y bloquea cierre si hay `P0/P1` sin resolución o aceptación explícita.

## Regla de priorización

Orden base de severidad: `P0 > P1 > P2 > P3`.

Empate por prioridad de dominio:

1. seguridad/permisos/datos
2. estabilidad operativa
3. coherencia funcional de transporte y mapas
4. UX crítica
5. optimizaciones

## Contrato obligatorio del hallazgo

Cada hallazgo debe incluir:

- `severity` (`P0..P3`)
- `impact`
- `evidence`
- `risk`
- `recommendation`
- `suggested_owner`
- `acceptance_criteria`

Sin estos campos, el hallazgo se considera inválido para consolidación.
