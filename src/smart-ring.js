import {
  RING_SERVICE, RING_NOTIFICATIONS, RING_AUX_NOTIFICATIONS, RING_COMMANDS,
  HEART_RATE_SERVICE, HEART_RATE_MEASUREMENT,
  createHeartRateDecoder, decodeHeartRateMeasurement, heartRateCommand,
} from "./smart-ring-protocol.js?v=3";

const action = document.querySelector("#ring-action");
const disconnect = document.querySelector("#ring-disconnect");
const status = document.querySelector("#session-status");
const hint = document.querySelector("#session-hint");
const bpm = document.querySelector("#bpm");
const readingText = document.querySelector("#reading-text");
const beatInterval = document.querySelector("#beat-interval");
const diagnostics = document.querySelector("#bluetooth-diagnostics");
const diagnosticCounts = document.querySelector("#bluetooth-counts");

diagnostics.hidden = new URLSearchParams(window.location.search).get("diagnostics") !== "1";

const bluetooth = navigator.bluetooth;
const states = {
  insecure: ["Secure connection required", "Open this page over HTTPS to use Bluetooth.", "Connect ring"],
  unsupported: ["Web Bluetooth unavailable", "Open this page in Chrome on Windows, Mac, or Android. Chrome on iPhone and iPad doesn’t support Web Bluetooth.", "Connect ring"],
  idle: ["Ring disconnected", "Your VR11 may appear as VRing in the Bluetooth picker.", "Connect ring"],
  choosing: ["Choose your VR11 ring", "It may appear as VRing in the Bluetooth picker.", "Connect ring"],
  connecting: ["Connecting to ring…", "Keep your ring nearby.", "Connect ring"],
  ready: ["Ring connected", "Wear your ring and start monitoring to see your heart rate.", "Start heart rate monitoring"],
  monitoring: ["Measuring heart rate", "Waiting for the first reading. Keep the ring snug and your hand still.", "Stop heart rate monitoring"],
  stopping: ["Stopping monitoring…", "", "Stop heart rate monitoring"],
  stopFailed: ["Automatic measurements stopped", "Couldn’t send the stop command to the ring. Try again or disconnect the ring.", "Retry stop"],
  disconnecting: ["Disconnecting ring…", "", "Connect ring"],
};
const connectedActions = new Set(["ready", "monitoring", "stopFailed"]);
const NEXT_SPOT_CHECK_DELAY_MS = 2000;

let phase = "idle";
let connection = null;
let reading = null;
let measurementTimer = null;
let pageVersion = 0;

function showState(nextPhase, message) {
  phase = nextPhase;
  const [label, defaultMessage, actionLabel] = states[phase];
  status.textContent = phase === "ready" && connection.device.name ? `Connected to ${connection.device.name}` : label;
  status.dataset.state = phase;
  hint.textContent = message ?? defaultMessage;
  action.textContent = actionLabel;
  action.disabled = phase !== "idle" && !connectedActions.has(phase);
  disconnect.hidden = !connection?.commands;
  disconnect.disabled = !connectedActions.has(phase);
}

function showReading(measurement) {
  reading = measurement?.bpm ?? null;
  bpm.textContent = reading ?? "—";
  readingText.textContent = reading === null ? "No heart rate reading" : `${reading} beats per minute`;
  if (measurement === null || measurement.beatIntervalMs !== null) {
    beatInterval.hidden = measurement === null;
    beatInterval.textContent = measurement ? `Latest beat interval ${measurement.beatIntervalMs} ms` : "";
  }
}

function showDiagnosticCounts() {
  if (diagnostics.hidden) return;
  if (!connection?.notifications.size) {
    diagnosticCounts.textContent = "Connect the ring to check which readings it sends.";
    return;
  }
  const channels = Array.from(connection.notifications.values(), ({ id, bpmReports }) => `${id.toString(16).toUpperCase()} ${bpmReports}`);
  diagnosticCounts.textContent = `BPM updates by channel · ${channels.join(" · ")}. Beat interval packets ${connection.beatIntervalPackets}.`;
}

function clearMeasurementTimer() {
  clearTimeout(measurementTimer);
  measurementTimer = null;
}

