# Sorteos Auditoria Publica

Este repositorio publica solamente material verificable por terceros.

Contenido esperado:

- `scripts/` con verificadores públicos
- `auditor/` con una interfaz HTML descargable para comprobaciones manuales
- `sorteos_log/YYYY/MM/DD/` con resultados auditables del día
- `ticket_keys/YYYY/MM/DD/public_keys.json` con claves públicas para verificar recibos históricos

No se publican:

- llaves privadas
- secretos
- `.env`
- archivos de `~/.ssh`

Uso típico:

- Verificar resultado: `node scripts/verificar_resultado.js <ruta-carpeta-sorteo>`
- Verificar recibo: `node scripts/verificar_recibo_ticket_publico.js <recibo.json> <public_keys.json>`
- Auditor manual: abrir `auditor/index.html` y cargar los archivos publicados del sorteo

## Auditor HTML

Ruta:

- `auditor/index.html`

Objetivo:

- permitir una auditoría manual simple desde el navegador
- comprobar hashes publicados sin depender de herramientas externas
- mostrar de forma legible el número ganador cuando se carga `resultado.json`

Dos modos de uso:

1. Carga manual de archivos

- `pre_compromiso.json`
- `tickets_commit.json`
- `tickets_draw.json`
- `tickets_draw.json.sha256`
- `resultado.json` (opcional pero recomendado)

2. Carga desde publicación

- seleccionar fecha
- seleccionar hora
- seleccionar sorteo
- pulsar `Cargar datos publicados`

Validaciones que realiza:

- consistencia de `draw_id`
- hash de participantes del precompromiso
- SHA-256 de `tickets_draw.json`
- consistencia de `ticket_set_hash`
- conteo de tickets
- si existe `resultado.json`: comprobación de hash de semilla final y relación índice ganador / número ganador

Resumen legible:

- al cargar `resultado.json`, el HTML muestra un resumen tipo:
	- para el día `DD/MM/AAAA`, en el sorteo y hora indicados, usando los datos publicados de auditoría, el número ganador verificado es `NN`