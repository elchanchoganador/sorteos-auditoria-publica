import cron from "node-cron";
import fs   from "fs/promises";
import path  from "path";
import { fileURLToPath } from "url";
import { AttachmentBuilder } from "discord.js";
import {
  generarPreCompromiso,
  ejecutarSorteo,
  leerParticipantes,
  parseHoraVet,
} from "./audit/sorteo_audit.js";
import {
  cargarConfigSorteos,
  validarImagenesDeSorteo,
} from "./sorteos_media.js";
import {
  analizarSorteoLocal,
  generarReporte,
} from "./audit/virustotal_analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const LOGS_BASE = path.join(__dirname, 'sorteos_log');

// ════════════════════════════════════════════════════════════════════════════════
//  UTILIDADES DE RUTAS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Construye la carpeta de log para un sorteo:
 *   sorteos_log/YYYY/MM/DD/HH/{sorteo-slug}/
 * La carpeta usa la fecha y hora VET —lo que el jugador ve.
 */
function carpetaLog(year, month, day, hora24Vet, sorteoSlug) {
  return path.join(
    LOGS_BASE,
    String(year),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
    String(hora24Vet).padStart(2, '0'),
    sorteoSlug,
  );
}

// ════════════════════════════════════════════════════════════════════════════════
//  VERIFICACIONES DEFENSIVAS (filesystem como fuente de verdad)
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Verifica si el pre-compromiso ya fue generado (archivo existe en disco).
 * Esto permite sobrevivir a reinicios del bot de forma segura.
 */
async function preCompromisoYaGenerado(carpeta) {
  try {
    await fs.access(path.join(carpeta, 'pre_compromiso.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Verifica si el resultado ya fue ejecutado (archivo existe en disco).
 * Esto permite sobrevivir a reinicios del bot de forma segura.
 */
async function resultadoYaEjecutado(carpeta) {
  try {
    await fs.access(path.join(carpeta, 'resultado.json'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Devuelve la hora actual en Venezuela (VET = UTC-4) como objeto.
 */
function ahoraVET() {
  const utc = new Date();
  // VET es UTC-4 (sin DST)
  const vetMs = utc.getTime() - 4 * 60 * 60 * 1000;
  const vet   = new Date(vetMs);
  return {
    date:   vet,
    year:   vet.getUTCFullYear(),
    month:  vet.getUTCMonth() + 1,
    day:    vet.getUTCDate(),
    hour:   vet.getUTCHours(),
    minute: vet.getUTCMinutes(),
  };
}

export function iniciarProcesosSorteos(client) {
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (!channelId) return console.error("No se encontró DISCORD_CHANNEL_ID en las variables de entorno");

  // ── Cron: cada minuto ────────────────────────────────────────────────────
  cron.schedule("* * * * *", async () => {
    try {
      const channel = await client.channels.fetch(channelId);
      const config  = await cargarConfigSorteos();
      const now     = ahoraVET();

      for (const sorteo of config.Sorteos) {
        if (!sorteo.estado?.activo || sorteo.estado?.bloqueado) continue;

        for (const horaStr of sorteo.horas) {
          let hora24;
          try { hora24 = parseHoraVet(horaStr); } catch { continue; }

          const carpeta = carpetaLog(now.year, now.month, now.day, hora24, sorteo.slug);

          // ── PRE-COMPROMISO: 20 minutos antes del sorteo ──────────────────
          const minutosParaSorteo = (hora24 - now.hour) * 60 + (0 - now.minute);
          if (minutosParaSorteo === 20) {
            const yaGenerado = await preCompromisoYaGenerado(carpeta);
            if (yaGenerado) {
              console.log(`ℹ️ Pre-compromiso ya existe: ${sorteo.slug} ${horaStr}`);
              continue;
            }

            try {
              const participantes = await leerParticipantes({
                year:            now.year,
                month:           now.month,
                day:             now.day,
                horaStr,
                sorteoSlug:      sorteo.slug,
              });

              await generarPreCompromiso({
                sorteo,
                horaStr,
                year:  now.year,
                month: now.month,
                day:   now.day,
                participantes,
              });

              console.log(`📋 Pre-compromiso generado: ${sorteo.titulo} ${horaStr}`);
            } catch (e) {
              console.error(`❌ Error generando pre-compromiso ${sorteo.slug} ${horaStr}:`, e.message);
            }
          }

          // ── RESULTADO: exactamente en la hora del sorteo ─────────────────
          if (hora24 === now.hour && now.minute === 0) {
            const yaEjecutado = await resultadoYaEjecutado(carpeta);
            if (yaEjecutado) {
              console.log(`ℹ️ Sorteo ya ejecutado: ${sorteo.slug} ${horaStr}`);
              continue;
            }

            try {
              const participantes = await leerParticipantes({
                year:       now.year,
                month:      now.month,
                day:        now.day,
                horaStr,
                sorteoSlug: sorteo.slug,
              });

              const resultado = await ejecutarSorteo({
                sorteo,
                horaStr,
                year:  now.year,
                month: now.month,
                day:   now.day,
                participantes,
              });

              // ── Análisis de integridad VirusTotal ────────────────────────
              const carpetaSorteo = path.join(
                LOGS_BASE,
                String(now.year),
                String(now.month).padStart(2, '0'),
                String(now.day).padStart(2, '0'),
                String(now.hour).padStart(2, '0'),
                sorteo.slug
              );
              try {
                await generarReporte(carpetaSorteo);
                console.log(`✓ Análisis VirusTotal completado para ${sorteo.slug}`);
              } catch (error) {
                console.error(`⚠️ Error en análisis VirusTotal: ${error.message}`);
              }

              // ── Notificar ganadores en Discord ───────────────────────────
              const { numero_ganador, producto_ganador, ganadores } = resultado.resultado;
              let msg = `🎲 **${sorteo.titulo}** — ${horaStr}\n`;
              msg += `🏆 Número ganador: **${numero_ganador}** *(${producto_ganador})*\n`;
              if (ganadores.length > 0) {
                msg += `🎉 Ganadores: ${ganadores.map(g => `**${g.usuario}**`).join(", ")}\n`;
              } else {
                msg += `😔 El número ${numero_ganador} no fue jugado esta ronda.\n`;
              }

              const validacionImagen = await validarImagenesDeSorteo(sorteo, numero_ganador);
              if (!validacionImagen.ok) {
                console.warn(
                  `⚠️ Imágenes inválidas para ${sorteo.slug}: ${validacionImagen.errores.join(" | ")}`
                );
              } else if (validacionImagen.advertencias?.length) {
                console.warn(
                  `ℹ️ Imágenes con advertencias para ${sorteo.slug}: ${validacionImagen.advertencias.join(" | ")}`
                );
              }

              msg += `\n🔍 Verificación pública disponible en el log del sorteo.`;

              const payload = { content: msg };
              if (validacionImagen.ok && validacionImagen.imagenPrincipalAbs) {
                payload.files = [
                  new AttachmentBuilder(validacionImagen.imagenPrincipalAbs, {
                    name: validacionImagen.imagenPrincipalNombre || "sorteo.png",
                  }),
                ];
              }

              await channel.send(payload);
            } catch (e) {
              console.error(`❌ Error ejecutando sorteo ${sorteo.slug} ${horaStr}:`, e.message);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error al procesar sorteos:", err);
    }
  }, { timezone: "America/Caracas" });
}

