let data = [], chart = null, chartAnalisis = null, isRegisterMode = false, currentRangeText = 'Filter Tanggal Analisis';
let isAdmin = false; // status admin diverifikasi ke server (Supabase Auth + tabel admin_list)
const ITEMS_PER_PAGE = 10;
let currentPage = 1;
let activeChartFilter = '24';
// STATE KONTROL AKTUATOR
let pumpState = 'off', isAuto = true;
let pumpAirState = 'off', isAutoAir = true;
let fanState = 'off', isAutoFan = true, fanSpeed = 100;
const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_TELEMETRI = 'jamurTrm/nsrl/telemetri';
const MQTT_TOPIC_MODE = 'jamurTrm/nsrl/kontrol/mode';
const MQTT_TOPIC_MIST = 'jamurTrm/nsrl/kontrol/mist';
const MQTT_TOPIC_MODE_AIR = 'jamurTrm/nsrl/kontrol/mode_air';
const MQTT_TOPIC_PUMP_AIR = 'jamurTrm/nsrl/kontrol/pump_air';
const MQTT_TOPIC_MODE_FAN = 'jamurTrm/nsrl/kontrol/mode_fan';
const MQTT_TOPIC_FAN = 'jamurTrm/nsrl/kontrol/fan';
const MQTT_TOPIC_FAN_SPEED = 'jamurTrm/nsrl/kontrol/fan_speed';
const SUPABASE_PROJECT = 'https://nnbppefydzfquldtewvz.supabase.co';
const SUPABASE_URL = SUPABASE_PROJECT + '/rest/v1/log_jamur?select=*&order=created_at.desc&limit=350';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYnBwZWZ5ZHpmcXVsZHRld3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTE1ODQsImV4cCI6MjA5MzEyNzU4NH0.baQcxt0P0Oc7U45YlLc9uWXfoZKDRSYO4fqNspjH1j8';
// Client Supabase (login/daftar/logout + hapus data memakai token user)
const sb = supabase.createClient(SUPABASE_PROJECT, SUPABASE_KEY);
// Ambang batas evaluasi, disamakan dengan himpunan fuzzy di fuzzy.ino (ESP32)
const FUZZY_SUHU = { normalMin: 27, normalMax: 30, panasPenuh: 32 };      // °C
const FUZZY_UDARA = { kering: 60, lembapMin: 70, lembapMax: 85 };          // %
const el = (id) => document.getElementById(id);
const ICON_EYE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const ICON_EYE_OFF = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
function toLocalISO(d) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().split('T')[0];
}
// TOAST NOTIFICATION
function showToast(message, type = 'info') {
  const container = el('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
const clientId = 'web_' + Math.random().toString(16).substring(2, 10);
const client = mqtt.connect(MQTT_BROKER, { clientId: clientId, clean: true, reconnectPeriod: 2000 });
// INDIKATOR STATUS MQTT
function setMqttStatus(isOnline, text) {
  const statusEl = el('mqtt-status');
  if (!statusEl) return;
  if (isOnline) {
    statusEl.className = 'mqtt-status online';
    statusEl.querySelector('.status-text').textContent = text || 'Terhubung';
  } else {
    statusEl.className = 'mqtt-status offline';
    statusEl.querySelector('.status-text').textContent = text || 'Terputus';
  }
}
client.on('connect', () => {
  setMqttStatus(true, 'Terhubung');
  client.subscribe(MQTT_TOPIC_TELEMETRI);
});
client.on('reconnect', () => setMqttStatus(false, 'Menghubungkan...'));
client.on('offline', () => setMqttStatus(false, 'Terputus'));
client.on('error', () => setMqttStatus(false, 'Error'));
// MQTT RECEIVE DATA REALTIME (hanya memperbarui kartu & tombol, tabel dari Supabase)
client.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_TELEMETRI) {
    try {
      const payload = JSON.parse(message.toString());
      const valSuhu = payload.suhu != null ? payload.suhu : 0.0;
      const valUdara = payload.udara != null ? payload.udara : 0;
      const valAir = payload.air != null ? payload.air : 0.0;
      el('suhu').textContent = valSuhu.toFixed(1) + "°C";
      el('udara').textContent = Math.round(valUdara) + "%";
      el('air').textContent = valAir.toFixed(1) + " cm";
      pumpState = payload.mist_state || 'off';
      isAuto = payload.mode === 'AUTO';
      el('mode-kabut').textContent = payload.mode || 'AUTO';
      pumpAirState = payload.pump_state || 'off';
      isAutoAir = payload.mode_air !== 'MANUAL';
      el('mode-air').textContent = isAutoAir ? 'AUTO' : 'MANUAL';
      fanState = payload.fan_state || 'off';
      isAutoFan = payload.mode_fan !== 'MANUAL';
      el('mode-fan').textContent = isAutoFan ? 'AUTO' : 'MANUAL';
      if (payload.fan_speed !== undefined) {
        const fs = parseInt(payload.fan_speed);
        fanSpeed = isNaN(fs) ? 100 : fs;
        updateFanSpeedUI();
      }
      updatePumpUI();
      updateAirPumpUI();
      updateFanUI();
    } catch (e) {
      // Abaikan jika payload bukan JSON valid
    }
  }
});
// UPDATE UI AKTUATOR
function updatePumpUI() {
  const btn = el('pump-kabut');
  if (!btn) return;
  btn.textContent = pumpState.toUpperCase();
  btn.dataset.state = pumpState;
  btn.style.opacity = isAuto ? '0.45' : '1';
  btn.style.pointerEvents = isAuto ? 'none' : 'auto';
}
function updateAirPumpUI() {
  const btn = el('pump-air');
  if (!btn) return;
  btn.textContent = pumpAirState.toUpperCase();
  btn.dataset.state = pumpAirState;
  btn.style.opacity = isAutoAir ? '0.45' : '1';
  btn.style.pointerEvents = isAutoAir ? 'none' : 'auto';
}
function updateFanUI() {
  const btn = el('pump-fan');
  if (!btn) return;
  btn.textContent = fanState.toUpperCase();
  btn.dataset.state = fanState;
  btn.style.opacity = isAutoFan ? '0.45' : '1';
  btn.style.pointerEvents = isAutoFan ? 'none' : 'auto';
}
function updateFanSpeedUI() {
  const input = el('fan-speed');
  if (input && document.activeElement !== input) {
    input.value = fanSpeed;
    el('speed-val').textContent = fanSpeed;
  }
}
// EVENT LISTENERS AKTUATOR
el('pump-kabut')?.addEventListener('click', () => {
  if (isAuto) return showToast("Ubah mode ke MANUAL terlebih dahulu!", "warning");
  pumpState = pumpState === 'off' ? 'on' : 'off';
  updatePumpUI();
  client.publish(MQTT_TOPIC_MIST, pumpState === 'on' ? 'ON' : 'OFF');
});
el('mode-kabut')?.addEventListener('click', () => {
  isAuto = !isAuto;
  el('mode-kabut').textContent = isAuto ? 'AUTO' : 'MANUAL';
  updatePumpUI();
  client.publish(MQTT_TOPIC_MODE, isAuto ? 'AUTO' : 'MANUAL');
});
el('pump-air')?.addEventListener('click', () => {
  if (isAutoAir) return showToast("Ubah mode ke MANUAL terlebih dahulu!", "warning");
  pumpAirState = pumpAirState === 'off' ? 'on' : 'off';
  updateAirPumpUI();
  client.publish(MQTT_TOPIC_PUMP_AIR, pumpAirState === 'on' ? 'ON' : 'OFF');
});
el('mode-air')?.addEventListener('click', () => {
  isAutoAir = !isAutoAir;
  el('mode-air').textContent = isAutoAir ? 'AUTO' : 'MANUAL';
  updateAirPumpUI();
  client.publish(MQTT_TOPIC_MODE_AIR, isAutoAir ? 'AUTO' : 'MANUAL');
});
el('pump-fan')?.addEventListener('click', () => {
  if (isAutoFan) return showToast("Ubah mode ke MANUAL terlebih dahulu!", "warning");
  fanState = fanState === 'off' ? 'on' : 'off';
  updateFanUI();
  client.publish(MQTT_TOPIC_FAN, fanState === 'on' ? 'ON' : 'OFF');
});
el('mode-fan')?.addEventListener('click', () => {
  isAutoFan = !isAutoFan;
  el('mode-fan').textContent = isAutoFan ? 'AUTO' : 'MANUAL';
  updateFanUI();
  client.publish(MQTT_TOPIC_MODE_FAN, isAutoFan ? 'AUTO' : 'MANUAL');
});
el('fan-speed')?.addEventListener('input', (e) => {
  let val = parseInt(e.target.value) || 0;
  val = Math.max(0, Math.min(100, val));
  el('speed-val').textContent = val;
});
el('set-speed-btn')?.addEventListener('click', () => {
  let inputVal = parseInt(el('fan-speed').value);
  if (isNaN(inputVal) || inputVal < 0 || inputVal > 100) {
    return showToast("Kecepatan kipas harus 0% - 100%!", "warning");
  }
  fanSpeed = inputVal;
  const pwm = Math.round((fanSpeed / 100) * 255);
  client.publish(MQTT_TOPIC_FAN_SPEED, pwm.toString());
  showToast(`Kecepatan kipas diset ke ${fanSpeed}%`, "info");
});
// FETCH DATA DARI SUPABASE
async function fetchHistoryFromSupabase(resetPage = false) {
  try {
    const response = await fetch(SUPABASE_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!Array.isArray(result)) throw new Error('Data Supabase bukan array');
    data = result.map(item => {
      const dateObj = new Date(item.created_at);
      return {
        rawDate: dateObj,
        time: dateObj.toLocaleDateString('id-ID') + ' ' + dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        suhu: parseFloat(item.suhu),
        udara: parseInt(item.kelembapan),
        air: parseFloat(item.jarak_air),
        kabut: item.status_kabut === 'ON' ? (item.mode === 'AUTO' ? 'ON (A)' : 'ON (M)') : 'OFF'
      };
    });
    if (resetPage) currentPage = 1;
    renderTables();
    if (el('grafik').classList.contains('active')) initChart();
  } catch (error) {
    console.error('Gagal mengambil data Supabase:', error);
    if (!data.length) {
      el('history').innerHTML = `<tr><td colspan="5" style="color:#e74c3c;">Gagal memuat data dari server.</td></tr>`;
      el('history-full').innerHTML = `<tr><td colspan="5" style="color:#e74c3c;">Gagal memuat data dari server.</td></tr>`;
    }
  }
}
// RENDER TABEL
function renderTables() {
  if (!data.length) {
    el('history').innerHTML = `<tr><td colspan="5">Belum ada data recorded.</td></tr>`;
    el('history-full').innerHTML = `<tr><td colspan="5">Belum ada data recorded.</td></tr>`;
    el('pagination-riwayat').innerHTML = '';
    return;
  }
  const rowHtml = d => `
    <tr>
      <td>${d.time}</td>
      <td>${d.suhu.toFixed(1)}°C</td>
      <td>${d.udara}%</td>
      <td>${d.air.toFixed(1)} cm</td>
      <td><strong>${d.kabut}</strong></td>
    </tr>`;
  el('history').innerHTML = data.slice(0, ITEMS_PER_PAGE).map(rowHtml).join('');
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  el('history-full').innerHTML = data.slice(startIndex, startIndex + ITEMS_PER_PAGE).map(rowHtml).join('');
  renderPaginationControls();
}
function renderPaginationControls() {
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE) || 1;
  let html = `<button onclick="changePage(1)" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>`;
  let startPage = 1, endPage = 5;
  if (currentPage > 3) { startPage = currentPage - 2; endPage = currentPage + 2; }
  if (endPage > totalPages) { endPage = totalPages; startPage = Math.max(1, endPage - 4); }
  for (let i = startPage; i <= endPage; i++) {
    html += `<button onclick="changePage(${i})" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
  }
  html += `<button onclick="changePage(${totalPages})" ${currentPage === totalPages ? 'disabled' : ''}>&gt;</button>`;
  el('pagination-riwayat').innerHTML = html;
}
window.changePage = function (pageNumber) {
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  if (pageNumber >= 1 && pageNumber <= totalPages) {
    currentPage = pageNumber;
    renderTables();
  }
};
el('btn-to-riwayat')?.addEventListener('click', () => goToPage('riwayat'));
// GRAFIK REAL-TIME
function initChart() {
  if (chart) chart.destroy();
  let chartData = [...data].reverse();
  if (activeChartFilter !== 'all' && chartData.length > 0) {
    const cutoff = Date.now() - parseInt(activeChartFilter) * 3600 * 1000;
    chartData = chartData.filter(d => d.rawDate.getTime() >= cutoff);
  }
  chart = new Chart(el('chart'), {
    type: 'line',
    data: {
      labels: chartData.map(d => d.time),
      datasets: [
        { label: 'Suhu (°C)', data: chartData.map(d => d.suhu), borderColor: '#e74c3c', tension: 0.3 },
        { label: 'Kelembapan Udara (%)', data: chartData.map(d => d.udara), borderColor: '#3498db', tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { ticks: { maxTicksLimit: 8, maxRotation: 30 } } } }
  });
}
el('select-chart-time')?.addEventListener('change', (e) => {
  activeChartFilter = e.target.value;
  initChart();
});
// SHOW / HIDE PASSWORD TOGGLE
el('btn-toggle-password')?.addEventListener('click', () => {
  const pwdInput = el('login-password');
  const btnToggle = el('btn-toggle-password');
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    btnToggle.innerHTML = ICON_EYE_OFF;
  } else {
    pwdInput.type = 'password';
    btnToggle.innerHTML = ICON_EYE;
  }
});
// ================= AUTENTIKASI (SUPABASE AUTH) =================
// Tampilan saja; keamanan sebenarnya ada di RLS database (policy admin_list)
function setAdminState(status) {
  isAdmin = status;
  document.querySelectorAll('.admin-only').forEach(e => e.style.display = isAdmin ? '' : 'none');
  el('btn-login-modal').style.display = isAdmin ? 'none' : '';
  el('btn-logout').style.display = isAdmin ? '' : 'none';
  // Jika kehilangan akses saat berada di halaman admin, kembali ke Beranda
  if (!isAdmin && (el('control').classList.contains('active') || el('analisis').classList.contains('active'))) {
    goToPage('home');
  }
}
// Cek sesi login + apakah emailnya terdaftar di admin_list
async function refreshAuth() {
  let ok = false;
  try {
    const { data: sess } = await sb.auth.getSession();
    if (sess && sess.session) {
      const r = await sb.from('admin_list').select('email').maybeSingle();
      ok = !!(r.data && r.data.email);
    }
  } catch (err) {
    console.error('Gagal cek sesi:', err);
  }
  setAdminState(ok);
  return ok;
}
function goToPage(page) {
  document.querySelectorAll('.page, [data-page]').forEach(e => e.classList.remove('active'));
  el(page).classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(e => e.classList.add('active'));
}
setAdminState(false);
refreshAuth();
el('btn-login-modal').onclick = () => {
  el('modal-login').style.display = 'block';
  el('login-password').type = 'password';
  if (el('btn-toggle-password')) el('btn-toggle-password').innerHTML = ICON_EYE;
};
document.querySelector('.close-modal').onclick = () => el('modal-login').style.display = 'none';
el('link-toggle-auth').onclick = (e) => {
  e.preventDefault();
  isRegisterMode = !isRegisterMode;
  el('modal-title').textContent = isRegisterMode ? 'Registrasi' : 'Login';
  el('btn-submit-auth').textContent = isRegisterMode ? 'Daftar Sekarang' : 'Login';
  el('toggle-message').textContent = isRegisterMode ? 'Sudah punya akun? ' : 'Belum punya akun? ';
  el('link-toggle-auth').textContent = isRegisterMode ? 'Login' : 'Daftar Akun';
  el('login-password').type = 'password';
  if (el('btn-toggle-password')) el('btn-toggle-password').innerHTML = ICON_EYE;
};
el('form-login').onsubmit = async (e) => {
  e.preventDefault();
  const email = el('login-email').value.trim().toLowerCase();
  const password = el('login-password').value;
  const btn = el('btn-submit-auth');
  btn.disabled = true;
  try {
    if (isRegisterMode) {
      if (password.length < 6) return showToast('Password minimal 6 karakter', 'warning');
      const { error } = await sb.auth.signUp({ email, password });
      if (error) return showToast(error.message, 'error');
      await sb.auth.signOut();
      showToast('Registrasi berhasil. Akun aktif sebagai admin setelah disetujui pengelola.', 'success');
      el('form-login').reset();
      el('link-toggle-auth').click();
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return showToast('Email atau password salah!', 'error');
      if (await refreshAuth()) {
        el('modal-login').style.display = 'none';
        el('form-login').reset();
        showToast('Login berhasil!', 'success');
      } else {
        await sb.auth.signOut();
        showToast('Akun belum disetujui sebagai admin.', 'warning');
      }
    }
  } catch (err) {
    showToast('Kesalahan koneksi autentikasi', 'error');
  } finally {
    btn.disabled = false;
  }
};
el('btn-logout').onclick = async () => {
  await sb.auth.signOut();
  setAdminState(false);
  goToPage('home');
  showToast('Anda telah logout.', 'info');
};
// NAVIGASI MENU DASHBOARD
document.querySelectorAll('[data-page]').forEach(link => {
  link.onclick = (e) => {
    e.preventDefault();
    const page = link.dataset.page;
    if ((page === 'control' || page === 'analisis') && !isAdmin) return showToast('Halaman ini perlu login', 'warning');
    goToPage(page);
    if (page === 'grafik') setTimeout(initChart, 150);
    if (page === 'analisis') { initAnalisisDates(); setTimeout(processAnalisisByDate, 150); }
  };
});
// LOGIKA MENU ANALISIS DATA
// Tanggal diperbarui setiap masuk halaman Analisis (pakai zona waktu lokal)
function initAnalisisDates() {
  const today = new Date(), sevenAgo = new Date();
  sevenAgo.setDate(today.getDate() - 7);
  el('analisis-start').value = toLocalISO(sevenAgo);
  el('analisis-end').value = toLocalISO(today);
}
el('btn-toggle-filter').onclick = () => {
  const filterWrapper = el('analisis-filter-wrapper');
  filterWrapper.classList.toggle('show');
  el('btn-toggle-filter').textContent = `${currentRangeText} ${filterWrapper.classList.contains('show') ? '▴' : '▾'}`;
};
el('btn-filter-date').onclick = () => {
  el('insight-text').innerHTML = `<div class="loading-spinner"></div> Menganalisis rentang data...`;
  setTimeout(processAnalisisByDate, 300);
};
// Hitung berapa kali kabut menyala (perpindahan OFF -> ON), bukan jumlah baris ON
function hitungKejadianKabut(rows) {
  const asc = [...rows].reverse(); // data terbaru di depan, dibalik jadi lama -> baru
  let count = 0, prevOn = false;
  for (const r of asc) {
    const on = r.kabut.includes('ON');
    if (on && !prevOn) count++;
    prevOn = on;
  }
  return count;
}
function processAnalisisByDate() {
  if (!data.length) {
    el('insight-text').innerHTML = "<p>Belum ada data untuk dianalisis.</p>";
    return;
  }
  const startVal = el('analisis-start').value;
  const endVal = el('analisis-end').value;
    if (!startVal || !endVal) {
    el('insight-text').innerHTML = "<p>Pilih tanggal mulai dan selesai terlebih dahulu.</p>";
    return showToast("Silakan pilih tanggal mulai dan selesai!", "warning");
  }
  const s = new Date(startVal), e = new Date(endVal);
  s.setHours(0, 0, 0, 0); e.setHours(23, 59, 59, 999);
  const filtered = data.filter(i => i.rawDate >= s && i.rawDate <= e);
  const formatDisplayDate = (str) => {
    if (!str) return '';
    const p = str.split('-');
    return `${p[2]}/${p[1]}/${p[0]}`;
  };
  currentRangeText = `${formatDisplayDate(startVal)} - ${formatDisplayDate(endVal)}`;
  el('btn-toggle-filter').textContent = `${currentRangeText} ▾`;
  el('analisis-filter-wrapper').classList.remove('show');
  if (!filtered.length) {
    showToast("Tidak ada data pada rentang tanggal tersebut!", "warning");
    el('avg-suhu').textContent = "0 °C";
    el('avg-udara').textContent = "0 %";
    el('freq-kabut').textContent = "0";
    el('insight-text').innerHTML = "<p>Data tidak ditemukan pada rentang tanggal yang dipilih.</p>";
    if (chartAnalisis) chartAnalisis.destroy();
    return;
  }
  const avgSuhu = parseFloat((filtered.reduce((a, b) => a + b.suhu, 0) / filtered.length).toFixed(1));
  const avgUdara = Math.round(filtered.reduce((a, b) => a + b.udara, 0) / filtered.length);
  const countKabut = hitungKejadianKabut(filtered);
  el('avg-suhu').textContent = `${avgSuhu} °C`;
  el('avg-udara').textContent = `${avgUdara} %`;
  el('freq-kabut').textContent = countKabut;
  let insightText = `<p>Hasil analisis akumulasi data dari <strong>${formatDisplayDate(startVal)}</strong> s/d <strong>${formatDisplayDate(endVal)}</strong> (${filtered.length} data):</p><ul>`;
  if (avgSuhu < FUZZY_SUHU.normalMin) {
    insightText += `<li>Rata-rata suhu ruang (<strong>${avgSuhu}°C</strong>) berada di bawah rentang normal (${FUZZY_SUHU.normalMin}-${FUZZY_SUHU.normalMax}°C), kondisi cenderung dingin.</li>`;
  } else if (avgSuhu <= FUZZY_SUHU.normalMax) {
    insightText += `<li>Rata-rata suhu ruang (<strong>${avgSuhu}°C</strong>) berada pada rentang normal (${FUZZY_SUHU.normalMin}-${FUZZY_SUHU.normalMax}°C) sesuai himpunan fuzzy sistem.</li>`;
  } else if (avgSuhu < FUZZY_SUHU.panasPenuh) {
    insightText += `<li>Rata-rata suhu ruang (<strong>${avgSuhu}°C</strong>) mulai masuk zona panas (di atas ${FUZZY_SUHU.normalMax}°C), sistem mulai mengaktifkan kabut untuk menurunkan suhu.</li>`;
  } else {
    insightText += `<li>Rata-rata suhu ruang (<strong>${avgSuhu}°C</strong>) berada pada zona panas (${FUZZY_SUHU.panasPenuh}°C ke atas), kabut aktif untuk pendinginan.</li>`;
  }
  if (avgUdara < FUZZY_UDARA.kering) {
    insightText += `<li>Kelembapan udara (<strong>${avgUdara}%</strong>) tergolong kering (di bawah ${FUZZY_UDARA.kering}%), sistem cenderung mengaktifkan kabut.</li>`;
  } else if (avgUdara < FUZZY_UDARA.lembapMin) {
    insightText += `<li>Kelembapan udara (<strong>${avgUdara}%</strong>) berada pada zona transisi kering ke lembap (${FUZZY_UDARA.kering}-${FUZZY_UDARA.lembapMin}%).</li>`;
  } else if (avgUdara <= FUZZY_UDARA.lembapMax) {
    insightText += `<li>Kelembapan udara (<strong>${avgUdara}%</strong>) berada pada rentang lembap (${FUZZY_UDARA.lembapMin}-${FUZZY_UDARA.lembapMax}%) sesuai himpunan fuzzy sistem.</li>`;
  } else {
    insightText += `<li>Kelembapan udara (<strong>${avgUdara}%</strong>) tergolong sangat lembap (di atas ${FUZZY_UDARA.lembapMax}%), kabut tidak perlu menyala.</li>`;
  }
  insightText += `<li>Mist maker telah diaktifkan <strong>${countKabut}</strong> kali dalam periode ini.</li>`;
  insightText += `</ul>`;
  el('insight-text').innerHTML = insightText;
  if (chartAnalisis) chartAnalisis.destroy();
  const rev = [...filtered].reverse();
  chartAnalisis = new Chart(el('chart-analisis'), {
    type: 'line',
    data: {
      labels: rev.map(d => d.time),
      datasets: [
        { label: 'Suhu (°C)', data: rev.map(d => d.suhu), borderColor: '#e74c3c', tension: 0.3 },
        { label: 'Kelembapan (%)', data: rev.map(d => d.udara), borderColor: '#3498db', tension: 0.3 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } }
      },
      elements: { point: { radius: 2 }, line: { borderWidth: 2 } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, maxRotation: 30, minRotation: 0, font: { size: 10 } } },
        y: { ticks: { font: { size: 10 } } }
      }
    }
  });
}
// EKSPOR PDF
el('download-pdf-analisis').onclick = async () => {
  const element = el('pdf-analisis-area');
  const kopHeader = el('pdf-kop-header');
  const canvas = el('chart-analisis');
  if (!element) return;
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  if (el('pdf-print-date')) {
    el('pdf-print-date').textContent = `Sistem Monitoring Real-time IoT | Tanggal Cetak: ${dateStr}`;
  }
  showToast("Menyiapkan dokumen PDF...", "info");
  const MARGIN_X = 12;
  const PDF_WIDTH = Math.floor((210 - MARGIN_X * 2) * 3.78) - 20;
  let chartImg = null;
  const prevAnimation = chartAnalisis ? chartAnalisis.options.animation : undefined;
  window.scrollTo(0, 0);
  element.classList.add('pdf-rendering');
  element.style.width = PDF_WIDTH + 'px';
  if (kopHeader) kopHeader.style.display = 'block';
  try {
    if (chartAnalisis) {
      chartAnalisis.options.animation = false;
      chartAnalisis.resize();
      chartAnalisis.update('none');
      await new Promise(r => setTimeout(r, 300));
      chartImg = document.createElement('img');
      chartImg.src = chartAnalisis.toBase64Image('image/png', 1);
      chartImg.style.cssText = 'width:100%;height:auto;display:block;margin:0.2rem 0;';
      canvas.style.display = 'none';
      canvas.parentNode.insertBefore(chartImg, canvas);
      await new Promise(r => { chartImg.onload = r; setTimeout(r, 300); });
    }
    const opt = {
      margin:       [8, MARGIN_X, 8, MARGIN_X],
      filename:     `Laporan_Analisis_Kumbung_${toLocalISO(new Date())}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, logging: false, scrollX: 0, scrollY: 0 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    await html2pdf().set(opt).from(element).save();
    showToast("PDF Laporan berhasil diunduh!", "success");
  } catch (err) {
    console.error("Gagal export PDF:", err);
    showToast("Gagal mengunduh file PDF.", "error");
  } finally {
    if (chartImg) chartImg.remove();
    if (canvas) canvas.style.display = '';
    if (kopHeader) kopHeader.style.display = 'none';
    element.classList.remove('pdf-rendering');
    element.style.width = '';
    if (chartAnalisis) {
      chartAnalisis.options.animation = prevAnimation;
      chartAnalisis.resize();
    }
  }
};
// DOWNLOAD CSV
el('download-csv').onclick = () => {
  if (!isAdmin) return showToast("Akses ditolak! Anda perlu login.", "error");
  if (data.length === 0) return showToast("Belum ada data untuk diunduh!", "warning");
  let csv = 'Jam,Suhu,Udara,Air,Kabut\n' + data.map(d => `${d.time},${d.suhu},${d.udara},${d.air},${d.kabut}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `monitoring_jamur_${toLocalISO(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("File CSV berhasil diunduh.", "success");
};
// HAPUS DATA PERMANEN (diperiksa oleh database lewat RLS + token user)
async function clearAllDataSupabase() {
  if (!isAdmin) return showToast("Akses ditolak! Anda perlu login.", "error");
  const confirmFirst = confirm("Apakah Anda yakin ingin menghapus seluruh data riwayat? Tindakan ini tidak dapat dibatalkan.");
  if (!confirmFirst) return;
  const confirmSecond = confirm("Tindakan ini benar-benar akan menghapus permanen seluruh log data dari server. Tekan OK untuk melanjutkan.");
  if (!confirmSecond) return;
  try {
    const { data: deleted, error } = await sb.from('log_jamur').delete().gt('id', 0).select('id');
    if (error || !deleted || deleted.length === 0) {
      return showToast("Gagal menghapus data (tidak punya izin atau tabel kosong).", "error");
    }
    showToast("Seluruh data riwayat berhasil dihapus!", "success");
    data = [];
    currentPage = 1;
    renderTables();
    if (el('grafik').classList.contains('active')) initChart();
  } catch (error) {
    showToast("Terjadi kesalahan saat menghapus data.", "error");
  }
}
el('delete-data').onclick = clearAllDataSupabase;
// UPDATER JAM & TANGGAL HEADER
function updateTime() {
  const now = new Date();
  el('datetime').textContent = `${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} | ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}
setInterval(updateTime, 1000);
updateTime();
// FETCH & VISIBILITY LISTENER
fetchHistoryFromSupabase(true);
setInterval(() => fetchHistoryFromSupabase(false), 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchHistoryFromSupabase(false);
  }
});