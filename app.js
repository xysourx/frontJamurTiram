let data = [];
let pumpState = 'off';
let isAuto = true;
let chart = null;

const ITEMS_PER_PAGE = 30;
let currentPage = 1;

const MQTT_BROKER = 'wss://broker.emqx.io:8084/mqtt';
const MQTT_TOPIC_TELEMETRI = 'jamurTrm/nsrl/telemetri';
const MQTT_TOPIC_MODE = 'jamurTrm/nsrl/kontrol/mode';
const MQTT_TOPIC_MIST = 'jamurTrm/nsrl/kontrol/mist';

const SUPABASE_URL = 'https://nnbppefydzfquldtewvz.supabase.co/rest/v1/log_jamur?select=*&order=created_at.desc&limit=300';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uYnBwZWZ5ZHpmcXVsZHRld3Z6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1NTE1ODQsImV4cCI6MjA5MzEyNzU4NH0.baQcxt0P0Oc7U45YlLc9uWXfoZKDRSYO4fqNspjH1j8';

const elements = {
  suhu: document.getElementById('suhu'),
  udara: document.getElementById('udara'),
  air: document.getElementById('air'),
  history: document.getElementById('history'),
  historyFull: document.getElementById('history-full'),
  pumpKabut: document.getElementById('pump-kabut'),
  modeKabut: document.getElementById('mode-kabut'),
  kabutCard: document.querySelector('.kabut-card'),
  datetime: document.getElementById('datetime'),
  downloadCsv: document.getElementById('download-csv'),
  deleteData: document.getElementById('delete-data')
};

const clientId = 'web_' + Math.random().toString(16).substring(2, 10);
const client = mqtt.connect(MQTT_BROKER, {
  clientId: clientId,
  clean: true,
  connectTimeout: 5000,
  reconnectPeriod: 2000,
});

client.on('connect', () => {
  console.log('Terhubung ke MQTT Broker dengan ID:', clientId);
  client.subscribe(MQTT_TOPIC_TELEMETRI);
});


client.on('message', (topic, message) => {
  if (topic === MQTT_TOPIC_TELEMETRI) {
    const payload = JSON.parse(message.toString());
    
    elements.suhu.textContent = payload.suhu.toFixed(1) + "°C";
    elements.udara.textContent = Math.round(payload.udara) + "%";
    elements.air.textContent = payload.air.toFixed(1) + " cm";
    
    pumpState = payload.mist_state;
    isAuto = payload.mode === 'AUTO';
    elements.modeKabut.textContent = payload.mode;
    
    updatePumpUI();
  }
});

async function fetchHistoryFromSupabase() {
  try {
    const response = await fetch(SUPABASE_URL, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    data = result.map(item => {
      const dateObj = new Date(item.created_at);
      return {
        time: dateObj.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        suhu: parseFloat(item.suhu),
        udara: parseInt(item.kelembapan),
        air: parseFloat(item.jarak_air),
        kabut: item.status_kabut === 'ON' ? (item.mode === 'AUTO' ? 'ON (A)' : 'ON (M)') : 'OFF'
      };
    });

    currentPage = 1;
    
    renderTables();
    
    if(document.getElementById('grafik').classList.contains('active')) {
      initChart();
    }
  } catch (error) {
    console.error("Gagal mengambil data dari Supabase:", error);
  }
}

const allNavLinks = document.querySelectorAll('[data-page]');
allNavLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
    document.getElementById(link.dataset.page).classList.add('active');
    allNavLinks.forEach(a => a.classList.remove('active'));
    document.querySelectorAll(`[data-page="${link.dataset.page}"]`).forEach(a => a.classList.add('active'));

    if (link.dataset.page === 'grafik') {
      setTimeout(initChart, 150);
    }
  });
});

