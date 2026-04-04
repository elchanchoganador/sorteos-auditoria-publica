#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { execFileSync } from 'child_process';
import { initSqlite, getSigningPublicKeysByDateSqlite } from '../db/sqlite.js';
import { escanearAuditoriaPublica } from '../audit/virustotal_analyzer.js';

const DEFAULT_PUBLIC_REPO = process.env.PUBLIC_AUDIT_REPO_PATH
  ? path.resolve(process.env.PUBLIC_AUDIT_REPO_PATH)
  : path.resolve('/home/linx/Escritorio/VPS/sorteos-auditoria-publica');

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

async function copyRecursive(src, dest) {
  const stats = await fs.stat(src);
  if (stats.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }

  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

function parseDateArg(dateArg) {
  if (dateArg && /^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
    return dateArg;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

async function ensureRepoReady(repoPath) {
  const gitDir = path.join(repoPath, '.git');
  await fs.access(gitDir);
}

async function main() {
  const repoPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_PUBLIC_REPO;
  const fecha = parseDateArg(process.argv[3]);
  const [year, month, day] = fecha.split('-');
  const basePath = process.cwd();

  await ensureRepoReady(repoPath);
  await initSqlite();

  const scriptsToCopy = [
    ['scripts/verificar_resultado.js', 'scripts/verificar_resultado.js'],
    ['scripts/verificar_recibo_ticket_publico.js', 'scripts/verificar_recibo_ticket_publico.js'],
    ['auditor/index.html', 'auditor/index.html'],
  ];

  for (const [srcRel, destRel] of scriptsToCopy) {
    await copyRecursive(path.join(basePath, srcRel), path.join(repoPath, destRel));
  }

  const dailyLogSrc = path.join(basePath, 'sorteos_log', year, month, day);
  const dailyLogDest = path.join(repoPath, 'sorteos_log', year, month, day);
  try {
    await copyRecursive(dailyLogSrc, dailyLogDest);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const publicKeys = await getSigningPublicKeysByDateSqlite(fecha);
  const keyExportPath = path.join(repoPath, 'ticket_keys', year, month, day, 'public_keys.json');
  await fs.mkdir(path.dirname(keyExportPath), { recursive: true });
  await fs.writeFile(
    keyExportPath,
    JSON.stringify({ valid_date: fecha, total: publicKeys.length, public_keys: publicKeys.map((entry) => ({
      key_id: entry.keyId,
      signer_type: entry.signerType,
      signer_subject_id: entry.signerSubjectId,
      valid_date: entry.validDate,
      public_key_pem: entry.publicKeyPem,
      public_key_fingerprint: entry.publicKeyFingerprint,
      created_at: entry.createdAt,
    })) }, null, 2),
    'utf8'
  );

  runGit(['add', '.'], repoPath);

  let hasChanges = true;
  try {
    runGit(['diff', '--cached', '--quiet'], repoPath);
    hasChanges = false;
  } catch {
    hasChanges = true;
  }

  if (!hasChanges) {
    console.log(`No hay cambios públicos para publicar en ${fecha}.`);
    return;
  }

  const msg = `public audit publish ${fecha}`;
  runGit(['commit', '-m', msg], repoPath);
  runGit(['push', 'origin', 'main'], repoPath);
  console.log(`Publicación completada para ${fecha} en ${repoPath}`);

  // ── Escaneo de integridad con VirusTotal ─────────────────────────────────
  // Nota: solo se ejecutan sorteos que tienen carpeta publicada en el repo
  console.log('\n🔍 Iniciando escaneo de integridad con VirusTotal...');
  let vtHuboEscrituras = false;
  try {
    const sorteoSlugs = ['el-chancho-de-bronce', 'el-chancho-de-plata', 'el-chancho-de-oro'];
    for (const slug of sorteoSlugs) {
      for (let hora = 8; hora < 20; hora++) {
        const horaStr = String(hora).padStart(2, '0');
        // Solo escanear si la carpeta del sorteo ya fue publicada
        const carpetaPublicada = path.join(repoPath, 'sorteos_log', year, month, day, horaStr, slug);
        try {
          await fs.access(carpetaPublicada);
        } catch {
          continue; // carpeta no existe, no hubo sorteo en esa hora/slug
        }
        console.log(`  Escaneando ${slug} a las ${horaStr}:00...`);
        try {
          const analisisVT = await escanearAuditoriaPublica(fecha, horaStr, slug);
          const reportPath = path.join(carpetaPublicada, 'virustotal_scan.json');
          await fs.writeFile(reportPath, JSON.stringify(analisisVT, null, 2));
          vtHuboEscrituras = true;
          console.log(`  ✓ Análisis guardado para ${slug}:${horaStr}`);
        } catch (error) {
          console.log(`  ⚠️ No se pudo escanear ${slug}:${horaStr}: ${error.message}`);
        }
      }
    }
    console.log('✓ Escaneo de integridad completado');
  } catch (error) {
    console.warn(`⚠️ Error en escaneo VirusTotal (no bloqueante): ${error.message}`);
  }

  // ── Segundo commit para publicar los reportes de VirusTotal ──────────────
  if (vtHuboEscrituras) {
    try {
      runGit(['add', '.'], repoPath);
      let vtHayCambios = true;
      try {
        runGit(['diff', '--cached', '--quiet'], repoPath);
        vtHayCambios = false;
      } catch { /* hay cambios */ }
      if (vtHayCambios) {
        runGit(['commit', '-m', `virustotal integrity scan ${fecha}`], repoPath);
        runGit(['push', 'origin', 'main'], repoPath);
        console.log('✓ Reportes VirusTotal subidos a GitHub');
      }
    } catch (error) {
      console.warn(`⚠️ Error publicando reportes VirusTotal: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`ERROR publicando auditoría pública: ${error.message}`);
  process.exit(1);
});