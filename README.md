# Sorteos — auditoría pública

Herramientas **solo HTML** de **EL CHANCHO GANADOR, C.A.** para verificar sorteos de [*La Gran Carrera*](https://elchanchoganador.com).

**RIF:** J-506703866 · No requiere Node.js ni instalación.

---

## ¿Qué hace el sistema?

1. En **elchanchoganador.com**, cada resultado publicado muestra validez notarial y huella digital (SHA-256).
2. Puede **descargar** un archivo `verificacion-sorteo.txt` con todos los datos del sorteo.
3. En este repositorio, **[`index.html`](index.html)** recarga ese archivo y **vuelve a calcular la huella** en su navegador.
4. Si coincide → el número publicado es consistente con el registro del sistema.

El azar proviene de **drand** (red pública). El notario aprueba antes de publicar. Nadie elige el número a mano.

---

## Cómo verificar (3 pasos)

### 1. En elchanchoganador.com

Abra el auditor del sorteo (ícono 👁 en resultados), por ejemplo:

`https://elchanchoganador.com/auditor?fecha=2026-06-15&sorteo=la-gran-carrera&hora=0`

Pulse **「Descargar datos para verificar」**.

### 2. En este repositorio

Abra [`index.html`](index.html) (en GitHub: botón *Code* → archivo → *View raw*, o clone el repo y ábrelo en el navegador).

- Cargue el archivo `.txt` descargado, **o**
- Pegue su contenido en el cuadro de texto.

Pulse **Comprobar datos**.

### 3. Revise el resultado

- ✓ Huella coincide → datos consistentes.
- ✗ No coincide → compare con la web o contacte soporte.

---

## Archivos del repositorio

| Archivo | Uso |
|---------|-----|
| [`index.html`](index.html) | Verificador principal (cargar `verificacion-sorteo.txt`) |
| [`auditor/index.html`](auditor/index.html) | Auditor avanzado con archivos JSON de evidencia |
| [`VIRUSTOTAL_INTEGRATION.html`](VIRUSTOTAL_INTEGRATION.html) | Interpretar reportes VirusTotal |
| [`SOLICITUD_CONALOT_DOSSIER.html`](SOLICITUD_CONALOT_DOSSIER.html) | Dossier CONALOT |

---

## Formato del archivo de verificación

Una línea por campo, por ejemplo:

```
# verificacion-sorteo-v1
producto=La Gran Carrera
fecha=2026-06-15
hora=08:00 AM
draw_id=12345
numero_ganador=06
opcion=Embudo
huella_registrada=abc123...
huella_calculada=abc123...
drand_ronda=5776500
...
```

---

## Enlaces

| Canal | URL |
|-------|-----|
| Resultados y auditor | https://elchanchoganador.com |
| Verificar ticket | https://verificatuticket.com |

---

Ver [LICENSE](LICENSE).
