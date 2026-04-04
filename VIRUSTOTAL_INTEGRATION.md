# 🛡️ Análisis de Integridad con VirusTotal

Validación criptográfica de archivos mediante VirusTotal API v3 para garantizar que los archivos de auditoría pública no contienen código malicioso.

---

## 📋 ¿Qué se verifica?

### Archivos Locales (Post-Sorteo)
Inmediatamente después de generar cada resultado:
- ✅ `resultado.json` - Resultado oficial del sorteo
- ✅ `pre_compromiso.json` - Compromiso previo criptográfico  
- ✅ `tickets_snapshot.json` - Snapshot de participantes

### URLs Públicas (Pre-Publicación)
Antes de subir a GitHub, se escanean:
- ✅ Archivos JSON en `sorteos-auditoria-publica`
- ✅ Scripts de verificación (`verificar_resultado.js`)
- ✅ HTML de auditoría (`auditor/index.html`)

### Información Capturada

```json
{
  "archivo": "resultado.json",
  "hash": "a83f9c1e2d4b7f9c8e1a2b3c4d5e6f...",
  "tamaño": 2048,
  "virustotal": {
    "estado": "analizado",
    "resultados": {
      "malicioso": 0,
      "sospechoso": 0,
      "limpio": 72
    },
    "link_vt": "https://www.virustotal.com/gui/file/..."
  }
}
```

---

## 🔧 Configuración

### Opción 1: API Pública de VirusTotal (Recomendado inicialmente)

No requiere configuración especial. Funciona sin API key para análisis de hashes (file lookup).

**Limitaciones**:
- Análisis de hashes: ilimitado
- Escaneo de URLs: 4 por minuto
- Sin acceso a resultados detallados en tiempo real

### Opción 2: API Premium de VirusTotal (Producción)

Para análisis más robustos:

```bash
# 1. Obtener clave en: https://www.virustotal.com/gui/home/upload

# 2. Agregar a .env
echo "VIRUSTOTAL_API_KEY=tu_api_key_aqui" >> .env

# 3. Verificar que funciona
node audit/virustotal_analyzer.js analyze-local ./sorteos_log/2026/04/03/09/el-chancho-de-bronce
```

---

## 📖 Uso

### Comando 1: Analizar Sorteo Local

Después de que se genera un resultado:

```bash
node audit/virustotal_analyzer.js analyze-local [carpeta-sorteo]

# Ejemplo:
node audit/virustotal_analyzer.js analyze-local ./sorteos_log/2026/04/03/09/el-chancho-de-bronce
```

**Salida esperada:**
```
✓ Reporte VirusTotal guardado en: ./sorteos_log/2026/04/03/09/el-chancho-de-bronce/virustotal_analysis.json
{
  "carpeta": "./sorteos_log/2026/04/03/09/el-chancho-de-bronce",
  "fecha_analisis": "2026-04-04T12:34:56.789Z",
  "archivos": [
    {
      "archivo": "resultado.json",
      "hash": "a83f9c1e...",
      "virustotal": {
        "estado": "analizado",
        "resultados": {
          "malicioso": 0
        },
        "link_vt": "https://www.virustotal.com/gui/file/..."
      }
    }
  ]
}
```

### Comando 2: Escanear URLs de GitHub

Después de publicar en auditoría pública:

```bash
node audit/virustotal_analyzer.js scan-github [FECHA] [HORA] [SLUG]

# Ejemplo:
node audit/virustotal_analyzer.js scan-github 2026-04-03 09 el-chancho-de-bronce
```

**Salida:**
```json
{
  "fecha_escaneo": "2026-04-04T12:34:56.789Z",
  "sorteo": "el-chancho-de-bronce:2026-04-03:09",
  "urls_analizadas": [
    {
      "url": "https://raw.githubusercontent.com/elchanchoganador/sorteos-auditoria-publica/main/sorteos_log/2026/04/03/09/el-chancho-de-bronce/resultado.json",
      "estado": "analizado",
      "link_vt": "https://www.virustotal.com/gui/url/..."
    }
  ]
}
```

### Comando 3: Generar Reporte Completo

```bash
node audit/virustotal_analyzer.js generate-report [carpeta]
```

---

## 🔄 Integración Automática

Los análisis se ejecutan **automáticamente**:

### 1️⃣ Post-Sorteo (procesar.js)

Inmediatamente después de cada resultado:
```javascript
// Automático en procesar.js, línea ~180
await generarReporte(carpetaSorteo);
```

**Genera**: `virustotal_analysis.json` en la carpeta del sorteo

### 2️⃣ Pre-Publicación (publicar_auditoria_publica.js)

Antes de hacer push a GitHub:
```bash
npm run publish-auditoria  # O:
node scripts/publicar_auditoria_publica.js [repo] [fecha]
```

