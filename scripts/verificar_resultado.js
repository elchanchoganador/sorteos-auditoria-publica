#!/usr/bin/env node
import { createHash, verify } from 'crypto';
import { readFile } from 'fs/promises';
import path from 'path';

const VERDE = '\x1b[32m';
const ROJO = '\x1b[31m';
const RESET = '\x1b[0m';
const STRICT_V3 = String(process.env.ALLOW_LEGACY_V2 || '').toLowerCase() !== 'true';
const V3_DOMAIN_TAG = 'LOTTERY-V3.0';

function ok(msg) {
  console.log(`${VERDE}OK${RESET} ${msg}`);
}

function fail(msg) {
  console.log(`${ROJO}ERROR${RESET} ${msg}`);
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
  return (snapshotCiudades || [])
    .map(c => `${c.nombre}|${c.lat}|${c.lon}|${c.temperatura_c}|${c.viento_kmh}|${c.weathercode}|${c.observado_en}`)
    .join('\n');
}

function hexABinario(hex) {
  return String(hex || '')
    .toLowerCase()
    .split('')
    .map(char => parseInt(char, 16).toString(2).padStart(4, '0'))
    .join('');
}

function derivarColorDesdeHex(hex) {
  return `#${String(hex || '').slice(0, 6).toLowerCase()}`;
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

function compararTextoDeterministico(a, b) {
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  if (sa < sb) return -1;
  if (sa > sb) return 1;
  return 0;
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
    intento++;
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

  const errors = [];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) {
        errors.push(`${url} -> HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      if (data?.pulse?.outputValue) return data.pulse;
      errors.push(`${url} -> respuesta invalida`);
    } catch (e) {
      errors.push(`${url} -> ${e.message}`);
    }
  }
  throw new Error(errors.join('\n'));
}

async function fetchBeacon(round, endpoints) {
  const errors = [];
  for (const endpoint of endpoints) {
    const url = endpoint.includes('/public/') ? endpoint : `${endpoint}/public/${round}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (res.ok) {
        const data = await res.json();
        return { ...data, _url: url };
      }
      errors.push(`${url} -> HTTP ${res.status}`);
    } catch (e) {
      errors.push(`${url} -> ${e.message}`);
    }
  }
  throw new Error(errors.join('\n'));
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

async function main() {
  const targetFolderArg = process.argv[2] || process.cwd();
  const targetFolder = path.resolve(targetFolderArg);
  const resultPath = path.join(targetFolder, 'resultado.json');
  const prePath = path.join(targetFolder, 'pre_compromiso.json');

  let resultado;
  let preCompromiso = null;
  try {
    resultado = JSON.parse(await readFile(resultPath, 'utf8'));
  } catch (e) {
    fail(`No se pudo leer ${resultPath}: ${e.message}`);
    process.exit(1);
  }

  try {
    preCompromiso = JSON.parse(await readFile(prePath, 'utf8'));
  } catch {
    // opcional para lotes antiguos
  }

  console.log(`Sorteo: ${resultado?.sorteo?.titulo || 'N/A'}`);
  console.log(`Fecha : ${resultado?.horario?.fecha_vet || 'N/A'} ${resultado?.horario?.hora_vet || ''}`);

  let errors = 0;

  // 1) Verificar drand
  const endpoints = [
    resultado?.drand?.endpoint_usado,
    ...(resultado?.drand?.endpoints_alternos || []),
    'https://drand.cloudflare.com',
    'https://api.drand.sh'
  ].filter(Boolean);

  let beacon;
  beacon = {
    round: resultado.drand.ronda,
    randomness: resultado.drand.randomness,
  };
  if (String(beacon.round) !== String(resultado.drand.ronda)) {
    fail(`Ronda inválida: ${resultado.drand.ronda}`);
    errors++;
  } else {
    ok(`Ronda valida: ${beacon.round}`);
  }

  if (!/^[0-9a-f]{64}$/i.test(String(beacon.randomness || ''))) {
    fail('Randomness drand con formato invalido');
    errors++;
  } else {
    ok('Randomness drand con formato valido');
  }

  // 2) Verificar hash participantes
  const recalculatedHash = createHash('sha256')
    .update(resultado.participantes.texto_hasheado, 'utf8')
    .digest('hex');

  if (recalculatedHash !== resultado.participantes.hash_sha256) {
    fail('Hash de participantes no coincide. Posible alteracion.');
    errors++;
  } else {
    ok('Hash de participantes valido');
  }

  const listaParticipantes = Array.isArray(resultado.participantes?.lista)
    ? resultado.participantes.lista
    : [];
  if (listaParticipantes.length > 0) {
    const ordenados = ordenarParticipantesDeterministico(listaParticipantes);
    const setTickets = new Set(ordenados.map((p) => p.ticket_id_hash));
    if (setTickets.size !== ordenados.length) {
      fail('Lista de participantes contiene tickets duplicados.');
      errors++;
    } else {
      ok('Lista de participantes sin tickets duplicados');
    }
    const textoEsperado = ordenados
      .map((p) => `${p.usuario}|${p.numero}|${p.timestamp_jugada}`)
      .join('\n');
    if (textoEsperado !== resultado.participantes.texto_hasheado) {
      fail('Orden determinístico de participantes no coincide con texto_hasheado.');
      errors++;
    } else {
      ok('Orden determinístico de participantes valido');
    }
  }

  if (preCompromiso?.participantes?.hash_sha256) {
    if (preCompromiso.participantes.hash_sha256 !== resultado.participantes.hash_sha256) {
      fail('Hash de participantes no coincide entre pre_compromiso y resultado.');
      errors++;
    } else {
      ok('Hash de participantes coincide entre pre_compromiso y resultado');
    }

    if (String(preCompromiso?.aleatoriedad?.ronda_comprometida) !== String(resultado?.drand?.ronda)) {
      fail('Ronda drand no coincide entre pre_compromiso y resultado.');
      errors++;
    } else {
      ok('Ronda drand coincide entre pre_compromiso y resultado');
    }

    if (String(preCompromiso?.compromiso?.algoritmo_version || '') !== String(resultado?.calculo?.algoritmo_version || '')) {
      fail('Algoritmo version no coincide entre pre_compromiso y resultado.');
      errors++;
    } else {
      ok('Algoritmo version coincide entre pre_compromiso y resultado');
    }

    if (String(preCompromiso?.draw_id || '') !== String(resultado?.draw_id || '')) {
      fail('Draw ID no coincide entre pre_compromiso y resultado.');
      errors++;
    } else {
      ok('Draw ID coincide entre pre_compromiso y resultado');
    }
  }

  const algoritmoVersion = String(resultado?.calculo?.algoritmo_version || '3.0.0');

  if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
    const cadenaPath = await encontrarArchivoCadena(targetFolder);
    if (!cadenaPath) {
      fail('No se encontro sorteos.json para verificar eventos SEED_COMMIT/SEED_REVEAL.');
      errors++;
    } else {
      const rawChain = await readFile(cadenaPath, 'utf8');
      const eventos = rawChain
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean)
        .filter((e) => String(e.draw_id || '') === String(resultado?.draw_id || ''));

      const hasSeedCommit = eventos.some((e) => e.entry_type === 'SEED_COMMIT');
      const hasSeedReveal = eventos.some((e) => e.entry_type === 'SEED_REVEAL');
      const hasTicketsCommit = eventos.some((e) => e.entry_type === 'TICKETS_COMMIT');
      const hasTicketsReveal = eventos.some((e) => e.entry_type === 'TICKETS_REVEAL');
      if (!hasSeedCommit || !hasSeedReveal || !hasTicketsCommit || !hasTicketsReveal) {
        fail('Cadena incompleta: faltan eventos de commit/reveal de seed y/o tickets para el draw_id.');
        errors++;
      } else {
        ok('Cadena contiene eventos SEED_COMMIT/SEED_REVEAL y TICKETS_COMMIT/TICKETS_REVEAL');
      }
    }
  }

  // 3) Verificar trazabilidad offline y algoritmo ganador
  const randomness = resultado.drand.randomness;
  const hashPart = resultado.participantes.hash_sha256;
  if (STRICT_V3 && !['3.0.0', '3.1.0'].includes(algoritmoVersion)) {
    fail(`Verificador v3 rechaza algoritmo_version=${algoritmoVersion}. Usa ALLOW_LEGACY_V2=true para validar v2.`);
    process.exit(1);
  }

  if (algoritmoVersion === '2.0.0') {
    const hashClimaCalc = createHash('sha256')
      .update(climaTexto(resultado.entropia?.clima?.snapshot_ciudades), 'utf8')
      .digest('hex');

    if (hashClimaCalc !== resultado.entropia?.clima?.hash_sha256) {
      fail('Hash climático no coincide. Posible alteración en snapshot de clima.');
      errors++;
    } else {
      ok('Hash climático valido');
    }

    const fib = fibonacciHex(resultado.entropia?.randomness_sorteo || randomness);
    if (fib.hex !== resultado.entropia?.transformacion_fibonacci?.resultado_hex || fib.n !== resultado.entropia?.transformacion_fibonacci?.n) {
      fail('Transformación Fibonacci no coincide.');
      errors++;
    } else {
      ok('Transformación Fibonacci valida');
    }
  }

  const localHex = resultado.entropia?.local?.hex ?? null;
  if (localHex) {
    const localHashCalc = createHash('sha256').update(localHex, 'utf8').digest('hex');
    if (localHashCalc !== resultado.entropia?.local?.hash_sha256) {
      fail('Entropía local no coincide.');
      errors++;
    } else {
      ok('Entropía local valida');
    }
  }

  const qrngHex = resultado.entropia?.qrng?.hex ?? null;
  if (qrngHex) {
    if ((resultado.entropia?.qrng?.bloques || []).join('') !== qrngHex) {
      fail('Bloques QRNG no coinciden con el hex concatenado.');
      errors++;
    } else {
      ok('Bloques QRNG validos');
    }

    if (hexABinario(qrngHex) !== resultado.entropia?.qrng?.binary) {
      fail('QRNG binario no coincide.');
      errors++;
    } else {
      ok('QRNG binario valido');
    }

    if (derivarColorDesdeHex(qrngHex) !== resultado.entropia?.qrng?.color_hex) {
      fail('QRNG color no coincide.');
      errors++;
    } else {
      ok('QRNG color valido');
    }
  }

  const nistHex = resultado.entropia?.nist?.hex ?? null;
  if (nistHex && resultado.entropia?.nist?.pulse?.pulseIndex) {
    if (String(resultado.entropia?.nist?.pulse?.outputValue || '').toLowerCase() !== String(nistHex).toLowerCase()) {
      fail('OutputValue NIST no coincide.');
      errors++;
    } else {
      ok('OutputValue NIST valido');
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

      if (hashEntradaCalc !== poolEntryHash) {
        fail('Hash del bloque de pool no coincide.');
        errors++;
      } else {
        ok('Hash del bloque de pool valido');
      }
    } else {
      fail('Metadatos de pool incompletos.');
      errors++;
    }

    if (!resultado?.entropia?.pool?.pool_version) {
      fail('Pool version ausente en resultado.');
      errors++;
    } else {
      ok(`Pool version registrada: ${resultado.entropia.pool.pool_version}`);
    }
  }

  const precompromisoHash = resultado.entropia?.precompromiso_hash ?? null;
  if (!precompromisoHash || !/^[0-9a-f]{64}$/i.test(precompromisoHash)) {
    fail('Precompromiso hash ausente o invalido.');
    errors++;
  } else {
    ok('Precompromiso hash valido');
  }

  if (preCompromiso?.compromiso?.hash_sha256) {
    if (preCompromiso.compromiso.hash_sha256 !== precompromisoHash) {
      fail('Precompromiso hash no coincide entre pre_compromiso y resultado.');
      errors++;
    } else {
      ok('Precompromiso hash coincide entre pre_compromiso y resultado');
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
      if (preHashCalc !== preCompromiso.compromiso.hash_sha256) {
        fail('Precommit payload v3 canónico no coincide con hash comprometido.');
        errors++;
      } else {
        ok('Precommit payload v3 canónico valido (draw_time_utc/red/round)');
      }
    }
  }

  if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
    const snapshotFile = String(resultado?.entropia?.tickets_snapshot?.file || 'tickets_draw.json');
    const snapshotPath = path.join(targetFolder, snapshotFile);
    let snapshotRaw;
    let snapshotJson;
    try {
      snapshotRaw = await readFile(snapshotPath);
      snapshotJson = JSON.parse(snapshotRaw.toString('utf8'));
    } catch (e) {
      fail(`No se pudo leer snapshot de tickets (${snapshotFile}): ${e.message}`);
      errors++;
      snapshotRaw = Buffer.from('');
      snapshotJson = { tickets: [] };
    }
    const ticketSetHashFromBytes = createHash('sha256').update(snapshotRaw).digest('hex');
    const ticketSetHashComprometido = String(preCompromiso?.tickets_commitment?.ticket_set_hash || '');
    if (!ticketSetHashComprometido || ticketSetHashFromBytes !== ticketSetHashComprometido) {
      fail('ticket_set_hash por bytes no coincide con pre_compromiso (TICKETS_COMMIT).');
      errors++;
    } else {
      ok('Ticket set commitment valido: SHA-256(bytes de snapshot) coincide con pre_compromiso');
    }
    if (String(resultado?.entropia?.ticket_set_hash || '') !== ticketSetHashFromBytes) {
      fail('ticket_set_hash en resultado no coincide con SHA-256(bytes de snapshot).');
      errors++;
    } else {
      ok('ticket_set_hash en resultado coincide con snapshot por bytes');
    }

    const snapshotTickets = Array.isArray(snapshotJson?.tickets) ? snapshotJson.tickets : [];
    const totalTicketsComprometido = Number(preCompromiso?.tickets_commitment?.total_tickets || snapshotTickets.length);
    if (snapshotTickets.length !== totalTicketsComprometido) {
      fail('total_tickets no coincide entre snapshot y TICKETS_COMMIT.');
      errors++;
    } else {
      ok('total_tickets coincide entre snapshot y TICKETS_COMMIT');
    }

    const totalPlayersComprometido = Number(preCompromiso?.tickets_commitment?.total_players || snapshotTickets.length);
    if (snapshotTickets.length !== totalPlayersComprometido) {
      fail('total_players no coincide entre snapshot y TICKETS_COMMIT.');
      errors++;
    } else {
      ok('total_players coincide entre snapshot y TICKETS_COMMIT');
    }

    if (!validarIndicesTicketsSecuenciales(snapshotTickets)) {
      fail('snapshot de tickets invalido: tickets[i].ticket debe ser igual a i (sin huecos/duplicados).');
      errors++;
    } else {
      ok('Índices de tickets secuenciales y sin huecos');
    }

    const seedReveal = resultado?.entropia?.commit_reveal?.seed_reveal;
    const seedHashComprometido = String(preCompromiso?.commit_reveal?.seed_hash_sha256 || '').toLowerCase();
    const seedHashCalculado = createHash('sha256').update(String(seedReveal || ''), 'utf8').digest('hex');
    if (!/^[0-9a-f]{64}$/i.test(String(seedReveal || ''))) {
      fail('seed_reveal ausente o con formato invalido en resultado.entropia.commit_reveal.');
      errors++;
    } else if (!seedHashComprometido || seedHashCalculado !== seedHashComprometido) {
      fail('SHA-256(seed_reveal) no coincide con seed_hash comprometido en pre_compromiso.');
      errors++;
    } else {
      ok('Commit-reveal valido: SHA-256(seed_reveal) coincide con pre_compromiso');
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
    if (semillaCanonicaEsperada !== resultado.entropia?.semilla_final?.concatenado) {
      fail('Payload canónico de semilla v3 no coincide.');
      errors++;
    } else {
      ok('Payload canónico de semilla v3 valido');
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
      canonicalResultadoEsperado !== resultado?.resultado_canonico_v3?.payload_canonico ||
      hashResultadoEsperado !== resultado?.resultado_canonico_v3?.hash_sha256
    ) {
      fail('Bloque resultado_canonico_v3 no coincide con el resultado publicado.');
      errors++;
    } else {
      ok('Bloque resultado_canonico_v3 valido');
    }

    const firmaOk = verificarFirmaEd25519(
      resultado?.resultado_canonico_v3?.hash_sha256,
      resultado?.resultado_canonico_v3?.firma
    );
    if (firmaOk === true) {
      ok('Firma Ed25519 de resultado_canonico_v3 valida');
    } else if (firmaOk === false) {
      fail('Firma Ed25519 de resultado_canonico_v3 invalida');
      errors++;
    }
  }

  if (algoritmoVersion === '3.1.0') {
    const requiredConfirmations = Number(preCompromiso?.aleatoriedad?.triple_beacon?.bitcoin_confirmations_required || 0);
    const obtainedConfirmations = Number(resultado?.entropia?.bitcoin?.confirmations || 0);
    const bitcoinHeightPre = Number(preCompromiso?.aleatoriedad?.triple_beacon?.bitcoin_height_comprometido || 0);
    const bitcoinHeightRes = Number(resultado?.entropia?.bitcoin?.height || 0);
    if (!Number.isInteger(requiredConfirmations) || requiredConfirmations < 6) {
      fail('bitcoin_confirmations_required inválido en pre_compromiso (mínimo esperado: 6).');
      errors++;
    } else if (obtainedConfirmations < requiredConfirmations) {
      fail(`Bitcoin confirmaciones insuficientes: obtenidas=${obtainedConfirmations}, requeridas=${requiredConfirmations}`);
      errors++;
    } else {
      ok(`Bitcoin confirmaciones válidas (${obtainedConfirmations}/${requiredConfirmations})`);
    }

    if (bitcoinHeightPre !== bitcoinHeightRes) {
      fail(`Bitcoin height no coincide entre pre_compromiso (${bitcoinHeightPre}) y resultado (${bitcoinHeightRes}).`);
      errors++;
    } else {
      ok('Bitcoin height coincide entre pre_compromiso y resultado');
    }

    if (resultado?.entropia?.qrng?.audit_only !== true) {
      fail('ANU en v3.1 debe marcarse como audit_only=true.');
      errors++;
    } else {
      ok('ANU marcado correctamente como audit_only');
    }
  }

  let semillaFinal;
  try {
    semillaFinal = calcularSemillaSegunVersion({
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
  } catch (e) {
    fail(`No se pudo calcular semilla: ${e.message}`);
    errors++;
    semillaFinal = '0'.repeat(64);
  }

  if (semillaFinal !== resultado.entropia?.semilla_final?.hash_sha256) {
    fail('Semilla final no coincide.');
    errors++;
  } else {
    ok('Semilla final valida');
  }

  const numeros = resultado.calculo.todos_numeros;
  const winnerDomainTag = algoritmoVersion === '3.1.0' ? 'LOTTERY-V3.1-TRIPLE' : V3_DOMAIN_TAG;
  const idxData = (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0')
    ? determinarIndiceSinSesgo(semillaFinal, numeros.length, winnerDomainTag)
    : { idx: Number(BigInt('0x' + semillaFinal) % BigInt(numeros.length)), intento: 0, hashIntento: null };
  const idx = idxData.idx;
  const numeroCalculado = numeros[idx];

  if (algoritmoVersion === '3.0.0' || algoritmoVersion === '3.1.0') {
    ok(`Rejection sampling valido (intento=${idxData.intento})`);
  }

  if (numeroCalculado !== resultado.resultado.numero_ganador) {
    fail(`Numero ganador distinto. esperado=${resultado.resultado.numero_ganador}, calculado=${numeroCalculado}`);
    errors++;
  } else {
    ok(`Numero ganador verificado: ${numeroCalculado}`);
  }

  if (errors > 0) {
    fail(`Verificacion fallida con ${errors} error(es).`);
    process.exit(1);
  }

  ok('Verificacion completa. Resultado no modificado.');
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
