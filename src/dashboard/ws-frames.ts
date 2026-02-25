import { createHash } from 'node:crypto';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function computeAcceptKey(key: string): string {
  return createHash('sha1').update(key + WS_MAGIC).digest('base64');
}

export function encodeWebSocketFrame(data: string): Buffer {
  const payload = Buffer.from(data, 'utf-8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    // Write as two 32-bit values (good for up to ~4GB)
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }

  return Buffer.concat([header, payload]);
}

export function decodeWebSocketFrame(buffer: Buffer): { opcode: number; payload: string; bytesConsumed: number } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const opcode = firstByte & 0x0f;
  const secondByte = buffer[1];
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < 4) return null;
    payloadLength = buffer.readUInt16BE(2);
    offset = 4;
  } else if (payloadLength === 127) {
    if (buffer.length < 10) return null;
    payloadLength = buffer.readUInt32BE(6); // lower 32 bits
    offset = 10;
  }

  const maskSize = masked ? 4 : 0;
  const totalLength = offset + maskSize + payloadLength;
  if (buffer.length < totalLength) return null;

  let payload: Buffer;
  if (masked) {
    const mask = buffer.subarray(offset, offset + 4);
    payload = Buffer.alloc(payloadLength);
    for (let i = 0; i < payloadLength; i++) {
      payload[i] = buffer[offset + 4 + i] ^ mask[i % 4];
    }
  } else {
    payload = buffer.subarray(offset, offset + payloadLength);
  }

  return {
    opcode,
    payload: payload.toString('utf-8'),
    bytesConsumed: totalLength,
  };
}
