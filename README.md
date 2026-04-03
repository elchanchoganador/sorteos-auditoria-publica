# Sorteos Auditoria Publica

Este repositorio publica solamente material verificable por terceros.

Contenido esperado:

- `scripts/` con verificadores públicos
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