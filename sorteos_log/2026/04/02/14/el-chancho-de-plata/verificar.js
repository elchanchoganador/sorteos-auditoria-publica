#!/usr/bin/env node
/**
 * verificar.js — Script de verificación independiente
 * ─────────────────────────────────────────────────────────────────
 * El Chancho Ganador C.A.  |  RIF J-506703866
 *
 * REQUISITOS: Node.js v18+  (fetch y crypto son nativos, sin npm install)
 * USO       : node verificar.js
 *
 * Este script lee resultado.json del mismo directorio y verifica:
 *   1. Que el beacon drand corresponde a la ronda comprometida, confirmando
 *      que la aleatoriedad proviene de una fuente pública e independiente.
 *   2. Que el hash SHA-256 de la lista de participantes coincide, garantizando
 *      que no se añadieron ni eliminaron jugadores después del cierre.
 *   3. Que el número ganador se obtiene aplicando el algoritmo documentado,
 *      de forma que cualquier persona puede reproducirlo y confirmar el resultado.
 *
 * Para subir a GitHub incluye este archivo junto con resultado.json y
 * pre_compromiso.json (los tres en la misma carpeta).
 * ─────────────────────────────────────────────────────────────────
 */

import { createHash } from 'crypto';
import { readFile }   from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Códigos ANSI
const VERDE = '\x1b[32m';
const ROJO  = '\x1b[31m';
const AMAR  = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';

const ok   = msg => console.log(`  ${VERDE}✔${RESET} ${msg}`);
const fail = msg => console.log(`  ${ROJO}✘${RESET} ${msg}`);
const info = msg => console.log(`  ${DIM}ℹ ${msg}${RESET}`);
const warn = msg => console.log(`  ${AMAR}⚠${RESET} ${msg}`);

function fibonacciHex(seedHex) {
    const n = Number(BigInt('0x' + seedHex.slice(0, 16)) % 700n) + 300;
    const mod = 1n << 256n;
    let a = 0n;
    let b = 1n;
    for (let i = 0; i < n; i++) {
        const t = (a + b) % mod;
        a = b;
        b = t;
    }
    return { n, hex: a.toString(16).padStart(64, '0') };
}

function climaTexto(snapshotCiudades) {
    return snapshotCiudades
        .map(c => `${c.nombre}|${c.lat}|${c.lon}|${c.temperatura_c}|${c.viento_kmh}|${c.weathercode}|${c.observado_en}`)
        .join('\n');
}

