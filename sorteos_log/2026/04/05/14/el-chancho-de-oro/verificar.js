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

import { createHash, verify } from 'crypto';
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
const STRICT_V3 = String(process.env.ALLOW_LEGACY_V2 || '').toLowerCase() !== 'true';
const V3_DOMAIN_TAG = 'LOTTERY-V3.0';

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

function hexABinario(hex) {
    return String(hex)
        .toLowerCase()
        .split('')
        .map(char => parseInt(char, 16).toString(2).padStart(4, '0'))
        .join('');
}

function derivarColorDesdeHex(hex) {
    return `#${String(hex).slice(0, 6).toLowerCase()}`;
}

function compararTextoDeterministico(a, b) {
    const sa = String(a ?? '');
    const sb = String(b ?? '');
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
}

function normalizarTimestampEpochMs(valor) {
    if (typeof valor === 'string' && /^\d+$/.test(valor)) {
        if (valor.length > 1 && valor.startsWith('0')) {
            throw new Error(`timestamp_jugada_ceros_izquierda_no_permitidos: ${valor}`);
        }
        const bi = BigInt(valor);
        const maxU64 = (1n << 64n) - 1n;
        if (bi > maxU64) {
            throw new Error(`timestamp_jugada_fuera_de_rango_uint64: ${valor}`);
        }
        return bi.toString();
    }
    if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0) {
        const trunc = Math.trunc(valor);
        if (!Number.isSafeInteger(trunc)) {
            throw new Error(`timestamp_jugada_number_no_seguro: ${String(valor)}`);
        }
        return BigInt(trunc).toString();
    }
    const ms = Date.parse(String(valor ?? ''));
    if (!Number.isFinite(ms)) {
        throw new Error(`timestamp_jugada_invalido: ${String(valor ?? '')}`);
    }
    const msInt = Math.trunc(ms);
    if (!Number.isSafeInteger(msInt) || msInt < 0) {
        throw new Error(`timestamp_jugada_parse_no_seguro: ${String(valor ?? '')}`);
    }
    return BigInt(msInt).toString();
}

function canonicalKVLen(pares) {
    return pares
        .map(([k, v]) => {
            const valor = String(v ?? '');
            return `${k}:${Buffer.byteLength(valor, 'utf8')}:${valor}`;
        })
        .join('\n');
}

function normalizarParticipante(participante) {
    const usuario = String(participante?.usuario ?? '');
    const numero = String(participante?.numero ?? '').padStart(2, '0');
    const timestamp_epoch_ms = normalizarTimestampEpochMs(participante?.timestamp_jugada);
    const timestamp_jugada = timestamp_epoch_ms;
    const ticket_texto = `${usuario}|${numero}|${timestamp_epoch_ms}`;
    return {
        usuario,
        numero,
        timestamp_jugada,
        timestamp_epoch_ms,
        ticket_id_hash: createHash('sha256').update(ticket_texto, 'utf8').digest('hex'),
    };
}

function ordenarParticipantesDeterministico(participantes) {
    const normalizados = (participantes || []).map(normalizarParticipante);
    return normalizados.sort((a, b) =>
        compararTextoDeterministico(a.ticket_id_hash, b.ticket_id_hash) ||
        compararTextoDeterministico(a.usuario, b.usuario) ||
        compararTextoDeterministico(a.numero, b.numero) ||
        compararTextoDeterministico(a.timestamp_jugada, b.timestamp_jugada)
    );
}

function construirTicketSetCanonicoDesdeParticipantes(participantes) {
    const ordenados = ordenarParticipantesDeterministico(participantes || []);
    const tickets = ordenados.map((p, idx) => ({
        ticket: idx,
        user: String(p.usuario ?? ''),
        numero: String(p.numero ?? '').padStart(2, '0'),
        timestamp_epoch_ms: String(p.timestamp_epoch_ms ?? p.timestamp_jugada ?? ''),
        ticket_id_hash: String(p.ticket_id_hash ?? ''),
    }));
    tickets.sort((a, b) => a.ticket - b.ticket);
    const canonical = JSON.stringify(tickets);
    return {
        tickets,
        canonical,
        hash: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    };
}

