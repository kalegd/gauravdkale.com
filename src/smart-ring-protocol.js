// Moyoung Da Rings framing: https://github.com/netseye/smartring-mac/blob/main/DaRings-BLE-Protocol.md
export const RING_SERVICE = 0xfdda;
export const RING_NOTIFICATIONS = 0xfdd1;
export const RING_COMMANDS = 0xfdd2;
export const RING_AUX_NOTIFICATIONS = 0xfdd3;
export const HEART_RATE_SERVICE = 0x180d;
export const HEART_RATE_MEASUREMENT = 0x2a37;

const SYNC_FIRST = 0xfd;
const SYNC_SECOND = 0xda;
const HEADER_LENGTH = 6;
const MEASUREMENT_TYPE = 0x01;
const HEART_RATE_FEATURE = 0x09;

export function heartRateCommand(start) {
  return Uint8Array.of(
    SYNC_FIRST, SYNC_SECOND, 0x10, HEADER_LENGTH + 1,
    MEASUREMENT_TYPE, HEART_RATE_FEATURE, start ? 0x01 : 0x00,
  );
}

function validBpm(value) {
  // The ring can send 0xff while the sensor is settling or has poor contact.
  return value >= 25 && value <= 220 ? value : null;
}

export function createHeartRateDecoder() {
  let pending = [];

  return function decode(notification) {
    const bytes = new Uint8Array(notification.buffer, notification.byteOffset, notification.byteLength);
    const data = pending.concat(Array.from(bytes));
    let offset = 0;
    let bpm = null;

    while (offset + 1 < data.length) {
      if (data[offset] !== SYNC_FIRST || data[offset + 1] !== SYNC_SECOND) {
        offset += 1;
        continue;
      }
      if (data.length - offset < HEADER_LENGTH) break;

      const frameLength = ((data[offset + 2] & 1) << 8) | data[offset + 3];
      if (frameLength < HEADER_LENGTH) {
        offset += 2;
        continue;
      }
      if (data.length - offset < frameLength) break;

      if (frameLength > HEADER_LENGTH && data[offset + 4] === MEASUREMENT_TYPE && data[offset + 5] === HEART_RATE_FEATURE) {
        bpm = validBpm(data[offset + HEADER_LENGTH]) ?? bpm;
      }
      offset += frameLength;
    }

    pending = data.slice(offset);
    return bpm === null ? null : { bpm, beatIntervalMs: null };
  };
}

export function decodeHeartRateMeasurement(notification) {
  if (notification.byteLength < 2) return null;

  // Da Rings also accepts a four-byte 2A37 value with its own 0x0400 trailer.
  if (notification.byteLength === 4 && notification.getUint16(2) === 0x0400) {
    const bpm = validBpm(notification.getUint8(1));
    return bpm === null ? null : { bpm, beatIntervalMs: null };
  }

  const flags = notification.getUint8(0);
  if ((flags & 0x06) === 0x04) return null; // Sensor contact supported, but no contact.
  const valueEnd = (flags & 0x01) ? 3 : 2;
  if (notification.byteLength < valueEnd) return null;
  const bpm = validBpm(valueEnd === 3 ? notification.getUint16(1, true) : notification.getUint8(1));
  if (bpm === null) return null;

  // Standard 2A37 intervals follow the optional two-byte energy field and use 1/1024 second units.
  const intervalStart = valueEnd + ((flags & 0x08) ? 2 : 0);
  const intervalBytes = notification.byteLength - intervalStart;
  let beatIntervalMs = null;
  if ((flags & 0x10) && intervalBytes >= 2 && intervalBytes % 2 === 0) {
    const ticks = notification.getUint16(notification.byteLength - 2, true);
    if (ticks > 0) beatIntervalMs = Math.round(ticks * 1000 / 1024);
  }
  return { bpm, beatIntervalMs };
}