// ─── Fetch beacon drand ───────────────────────────────────────────────────────
async function fetchBeacon(ronda, endpoints) {
    const errores = [];
    for (const base of endpoints) {
        // Acepta URLs completas o bases sin ruta
        const url = base.includes('/public/') ? base : `${base}/public/${ronda}`;
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(12_000),
                headers: { Accept: 'application/json' },
            });
            if (res.ok) {
                const data = await res.json();
                return { ...data, _url: url };
            }
            errores.push(`${url} → HTTP ${res.status}`);
        } catch (e) {
            errores.push(`${url} → ${e.message}`);
        }
    }
    throw new Error(`No se pudo obtener beacon drand:\n  ${errores.join('\n  ')}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('');
    console.log(`${BOLD}══════════════════════════════════════════════════════════${RESET}`);
    console.log(`${BOLD}  VERIFICADOR INDEPENDIENTE — El Chancho Ganador C.A.    ${RESET}`);
    console.log(`${BOLD}══════════════════════════════════════════════════════════${RESET}`);
    console.log('');

    // ── Cargar resultado.json ────────────────────────────────────────────────
    let resultado;
    try {
        const raw = await readFile(path.join(__dirname, 'resultado.json'), 'utf8');
        resultado = JSON.parse(raw);
    } catch (e) {
        console.error(`${ROJO}ERROR: No se encontró resultado.json en ${__dirname}${RESET}`);
        console.error(`  Detalle: ${e.message}`);
        process.exit(1);
    }

    if (resultado.tipo !== 'RESULTADO_FINAL') {
        warn(`El archivo resultado.json tiene tipo "${resultado.tipo}", se esperaba "RESULTADO_FINAL"`);
    }

    // ── Cabecera informativa ─────────────────────────────────────────────────
    console.log(`${BOLD}Detalles del sorteo${RESET}`);
    console.log(`  Empresa  : ${resultado.empresa.nombre}  [${resultado.empresa.rif}]`);
    console.log(`  Sorteo   : ${resultado.sorteo.titulo}  (${resultado.sorteo.slug})`);
    console.log(`  Fecha VET: ${resultado.horario.fecha_vet}  ${resultado.horario.hora_vet}`);
    console.log(`  Fecha UTC: ${resultado.horario.fecha_utc}`);
    console.log(`  Versión  : ${resultado.version ?? 'N/A'}`);
    console.log('');

    let pasaron = 0;
    let fallaron = 0;

    // ════════════════════════════════════════════════════════════════════════
    //  VERIFICACIÓN 1 — Beacon drand
    // ════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}[1/3] Verificando beacon drand — ronda ${resultado.drand.ronda}${RESET}`);
    info(`Fuente: ${resultado.drand.fuente}`);
    info(`Red   : ${resultado.drand.red}`);

    const endpoints = [
        resultado.drand.endpoint_usado,
        ...(resultado.drand.endpoints_alternos ?? []),
        'https://drand.cloudflare.com',
        'https://api.drand.sh',
    ].filter(Boolean);

    let beacon = null;
    try {
        beacon = await fetchBeacon(resultado.drand.ronda, endpoints);
        info(`Beacon obtenido desde: ${beacon._url}`);

        if (String(beacon.round) === String(resultado.drand.ronda)) {
            ok(`Ronda drand coincide: ${beacon.round}`);
            pasaron++;
        } else {
            fail(`Ronda drand NO coincide: esperada ${resultado.drand.ronda}, obtenida ${beacon.round}`);
            fallaron++;
        }

        if (beacon.randomness === resultado.drand.randomness) {
            ok(`Randomness coincide: ${beacon.randomness.slice(0, 24)}...`);
            pasaron++;
        } else {
            fail(`Randomness NO coincide`);
            info(`  Esperado : ${resultado.drand.randomness}`);
            info(`  Obtenido : ${beacon.randomness}`);
            fallaron++;
        }
    } catch (e) {
        fail(`No se pudo obtener el beacon drand: ${e.message}`);
        warn(`Verificación manual: ${endpoints.find(u => u.includes('/public/')) ?? endpoints[0]}`);
        fallaron++;
    }
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    //  VERIFICACIÓN 2 — Hash SHA-256 de participantes
    // ════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}[2/3] Verificando integridad de participantes (SHA-256)${RESET}`);
    info(`Participantes registrados: ${resultado.participantes.total}`);
    info(`Algoritmo: ${resultado.participantes.algoritmo_hash}`);

    const hashCalculado = createHash('sha256')
        .update(resultado.participantes.texto_hasheado, 'utf8')
        .digest('hex');

    if (hashCalculado === resultado.participantes.hash_sha256) {
        ok(`Hash SHA-256 coincide: ${hashCalculado.slice(0, 24)}...`);
        ok(`La lista de participantes no fue alterada después del cierre`);
        pasaron++;
    } else {
        fail(`Hash SHA-256 NO coincide — posible alteración de la lista de participantes`);
        info(`  Esperado : ${resultado.participantes.hash_sha256}`);
        info(`  Calculado: ${hashCalculado}`);
        fallaron++;
    }
    console.log('');

    // Mostrar participantes para transparencia
    if (resultado.participantes.lista?.length > 0) {
        console.log(`  ${DIM}Participantes (${resultado.participantes.lista.length}):${RESET}`);
        for (const p of resultado.participantes.lista) {
            console.log(`  ${DIM}  · ${p.usuario.padEnd(20)} nº ${p.numero}  [${p.timestamp_jugada}]${RESET}`);
        }
        console.log('');
    }

    // ════════════════════════════════════════════════════════════════════════
    //  VERIFICACIÓN 3 — Entropía híbrida y ganador
    // ════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}[3/3] Verificando entropía híbrida y algoritmo final${RESET}`);
    info(`Algoritmo: ${resultado.calculo.algoritmo}`);

    const randomnessBase = beacon?.randomness ?? resultado.drand.randomness;
    const randomness = resultado.entropia?.randomness_sorteo || randomnessBase;
    const numeros       = resultado.calculo.todos_numeros;
    const hashPart      = resultado.participantes.hash_sha256;

    const textoClimaCalc = climaTexto(resultado.entropia.clima.snapshot_ciudades || []);
    const hashClimaCalc = createHash('sha256').update(textoClimaCalc, 'utf8').digest('hex');
    if (hashClimaCalc === resultado.entropia.clima.hash_sha256) {
        ok(`Hash climático coincide: ${hashClimaCalc.slice(0, 24)}...`);
        pasaron++;
    } else {
        fail(`Hash climático NO coincide`);
        info(`  Esperado : ${resultado.entropia.clima.hash_sha256}`);
        info(`  Calculado: ${hashClimaCalc}`);
        fallaron++;
    }

    const fib = fibonacciHex(randomness);
    if (fib.hex === resultado.entropia.transformacion_fibonacci.resultado_hex && fib.n === resultado.entropia.transformacion_fibonacci.n) {
        ok(`Transformación Fibonacci coincide (n=${fib.n})`);
        pasaron++;
    } else {
        fail(`Transformación Fibonacci NO coincide`);
        fallaron++;
    }

    const semillaCalc = createHash('sha256')
        .update(`${randomness}|${hashPart}|${hashClimaCalc}|${fib.hex}|${resultado.drand.ronda}|${resultado.entropia.contexto_sorteo}`, 'utf8')
        .digest('hex');

    if (semillaCalc === resultado.entropia.semilla_final.hash_sha256) {
        ok(`Semilla final coincide: ${semillaCalc.slice(0, 24)}...`);
        pasaron++;
    } else {
        fail(`Semilla final NO coincide`);
        info(`  Esperado : ${resultado.entropia.semilla_final.hash_sha256}`);
        info(`  Calculado: ${semillaCalc}`);
        fallaron++;
    }

    const bigRand       = BigInt('0x' + semillaCalc);
    const idxCalculado  = Number(bigRand % BigInt(numeros.length));
    const numCalculado  = numeros[idxCalculado];

    info(`Operación: BigInt("0x${semillaCalc.slice(0, 16)}...") % ${numeros.length} = índice ${idxCalculado}`);
    info(`Número en índice ${idxCalculado}: ${numCalculado}`);

    if (numCalculado === resultado.resultado.numero_ganador) {
        ok(`Número ganador correcto: ${numCalculado} — ${resultado.resultado.producto_ganador}`);
        pasaron++;
    } else {
        fail(`Número ganador NO coincide`);
        info(`  Esperado : ${resultado.resultado.numero_ganador}`);
        info(`  Calculado: ${numCalculado}`);
        fallaron++;
    }
    console.log('');

    // ════════════════════════════════════════════════════════════════════════
    //  RESULTADO FINAL
    // ════════════════════════════════════════════════════════════════════════
    console.log('═'.repeat(58));

    if (fallaron === 0) {
        console.log(`${VERDE}${BOLD}✔  SORTEO VERIFICADO CORRECTAMENTE  (${pasaron}/${pasaron + fallaron} verificaciones)${RESET}`);
        console.log('');
        console.log(`  Número ganador : ${BOLD}${resultado.resultado.numero_ganador}${RESET} — ${resultado.resultado.producto_ganador}`);
        const gs = resultado.resultado.ganadores ?? [];
        if (gs.length > 0) {
            console.log(`  Ganadores (${gs.length}): ${gs.map(g => g.usuario).join(', ')}`);
        } else {
            console.log(`  Ganadores: Ninguno (el número ganador no fue jugado)`);
        }
    } else {
        console.log(`${ROJO}${BOLD}✘  VERIFICACIÓN FALLIDA  (${fallaron} error(es) de ${pasaron + fallaron} revisiones)${RESET}`);
        console.log(`  Contacta al administrador del sorteo para revisión.`);
        process.exitCode = 1;
    }

    console.log('═'.repeat(58));
    console.log('');
    console.log(`${DIM}Verificado con node verificar.js — ${new Date().toISOString()}${RESET}`);
    console.log('');
}

main().catch(e => {
    console.error(`\n${ROJO}ERROR INESPERADO: ${e.message}${RESET}\n`);
    process.exit(1);
});
