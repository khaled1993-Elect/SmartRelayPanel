const broker = 'wss://test.mosquitto.org:8081';

let token = '',
    controlTopics = [],
    statusTopics = [],
    topicHello = '',
    client,
    helloReceived = false,
    helloTimeout,
    relayNamesKey = '',
    relayNames = [],
    isEditing = false,
    schedules = [];

// Multi-device support
let devices = JSON.parse(localStorage.getItem('devices')) || [];
let currentDeviceIndex = -1;

function saveDevices() {
  localStorage.setItem('devices', JSON.stringify(devices));
}

function updateDeviceList() {
  const sel = document.getElementById('deviceList');
  sel.innerHTML = '';
  devices.forEach((token, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = token ? `Device ${idx + 1}` : 'Unnamed';
    if (idx === currentDeviceIndex) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.style.display = devices.length > 0 ? 'inline-block' : 'none';
}

// Show modal for adding device
document.getElementById('addDeviceBtn').onclick = function() {
  document.getElementById('addDeviceModal').classList.add('active');
  document.getElementById('newDeviceTokenInput').value = '';
  document.getElementById('addDeviceMessage').innerText = '';
};

// Hide modal
document.getElementById('cancelAddDeviceBtn').onclick = function() {
  document.getElementById('addDeviceModal').classList.remove('active');
};

// Confirm add device
document.getElementById('confirmAddDeviceBtn').onclick = function() {
  const t = document.getElementById('newDeviceTokenInput').value.trim();
  const msg = document.getElementById('addDeviceMessage');
  if (!t) {
    msg.innerText = 'Please enter a device token.';
    return;
  }
  if (devices.includes(t)) {
    msg.innerText = 'Device already added.';
    return;
  }
  devices.push(t);
  saveDevices();
  updateDeviceList();
  document.getElementById('addDeviceModal').classList.remove('active');
  switchDevice(devices.length - 1);
};

// Device switching
document.getElementById('deviceList').onchange = function() {
  switchDevice(Number(this.value));
};

function switchDevice(idx) {
  if (idx < 0 || idx >= devices.length) return;
  currentDeviceIndex = idx;
  token = devices[idx];
  document.getElementById('tokenInput').value = token;
  pair();
  updateDeviceList();
}

// === Pairing ===
function pair() {
  token = document.getElementById('tokenInput').value.trim();
  const msg = document.getElementById('pairMessage');
  if (!token) return msg.innerText = 'Please enter a valid token.';
  controlTopics = Array.from({ length: 8 }, (_, i) => `${token}/control/${i + 1}`);
  statusTopics = Array.from({ length: 8 }, (_, i) => `${token}/status/${i + 1}`);
  topicHello = `${token}/status/hello`;
  relayNamesKey = `${token}_relay_names`;
  msg.innerText = 'Connecting...';
  if (client && client.connected) client.end();
  client = mqtt.connect(broker);

  client.on('connect', () => {
    updateStatus(true);
    client.subscribe(topicHello, err => {
      if (!err) helloTimeout = setTimeout(() => {
        if (!helloReceived) {
          msg.innerText = 'No response. Check token.';
          client.end();
          updateStatus(false);
        }
      }, 5000);
    });
  });

  client.on('message', (topic, message) => {
    if (topic === topicHello && message.toString() === "HELLO") {
      helloReceived = true;
      clearTimeout(helloTimeout);
      msg.innerText = '';
      buildGrid();
      buildRelayOptions();
      document.getElementById('pairing').style.display = 'none';
      showPage('panelPage');
      statusTopics.forEach(t => client.subscribe(t));
    } else if (statusTopics.includes(topic)) {
      const i = statusTopics.indexOf(topic);
      const b = document.querySelector(`.breaker[data-index="${i}"]`);
      if (b) {
        const on = message.toString() === "ON";
        b.classList.toggle('on', on);
        b.querySelector('.handle').textContent = on ? "ON" : "OFF";
      }
    }
  });

  client.on('error', () => {
    updateStatus(false);
    msg.innerText = 'Connection error.';
  });

  client.on('close', () => updateStatus(false));
}

function updateStatus(c) {
  document.getElementById('status-dot').style.background = c ? '#28a745' : 'red';
}

function buildGrid() {
  const g = document.getElementById('breakerGrid');
  g.innerHTML = '';
  relayNames = JSON.parse(localStorage.getItem(relayNamesKey)) || [];
  for (let i = 0; i < 8; i++) {
    const t = controlTopics[i];
    const c = document.createElement('div');
    c.className = 'breaker-card';
    const l = document.createElement('div');
    l.className = 'name';
    l.textContent = relayNames[i] || `Relay ${i + 1}`;
    const inp = document.createElement('input');
    inp.className = 'name-input';
    inp.value = relayNames[i] || `Relay ${i + 1}`;
    inp.style.display = 'none';
    const b = document.createElement('div');
    b.className = 'breaker';
    b.dataset.topic = t;
    b.dataset.index = i;
    b.innerHTML = `<div class="label on">ON</div><div class="label off">OFF</div><div class="handle">OFF</div>`;
    b.onclick = () => {
      if (client && client.connected && !isEditing)
        client.publish(t, b.classList.contains('on') ? "OFF" : "ON");
    };
    c.appendChild(l);
    c.appendChild(inp);
    c.appendChild(b);
    g.appendChild(c);
  }
}

function buildRelayOptions() {
  const sel = document.getElementById('scheduleRelay');
  sel.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Relay ${i + 1}`;
    sel.appendChild(opt);
  }
}

function toggleEdit() {
  isEditing = !isEditing;
  document.getElementById('editBtn').textContent = isEditing ? "✔" : "✎";
  document.querySelectorAll('.breaker-card').forEach((c, i) => {
    const l = c.querySelector('.name'), inp = c.querySelector('.name-input');
    if (isEditing) {
      l.style.display = 'none';
      inp.style.display = 'block';
    } else {
      const n = inp.value.trim() || `Relay ${i + 1}`;
      l.textContent = n;
      inp.value = n;
      l.style.display = 'block';
      inp.style.display = 'none';
      relayNames[i] = n;
    }
  });
  if (!isEditing) localStorage.setItem(relayNamesKey, JSON.stringify(relayNames));
}

function showPage(id) {
  document.querySelectorAll('main, .page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('editBtn').style.display = (id === 'panelPage') ? 'inline-block' : 'none';
}

// === Scheduler ===
document.querySelectorAll('.day-btn').forEach(b => b.onclick = () => b.classList.toggle('active'));

function addSchedule() {
  const r = document.getElementById('scheduleRelay').value;
  const a = document.getElementById('scheduleAction').value;
  const t = document.getElementById('scheduleTime').value;
  if (!t) return alert("Pick a time");
  const days = [...document.querySelectorAll('.day-btn')].map(b => b.classList.contains('active'));
  schedules.push({ id: Date.now(), relay: r, action: a, time: t, days, lastRun: null });
  renderSchedules();
}

function renderSchedules() {
  const l = document.getElementById('scheduleList');
  l.innerHTML = '';
  schedules.forEach(s => {
    const daysText = s.days.some(v => v)
      ? s.days.map((v, i) => v ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] : '').filter(Boolean).join(',')
      : 'One-time';
    const i = document.createElement('div');
    i.className = 'schedule-item';
    i.textContent = `Relay ${parseInt(s.relay) + 1} → ${s.action} @ ${s.time} [${daysText}]`;
    const del = document.createElement('button');
    del.textContent = '✖';
    del.onclick = () => {
      schedules = schedules.filter(x => x.id !== s.id);
      renderSchedules();
    };
    i.appendChild(del);
    l.appendChild(i);
  });
}

setInterval(() => {
  const now = new Date(), h = String(now.getHours()).padStart(2, '0'), m = String(now.getMinutes()).padStart(2, '0');
  const weekday = (now.getDay() + 6) % 7;
  schedules.forEach(s => {
    if (s.days.some(v => v)) {
      if (s.days[weekday] && s.time === `${h}:${m}` && s.lastRun !== `${h}:${m}`) {
        client.publish(controlTopics[s.relay], s.action);
        s.lastRun = `${h}:${m}`;
      }
    } else {
      if (s.time === `${h}:${m}` && !s.lastRun) {
        client.publish(controlTopics[s.relay], s.action);
        s.lastRun = 'done';
      }
    }
  });
}, 30000);

// === Event Listeners ===
document.getElementById('pairBtn').onclick = function() {
  // If not in device list, add it for convenience
  const t = document.getElementById('tokenInput').value.trim();
  if (t && !devices.includes(t)) {
    devices.push(t);
    saveDevices();
    updateDeviceList();
    currentDeviceIndex = devices.length - 1;
  }
  pair();
};
document.getElementById('editBtn').onclick = toggleEdit;
document.getElementById('addScheduleBtn').onclick = addSchedule;

// Initialize UI
updateDeviceList();
if (devices.length > 0) {
  switchDevice(0);
} else {
  document.getElementById('pairing').style.display = 'flex';
  showPage('panelPage');
}
