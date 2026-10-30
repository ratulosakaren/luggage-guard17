const BROKER_URL = "wss://broker.hivemq.com:8884/mqtt";
const TOPIC_ALERT = "luggageguard/alert";
const TOPIC_STATUS = "luggageguard/status";

let client = null;
let currentRole = "sensor"; // 'sensor' atau 'monitor'
let audioCtx = null;
let isAlertActive = false;
let lastAlertTime = 0;

function setRole(role) {
  currentRole = role;
  document.getElementById("btnRoleSensor").classList.toggle("active", role === "sensor");
  document.getElementById("btnRoleMonitor").classList.toggle("active", role === "monitor");
  document.getElementById("panelSensor").style.display = role === "sensor" ? "block" : "none";
  document.getElementById("panelMonitor").style.display = role === "monitor" ? "block" : "none";
  writeLog(`Beralih ke mode: ${role === "sensor" ? "HP 1 (Sensor Tas)" : "HP 2 (Monitor Pemilik)"}`);
}

function writeLog(msg) {
  const log = document.getElementById("logText");
  const time = new Date().toLocaleTimeString();
  log.innerHTML = `[${time}] ${msg}<br>` + log.innerHTML;
}

function initApp() {
  // Inisialisasi AudioContext saat interaksi user
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  document.getElementById("btnStart").disabled = true;
  document.getElementById("btnStart").innerText = "Menghubungkan MQTT...";

  client = mqtt.connect(BROKER_URL);

  client.on("connect", () => {
    document.getElementById("connStatus").className = "badge connected";
    document.getElementById("connStatus").innerText = "Online";
    document.getElementById("btnStart").innerText = "Sistem Aktif";
    writeLog("Terhubung ke broker HiveMQ.");

    client.subscribe([TOPIC_ALERT, TOPIC_STATUS]);

    if (currentRole === "sensor") {
      requestSensorPermission();
    }
  });

  client.on("message", (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());
      if (topic === TOPIC_ALERT && currentRole === "monitor") {
        triggerOwnerAlarm(data);
      }
    } catch (e) {
      console.error(e);
    }
  });
}

function requestSensorPermission() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    DeviceMotionEvent.requestPermission().then((res) => {
      if (res === "granted") startAccelerometer();
    }).catch(console.error);
  } else {
    startAccelerometer();
  }
}

function startAccelerometer() {
  document.getElementById("sensorState").className = "badge armed";
  document.getElementById("sensorState").innerText = "Aktif (Mengawasi)";
  writeLog("Sensor Accelerometer aktif mengawasi getaran tas.");

  window.addEventListener("devicemotion", (e) => {
    if (currentRole !== "sensor") return;

    const acc = e.accelerationIncludingGravity;
    if (!acc) return;

    // Hitung Motion RMS deviasi dari gravitasi standar bumi (9.81 m/s^2)
    const totalMag = Math.sqrt((acc.x || 0)**2 + (acc.y || 0)**2 + (acc.z || 0)**2);
    const rmsDeviation = Math.abs(totalMag - 9.81);

    document.getElementById("accVal").innerText = `${rmsDeviation.toFixed(2)} m/s²`;

    // Ambang batas: getaran/pengangkatan > 1.8 m/s²
    const now = Date.now();
    if (rmsDeviation > 1.8 && (now - lastAlertTime > 2500)) {
      lastAlertTime = now;
      const payload = {
        timestamp: new Date().toISOString(),
        intensity: rmsDeviation.toFixed(2),
        message: "Peringatan! Gerakan tidak wajar pada tas terdeteksi!"
      };
      client.publish(TOPIC_ALERT, JSON.stringify(payload));
      writeLog(`🚨 Gerakan mencurigakan (${rmsDeviation.toFixed(2)} m/s²)! Sinyal bahaya dikirim.`);
    }
  });
}

function triggerOwnerAlarm(data) {
  isAlertActive = true;
  const box = document.getElementById("alarmCard");
  box.className = "status-box alert";
  document.getElementById("alarmTitle").innerText = "🚨 BAHAYA!";
  document.getElementById("alarmTitle").style.color = "var(--danger)";
  document.getElementById("alarmSubtitle").innerText = `${data.message} Intensitas: ${data.intensity} m/s²`;
  document.getElementById("btnResetAlarm").style.display = "block";

  writeLog(`ALARM DITERIMA DARI TAS! (Intensitas: ${data.intensity} m/s²)`);

  // Bunyikan Alarm Sirine & Getar HP
  playSirenTone();
  if (navigator.vibrate) {
    navigator.vibrate([400, 200, 400, 200, 800]);
  }
}

function playSirenTone() {
  if (!audioCtx || !isAlertActive) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.linearRampToValueAtTime(1400, audioCtx.currentTime + 0.3);

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.3);

  // Ulangi sirine jika belum dimatikan
  setTimeout(() => {
    if (isAlertActive) playSirenTone();
  }, 400);
}

function resetAlarm() {
  isAlertActive = false;
  const box = document.getElementById("alarmCard");
  box.className = "status-box";
  document.getElementById("alarmTitle").innerText = "AMAN";
  document.getElementById("alarmTitle").style.color = "var(--safe)";
  document.getElementById("alarmSubtitle").innerText = "Tidak ada pergerakan mencurigakan.";
  document.getElementById("btnResetAlarm").style.display = "none";
  writeLog("Alarm dinonaktifkan oleh pengguna.");
}