function watchForReading(ring) {
  clearMeasurementTimer();
  const { receivedReading, spotResult } = ring.measurement;
  if (spotResult) {
    // The VR11 returns its finished spot measurement on FDD3. Let the ring settle before starting again.
    const message = "Showing the last reading. Another measurement starts shortly.";
    if (hint.textContent !== message) hint.textContent = message;
    measurementTimer = setTimeout(() => {
      measurementTimer = null;
      if (phase === "monitoring" && ring === connection) void requestMeasurement(ring);
    }, NEXT_SPOT_CHECK_DELAY_MS);
    return;
  }

  const liveMessage = "The display updates as readings arrive.";
  if (receivedReading && hint.textContent !== liveMessage) hint.textContent = liveMessage;
  measurementTimer = setTimeout(() => {
    measurementTimer = null;
    if (phase !== "monitoring" || ring !== connection) return;
    if (reading !== null) {
      hint.textContent = "No new reading yet. Showing the last BPM from the ring.";
    } else if (ring.measurement.receivedNotification) {
      hint.textContent = "The ring is sending data. Keep the sensor against your skin and your hand still while it measures.";
    } else {
      hint.textContent = "No Bluetooth readings received. If your VR11 is connected to another device, disconnect it there and reconnect here.";
    }
  }, receivedReading ? 15000 : 30000);
}

function receiveReading(event) {
  const ring = connection;
  const characteristic = event.currentTarget;
  const channel = ring?.notifications.get(characteristic);
  if (!channel || !characteristic.value) return;
  const measurement = channel.decode(characteristic.value);
  if (phase !== "monitoring") return;
  ring.measurement.receivedNotification = true;
  if (measurement === null) return;
  ring.measurement.receivedReading = true;
  if (channel.id === RING_AUX_NOTIFICATIONS) ring.measurement.spotResult = true;
  channel.bpmReports += 1;
  if (measurement.beatIntervalMs !== null) ring.beatIntervalPackets += 1;
  showReading(measurement);
  showDiagnosticCounts();
  if (!ring.startWrite) watchForReading(ring);
}

async function subscribeToReadings(ring, service, id, decode) {
  const characteristic = await service.getCharacteristic(id).catch(() => null);
  if (!characteristic || ring !== connection) return;
  ring.notifications.set(characteristic, { id, decode, bpmReports: 0 });
  characteristic.addEventListener("characteristicvaluechanged", receiveReading);
  try {
    await characteristic.startNotifications();
  } catch {
    characteristic.removeEventListener("characteristicvaluechanged", receiveReading);
    ring.notifications.delete(characteristic);
  }
}

function releaseRing() {
  const ring = connection;
  connection = null;
  clearMeasurementTimer();
  showReading(null);
  showDiagnosticCounts();
  if (!ring) return;
  ring.device.removeEventListener("gattserverdisconnected", onRingDisconnected);
  for (const characteristic of ring.notifications.keys()) {
    characteristic.removeEventListener("characteristicvaluechanged", receiveReading);
  }
  ring.notifications.clear();
  ring.device.gatt?.disconnect();
}

function onRingDisconnected(event) {
  if (event.currentTarget !== connection?.device) return;
  const intentional = phase === "disconnecting";
  releaseRing();
  showState("idle", intentional ? undefined : "The Bluetooth connection dropped. Bring your ring nearby and reconnect.");
}

function connectionError(error, selected) {
  if (error.name === "NotFoundError") {
    return selected
      ? "This device doesn’t expose the expected Bluetooth service. Choose your VR11 ring in the picker."
      : "No ring selected. Turn on Bluetooth and try again. Your VR11 may appear as VRing.";
  }
  if (error.name === "SecurityError" || error.name === "NotAllowedError") {
    return "Bluetooth access was blocked. Check Bluetooth permissions for your browser and this site.";
  }
  return "Couldn’t connect. Keep your VR11 nearby and disconnect it from any other device before trying again.";
}