function updateTime() {
  const now = new Date();
  elements.datetime.textContent = `${now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} | ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
}
setInterval(updateTime, 1000);
updateTime();

function renderTables() {
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  
  const paginatedData = data.slice(startIndex, endIndex);

  const rowHTML = paginatedData.map(d => `
    <tr>
      <td>${d.time}</td>
      <td>${d.suhu.toFixed(1)}°C</td>
      <td>${d.udara}%</td>
      <td>${d.air.toFixed(1)} cm</td>
      <td><strong>${d.kabut}</strong></td>
    </tr>
  `).join('');

  elements.history.innerHTML = rowHTML;
  elements.historyFull.innerHTML = rowHTML;

  renderPaginationControls();
}

function renderPaginationControls() {
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE) || 1;
  let html = '';

  html += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>`;

  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      html += `<button class="active">${i}</button>`;
    } else {
      html += `<button onclick="changePage(${i})">${i}</button>`;
    }
  }

  html += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>&gt;</button>`;

  document.getElementById('pagination-home').innerHTML = html;
  document.getElementById('pagination-riwayat').innerHTML = html;
}

window.changePage = function(pageNumber) {
  const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
  if (pageNumber >= 1 && pageNumber <= totalPages) {
    currentPage = pageNumber;
    renderTables();
  }
};

function initChart() {
  if (chart) chart.destroy();
  const chartData = [...data].reverse(); 

  chart = new Chart(document.getElementById('chart'), {
    type: 'line',
    data: {
      labels: chartData.map(d => d.time),
      datasets: [
        { label: 'Suhu (°C)', data: chartData.map(d => d.suhu), borderColor: '#e74c3c', tension: 0.3 },
        { label: 'Kelembapan Udara (%)', data: chartData.map(d => d.udara), borderColor: '#3498db', tension: 0.3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } } }
  });
}

elements.pumpKabut.addEventListener('click', () => {
  if (isAuto) {
    alert("Ubah mode ke MANUAL terlebih dahulu untuk mengontrol kabut!");
    return; 
  }

  pumpState = pumpState === 'off' ? 'on' : 'off';
  updatePumpUI();

  const newState = pumpState === 'on' ? 'ON' : 'OFF';
  client.publish(MQTT_TOPIC_MIST, newState);
});

elements.modeKabut.addEventListener('click', () => {
  isAuto = !isAuto;
  elements.modeKabut.textContent = isAuto ? 'AUTO' : 'MANUAL';
  
  if (!isAuto) pumpState = 'off'; 
  
  updatePumpUI();

  const newMode = isAuto ? 'AUTO' : 'MANUAL';
  client.publish(MQTT_TOPIC_MODE, newMode);
});

function updatePumpUI() {
  elements.pumpKabut.textContent = pumpState.toUpperCase();
  elements.pumpKabut.dataset.state = pumpState;
  elements.pumpKabut.style.opacity = isAuto ? '0.45' : '1';
  elements.pumpKabut.style.pointerEvents = isAuto ? 'none' : 'auto';
  elements.kabutCard.classList.toggle('active', pumpState === 'on' && !isAuto);
}

elements.downloadCsv.addEventListener('click', () => {
  if (data.length === 0) return alert("Belum ada data untuk diunduh!");
  let csv = 'Jam,Suhu,Udara,Air,Kabut\n' + data.map(d => `${d.time},${d.suhu},${d.udara},${d.air},${d.kabut}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `monitoring_jamur_${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

async function clearAllDataSupabase() {
  const confirmDelete = confirm("Apakah Anda yakin ingin menghapus seluruh data riwayat? Tindakan ini tidak dapat dibatalkan.");
  if (!confirmDelete) return;

  try {
    const DELETE_URL = 'https://nnbppefydzfquldtewvz.supabase.co/rest/v1/log_jamur?id=gt.0';

    const response = await fetch(DELETE_URL, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      alert("Seluruh data riwayat berhasil dihapus!");
      data = [];
      currentPage = 1;
      renderTables();
      
      if(document.getElementById('grafik').classList.contains('active')) {
        initChart();
      }
    } else {
      console.error("Gagal menghapus data dari Supabase:", response.statusText);
      alert("Gagal menghapus data. Periksa koneksi atau console log.");
    }
  } catch (error) {
    console.error("Terjadi kesalahan:", error);
    alert("Terjadi kesalahan saat mencoba menghapus data.");
  }
}

elements.deleteData.addEventListener('click', clearAllDataSupabase);

fetchHistoryFromSupabase(); 
updateTime();