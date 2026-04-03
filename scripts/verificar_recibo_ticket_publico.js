#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

function calculateTicketHash(drawId, userId, choice) {
  const canonical = `${drawId}|${userId}|${String(choice).padStart(2, '0')}`;
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

async function main() {
  const receiptPathArg = process.argv[2];
  const keyIndexPathArg = process.argv[3];

  if (!receiptPathArg || !keyIndexPathArg) {
    console.error('Uso: node scripts/verificar_recibo_ticket_publico.js <recibo.json> <public_keys.json>');
    process.exit(1);
  }

  const receiptPath = path.resolve(process.cwd(), receiptPathArg);
  const keyIndexPath = path.resolve(process.cwd(), keyIndexPathArg);

  const receipt = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  const keyIndex = JSON.parse(await fs.readFile(keyIndexPath, 'utf8'));

  const receiptHash = String(receipt?.ticket_hash || receipt?.leaf_hash || '');
  const expectedHash = calculateTicketHash(receipt?.draw_id, receipt?.user_id, receipt?.choice);
  if (receiptHash !== expectedHash) {
    console.error('INVALIDO ticket_hash no coincide con el payload canónico');
    process.exit(2);
  }

  const keyId = String(receipt?.key_id || '').trim();
  if (!keyId) {
    console.error('INVALIDO recibo sin key_id');
    process.exit(3);
  }

  const publicKeys = Array.isArray(keyIndex?.public_keys) ? keyIndex.public_keys : [];
  const keyEntry = publicKeys.find((entry) => String(entry?.key_id || entry?.keyId || '') === keyId);
  if (!keyEntry?.public_key_pem && !keyEntry?.publicKeyPem) {
    console.error(`INVALIDO no existe clave pública para key_id=${keyId}`);
    process.exit(4);
  }

  const publicKeyPem = String(keyEntry.public_key_pem || keyEntry.publicKeyPem);
  const signature = String(receipt?.signature || '');
  if (!signature) {
    console.error('INVALIDO recibo sin firma');
    process.exit(5);
  }

  const ok = crypto.verify(
    null,
    Buffer.from(receiptHash, 'hex'),
    publicKeyPem,
    Buffer.from(signature, 'hex')
  );

  if (!ok) {
    console.error(`INVALIDO firma no válida para key_id=${keyId}`);
    process.exit(6);
  }

  console.log(`VALIDO key_id=${keyId}`);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(10);
});