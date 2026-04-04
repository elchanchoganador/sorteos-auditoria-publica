# 🔐 Cómo Verificar que un Resultado de Sorteo es Real

> **Transparencia Verificable**: Cualquier persona, sin acceso a sistemas privados, puede probar matemáticamente que un resultado de sorteo es legítimo. No hay que confiar en nadie - solo en las matemáticas.

---

## 📋 Tabla de Contenidos
1. [Conceptos clave](#conceptos-clave)
2. [Opción A: Verificación rápida desde GitHub](#opción-a-verificación-rápida-desde-github)
3. [Opción B: Verificación local detallada](#opción-b-verificación-local-detallada)
4. [Opción C: Verificación sin instalar nada](#opción-c-verificación-sin-instalar-nada)
5. [¿Qué se verifica exactamente?](#qué-se-verifica-exactamente)
6. [Ejemplos reales](#ejemplos-reales)

---

## 🎯 Conceptos Clave

### ¿Cómo sabemos que un resultado es real y no fue manipulado?

**El Proceso (Criptografía Verificable):**

```
┌─────────────────────────────────────────────────────────┐
│ ANTES DEL SORTEO (20 minutos antes)                    │
├─────────────────────────────────────────────────────────┤
│ 1. Se registran todos los participantes                │
│ 2. Se calcula: SHA-256 de la lista                    │
│ 3. Se publica: "pre_compromiso.json"                  │
│    (promesa criptográfica del resultado)              │
│ 4. Nadie puede cambiar esto sin que sea evidente      │
└─────────────────────────────────────────────────────────┘
                          ↓
        PASA EL TIEMPO, HORA DEL SORTEO
                          ↓
┌─────────────────────────────────────────────────────────┐
│ EN LA HORA DEL SORTEO (momento exacto)                │
├─────────────────────────────────────────────────────────┤
│ 1. Red drand publica valor aleatorio (público)        │
│ 2. Se combina con hash de participantes (matemática) │
│ 3. Se calcula ganador (determinístico = siempre igual)│
│ 4. Se firma digitalmente el resultado                 │
│ 5. Se publica: "resultado.json"                       │
└─────────────────────────────────────────────────────────┘
```

**¿Por qué es imposible trucar?**
- El pre_compromiso se publica ANTES
- El valor aleatorio viene de una red pública (drand) que no controla nadie
- El cálculo es matemático = reproducible por terceros
- La firma digital es verificable con claves públicas

---

## 📱 Opción A: Verificación Rápida desde GitHub

**Audiencia**: Cualquiera con navegador (no requiere instalar nada).

### Paso 1: Ir al repositorio de auditoría pública

Abre en tu navegador:
```
https://github.com/elchanchoganador/sorteos-auditoria-publica
```

### Paso 2: Buscar el sorteo que deseas verificar

Navega a la carpeta:
```
sorteos_log → 2026 → 04 → 03 → 09 → el-chancho-de-bronce
                    ↓     ↓    ↓
                  mes   día  hora
```

### Paso 3: Revisar los archivos publicados

Encontrarás 2 archivos JSON:

#### `pre_compromiso.json` (publicado ANTES del sorteo)
Muestra el compromiso criptográfico:
```json
{
  "draw_id": "el-chancho-de-bronce:2026-04-03:09",
  "draw_time_utc": "2026-04-03T13:00:00Z",
  "aleatoriedad": {
    "ronda_comprometida": 5776500
  },
  "participantes": {
    "hash_sha256": "a83f9c1e2d4b7f...",
    "cantidad": 147
  }
}
```

**Qué significa**: "Prometo que el ganador será calculado usando ronda 5776500 de drand y estos 147 participantes."

#### `resultado.json` (publicado DESPUÉS del sorteo)
Muestra el resultado completo:
```json
{
  "draw_id": "el-chancho-de-bronce:2026-04-03:09",
  "resultado": {
    "numero_ganador": 25,
    "identificador_ganador": "usuario#1234",
    "indice_ganador": 47
  },
  "verificable": {
    "hash_participantes_calculado": "a83f9c1e2d4b7f...",
    "semilla_calculada": "9b2f8e...",
    "firma_digital": "FIRMA_ED25519_BASE64..."
  }
}
```

**Qué significa**: "El ganador es el número 25."

### Paso 4: Comparar pre_compromiso con resultado

En GitHub, abre ambos archivos y verifica:
- ✅ El `hash_sha256` de participantes debe ser **idéntico**
- ✅ La `ronda_comprometida` debe coincidir
- ✅ El `draw_id` debe ser el mismo

**Si todos encajan** → El resultado es legítimo. ✅

---

## 🖥️ Opción B: Verificación Local Detallada

**Audiencia**: Técnicos que quieren auditar criptográficamente el resultado.

### Requisitos previos

```bash
# 1. Tener Node.js 18+ instalado
node --version  # Debe mostrar v18.0.0 o superior

# 2. Clonar el repo de auditoría pública
git clone https://github.com/elchanchoganador/sorteos-auditoria-publica.git
cd sorteos-auditoria-publica
```

### Paso 1: Localizar la carpeta del sorteo a verificar

```bash
# Estructura esperada:
# sorteos_log/2026/04/03/09/el-chancho-de-bronce/
#     ├── pre_compromiso.json
#     ├── resultado.json
#     └── (posible) tickets_snapshot.json

# Ejemplo para el 3 de abril, 9 AM, El Chancho de Bronce:
TARGET_PATH="./sorteos_log/2026/04/03/09/el-chancho-de-bronce"
```

### Paso 2: Ejecutar el script de verificación

```bash
# Desde la raíz del repositorio clonado:
node scripts/verificar_resultado.js "$TARGET_PATH"
```

**Salida esperada:**
```
Sorteo: El Chancho de Bronce
Fecha : 2026-04-03 09:00

✓ Ronda valida: 5776500
✓ Randomness drand con formato valido
✓ Hash de participantes valido
✓ Orden determinístico de participantes valido
✓ Ronda drand coincide entre pre_compromiso y resultado
✓ Algoritmo version coincide entre pre_compromiso y resultado
✓ Cadena contiene eventos SEED_COMMIT/SEED_REVEAL...
✓ Firma digital válida
✓ Índice del ganador: 47
✓ Número ganador: 25

═══════════════════════════════════════════════════════════
RESULTADO VERIFICADO ✓
Ganador: usuario#1234 (Número 25)
═══════════════════════════════════════════════════════════
```

### Paso 3: Entender los checkpoints

El script verifica estos 8 puntos automáticamente:

| # | Verificación | ¿Qué prueba? |
|---|---|---|
| 1 | Ronda drand válida | El valor aleatorio es de drand |
| 2 | Randomness formato válido | No ha sido corrompido en transmisión |
| 3 | Hash SHA-256 participantes | La lista no fue alterada |
| 4 | Orden determinístico | Los participantes están en orden auditado |
| 5 | Pre-compromiso = Resultado | Mismo commitment antes y después |
| 6 | Versión de algoritmo | Mismo método en ambos documentos |
| 7 | Cadena de eventos | Registros inmutables de seed y tickets |
| 8 | Firma digital válida | Resultado oficialmente firmado |

**Si todos son ✓** → Resultado completamente auditado. 🎤

---

## 💻 Opción C: Verificación Sin Instalar Nada

**Audiencia**: Usuarios que desean verificar sin terminal pero con herramientas en línea.

### Paso 1: Usar un validador JSON online

1. Ve a: https://jsonlint.com
2. Copia el contenido de `resultado.json` desde GitHub
3. Pégalo en el validador
4. ✅ Si obtiene "Valid JSON", el archivo no está corrompido

### Paso 2: Validar manualmente el hash SHA-256

**Herramienta online**: https://www.tools.keycdn.com/sha256

1. Abre el archivo `resultado.json`
2. Copia el campo `"texto_hasheado"` (texto de participantes)
3. Pégalo en la herramienta SHA-256
4. Compara el hash calculado con `"hash_sha256"` en el JSON
5. ✅ Si coinciden, los participantes no fueron alterados

### Paso 3: Verificar firma digital (avanzado)

Si tienes acceso a las claves públicas (en `ticket_keys/`), puedes usar openssl:

```bash
# Descargar clave pública
curl -L "https://raw.githubusercontent.com/elchanchoganador/sorteos-auditoria-publica/main/ticket_keys/2026/04/03/public_keys.json" > keys.json

# La firma está en resultado.json["verificable"]["firma_digital"]
# Con los datos públicos, cualquiera puede verificar la firma
```

---

## 🔍 ¿Qué Se Verifica Exactamente?

### 1️⃣ Integridad de Participantes

```javascript
// El script recalcula el hash:
SHA256(usuario1|numero1|timestamp1\n usuario2|numero2|timestamp2\n ...)

// Y compara con lo publicado:
if (recalculado === publicado) ✓ OK
```

**¿Por qué importa?** Si alguien quisiera cambiar un número participante, el hash cambiaría completamente. Es matemáticamente imposible falsificar.

### 2️⃣ Validez de Randomness

El script verifica que el `randomness` de drand:
- Tiene formato válido (64 caracteres hexadecimales)
- Vino de la ronda comprometida (verificable contra drand.cloudflare.com)

```javascript
// Formato válido es siempre:
/^[0-9a-f]{64}$/  // Exactamente 64 caracteres hex
```

### 3️⃣ Cálculo Determinístico del Ganador

```
Ganador = Seed → Fibonacci(Seed) → Índice % Total Participantes
                                    ↓
                          Resultado Único = No puede cambiar
```

El mismo seed siempre genera el mismo ganador. No hay aleatoriedad en el cálculo final.

### 4️⃣ Firma Digital

```
Resultado firmado con CLAVE_PRIVADA_del_organizador
        ↓
Cualquiera verifica con CLAVE_PUBLICA_de_confianza
        ↓
Si valida: Resultado NO fue modificado después de publicarse ✓
```

---

## 📚 Ejemplos Reales

### Caso 1: Verificación básica de GitHub (5 minutos)

```bash
# 1. Ir a GitHub en navegador
# https://github.com/elchanchoganador/sorteos-auditoria-publica

# 2. Navegar a: sorteos_log/2026/04/03/09/el-chancho-de-bronce

# 3. Click en resultado.json → Click en "View raw"

# 4. Verificar campos visibles:
#    - draw_id coincide
#    - numero_ganador es válido (00-37)
#    - hash_participantes es legible (64 hex chars)
#    - firma_digital existe
```

**Tiempo**: 5 minutos  
**Nivel técnico**: Ninguno  
**Conclusión**: "El resultado está publicado y es accesible"

---

### Caso 2: Verificación criptográfica local (30 minutos)

```bash
# 1. Clonar repositorio
git clone https://github.com/elchanchoganador/sorteos-auditoria-publica.git
cd sorteos-auditoria-publica

# 2. Ejecutar verificación
node scripts/verificar_resultado.js ./sorteos_log/2026/04/03/09/el-chancho-de-bronce

# 3. Ver todos los checkpoints ✓
#    - Hash participantes
#    - Ronda drand
#    - Firma digital
#    - Índice ganador
#    - Número ganador

# 4. Resultado:
#    ✓ RESULTADO VERIFICADO
#    Ganador: usuario#1234 (Número 25)
```

**Tiempo**: 30 minutos (incluye instalación)  
**Nivel técnico**: Básico (solo git + node)  
**Conclusión**: "Resultado es matemáticamente correcto y no fue manipulado"

---

### Caso 3: Auditoría pública en vivo

**Escenario**: Eres periodista/auditor y quieres reportar sobre transparencia del sorteo.

```bash
# 1. Clona el repo público
git clone https://github.com/elchanchoganador/sorteos-auditoria-publica.git

# 2. Selecciona una muestra de sorteos recientes
#    Ejemplo: últimos 10 sorteos del mes

# 3. Crea un script que verifica todos:
for day in 01 02 03 04; do
  for hour in 08 09 10 11 12 13 14 15 16 17 18 19; do
    path="./sorteos_log/2026/04/${day}/${hour}/el-chancho-de-bronce"
    echo "Verificando $path..."
    node scripts/verificar_resultado.js "$path" || echo "❌ FALLO"
  done
done

# 4. Publicar reporte:
#    "He verificado 160 sorteos. 160/160 pasaron auditoría (100%)"
```

**Impacto**: Terceros independientes pueden auditar sin acceso privado.

---

## 🛡️ Seguridad: Garantías que tienes

| Si ✓ verificas | Entonces NO... |
|---|---|
| Hash participantes | ...alguien cambió números sin que se note |
| Ronda drand | ...usaron un valor aleatorio diferente |
| Firma digital | ...modificaron el resultado DESPUÉS de publicarlo |
| Cadena de eventos | ...borraron o reescribieron registros intermedios |

**En resumen**: Si todos los checkpoints pasan, el resultado es imposible de haber sido truqueado sin dejar evidencia.

---

## ❓ Preguntas Frecuentes

### P: ¿Puedo confiar en GitHub?
**R**: No necesitas confiar en GitHub. Los archivos JSON están disponibles en tu máquina local. El script de verificación no contacta a GitHub en tiempo de ejecución. Podrías incluso descargarte una copia hace 6 meses y verificarla hoy.

### P: ¿Qué es la "firma digital"?
**R**: Es como un sellado criptográfico. Solo quien tiene la clave privada puede crear firmas válidas. Cualquiera con la clave pública puede verificar que la firma es real. Si el resultado cambia, la firma falla.

### P: ¿Se puede falsificar el pre_compromiso?
**R**: No. Se publica públicamente ANTES del sorteo. Si alguien lo falsifikara, habría versiones conflictivas. Además, está firmado.

### P: ¿Qué si alguien tiene acceso a "drand" y los engaña?
**R**: Imposible. Drand es una red descentralizada operada por organizaciones independientes (Cloudflare, League of Entropy, etc.). Nadie controla un valor drand histórico.

### P: ¿Y si tu código de verificación está roto?
**R**: El script está público. Cualquiera puede auditarlo, forkear, crear una versión nueva. El algoritmo es transparente.

---

## 🎬 Próximos Pasos

**Para participantes**: Verificación opción A (GitHub, 5 min).  
**Para auditoría**: Verificación opción B (Local, 30 min).  
**Para reporteros/autoridades**: Verificación opción C + creación de reporte independiente.

---

### 📞 Soporte

- Script de verificación tiene problemas: Crea un issue en GitHub
- No entiende un concepto: Lee [MERKLE_TREE_SYSTEM.md](MERKLE_TREE_SYSTEM.md) y [SORTEO_PROTOCOL_v3.md](SORTEO_PROTOCOL_v3.md)
- Quieres auditar más a fondo: Contacta a un criptógrafo independiente

---

**Última actualización**: 4 de abril de 2026  
**Versión de protocolo**: 3.1.0  
**Estado**: ✓ En operación