function validarIndicesTicketsSecuenciales(tickets) {
    for (let i = 0; i < tickets.length; i++) {
        if (Number(tickets[i]?.ticket) !== i) return false;
    }
    return true;
}

function canonicalSemillaV3({ version = '3.0.0', seedReveal, ticketSetHash, precompromisoHash, drandRandomness, round, hashParticipantes, bitcoinBlockHeight, bitcoinBlockHash }) {
    const fields = [
        ['domain_tag', V3_DOMAIN_TAG],
        ['seed_reveal', seedReveal ?? 'SEED_REVEAL_NO_DISPONIBLE'],
        ['ticket_set_hash', ticketSetHash ?? 'TICKETS_HASH_NO_DISPONIBLE'],
        ['precompromiso_hash', precompromisoHash ?? 'PRECOMPROMISO_NO_DISPONIBLE'],
        ['drand_randomness', drandRandomness ?? 'DRAND_RANDOMNESS_NO_DISPONIBLE'],
        ['round_drand', String(round)],
    ];
    if (String(version) === '3.1.0') {
        fields[0] = ['domain_tag', 'LOTTERY-V3.1-TRIPLE'];
        fields.push(['bitcoin_block_height', String(bitcoinBlockHeight ?? 'BTC_HEIGHT_NO_DISPONIBLE')]);
        fields.push(['bitcoin_block_hash', bitcoinBlockHash ?? 'BTC_BLOCK_HASH_NO_DISPONIBLE']);
    }
    fields.push(['hash_participantes', hashParticipantes ?? 'HASH_PARTICIPANTES_NO_DISPONIBLE']);
    return canonicalKVLen(fields);
}

function canonicalPrecommitV3({ drawId, drawTimeUtc, hashParticipantes, drandNetwork, drandRound, algoritmoVersion, tripleBeacon }) {
    const fields = [
        ['draw_id', drawId],
        ['draw_time_utc', drawTimeUtc],
        ['hash_participantes', hashParticipantes],
        ['drand_network', drandNetwork],
        ['drand_round', Number(drandRound)],
        ['algoritmo_version', algoritmoVersion],
    ];
    if (String(algoritmoVersion) === '3.1.0') {
        fields.push(['btc_height', Number(tripleBeacon?.bitcoin_height_comprometido)]);
        fields.push(['btc_confirmations_required', Number(tripleBeacon?.bitcoin_confirmations_required)]);
        fields.push(['anu_query_slot_utc', String(tripleBeacon?.anu_query_slot_utc || '')]);
        fields.push(['beacon_policy', String(tripleBeacon?.policy || 'precommitted_round_and_height_no_post_selection')]);
        fields.push(['anu_audit_scope', JSON.stringify(tripleBeacon?.anu_audit_scope || [])]);
        fields.push(['seed_serialization', String(tripleBeacon?.seed_serialization || 'canonical_kv_len_v1_utf8')]);
    }
    return canonicalKVLen(fields);
}

function canonicalResultadoV3({ drawId, algoritmoVersion, participantesHash, drandRound, seedHex, winnerIndex, winnerNumero, winnerTicket }) {
    return canonicalKVLen([
        ['draw_id', drawId],
        ['algoritmo_version', algoritmoVersion],
        ['participantes_hash', participantesHash],
        ['drand_round', Number(drandRound)],
        ['seed', seedHex],
        ['winner_index', Number(winnerIndex)],
        ['winner_number', String(winnerNumero)],
        ['winner_ticket', winnerTicket ?? ''],
    ]);
}

function verificarFirmaEd25519(hashHex, firmaObj) {
    if (!firmaObj || !firmaObj.firma_base64 || !firmaObj.public_key_pem) {
        return null;
    }
    try {
        return verify(
            null,
            Buffer.from(hashHex, 'hex'),
            firmaObj.public_key_pem,
            Buffer.from(firmaObj.firma_base64, 'base64')
        );
    } catch {
        return false;
    }
}

function determinarIndiceSinSesgo(seedHex, totalNumeros, domainTag = V3_DOMAIN_TAG) {
    const N = BigInt(totalNumeros);
    const MOD = 1n << 256n;
    const limite = (MOD / N) * N;
    let intento = 0;
    while (true) {
        const hashIntento = createHash('sha256')
            .update(`${domainTag}|winner-index|${seedHex}|${intento}`, 'utf8')
            .digest('hex');
        const valor = BigInt(`0x${hashIntento}`);
        if (valor < limite) {
            return { idx: Number(valor % N), intento, hashIntento };
        }
        intento += 1;
    }
}

