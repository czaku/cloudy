import { describe, it, expect } from 'vitest';
import {
  computeAcceptKey,
  encodeWebSocketFrame,
  decodeWebSocketFrame,
} from '../../src/dashboard/ws-frames.js';

describe('computeAcceptKey', () => {
  it('produces deterministic SHA-1 output', () => {
    const key = 'testkey123';
    const result1 = computeAcceptKey(key);
    const result2 = computeAcceptKey(key);
    // Same input always produces same output
    expect(result1).toBe(result2);
    // Different inputs produce different outputs
    expect(computeAcceptKey('otherkey')).not.toBe(result1);
    // Output is base64 encoded
    expect(result1).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});

describe('encodeWebSocketFrame / decodeWebSocketFrame', () => {
  it('handles small payloads (< 126 bytes)', () => {
    const data = 'hello';
    const frame = encodeWebSocketFrame(data);
    const decoded = decodeWebSocketFrame(frame);

    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(1); // text
    expect(decoded!.payload).toBe('hello');
    expect(decoded!.bytesConsumed).toBe(frame.length);
  });

  it('handles medium payloads (126-65535 bytes)', () => {
    const data = 'x'.repeat(200);
    const frame = encodeWebSocketFrame(data);
    const decoded = decodeWebSocketFrame(frame);

    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toBe(data);
    expect(decoded!.payload.length).toBe(200);
  });

  it('handles large payloads (>= 65536 bytes)', () => {
    const data = 'a'.repeat(70000);
    const frame = encodeWebSocketFrame(data);
    const decoded = decodeWebSocketFrame(frame);

    expect(decoded).not.toBeNull();
    expect(decoded!.payload.length).toBe(70000);
    expect(decoded!.payload).toBe(data);
  });

  it('decodes masked frames', () => {
    // Build a masked frame manually
    const payload = Buffer.from('hi', 'utf-8');
    const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const masked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ mask[i % 4];
    }

    const frame = Buffer.alloc(2 + 4 + payload.length);
    frame[0] = 0x81; // FIN + text
    frame[1] = 0x80 | payload.length; // MASK bit set
    mask.copy(frame, 2);
    masked.copy(frame, 6);

    const decoded = decodeWebSocketFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toBe('hi');
  });

  it('returns null for incomplete data', () => {
    expect(decodeWebSocketFrame(Buffer.alloc(0))).toBeNull();
    expect(decodeWebSocketFrame(Buffer.alloc(1))).toBeNull();

    // Valid header but truncated payload
    const frame = encodeWebSocketFrame('hello world');
    const truncated = frame.subarray(0, 4);
    expect(decodeWebSocketFrame(truncated)).toBeNull();
  });

  it('round-trips encode then decode', () => {
    const messages = [
      '',
      'hello',
      '{"type":"test","data":123}',
      'Unicode: \u{1F680}\u{1F4CA}',
      'x'.repeat(300),
    ];

    for (const msg of messages) {
      const frame = encodeWebSocketFrame(msg);
      const decoded = decodeWebSocketFrame(frame);
      expect(decoded).not.toBeNull();
      expect(decoded!.payload).toBe(msg);
    }
  });
});
