#!/usr/bin/env node
/**
 * verificar.js — Script de verificación independiente
 * ─────────────────────────────────────────────────────
 * Requisitos: Node.js 18+   (fetch y crypto nativos, sin instalaciones)
 * Uso       : node verificar.js
 *
 * Este script lee resultado.json del mismo directorio y verifica:
 *   1. Que el beacon drand corresponde a la ronda comprometida
 *   2. Que el hash SHA-256 de participantes coincide
 *   3. Que el número ganador se obtiene aplicando el algoritmo documentado
 */

import { createHash } from 'crypto';
import { readFile }   from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VERDE = '\x1b[32m';
const ROJO  = '\x1b[31m';
const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';

function ok(msg)   { console.log(`  ${VERDE}✔${RESET} ${msg}`); }
function fail(msg) { console.log(`  ${ROJO}✘${RESET} ${msg}`); }
function info(msg) { console.log(`  ℹ ${msg}`); }

async function fetchBeacon(ronda, endpoints) {
    for (const base of endpoints) {
        try {
            const url = `${base}/public/${ronda}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
            if (res.ok) return await res.json();
        } catch (_) { continue; }
    }
    throw new Error(`No se pudo obtener beacon ronda ${ronda}`);
}

function calcularHash(textoHasheado) {
    return createHash('sha256').update(textoHasheado, 'utf8').digest('hex');
}

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
        .join('
');
}

async function main() {
    console.log('');
    console.log(`${BOLD}══════ VERIFICADOR INDEPENDIENTE — El Chancho Ganador ══════${RESET}`);
    console.log('');

    // ── Cargar resultado.json ────────────────────────────────────────────────
    let resultado;
    try {
        const raw = await readFile(path.join(__dirname, 'resultado.json'), 'utf8');
        resultado = JSON.parse(raw);
    } catch (e) {
        console.error(`${ROJO}ERROR: No se encontró resultado.json en ${__dirname}${RESET}`);
        process.exit(1);
    }

    console.log(`Sorteo : ${resultado.sorteo.titulo}`);
    console.log(`Fecha  : ${resultado.horario.fecha_vet}  ${resultado.horario.hora_vet} (VET)`);
    console.log(`Empresa: ${resultado.empresa.nombre}  [${resultado.empresa.rif}]`);
    console.log('');

    let errores = 0;

    // ── Verificación 1: beacon drand ─────────────────────────────────────────
    console.log(`${BOLD}[1/3] Verificando beacon drand ronda ${resultado.drand.ronda}...${RESET}`);
    const endpoints = [resultado.drand.endpoint_usado, ...(resultado.drand.endpoints_alternos ?? [])].filter(Boolean);
    let beacon;
    try {
        beacon = await fetchBeacon(resultado.drand.ronda, endpoints);
        if (beacon.randomness === resultado.drand.randomness) {
            ok(`Randomness coincide: ${beacon.randomness.slice(0, 16)}...`);
        } else {
            fail(`Randomness NO coincide`);
            info(`  Esperado: ${resultado.drand.randomness.slice(0, 16)}...`);
            info(`  Obtenido: ${beacon.randomness.slice(0, 16)}...`);
            errores++;
        }
    } catch (e) {
        fail(`No se pudo contactar drand: ${e.message}`);
        info(`Intenta manualmente: ${endpoints[0]}`);
        errores++;
    }
    console.log('');

    // ── Verificación 2: hash participantes ───────────────────────────────────
    console.log(`${BOLD}[2/3] Verificando integridad de participantes (SHA-256)...${RESET}`);
    const hashRecalculado = calcularHash(resultado.participantes.texto_hasheado);
    if (hashRecalculado === resultado.participantes.hash_sha256) {
        ok(`Hash SHA-256 coincide: ${hashRecalculado.slice(0, 16)}...`);
        info(`Total participantes: ${resultado.participantes.total}`);
    } else {
        fail(`Hash SHA-256 NO coincide — la lista de participantes fue alterada`);
        info(`  Esperado: ${resultado.participantes.hash_sha256}`);
        info(`  Calculado: ${hashRecalculado}`);
        errores++;
    }
    console.log('');

    // ── Verificación 3: algoritmo ganador ────────────────────────────────────
    console.log(`${BOLD}[3/3] Verificando algoritmo de selección...${RESET}`);
    const randomnessBase = beacon?.randomness ?? resultado.drand.randomness;
    const randomness = resultado.entropia?.randomness_sorteo ?? randomnessBase;
    const numeros = resultado.calculo.todos_numeros;
    const hashPart = resultado.participantes.hash_sha256;
    const hashClimaCalc = calcularHash(climaTexto(resultado.entropia?.clima?.snapshot_ciudades ?? []));
    const fib = fibonacciHex(randomness);
    const qrngSegmento = resultado.entropia?.qrng?.hex ?? 'QRNG_NO_DISPONIBLE';
    const semillaCalc = createHash('sha256')
        .update(`${randomness}|${hashPart}|${hashClimaCalc}|${fib.hex}|${resultado.drand.ronda}|${resultado.entropia.contexto_sorteo}|${qrngSegmento}`, 'utf8')
        .digest('hex');
    const bigRand = BigInt('0x' + semillaCalc);
    const idx = Number(bigRand % BigInt(numeros.length));
    const numCalc = numeros[idx];

    info(`Operación: BigInt("0x${semillaCalc.slice(0,8)}...") % ${numeros.length} = índice ${idx}`);

    if (numCalc === resultado.resultado.numero_ganador) {
        ok(`Número ganador correcto: ${numCalc} (${resultado.resultado.producto_ganador})`);
    } else {
        fail(`Número ganador NO coincide`);
        info(`  Esperado : ${resultado.resultado.numero_ganador}`);
        info(`  Calculado: ${numCalc}`);
        errores++;
    }
    console.log('');

    // ── Resultado final ──────────────────────────────────────────────────────
    console.log('─'.repeat(57));
    if (errores === 0) {
        console.log(`${VERDE}${BOLD}✔ SORTEO VERIFICADO CORRECTAMENTE${RESET}`);
        console.log(`  Número ganador : ${resultado.resultado.numero_ganador} — ${resultado.resultado.producto_ganador}`);
        const gs = resultado.resultado.ganadores;
        console.log(`  Ganadores      : ${gs.length > 0 ? gs.map(g => g.usuario).join(', ') : 'Ninguno (número no fue jugado)'}`);
    } else {
        console.log(`${ROJO}${BOLD}✘ FALLÓ LA VERIFICACIÓN (${errores} error(es))${RESET}`);
        process.exitCode = 1;
    }
    console.log('─'.repeat(57));
    console.log('');
}

main().catch(e => { console.error(e); process.exit(1); });
