# AGENTS / instrucciones para agentes en gtfs_generator

Este archivo condensa el marco funcional que deben seguir los agentes al trabajar sobre el generador de GTFS y el mapa de rutas.

## Propósito general
- El objetivo es construir rutas de bus realistas combinando red vial mixta y exclusiva.
- El sistema se debe comportar como herramienta de planificación del transporte, no como navegador de automóvil.
- Cada sugerencia, cambio o prueba debe respetar la semántica operativa de los buses.

## Prioridades funcionales
1. Permitir seleccionar perfiles de enrutamiento antes y durante el trazo.
2. Usar perfiles diferenciados para vía mixta, vía exclusiva y combinaciones mixtas/exclusivas.
3. Reconocer conectores válidos entre redes y respetar permisos/giros/restricciones específicas de buses.
4. Garantizar continuidad geométrica y reproducibilidad: mismo perfil + mismas paradas => mismo resultado.
5. Ofrecer edición manual del trazado y visualización del tipo de infraestructura en cada tramo.

## Reglas operativas clave
- Nunca asumir que el camino más corto para un automóvil es válido; evalúa según el perfil de bus.
- Un perfil que no tenga permiso para vía exclusiva debe evitarla; un perfil troncal debe privilegiarla.
- Las vías mixtas pueden usarse siempre que no haya restricción específica para buses.
- Las transiciones mix/exclusivo deben pasar por conectores autorizados o modelados explícitamente.
- El motor debe distinguir restricciones diferenciales (giros, sentidos, accesos) admitiendo excepciones para buses cuando existan.

## Flujo esperado durante el desarrollo/respuesta
1. Identifica el perfil de servicio: mixta, mixta+exclusiva o exclusivamente troncal.
2. Asegura que los datos de la red (calles, corredores, conectores, restricciones) están bien etiquetados y se usan según el perfil.
3. Valida que la ruta resultante use la infraestructura adecuada y sea editable visualmente.
4. Si algo no se puede modelar automáticamente, deja claro qué falta (por ejemplo, conectores no mapeados).

## Criterios de calidad y validaciones
- El enrutamiento debe usar infraestructura correcta para cada perfil y evitar desvíos ilógicos.
- Las rutas deben distinguir visualmente por tipo de vía para apoyar la revisión operativa.
- El comportamiento debe responder de forma consistente ante entradas iguales.
- Documenta cualquier suposición operativa o restricción especial que afecte el resultado.

Si necesitas más contexto, consulta la especificación funcional oficial antes de proponer cambios.