**Genera**: `virustotal_scan.json` en auditoría pública

---

## 📊 Interpretación de Resultados

### Estados

| Estado | Significado | Acción |
|---|---|---|
| `analizado` | Hash encontrado en VirusTotal | ✓ Se conoce el archivo |
| `no_encontrado` | Hash nuevo o privado | ℹ️ Probablemente archivo nuevo |
| `pendiente_analisis` | URL encolada en VirusTotal | ⏳ Vuelve a verificar en 5 min |
| `error` | Problema de conexión | ⚠️ Reintentar |
| `skipped` | API key no configurada | ℹ️ Modo básico |

### Resultados de Detección

```json
"resultados": {
  "malicioso": 0,      // Detectores que lo marcan como malware
  "sospechoso": 0,     // Detectores que lo marcan como PUA/PUP
  "limpio": 72         // Detectores que lo consideran limpio
}
```

**Interpretación:**
- `malicioso === 0` → ✓ Muy buena señal
- `sospechoso > 0` → ⚠️ Revisar manualmente
- `limpio > 50` → ✓ Confiable

---

## 🔍 Casos de Uso

### Caso 1: Auditoría Independiente
```bash
# Auditor descarga repo público
git clone https://github.com/elchanchoganador/sorteos-auditoria-publica.git

# Verifica hashes localmente
node audit/virustotal_analyzer.js analyze-local \
  ./sorteos_log/2026/04/03/09/el-chancho-de-bronce

# Compara con reportes publicados
cat sorteos_log/2026/04/03/09/el-chancho-de-bronce/virustotal_analysis.json
```

### Caso 2: Verificación Continua
```bash
# En CI/CD, ejecutar antes de cada merge a main
npm run test-integrity

# O manualmente:
for fecha in 01 02 03 04; do
  node scripts/publicar_auditoria_publica.js "" "2026-04-${fecha}"
done
```

### Caso 3: Reporte Público
```bash
# Generar reporte mensual
node audit/virustotal_analyzer.js scan-github 2026-04-01 08 el-chancho-de-bronce > \
  monthly_audit_report.json

# Publicar en web/newsletter
```

---

## 🛠️ Troubleshooting

### "VIRUSTOTAL_API_KEY no configurado"
**Solución**: La API es opcional. Sin ella funciona con análisis de hashes.
```bash
# Si quieres premium:
echo "VIRUSTOTAL_API_KEY=abc123xyz..." >> .env
source .env
node audit/virustotal_analyzer.js ...
```

### "Hash no existe en VirusTotal"
**Causa**: Archivo nuevo/privado. Es normal.
**Solución**: No bloquea nada, solo significa que VirusTotal no lo ha visto antes.

### Timeout de conexión
**Causa**: VirusTotal está lento o red está saturada.
**Solución**: Reintentar después de 1-2 minutos.

### URLs "pendiente_analisis"
**Causa**: VirusTotal necesita tiempo para analizar URLs nuevas.
**Solución**: Verificar nuevamente en 5-10 minutos.

---

## 📝 Archivos Generados

### Análisis Local (Post-Sorteo)
```
sorteos_log/2026/04/03/09/el-chancho-de-bronce/
├── resultado.json
├── pre_compromiso.json
└── virustotal_analysis.json      ← NUEVO
```

### Análisis GitHub (Pre-Publicación)
```
sorteos-auditoria-publica/sorteos_log/2026/04/03/09/el-chancho-de-bronce/
├── resultado.json
├── pre_compromiso.json
└── virustotal_scan.json          ← NUEVO
```

---

## 🔐 Seguridad

### ¿Qué información se envía a VirusTotal?

**Análisis de Hashes:**
- SHA-256 del archivo (130 caracteres)
- Nada de contenido sensible

**Escaneo de URLs:**
- URL pública a GitHub
- Nada privado

### ¿Es privado?

- Público: Cualquiera puede ver tu envío en VirusTotal
- Recomendación: No uses para archivos super privados
- Para sorteos: Sin problema, todo es público de todas formas

### Link Público
Después del análisis, podrás compartir:
```
https://www.virustotal.com/gui/file/{SHA256_HASH}
```

Terceros pueden verificar el mismo archivo sin instalar software.

---

## 📚 Referencias

- [VirusTotal API v3 docs](https://developers.virustotal.com/reference/overview)
- [File Hash Lookup](https://developers.virustotal.com/reference/file-object)
- [URL Scanning](https://developers.virustotal.com/reference/scan-url)
- [VirusTotal Community](https://www.virustotal.com/gui/home)

---

**Última actualización**: 4 de abril de 2026  
**Versión**: 1.1.0  
**Protocolo**: v3.1.0
