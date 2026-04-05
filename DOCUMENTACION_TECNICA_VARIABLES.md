# Glosario Tecnico de Variables Internas

Este documento separa la terminologia tecnica interna de la interfaz publica.

## Equivalencias recomendadas para interfaz

- `draw_id` -> Codigo tecnico del sorteo
- `ticket_set_hash` -> Huella/compromiso del conjunto de boletos
- `hash_sha256` -> Huella digital SHA-256
- `pre_compromiso.json` -> Archivo de precompromiso
- `tickets_commit.json` -> Archivo de compromiso de boletos
- `tickets_draw.json` -> Archivo de boletos del sorteo
- `tickets_draw.json.sha256` -> Huella digital del archivo de boletos
- `resultado.json` -> Archivo de resultado final
- `slug` -> Identificador interno del sorteo

## Notas

- En la interfaz publica se prioriza lenguaje claro en espanol.
- Los nombres tecnicos se mantienen solo para trazabilidad tecnica y validacion reproducible.
- Para auditorias avanzadas se pueden consultar los scripts publicos de verificacion en `scripts/`.
