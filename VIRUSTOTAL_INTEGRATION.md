# Integridad de Archivos (VirusTotal)

Este documento describe únicamente cómo interpretar la evidencia pública de integridad publicada junto a cada sorteo.

## Archivos publicados

En cada carpeta de sorteo pueden aparecer:

- `virustotal_analysis.json`
- `virustotal_scan.json`

Ambos son evidencia adicional de integridad sobre archivos ya públicos del sorteo.

## Qué revisar

Para cada archivo verificado, revisar:

- hash SHA-256 del archivo
- estado del análisis
- conteos de detección (`malicioso`, `sospechoso`, `limpio`)
- enlace público de consulta (`link_vt`)

## Criterio práctico

- `malicioso = 0` y `sospechoso = 0`: sin señales de riesgo en motores reportados.
- Si existe cualquier detección positiva: marcar para revisión manual independiente.

## Alcance

- Estos reportes complementan la verificación criptográfica del sorteo.
- La validez del resultado principal sigue siendo verificable con los archivos de auditoría del draw.
