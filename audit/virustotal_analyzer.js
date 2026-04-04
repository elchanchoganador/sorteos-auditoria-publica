#!/usr/bin/env node
/**
 * audit/virustotal_analyzer.js
 * 
 * Análisis de integridad de archivos con VirusTotal API v3
 * - Calcula hashes SHA-256 de archivos críticos
 * - Envía hashes a VirusTotal para análisis (sin subir archivos)
 * - Escanea URLs de GitHub para auditoría pública
 * - Genera reporte firmado de integridad
 * 
 * Uso:
 *   node audit/virustotal_analyzer.js analyze-local [carpeta-sorteo]
 *   node audit/virustotal_analyzer.js scan-github [fecha] [hora] [sorteo-slug]
 *   node audit/virustotal_analyzer.js generate-report [carpeta-sorteo]
 */

import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __root = path.dirname(__dirname);

const VT_API_KEY = process.env.VIRUSTOTAL_API_KEY || null;
const VT_API_BASE = 'https://www.virustotal.com/api/v3';

/**
 * Calcula SHA-256 de un archivo
 */
async function calcularHashArchivo(filePath) {
  try {
    const contenido = await fs.readFile(filePath);
    const hash = createHash('sha256').update(contenido).digest('hex');
    return {
      archivo: path.basename(filePath),
      ruta: filePath,
      hash,
      tamaño: contenido.length,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      archivo: path.basename(filePath),
      ruta: filePath,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Envía un hash a VirusTotal para análisis
 * Usa la API de "file hash lookup" (no requiere upload)
 * El link_vt siempre se incluye: cualquier SHA-256 tiene URL pública en VT sin API key.
 */
async function analizarHashVirusTotal(sha256Hash) {
  // La URL pública de VirusTotal para un hash siempre es predecible
  const linkPublico = `https://www.virustotal.com/gui/file/${sha256Hash}`;

  if (!VT_API_KEY) {
    return {
      hash: sha256Hash,
      estado: 'sin_api_key',
      razon: 'VIRUSTOTAL_API_KEY no configurado. El link_vt es público y verificable en el navegador.',
      link_vt: linkPublico,
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch(`${VT_API_BASE}/files/${sha256Hash}`, {
      method: 'GET',
      headers: {
        'x-apikey': VT_API_KEY,
      },
      timeout: 10000,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          hash: sha256Hash,
          estado: 'no_encontrado',
          razon: 'Hash no encontrado en VirusTotal (archivo nuevo, sin historial previo)',
          link_vt: linkPublico,
          timestamp: new Date().toISOString(),
        };
      }
      return {
        hash: sha256Hash,
        estado: 'error_http',
        razon: `HTTP ${response.status}`,
        link_vt: linkPublico,
        timestamp: new Date().toISOString(),
      };
    }

    const data = await response.json();
    const resultado = data?.data?.attributes?.last_analysis_stats || {};

    return {
      hash: sha256Hash,
      estado: 'analizado',
      resultados: {
        malicioso: resultado.malicious || 0,
        sospechoso: resultado.suspicious || 0,
        limpio: resultado.undetected || 0,
        no_categorizado: resultado.undetected || 0,
      },
      numero_detectores: resultado.malicious || resultado.suspicious ? 'DETECCIONES' : 'LIMPIO',
      link_vt: linkPublico,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      hash: sha256Hash,
      estado: 'error',
      razon: error.message,
      link_vt: linkPublico,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Escanea una URL de GitHub (para auditoría pública)
 */
async function escanearURLGitHub(url) {
  if (!VT_API_KEY) {
    return {
      url,
      estado: 'skipped',
      razon: 'VIRUSTOTAL_API_KEY no configurado',
      timestamp: new Date().toISOString(),
    };
  }

  try {
    const body = new URLSearchParams();
    body.append('url', url);

    const response = await fetch(`${VT_API_BASE}/urls`, {
      method: 'POST',
      headers: {
        'x-apikey': VT_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      timeout: 10000,
    });

    if (!response.ok) {
      return {
        url,
        estado: 'error',
        razon: `HTTP ${response.status}`,
        timestamp: new Date().toISOString(),
      };
    }

    const data = await response.json();
    const analysisId = data?.data?.id;

    // Intentar obtener análisis inmediato (si está cacheado)
    if (analysisId) {
      const analysisUrl = `${VT_API_BASE}/analyses/${analysisId}`;
      const analysisResponse = await fetch(analysisUrl, {
        headers: { 'x-apikey': VT_API_KEY },
        timeout: 10000,
      });

      if (analysisResponse.ok) {
        const analysisData = await analysisResponse.json();
        const stats = analysisData?.data?.attributes?.stats || {};

        return {
          url,
          estado: 'analizado',
          resultados: {
            malicioso: stats.malicious || 0,
            sospechoso: stats.suspicious || 0,
            limpio: stats.undetected || 0,
          },
          link_vt: `https://www.virustotal.com/gui/url/${analysisId}`,
          timestamp: new Date().toISOString(),
        };
      }
    }

    return {
      url,
      estado: 'pendiente_analisis',
      razon: 'URL encolada para análisis en VirusTotal',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      url,
      estado: 'error',
      razon: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Analiza todos los archivos críticos de un sorteo
 */
async function analizarSorteoLocal(carpetaSorteo) {
  const archivoCritico = [
    'resultado.json',
    'pre_compromiso.json',
    'tickets_snapshot.json',
    'virustotal_analysis.json',
  ];

  const reportes = {
    carpeta: carpetaSorteo,
    fecha_analisis: new Date().toISOString(),
    archivos: [],
  };

  for (const nombre of archivoCritico) {
    const ruta = path.join(carpetaSorteo, nombre);
    try {
      await fs.access(ruta);
      const hashInfo = await calcularHashArchivo(ruta);
      const analisisVT = await analizarHashVirusTotal(hashInfo.hash);

      reportes.archivos.push({
        ...hashInfo,
        virustotal: analisisVT,
      });
    } catch {
      // Archivo no existe, continuar
    }
  }

  return reportes;
}

/**
 * Genera reporte firmado de integridad
 */
async function generarReporte(carpetaSorteo) {
  const analisis = await analizarSorteoLocal(carpetaSorteo);

  // Guardar reporte en la carpeta del sorteo
  const rutaReporte = path.join(carpetaSorteo, 'virustotal_analysis.json');
  await fs.mkdir(path.dirname(rutaReporte), { recursive: true });
  await fs.writeFile(rutaReporte, JSON.stringify(analisis, null, 2));

  console.log(`✓ Reporte VirusTotal guardado en: ${rutaReporte}`);
  console.log(JSON.stringify(analisis, null, 2));

  return analisis;
}

/**
 * Escanea URLs de GitHub (para repo de auditoría pública)
 * Cubre todos los archivos involucrados en el sorteo.
 */
async function escanearAuditoriaPublica(fecha, hora, sorteoSlug) {
  const baseGithubURL = 'https://raw.githubusercontent.com/elchanchoganador/sorteos-auditoria-publica/main';
  const baseGithubGuiURL = 'https://github.com/elchanchoganador/sorteos-auditoria-publica/blob/main';
  const [year, month, day] = fecha.split('-');
  const horaZero = String(hora).padStart(2, '0');
  const baseSorteoPath = `sorteos_log/${year}/${month}/${day}/${horaZero}/${sorteoSlug}`;

  // Todos los archivos del sorteo publicados en GitHub
  const archivosDelSorteo = [
    { nombre: 'resultado.json',           descripcion: 'Resultado oficial del sorteo' },
    { nombre: 'pre_compromiso.json',      descripcion: 'Compromiso criptográfico previo al sorteo' },
    { nombre: 'tickets_snapshot.json',    descripcion: 'Snapshot de participantes registrados' },
    { nombre: 'virustotal_analysis.json', descripcion: 'Análisis de integridad local post-sorteo' },
  ];

  // Archivos de infraestructura de auditoría (scripts y herramientas)
  const archivosInfraestructura = [
    { nombre: 'scripts/verificar_resultado.js',          descripcion: 'Script de verificación criptográfica' },
    { nombre: 'scripts/verificar_recibo_ticket_publico.js', descripcion: 'Script de verificación de tickets' },
    { nombre: 'auditor/index.html',                       descripcion: 'Interfaz web de auditoría' },
    { nombre: `ticket_keys/${year}/${month}/${day}/public_keys.json`, descripcion: 'Claves públicas de firma del día' },
  ];

  const reportes = {
    fecha_escaneo: new Date().toISOString(),
    sorteo: `${sorteoSlug}:${fecha}:${hora}`,
    repositorio_github: 'https://github.com/elchanchoganador/sorteos-auditoria-publica',
    nota: 'Cada link_vt permite verificar el archivo directamente en VirusTotal sin necesidad de instalar nada.',
    archivos_sorteo: [],
    archivos_infraestructura: [],
  };

  for (const archivo of archivosDelSorteo) {
    const url = `${baseGithubURL}/${baseSorteoPath}/${archivo.nombre}`;
    const urlGui = `${baseGithubGuiURL}/${baseSorteoPath}/${archivo.nombre}`;
    console.log(`🔍 Escaneando archivo del sorteo: ${archivo.nombre}`);
    const resultado = await escanearURLGitHub(url);
    reportes.archivos_sorteo.push({
      nombre: archivo.nombre,
      descripcion: archivo.descripcion,
      url_github: urlGui,
      ...resultado,
    });
  }

  for (const archivo of archivosInfraestructura) {
    const url = `${baseGithubURL}/${archivo.nombre}`;
    const urlGui = `${baseGithubGuiURL}/${archivo.nombre}`;
    console.log(`🔍 Escaneando infraestructura: ${archivo.nombre}`);
    const resultado = await escanearURLGitHub(url);
    reportes.archivos_infraestructura.push({
      nombre: archivo.nombre,
      descripcion: archivo.descripcion,
      url_github: urlGui,
      ...resultado,
    });
  }

  return reportes;
}

/**
 * Función principal
 */
async function main() {
  const comando = process.argv[2];

  if (!comando) {
    console.log(`
Uso:
  node audit/virustotal_analyzer.js analyze-local [carpeta]
    Analiza archivos locales de un sorteo
  
  node audit/virustotal_analyzer.js scan-github [YYYY-MM-DD] [HH] [sorteo-slug]
    Escanea URLs publicadas en GitHub
  
  node audit/virustotal_analyzer.js generate-report [carpeta]
    Genera reporte completo con hashes y análisis

Ejemplos:
  node audit/virustotal_analyzer.js analyze-local ./sorteos_log/2026/04/03/09/el-chancho-de-bronce
  node audit/virustotal_analyzer.js scan-github 2026-04-03 09 el-chancho-de-bronce
    `);
    return;
  }

  try {
    if (comando === 'analyze-local') {
      const carpeta = process.argv[3] || process.cwd();
      const resultado = await analizarSorteoLocal(carpeta);
      console.log(JSON.stringify(resultado, null, 2));
    } else if (comando === 'scan-github') {
      const fecha = process.argv[3];
      const hora = process.argv[4];
      const slug = process.argv[5];
      if (!fecha || !hora || !slug) {
        console.error('Uso: scan-github YYYY-MM-DD HH sorteo-slug');
        process.exit(1);
      }
      const resultado = await escanearAuditoriaPublica(fecha, hora, slug);
      console.log(JSON.stringify(resultado, null, 2));
    } else if (comando === 'generate-report') {
      const carpeta = process.argv[3];
      if (!carpeta) {
        console.error('Uso: generate-report [carpeta]');
        process.exit(1);
      }
      await generarReporte(carpeta);
    } else {
      console.error(`Comando desconocido: ${comando}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

export {
  calcularHashArchivo,
  analizarHashVirusTotal,
  escanearURLGitHub,
  analizarSorteoLocal,
  escanearAuditoriaPublica,
  generarReporte,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