async function connectRing() {
  const version = pageVersion;
  let ring;
  showState("choosing");
  try {
    // Some rings advertise FDDA only in service data, which Chrome's chooser can't filter on.
    const device = await bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: [RING_SERVICE, HEART_RATE_SERVICE] });
    if (version !== pageVersion) return;
    ring = { device, notifications: new Map(), stopNeeded: false, startWrite: null, beatIntervalPackets: 0 };
    connection = ring;
    device.addEventListener("gattserverdisconnected", onRingDisconnected);
    showState("connecting");

    const server = await device.gatt.connect();
    if (ring !== connection) {
      // The page can be left while Chrome is still opening the connection.
      if (connection?.device !== device) server.disconnect();
      return;
    }
    const service = await server.getPrimaryService(RING_SERVICE);
    const commands = await service.getCharacteristic(RING_COMMANDS);
    if (ring !== connection) return;
    await subscribeToReadings(ring, service, RING_AUX_NOTIFICATIONS, createHeartRateDecoder());
    if (ring !== connection) return;
    await subscribeToReadings(ring, service, RING_NOTIFICATIONS, createHeartRateDecoder());
    if (ring !== connection) return;
    const heartRateService = await server.getPrimaryService(HEART_RATE_SERVICE).catch(() => null);
    if (heartRateService && ring === connection) {
      await subscribeToReadings(ring, heartRateService, HEART_RATE_MEASUREMENT, decodeHeartRateMeasurement);
    }
    if (ring !== connection) return;
    if (ring.notifications.size === 0) {
      releaseRing();
      showState("idle", "Chrome connected to the ring but couldn’t subscribe to readings. Reconnect your VR11 and try again.");
      return;
    }
    ring.commands = commands;
    showState("ready");
    showDiagnosticCounts();
  } catch (error) {
    if (version !== pageVersion || (ring && ring !== connection)) return;
    releaseRing();
    showState("idle", connectionError(error, Boolean(ring)));
  }
}

async function sendHeartRateCommand(ring, start) {
  const command = heartRateCommand(start);
  if (ring.commands.properties.writeWithoutResponse) {
    await ring.commands.writeValueWithoutResponse(command);
  } else {
    await ring.commands.writeValueWithResponse(command);
  }
}

function startMonitoring() {
  const ring = connection;
  showReading(null);
  ring.beatIntervalPackets = 0;
  for (const channel of ring.notifications.values()) channel.bpmReports = 0;
  showDiagnosticCounts();
  showState("monitoring");
  void requestMeasurement(ring);
}

async function requestMeasurement(ring) {
  ring.measurement = { receivedNotification: false, receivedReading: false, spotResult: false };
  ring.stopNeeded = true;
  if (reading !== null) hint.textContent = "Taking another measurement. Showing the last BPM.";
  ring.startWrite = sendHeartRateCommand(ring, true);
  let writeFailed = false;
  try {
    await ring.startWrite;
  } catch {
    writeFailed = true;
  } finally {
    ring.startWrite = null;
  }
  if (ring !== connection || phase !== "monitoring") return;
  if (writeFailed && !ring.measurement.receivedReading) {
    showState("ready", reading === null
      ? "Couldn’t start monitoring. Try again or reconnect your ring."
      : "Couldn’t start another measurement. Showing the last BPM.");
    return;
  }
  watchForReading(ring);
}

async function stopMeasurement(ring) {
  // Stop comes after any GATT start write already in progress.
  await ring.startWrite?.catch(() => {});
  if (ring === connection) await sendHeartRateCommand(ring, false);
}

async function stopMonitoring() {
  const ring = connection;
  clearMeasurementTimer();
  showState("stopping");
  try {
    await stopMeasurement(ring);
    if (ring !== connection) return;
    ring.stopNeeded = false;
    showState("ready", reading === null ? "Monitoring stopped." : "Monitoring stopped. Showing the last reading.");
  } catch {
    if (ring !== connection) return;
    showState("stopFailed");
  }
}

async function disconnectRing() {
  if (!connectedActions.has(phase)) return;
  const ring = connection;
  clearMeasurementTimer();
  showState("disconnecting");
  let message;
  try {
    if (ring.stopNeeded) await stopMeasurement(ring);
  } catch {
    message = "The ring disconnected after the stop command failed.";
  }
  if (ring !== connection) return;
  releaseRing();
  showState("idle", message);
  action.focus();
}

action.addEventListener("click", () => {
  if (phase === "idle") void connectRing();
  else if (phase === "ready") startMonitoring();
  else if (phase === "monitoring" || phase === "stopFailed") void stopMonitoring();
});
disconnect.addEventListener("click", disconnectRing);

window.addEventListener("pagehide", () => {
  pageVersion += 1;
  if (phase !== "insecure" && phase !== "unsupported") {
    releaseRing();
    showState("idle");
  }
});

showState(!window.isSecureContext ? "insecure" : typeof bluetooth?.requestDevice !== "function" ? "unsupported" : "idle");
