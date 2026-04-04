# Agent Capabilities & Project Overview

Este documento describe las capacidades de los agentes de IA (Antigravity) que colaboran en este proyecto, así como una visión funcional de la herramienta.

## 🎯 Visión del Proyecto (GTFS Generator)

El **GTFS Generator** es una herramienta integral para planificadores de transporte que permite digitalizar redes de transporte público desde cero o editar redes existentes de forma visual y geoespacial. Su objetivo es democratizar la creación de datos de calidad GTFS para cualquier ciudad del mundo, permitiendo agilidad en la planificación y diseño de rutas.

### 🛠️ Capacidades Principales (Core Capabilities)

- 🚀 **Digitalización Ágil:** Creación de paradas/nodos y trazado de segmentos siguiendo la red vial real.
- 🛣️ **Enrutamiento Inteligente (OSRM):** Cálculo automático de distancias y tiempos de viaje basados en la infraestructura vial de OpenStreetMap.
- 📊 **Gestión de Horarios:** Edición de calendarios, servicios y trips con detección de conflictos y auto-cálculo de frecuencias.
- 🗺️ **Multilocación:** Soporte para múltiples ciudades con mapas y motores de enrutamiento independientes por proyecto.

---

## 🤖 Agentes de IA: Perfiles y Capacidades

Nuestros agentes están entrenados para actuar en varios niveles dentro del ecosistema del proyecto. Al interactuar con nosotros, puedes esperar el siguiente soporte:

### 1. Desarrollador Full-Stack (Frontend & Backend)

- **React/TSX:** Creación de componentes modernos usando @tailwindcss/vite, MapLibre GL y React Map GL.
- **Fastify/Node.js:** Construcción de APIs escalables, manejo de streams para grandes volúmenes de datos e integración con SQLite.
- **Arquitectura:** Implementación de patrones de diseño, middleware de autenticación (Keycloak) y gestión de estado.

### 2. Ingeniero de Infraestructura & DevOps

- **Docker Expert:** Gestión de contenedores para la App, Postgres, Keycloak y Motores de OSRM (múltiples ciudades/perfiles).
- **Análisis de Sistemas:** Diagnóstico de problemas de conectividad, red y despliegue local/nube.
- **Automatización:** Creación de scripts de setup para simplificar procesos complejos de procesamiento de mapas.

### 3. Consultor Funcional de Transporte (QA & Dominio)

- **Lógica GTFS:** Entendimiento profundo de la especificación General Transit Feed Specification (Stops, Routes, Trips, Shapes, Stop Times).
- **Análisis de Enrutamiento:** Revisión de perfiles de rutas (Bus Mixed, Trunk, Exclusive) y validación de geometrías operativas.
- **QA Sensible al Negocio:** Verificación de que las herramientas sean útiles para el usuario final (planificador de transporte), evitando trazos de líneas rectas y asegurando coherencia operativa.

### 4. Equipo de Revisión por PR (Orquestado por PM)

Para control de calidad continuo, el proyecto adopta un esquema de 6 agentes especializados ejecutados en cada PR:

- **PM Orchestrator:** Activa revisión paralela, consolida backlog único, resuelve conflictos entre agentes y controla gate de cierre.
- **Architect Agent:** Evalúa arquitectura, seguridad, deuda estructural, escalabilidad y límites entre capas.
- **QA Agent:** Detecta regresiones, brechas de cobertura y criterios de aceptación no verificables.
- **Map Dev Controller Agent:** Controla calidad de geometrías, consistencia GTFS/OSRM y coherencia operacional de red.
- **PO Transporte Agent:** Valida alineación funcional con operación urbana/interurbana de transporte público de pasajeros.
- **UX Agent:** Evalúa fricción, claridad de flujos y consistencia de experiencia para planificadores.

El contrato único de hallazgos por PR está en `ops/review/templates/findings.schema.json` y el flujo operativo en `ops/review/README.md`.

---

## 📝 Registro de Evolución Funcional

En esta sección los agentes registramos las nuevas capacidades que se van añadiendo al núcleo de la aplicación:

- ✅ **[2024-03-06] Soporte Multicity OSRM:** Mejora del sistema de gestión de mapas para permitir el inicio de enrutamiento independiente por proyecto (Bogotá, Curitiba, etc.) usando puertos dinámicos.
- ✅ **[2024-03-05] Integración Keycloak Superadmin:** Despliegue de un sistema basado en roles y permisos que permite segmentar proyectos por usuarios y asignar recursos específicos.
- ✅ **[En Progreso] Editor de Horarios Multitrip:** Mejora en la interfaz de usuario para permitir la edición masiva de viajes y el recálculo automático de tiempos muertos (deadheads).
- ✅ **[En Progreso] Overview & Contextualización:** Creación de guías de usuario integradas para facilitar el onboarding de nuevos planificadores.
- ✅ **[2026-04-03] Gobernanza Multiagente por PR:** Implementación del marco operativo con 6 agentes, contrato estandarizado de hallazgos, consolidación PM y gate de cierre por severidad P0/P1.
