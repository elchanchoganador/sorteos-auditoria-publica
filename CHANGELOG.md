# Changelog

Este archivo registra cambios relevantes publicados en el repositorio de auditoria publica.

Formato inspirado en Keep a Changelog.

## [Unreleased]

## [v2026.04.04] - 2026-04-04

### Added
- Integracion de analisis de integridad con VirusTotal en `audit/virustotal_analyzer.js`.
- Generacion de `virustotal_analysis.json` por sorteo para evidencia local/publicable.
- Escaneo de URLs publicas y generacion de `virustotal_scan.json` en publicacion de auditoria.
- Guia publica de verificacion paso a paso en `VERIFICAR_RESULTADO_PASO_A_PASO.md`.
- Documentacion operativa de VirusTotal en `VIRUSTOTAL_INTEGRATION.md`.

### Changed
- `scripts/publicar_auditoria_publica.js` ahora realiza segundo commit/push para reportes de VirusTotal.
- `auditor/index.html` validado sin rutas absolutas locales y listo para consumo publico.
- Version de `package.json` actualizada a `1.1.0`.

## [v2026.04.03] - 2026-04-03

### Added
- Publicacion de evidencias diarias de auditoria en `sorteos_log/2026/04/03`.
- Exportacion de claves publicas de firma en `ticket_keys/2026/04/03/public_keys.json`.
- Auditor web en `auditor/index.html` con carga manual y carga por fecha/hora/sorteo.
- Politica formal de invalidacion de draws y publicacion de evidencia por draw.

### Changed
- Documentacion del auditor HTML y del flujo operativo de verificacion publica.
- README actualizado con politica de invalidacion y guia de versionado/releases.

### Fixed
- Registro de invalidacion publica para draws de las 09:00 con motivo `seed_custody_missing`:
  - `el-chancho-de-bronce:20260403:09`
  - `el-chancho-de-plata:20260403:09`
  - `el-chancho-de-oro:20260403:09`