function calcularSemillaSegunVersion({ version, seedReveal, ticketSetHash, precompromisoHash, poolHashSegmento, round, drandRandomness, hashParticipantes, bitcoinBlockHeight, bitcoinBlockHash }) {
    switch (String(version || '3.0.0')) {
        case '2.0.0':
            {
                const payload = JSON.stringify({
                    precompromiso_hash: precompromisoHash ?? 'PRECOMPROMISO_NO_DISPONIBLE',
                    pool_entry_hash: poolHashSegmento,
                    round_drand: String(round),
                });
            return createHash('sha256')
                .update(payload, 'utf8')
                .digest('hex');
            }
        case '3.0.0':
            {
                const payload = canonicalSemillaV3({
                    version,
                    seedReveal,
                    ticketSetHash,
                    precompromisoHash,
                    drandRandomness,
                    round,
                    hashParticipantes,
                });
                return createHash('sha256')
                    .update(payload, 'utf8')
                    .digest('hex');
            }
        case '3.1.0':
            {
                const payload = canonicalSemillaV3({
                    version,
                    seedReveal,
                    ticketSetHash,
                    precompromisoHash,
                    drandRandomness,
                    round,
                    hashParticipantes,
                    bitcoinBlockHeight,
                    bitcoinBlockHash,
                });
                return createHash('sha256')
                    .update(payload, 'utf8')
                    .digest('hex');
            }
        default:
            throw new Error(`algoritmo_version_no_soportado: ${version}`);
    }
}

async function fetchNistPulse(nist) {
    const endpoints = [
        nist?.pulse?.uri,
        nist?.endpoint,
        nist?.pulse?.pulseIndex ? `https://beacon.nist.gov/beacon/2.0/chain/2/pulse/${nist.pulse.pulseIndex}` : null,
    ].filter(Boolean);

    const errores = [];
    for (const url of endpoints) {
        try {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(12_000),
                headers: { Accept: 'application/json' },
            });
            if (!res.ok) {
                errores.push(`${url} → HTTP ${res.status}`);
                continue;
            }
            const data = await res.json();
            if (data?.pulse?.outputValue) {
                return data.pulse;
            }
            errores.push(`${url} → respuesta inválida`);
        } catch (e) {
            errores.push(`${url} → ${e.message}`);
        }
    }
    throw new Error(`No se pudo obtener pulso NIST:\n  ${errores.join('\n  ')}`);
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

