# Sorteos Auditoria Publica

Repositorio público de evidencia verificable de sorteos.

Estado actual: desarrollo/pruebas. Cada proceso y artefacto se valida de forma exhaustiva para preparación de auditorías formales.

## Contenido

- `sorteos_log/YYYY/MM/DD/HH/<sorteo>/` con evidencia del sorteo:
	- `pre_compromiso.json`
	- `tickets_commit.json`
	- `tickets_draw.json`
	- `tickets_draw.json.sha256`
	- `resultado.json`
	- `verificar.js`
	- archivos de integridad (`virustotal_analysis.json`, `virustotal_scan.json` cuando aplique)
- `ticket_keys/YYYY/MM/DD/public_keys.json` para validar recibos firmados
- `scripts/verificar_resultado.js` y `scripts/verificar_recibo_ticket_publico.js`
- `auditor/index.html` para verificación manual

## Verificación

- Resultado: `node scripts/verificar_resultado.js <ruta-carpeta-sorteo>`
- Recibo: `node scripts/verificar_recibo_ticket_publico.js <recibo.json> <public_keys.json>`
- Auditor manual: abrir `auditor/index.html` y cargar archivos del sorteo

## Política pública

- Este repositorio conserva únicamente datos necesarios para verificación independiente del sorteo.