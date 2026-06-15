# Sorteos — auditoría pública

Herramientas abiertas de **EL CHANCHO GANADOR, C.A.** para verificar sorteos de [*La Gran Carrera*](https://elchanchoganador.com).

Este repositorio **no guarda resultados ni datos de jugadores**. Publica el software y la documentación para que cualquier persona compruebe, de forma independiente, que un sorteo fue calculado correctamente a partir de evidencia que el operador entrega por otro canal (JSON, ZIP o enlace en el resultado oficial).

**RIF:** J-506703866

---

## ¿Qué hace el sistema?

1. **Antes del sorteo** se publica un *pre-compromiso*: huella SHA-256 del conjunto de boletos y la ronda de aleatoriedad pública (**drand**) que se usará.
2. **En la hora del sorteo** se obtiene el valor de drand y se calcula el número ganador (00–14) de forma **determinista** — nadie lo elige a mano.
3. **Un notario público** revisa coherencia entre archivos y resultado antes de aprobar la publicación oficial.
4. **Cualquier auditor** puede repetir el cálculo con los archivos del sorteo y las herramientas de este repositorio.

No hace falta confiar en la empresa: basta reproducir las comprobaciones matemáticas.

---

## Contenido de este repositorio

| Archivo / carpeta | Función |
|-------------------|---------|
| [`auditor/index.html`](auditor/index.html) | Verificador web: carga archivos JSON del sorteo desde tu disco o URL de evidencia |
| [`index.html`](index.html) | Portal de entrada |
| [`scripts/verificar_resultado.js`](scripts/verificar_resultado.js) | Verificación criptográfica completa por terminal (Node.js 18+) |
| [`scripts/verificar_recibo_ticket_publico.js`](scripts/verificar_recibo_ticket_publico.js) | Valida recibos de tickets firmados |
| [`SOLICITUD_CONALOT_DOSSIER.html`](SOLICITUD_CONALOT_DOSSIER.html) | Dossier técnico-administrativo para CONALOT |
| [`VIRUSTOTAL_INTEGRATION.html`](VIRUSTOTAL_INTEGRATION.html) | Cómo interpretar reportes VirusTotal en la evidencia de un sorteo |

---

## Uso rápido

### Verificador web

1. Obtén la carpeta del sorteo (`pre_compromiso.json`, `tickets_commit.json`, `tickets_draw.json`, `resultado.json`, etc.).
2. Abre [`auditor/index.html`](auditor/index.html) en el navegador.
3. **Verificación manual** → carga los archivos → revisa que todas las comprobaciones pasen.

Si la evidencia está en un repositorio o URL pública:

`auditor/index.html?evidencia=https://raw.githubusercontent.com/ORG/REPO-EVIDENCIA/main`

### Terminal

```bash
git clone https://github.com/elchanchoganador/sorteos-auditoria-publica.git
cd sorteos-auditoria-publica

node scripts/verificar_resultado.js /ruta/a/carpeta-del-sorteo
node scripts/verificar_recibo_ticket_publico.js recibo.json public_keys.json
```

### Verificar tu ticket

[verificatuticket.com](https://verificatuticket.com)

---

## Archivos de evidencia (no incluidos aquí)

Cada sorteo debe aportar al menos:

```
carpeta-del-sorteo/
  pre_compromiso.json
  tickets_commit.json
  tickets_draw.json
  tickets_draw.json.sha256
  resultado.json
```

Opcional: `virustotal_scan.json` — ver [VIRUSTOTAL_INTEGRATION.html](VIRUSTOTAL_INTEGRATION.html).

---

## Canales oficiales

| Canal | URL |
|-------|-----|
| Web | https://elchanchoganador.com |
| Verificar ticket | https://verificatuticket.com |
| Panel operativo | https://sistema.elchanchoganador.com |

---

## Licencia

Ver [LICENSE](LICENSE).