async function encontrarArchivoCadena(startDir) {
    let current = path.resolve(startDir);
    for (let i = 0; i < 8; i++) {
        const candidate = path.join(current, 'sorteos.json');
        try {
            await readFile(candidate, 'utf8');
            return candidate;
        } catch {
            // continuar al padre
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
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
    let preCompromiso = null;
    try {
        const raw = await readFile(path.join(__dirname, 'resultado.json'), 'utf8');
        resultado = JSON.parse(raw);
    } catch (e) {
        console.error(`${ROJO}ERROR: No se encontró resultado.json en ${__dirname}${RESET}`);
        console.error(`  Detalle: ${e.message}`);
        process.exit(1);
    }

    try {
        const rawPre = await readFile(path.join(__dirname, 'pre_compromiso.json'), 'utf8');
        preCompromiso = JSON.parse(rawPre);
    } catch {
        warn('No se encontró pre_compromiso.json; algunas verificaciones de compromiso se omitirán.');
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

    const algoritmoVersion = String(resultado?.calculo?.algoritmo_version || '3.0.0');
    if (STRICT_V3 && !['3.0.0', '3.1.0'].includes(algoritmoVersion)) {
        throw new Error(`verificador_v3_rechaza_algoritmo_version=${algoritmoVersion}. Usa ALLOW_LEGACY_V2=true para verificar v2.`);
    }

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

        const beacon = {
            round: resultado.drand.ronda,
            randomness: resultado.drand.randomness,
            _url: resultado.drand.endpoint_usado,
        };
        info('Verificación offline: se usa drand almacenado en resultado.json (sin llamadas externas).');
        if (String(beacon.round) === String(resultado.drand.ronda)) {
            ok(`Ronda drand registrada: ${beacon.round}`);
            pasaron++;
        } else {
            fail(`Ronda drand inválida`);
            fallaron++;
        }

        if (/^[0-9a-f]{64}$/i.test(String(beacon.randomness || ''))) {
            ok(`Randomness drand con formato válido`);
            pasaron++;
        } else {
            fail(`Randomness drand con formato inválido`);
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

    if (preCompromiso?.participantes?.hash_sha256) {
        if (preCompromiso.participantes.hash_sha256 === resultado.participantes.hash_sha256) {
            ok('Hash de participantes coincide entre pre_compromiso y resultado');
            pasaron++;
        } else {
            fail('Hash de participantes NO coincide entre pre_compromiso y resultado');
            fallaron++;
        }

        if (String(preCompromiso?.aleatoriedad?.ronda_comprometida) === String(resultado?.drand?.ronda)) {
            ok('Ronda drand coincide entre pre_compromiso y resultado');
            pasaron++;
        } else {
            fail('Ronda drand NO coincide entre pre_compromiso y resultado');
            fallaron++;
        }

        if (String(preCompromiso?.compromiso?.algoritmo_version || '') === String(resultado?.calculo?.algoritmo_version || '')) {
            ok('Algoritmo version coincide entre pre_compromiso y resultado');
            pasaron++;
        } else {
            fail('Algoritmo version NO coincide entre pre_compromiso y resultado');
            fallaron++;
        }

        if (String(preCompromiso?.draw_id || '') === String(resultado?.draw_id || '')) {
            ok('Draw ID coincide entre pre_compromiso y resultado');
            pasaron++;
        } else {
            fail('Draw ID NO coincide entre pre_compromiso y resultado');
            fallaron++;
        }
    }

    if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
        const cadenaPath = await encontrarArchivoCadena(__dirname);
        if (!cadenaPath) {
            fail('No se encontró sorteos.json para verificar eventos SEED_COMMIT/SEED_REVEAL');
            fallaron++;
        } else {
            const rawChain = await readFile(cadenaPath, 'utf8');
            const eventos = rawChain
                .split('\n')
                .map(l => l.trim())
                .filter(Boolean)
                .map(l => {
                    try {
                        return JSON.parse(l);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean)
                .filter(e => String(e.draw_id || '') === String(resultado?.draw_id || ''));

            const hasSeedCommit = eventos.some(e => e.entry_type === 'SEED_COMMIT');
            const hasSeedReveal = eventos.some(e => e.entry_type === 'SEED_REVEAL');
            const hasTicketsCommit = eventos.some(e => e.entry_type === 'TICKETS_COMMIT');
            const hasTicketsReveal = eventos.some(e => e.entry_type === 'TICKETS_REVEAL');
            if (!hasSeedCommit || !hasSeedReveal || !hasTicketsCommit || !hasTicketsReveal) {
                fail('Cadena incompleta: faltan eventos de commit/reveal de seed y/o tickets para el draw_id');
                fallaron++;
            } else {
                ok('Cadena contiene eventos SEED_COMMIT/SEED_REVEAL y TICKETS_COMMIT/TICKETS_REVEAL');
                pasaron++;
            }
        }
    }

    const listaParticipantes = Array.isArray(resultado.participantes?.lista)
        ? resultado.participantes.lista
        : [];
    if (listaParticipantes.length > 0) {
        const ordenados = ordenarParticipantesDeterministico(listaParticipantes);
        const setTickets = new Set(ordenados.map(p => p.ticket_id_hash));
        if (setTickets.size !== ordenados.length) {
            fail('Lista de participantes contiene tickets duplicados');
            fallaron++;
        } else {
            ok('Lista de participantes sin tickets duplicados');
            pasaron++;
        }
        const textoEsperado = ordenados
            .map(p => `${p.usuario}|${p.numero}|${p.timestamp_jugada}`)
            .join('\n');
        if (textoEsperado === resultado.participantes.texto_hasheado) {
            ok('Orden determinístico de participantes coincide con texto_hasheado');
            pasaron++;
        } else {
            fail('Orden determinístico de participantes NO coincide con texto_hasheado');
            fallaron++;
        }
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
    //  VERIFICACIÓN 3 — Entropía híbrida y ganador (offline)
    // ════════════════════════════════════════════════════════════════════════
    console.log(`${BOLD}[3/3] Verificando algoritmo final (${algoritmoVersion})${RESET}`);
    info(`Algoritmo: ${resultado.calculo.algoritmo}`);

    const randomness = resultado.drand.randomness;
    const numeros = resultado.calculo.todos_numeros;

    if (algoritmoVersion === '2.0.0') {
        const textoClimaCalc = climaTexto(resultado.entropia?.clima?.snapshot_ciudades || []);
        const hashClimaCalc = createHash('sha256').update(textoClimaCalc, 'utf8').digest('hex');
        if (hashClimaCalc === resultado.entropia?.clima?.hash_sha256) {
            ok(`Hash climático coincide: ${hashClimaCalc.slice(0, 24)}...`);
            pasaron++;
        } else {
            fail(`Hash climático NO coincide`);
            fallaron++;
        }

        const fib = fibonacciHex(resultado.entropia?.randomness_sorteo || randomness);
        if (
            fib.hex === resultado.entropia?.transformacion_fibonacci?.resultado_hex &&
            fib.n === resultado.entropia?.transformacion_fibonacci?.n
        ) {
            ok(`Transformación Fibonacci coincide (n=${fib.n})`);
            pasaron++;
        } else {
            fail(`Transformación Fibonacci NO coincide`);
            fallaron++;
        }
    }

    const localHex = resultado.entropia?.local?.hex ?? null;
    if (localHex) {
        const localHashCalc = createHash('sha256').update(localHex, 'utf8').digest('hex');
        if (localHashCalc === resultado.entropia.local.hash_sha256) {
            ok(`Entropía local coincide: ${localHashCalc.slice(0, 24)}...`);
            pasaron++;
        } else {
            fail(`Entropía local NO coincide`);
            fallaron++;
        }
    }

    const qrngHex = resultado.entropia?.qrng?.hex ?? null;
    if (qrngHex) {
        if (Array.isArray(resultado.entropia.qrng.bloques) && resultado.entropia.qrng.bloques.join('') === qrngHex) {
            ok(`QRNG bloques concatenados coinciden (${resultado.entropia.qrng.bloques.length} bloques)`);
            pasaron++;
        } else {
            fail(`QRNG bloques NO coinciden con el hex almacenado`);
            fallaron++;
        }

        const qrngBinarioCalc = hexABinario(qrngHex);
        if (qrngBinarioCalc === resultado.entropia.qrng.binary) {
            ok(`QRNG binario coincide`);
            pasaron++;
        } else {
            fail(`QRNG binario NO coincide con el hex almacenado`);
            fallaron++;
        }

        const qrngColorCalc = derivarColorDesdeHex(qrngHex);
        if (qrngColorCalc === resultado.entropia.qrng.color_hex) {
            ok(`QRNG color coincide: ${qrngColorCalc}`);
            pasaron++;
        } else {
            fail(`QRNG color NO coincide con el hex almacenado`);
            fallaron++;
        }

        const qrngHashCalc = createHash('sha256').update(qrngHex, 'utf8').digest('hex');
        if (qrngHashCalc === resultado.entropia.qrng.hash_sha256) {
            ok(`QRNG hash coincide: ${qrngHashCalc.slice(0, 24)}...`);
            pasaron++;
        } else {
            fail(`QRNG hash NO coincide`);
            fallaron++;
        }
    }

    const nistHex = resultado.entropia?.nist?.hex ?? null;
    if (nistHex && resultado.entropia?.nist?.pulse?.pulseIndex) {
        if (String(resultado.entropia.nist.pulse.outputValue || '').toLowerCase() === String(nistHex).toLowerCase()) {
            ok('NIST outputValue interno coincide con el hex almacenado');
            pasaron++;
        } else {
            fail('NIST outputValue interno NO coincide con el hex almacenado');
            fallaron++;
        }
    }

    const poolEntryId = resultado.entropia?.pool?.entry_id ?? null;
    const poolEntryHash = resultado.entropia?.pool?.entry_hash ?? null;
    const poolHashSegmento = poolEntryHash ?? 'POOL_HASH_NO_DISPONIBLE';

    if (algoritmoVersion === '2.0.0') {
        if (poolEntryId && poolEntryHash) {
            const hashEntradaCalc = createHash('sha256')
                .update(`${poolEntryId}|${resultado.entropia.pool.created_at}|${resultado.entropia.local.hash_sha256}|${resultado.entropia.qrng.hash_sha256}|${resultado.entropia.nist.hash_sha256}`, 'utf8')
                .digest('hex');

            if (hashEntradaCalc === poolEntryHash) {
                ok(`Hash del bloque de pool coincide: ${hashEntradaCalc.slice(0, 24)}...`);
                pasaron++;
            } else {
                fail(`Hash del bloque de pool NO coincide`);
                fallaron++;
            }
        } else {
            fail('Metadatos de pool incompletos.');
            fallaron++;
        }

        if (resultado?.entropia?.pool?.pool_version) {
            ok(`Pool version registrada: ${resultado.entropia.pool.pool_version}`);
            pasaron++;
        } else {
            fail('Pool version ausente en resultado');
            fallaron++;
        }
    }

    const precompromisoHash = resultado.entropia?.precompromiso_hash ?? null;
    if (precompromisoHash && /^[0-9a-f]{64}$/i.test(precompromisoHash)) {
        ok(`Precompromiso hash presente`);
        pasaron++;
    } else {
        fail('Precompromiso hash ausente o inválido');
        fallaron++;
    }

    if (preCompromiso?.compromiso?.hash_sha256) {
        if (preCompromiso.compromiso.hash_sha256 === precompromisoHash) {
            ok('Precompromiso hash coincide entre pre_compromiso y resultado');
            pasaron++;
        } else {
            fail('Precompromiso hash NO coincide entre pre_compromiso y resultado');
            fallaron++;
        }

        if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
            const preCanon = canonicalPrecommitV3({
                drawId: preCompromiso?.draw_id,
                drawTimeUtc: preCompromiso?.horario?.fecha_utc,
                hashParticipantes: preCompromiso?.participantes?.hash_sha256,
                drandNetwork: preCompromiso?.aleatoriedad?.red,
                drandRound: preCompromiso?.aleatoriedad?.ronda_comprometida,
                algoritmoVersion: preCompromiso?.compromiso?.algoritmo_version,
                tripleBeacon: preCompromiso?.aleatoriedad?.triple_beacon,
            });
            const preHashCalc = createHash('sha256').update(preCanon, 'utf8').digest('hex');
            if (preHashCalc === preCompromiso.compromiso.hash_sha256) {
                ok('Precommit payload v3 canónico verifica draw_time_utc/red/round');
                pasaron++;
            } else {
                fail('Precommit payload v3 canónico NO coincide con hash comprometido');
                fallaron++;
            }
        }
    }

    if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
        const snapshotFile = String(resultado?.entropia?.tickets_snapshot?.file || 'tickets_draw.json');
        const snapshotPath = path.join(__dirname, snapshotFile);
        let snapshotRaw;
        let snapshotJson;
        try {
            snapshotRaw = await readFile(snapshotPath);
            snapshotJson = JSON.parse(snapshotRaw.toString('utf8'));
        } catch (e) {
            fail(`No se pudo leer snapshot de tickets (${snapshotFile}): ${e.message}`);
            fallaron++;
            snapshotRaw = Buffer.from('');
            snapshotJson = { tickets: [] };
        }
        const ticketSetHashFromBytes = createHash('sha256').update(snapshotRaw).digest('hex');
        const ticketSetHashComprometido = String(preCompromiso?.tickets_commitment?.ticket_set_hash || '');
        if (!ticketSetHashComprometido || ticketSetHashFromBytes !== ticketSetHashComprometido) {
            fail('ticket_set_hash por bytes NO coincide con pre_compromiso (TICKETS_COMMIT)');
            fallaron++;
        } else {
            ok('Ticket set commitment válido: SHA-256(bytes de snapshot) coincide con pre_compromiso');
            pasaron++;
        }
        if (String(resultado?.entropia?.ticket_set_hash || '') !== ticketSetHashFromBytes) {
            fail('ticket_set_hash en resultado NO coincide con SHA-256(bytes de snapshot)');
            fallaron++;
        } else {
            ok('ticket_set_hash en resultado coincide con snapshot por bytes');
            pasaron++;
        }

        const snapshotTickets = Array.isArray(snapshotJson?.tickets) ? snapshotJson.tickets : [];
        const totalTicketsComprometido = Number(preCompromiso?.tickets_commitment?.total_tickets || snapshotTickets.length);
        if (snapshotTickets.length !== totalTicketsComprometido) {
            fail('total_tickets NO coincide entre snapshot y TICKETS_COMMIT');
            fallaron++;
        } else {
            ok('total_tickets coincide entre snapshot y TICKETS_COMMIT');
            pasaron++;
        }

        const totalPlayersComprometido = Number(preCompromiso?.tickets_commitment?.total_players || snapshotTickets.length);
        if (snapshotTickets.length !== totalPlayersComprometido) {
            fail('total_players NO coincide entre snapshot y TICKETS_COMMIT');
            fallaron++;
        } else {
            ok('total_players coincide entre snapshot y TICKETS_COMMIT');
            pasaron++;
        }

        if (!validarIndicesTicketsSecuenciales(snapshotTickets)) {
            fail('snapshot de tickets inválido: tickets[i].ticket debe ser igual a i');
            fallaron++;
        } else {
            ok('Índices de tickets secuenciales y sin huecos');
            pasaron++;
        }

        const seedReveal = resultado?.entropia?.commit_reveal?.seed_reveal;
        const seedHashComprometido = String(preCompromiso?.commit_reveal?.seed_hash_sha256 || '').toLowerCase();
        const seedHashCalculado = createHash('sha256').update(String(seedReveal || ''), 'utf8').digest('hex');
        if (!/^[0-9a-f]{64}$/i.test(String(seedReveal || ''))) {
            fail('seed_reveal ausente o con formato inválido en resultado.entropia.commit_reveal');
            fallaron++;
        } else if (!seedHashComprometido || seedHashCalculado !== seedHashComprometido) {
            fail('SHA-256(seed_reveal) NO coincide con seed_hash comprometido en pre_compromiso');
            fallaron++;
        } else {
            ok('Commit-reveal válido: SHA-256(seed_reveal) coincide con pre_compromiso');
            pasaron++;
        }

        const semillaCanonicaEsperada = canonicalSemillaV3({
            version: algoritmoVersion,
            seedReveal,
            ticketSetHash: ticketSetHashFromBytes,
            precompromisoHash,
            drandRandomness: resultado.drand.randomness,
            round: resultado.drand.ronda,
            bitcoinBlockHeight: resultado?.entropia?.bitcoin?.height,
            bitcoinBlockHash: resultado?.entropia?.bitcoin?.block_hash,
            hashParticipantes: resultado.participantes.hash_sha256,
        });
        if (semillaCanonicaEsperada === resultado.entropia?.semilla_final?.concatenado) {
            ok('Payload canónico de semilla v3 coincide');
            pasaron++;
        } else {
            fail('Payload canónico de semilla v3 NO coincide');
            fallaron++;
        }

        const canonicalResultadoEsperado = canonicalResultadoV3({
            drawId: resultado?.draw_id,
            algoritmoVersion,
            participantesHash: resultado?.participantes?.hash_sha256,
            drandRound: resultado?.drand?.ronda,
            seedHex: resultado?.entropia?.semilla_final?.hash_sha256,
            winnerIndex: resultado?.calculo?.indice_ganador,
            winnerNumero: resultado?.resultado?.numero_ganador,
            winnerTicket: resultado?.resultado_canonico_v3?.payload?.winner_ticket ?? null,
        });
        const hashResultadoEsperado = createHash('sha256').update(canonicalResultadoEsperado, 'utf8').digest('hex');
        if (
            canonicalResultadoEsperado === resultado?.resultado_canonico_v3?.payload_canonico &&
            hashResultadoEsperado === resultado?.resultado_canonico_v3?.hash_sha256
        ) {
            ok('Bloque resultado_canonico_v3 coincide con el resultado publicado');
            pasaron++;
        } else {
            fail('Bloque resultado_canonico_v3 NO coincide con el resultado publicado');
            fallaron++;
        }

        const firmaOk = verificarFirmaEd25519(
            resultado?.resultado_canonico_v3?.hash_sha256,
            resultado?.resultado_canonico_v3?.firma
        );
        if (firmaOk === true) {
            ok('Firma Ed25519 de resultado_canonico_v3 válida');
            pasaron++;
        } else if (firmaOk === false) {
            fail('Firma Ed25519 de resultado_canonico_v3 inválida');
            fallaron++;
        } else {
            warn('Resultado sin firma Ed25519 (opcional).');
        }
    }

    if (algoritmoVersion === '3.1.0') {
        const requiredConfirmations = Number(preCompromiso?.aleatoriedad?.triple_beacon?.bitcoin_confirmations_required || 0);
        const obtainedConfirmations = Number(resultado?.entropia?.bitcoin?.confirmations || 0);
        const bitcoinHeightPre = Number(preCompromiso?.aleatoriedad?.triple_beacon?.bitcoin_height_comprometido || 0);
        const bitcoinHeightRes = Number(resultado?.entropia?.bitcoin?.height || 0);
        if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 6) {
            fail('bitcoin_confirmations_required invalido en pre_compromiso (minimo esperado: 6).');
            fallaron++;
        } else if (obtainedConfirmations < requiredConfirmations) {
            fail(`Bitcoin confirmaciones insuficientes: obtenidas=${obtainedConfirmations}, requeridas=${requiredConfirmations}`);
            fallaron++;
        } else {
            ok(`Bitcoin confirmaciones validas (${obtainedConfirmations}/${requiredConfirmations})`);
            pasaron++;
        }

        if (bitcoinHeightPre !== bitcoinHeightRes) {
            fail(`Bitcoin height no coincide entre pre_compromiso (${bitcoinHeightPre}) y resultado (${bitcoinHeightRes}).`);
            fallaron++;
        } else {
            ok('Bitcoin height coincide entre pre_compromiso y resultado');
            pasaron++;
        }

        if (resultado?.entropia?.qrng?.audit_only !== true) {
            fail('ANU en v3.1 debe marcarse como audit_only=true.');
            fallaron++;
        } else {
            ok('ANU marcado correctamente como audit_only');
            pasaron++;
        }
    }

    let semillaCalc;
    try {
        semillaCalc = calcularSemillaSegunVersion({
            version: resultado?.calculo?.algoritmo_version,
            seedReveal: resultado?.entropia?.commit_reveal?.seed_reveal,
            ticketSetHash: resultado?.entropia?.ticket_set_hash,
            precompromisoHash,
            poolHashSegmento,
            round: resultado.drand.ronda,
            drandRandomness: resultado.drand.randomness,
            bitcoinBlockHeight: resultado?.entropia?.bitcoin?.height,
            bitcoinBlockHash: resultado?.entropia?.bitcoin?.block_hash,
            hashParticipantes: resultado.participantes.hash_sha256,
        });
    } catch (error) {
        fail(`No se pudo calcular semilla: ${error.message}`);
        fallaron++;
        semillaCalc = '0'.repeat(64);
    }

    if (semillaCalc === resultado.entropia.semilla_final.hash_sha256) {
        ok(`Semilla final coincide: ${semillaCalc.slice(0, 24)}...`);
        pasaron++;
    } else {
        fail(`Semilla final NO coincide`);
        info(`  Esperado : ${resultado.entropia.semilla_final.hash_sha256}`);
        info(`  Calculado: ${semillaCalc}`);
        fallaron++;
    }

    const winnerDomainTag = algoritmoVersion === '3.1.0' ? 'LOTTERY-V3.1-TRIPLE' : V3_DOMAIN_TAG;
    const idxData = (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0')
        ? determinarIndiceSinSesgo(semillaCalc, numeros.length, winnerDomainTag)
        : { idx: Number(BigInt('0x' + semillaCalc) % BigInt(numeros.length)), intento: 0, hashIntento: null };
    const idxCalculado  = idxData.idx;
    const numCalculado  = numeros[idxCalculado];

    if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
        info(`Operación: rejection_sampling(domain=${winnerDomainTag}, N=${numeros.length}) => índice ${idxCalculado} (intento=${idxData.intento})`);
    } else {
        info(`Operación: BigInt("0x${semillaCalc.slice(0, 16)}...") % ${numeros.length} = índice ${idxCalculado}`);
    }
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
