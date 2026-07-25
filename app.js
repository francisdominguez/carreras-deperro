import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDshiKVoMFpxXSHnthO682xXte6kQS57bw",
  authDomain: "controlcarreras-736be.firebaseapp.com",
  projectId: "controlcarreras-736be",
  storageBucket: "controlcarreras-736be.firebasestorage.app",
  messagingSenderId: "166900825212",
  appId: "1:166900825212:web:7952db75a08b4536255df9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elementos del DOM
const raceForm = document.getElementById("raceForm");
const historyList = document.getElementById("historyList");
const totalCarrerasEl = document.getElementById("totalCarreras");
const ultimoGanadorEl = document.getElementById("ultimoGanador");
const secuenciaEl = document.getElementById("secuencia");
const topRecomendacionesEl = document.getElementById("topRecomendaciones");
const markov1El = document.getElementById("markov1");
const palesDirEl = document.getElementById("palesDir");
const eliminarEl = document.getElementById("eliminar");
const alertasEl = document.getElementById("alertas");
const regimenContainer = document.getElementById("regimenContainer");
const combosContainer = document.getElementById("combosContainer");
const desglosePerrosEl = document.getElementById("desglosePerros");
const proximaCarreraEl = document.getElementById("proximaCarrera");

// Sistema de Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// ============ PARSER FORMATO RAZA ============
function parseRazaFormat(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    const razaMatch = line.match(/^(\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+(\d)\s*-\s*(\d)/);
    
    if (razaMatch) {
      const raceNum = razaMatch[1];
      const winner = parseInt(razaMatch[2]);
      const second = parseInt(razaMatch[3]);

      if (winner >= 1 && winner <= 8 && second >= 1 && second <= 8 && winner !== second) {
        results.push({
          raw: line,
          valid: true,
          raceId: `C${raceNum}`,
          winner,
          secondPlace: second
        });
        continue;
      }
    }

    const numbers = line.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      const lastNum = parseInt(numbers[numbers.length - 1]);
      const secondLast = parseInt(numbers[numbers.length - 2]);
      const firstNum = numbers[0];

      if (lastNum >= 1 && lastNum <= 8 && secondLast >= 1 && secondLast <= 8 && lastNum !== secondLast) {
        results.push({
          raw: line,
          valid: true,
          raceId: `C${firstNum}`,
          winner: secondLast,
          secondPlace: lastNum
        });
        continue;
      }
    }

    if (line.length > 3 && !line.includes('RESULTADOS') && !line.includes('Raza') && !line.includes('Fecha')) {
      results.push({ raw: line, valid: false, error: "Formato no reconocido" });
    }
  }

  return results;
}

// ============ OCR ============
const ocrStatus = document.getElementById("ocrStatus");
const ocrImagePreview = document.getElementById("ocrImagePreview");
const ocrResult = document.getElementById("ocrResult");
let ocrParsedRaces = [];

async function processOCRImage(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    ocrImagePreview.innerHTML = `<img src="${e.target.result}" alt="Ticket">`;
    ocrImagePreview.classList.add("show");
  };
  reader.readAsDataURL(file);

  ocrStatus.className = "ocr-status show processing";
  ocrStatus.innerHTML = `⚙️ Inicializando OCR...<div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>`;

  try {
    const result = await Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          document.getElementById("progressFill").style.width = pct + "%";
          ocrStatus.innerHTML = ` Reconociendo... ${pct}%<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`;
        }
      }
    });

    const extractedText = result.data.text;
    ocrStatus.className = "ocr-status show success";
    ocrStatus.innerHTML = `✅ Texto extraído`;

    let html = `<div><strong>📝 Texto detectado:</strong></div>`;
    html += `<div class="ocr-extracted">${extractedText || '(vacío)'}</div>`;

    ocrParsedRaces = parseRazaFormat(extractedText);
    const valid = ocrParsedRaces.filter(r => r.valid);

    html += `<div style="margin-top:8px;"><strong>📊 Resultados:</strong> ${valid.length} carreras detectadas</div>`;

    if (ocrParsedRaces.length > 0) {
      html += `<table class="ocr-table"><thead><tr><th>Carrera</th><th>1ro</th><th>2do</th><th>Estado</th></tr></thead><tbody>`;
      ocrParsedRaces.forEach(r => {
        if (r.valid) {
          html += `<tr class="valid"><td>${r.raceId}</td><td>#${r.winner}</td><td>#${r.secondPlace}</td><td class="status-ok">✓</td></tr>`;
        } else {
          html += `<tr class="invalid"><td colspan="3">${r.error}</td><td class="status-err">✗</td></tr>`;
        }
      });
      html += `</tbody></table>`;
    }

    if (valid.length > 0) {
      html += `<div class="ocr-actions">
        <button class="btn-ocr-action btn-ocr-save" id="btnOcrSave">💾 Guardar ${valid.length}</button>
        <button class="btn-ocr-action btn-ocr-bulk" id="btnOcrBulk">📋 Pasar a Carga Masiva</button>
        <button class="btn-ocr-action btn-ocr-clear" id="btnOcrClear">🗑️</button>
      </div>`;
    }

    ocrResult.className = "ocr-result show success";
    ocrResult.innerHTML = html;
    ocrResult.dataset.extractedText = extractedText;

    document.getElementById("btnOcrSave").addEventListener("click", saveOCRToFirebase);
    document.getElementById("btnOcrBulk").addEventListener("click", passOCRToBulk);
    document.getElementById("btnOcrClear").addEventListener("click", clearOCR);

  } catch (err) {
    ocrStatus.className = "ocr-status show error";
    ocrStatus.innerHTML = `❌ Error: ${err.message}`;
  }
}

async function saveOCRToFirebase() {
  const valid = ocrParsedRaces.filter(r => r.valid);
  if (valid.length === 0) return;

  if (!confirm(`Se guardarán ${valid.length} carreras. ¿Continuar?`)) return;

  try {
    const batchSize = 10;
    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize);
      const promises = batch.map((r, idx) => addDoc(collection(db, "races"), {
        raceId: r.raceId,
        winner: r.winner,
        secondPlace: r.secondPlace,
        timestamp: new Date(Date.now() - (valid.length - i - idx) * 1000)
      }));
      await Promise.all(promises);
    }

    ocrStatus.innerHTML = `✅ ${valid.length} carreras guardadas`;
    clearOCR();
    loadAndAnalyzeRaces();
  } catch (error) {
    alert(" Error: " + error.message);
  }
}

function passOCRToBulk() {
  const extractedText = ocrResult.dataset.extractedText || "";
  const bulkInput = document.getElementById("bulkInput");
  const valid = ocrParsedRaces.filter(r => r.valid);
  let textToBulk = valid.length > 0 ? valid.map(r => `${r.raceId} ${r.winner} ${r.secondPlace}`).join('\n') : extractedText;

  if (textToBulk) {
    bulkInput.value = bulkInput.value ? bulkInput.value + '\n' + textToBulk : textToBulk;
    alert(`✅ Texto pasado a Carga Masiva`);
  }
}

function clearOCR() {
  ocrImagePreview.innerHTML = "";
  ocrImagePreview.classList.remove("show");
  ocrResult.innerHTML = "";
  ocrResult.classList.remove("show");
  ocrStatus.className = "ocr-status";
  ocrStatus.innerHTML = "";
  ocrParsedRaces = [];
  document.getElementById("fileCamera").value = "";
  document.getElementById("fileGallery").value = "";
}

document.getElementById("fileCamera").addEventListener("change", (e) => {
  if (e.target.files[0]) processOCRImage(e.target.files[0]);
});

document.getElementById("fileGallery").addEventListener("change", (e) => {
  if (e.target.files[0]) processOCRImage(e.target.files[0]);
});

// ============ GUARDAR CARRERA ============
raceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raceId = document.getElementById("raceId").value;
  const winner = Number(document.getElementById("winner").value);
  const secondPlaceValue = document.getElementById("secondPlace").value;
  const secondPlace = secondPlaceValue ? Number(secondPlaceValue) : null;

  if (secondPlace && winner === secondPlace) {
    alert("El primer y segundo lugar no pueden ser el mismo perro.");
    return;
  }

  try {
    await addDoc(collection(db, "races"), {
      raceId,
      winner,
      secondPlace,
      timestamp: new Date()
    });
    raceForm.reset();
    loadAndAnalyzeRaces();
  } catch (error) {
    alert("Error al guardar.");
  }
});

// ============ CARGA MASIVA ============
const bulkInput = document.getElementById("bulkInput");
const bulkPreview = document.getElementById("bulkPreview");
let parsedRaces = [];

document.getElementById("btnParse").addEventListener("click", () => {
  const text = bulkInput.value;
  if (!text.trim()) {
    bulkPreview.className = "bulk-preview show error";
    bulkPreview.innerHTML = "⚠️ Campo vacío.";
    return;
  }
  parsedRaces = parseRazaFormat(text);
  const validCount = parsedRaces.filter(r => r.valid).length;

  let html = `<div><strong>📊 Resultado:</strong> ${validCount} válidas</div>`;
  if (parsedRaces.length > 0) {
    html += `<table><thead><tr><th>Línea</th><th>Carrera</th><th>1ro</th><th>2do</th><th>Estado</th></tr></thead><tbody>`;
    parsedRaces.forEach((r, i) => {
      if (r.valid) {
        html += `<tr class="valid"><td>${i+1}</td><td>${r.raceId}</td><td>#${r.winner}</td><td>#${r.secondPlace}</td><td style="color:#10b981;">✓</td></tr>`;
      } else {
        html += `<tr class="invalid"><td>${i+1}</td><td colspan="3">${r.raw}</td><td style="color:#ef4444;">✗ ${r.error}</td></tr>`;
      }
    });
    html += `</tbody></table>`;
  }
  bulkPreview.className = `bulk-preview show ${validCount === parsedRaces.length ? 'success' : 'error'}`;
  bulkPreview.innerHTML = html;
});

document.getElementById("btnBulkSave").addEventListener("click", async () => {
  if (parsedRaces.length === 0) {
    const text = bulkInput.value;
    if (!text.trim()) { alert("⚠️ Campo vacío."); return; }
    parsedRaces = parseRazaFormat(text);
  }
  const validRaces = parsedRaces.filter(r => r.valid);
  if (validRaces.length === 0) { alert("❌ No hay carreras válidas."); return; }

  if (!confirm(`Se guardarán ${validRaces.length} carreras. ¿Continuar?`)) return;

  try {
    const batchSize = 10;
    for (let i = 0; i < validRaces.length; i += batchSize) {
      const batch = validRaces.slice(i, i + batchSize);
      const promises = batch.map((r, idx) => addDoc(collection(db, "races"), {
        raceId: r.raceId, winner: r.winner, secondPlace: r.secondPlace,
        timestamp: new Date(Date.now() - (validRaces.length - i - idx) * 1000)
      }));
      await Promise.all(promises);
    }
    bulkPreview.className = "bulk-preview show success";
    bulkPreview.innerHTML = `✅ ${validRaces.length} carreras guardadas`;
    bulkInput.value = "";
    parsedRaces = [];
    loadAndAnalyzeRaces();
  } catch (error) {
    alert("❌ Error: " + error.message);
  }
});

document.getElementById("btnBulkClear").addEventListener("click", () => {
  bulkInput.value = "";
  bulkPreview.className = "bulk-preview";
  bulkPreview.innerHTML = "";
  parsedRaces = [];
});

// ============ 🆕 PREDICCIÓN INMEDIATA PARA PRÓXIMA CARRERA ============
function generarPrediccionInmediata(races, total, counts, lastSeen, lastWinner) {
  if (total < 3 || !lastWinner) {
    return {
      dog: null,
      pale: null,
      confidence: "Baja",
      reason: "Necesitas al menos 3 carreras para predecir"
    };
  }

  // 1. Markov: qué suele venir después del último ganador
  let markovMatrix = {};
  for (let i = 1; i <= 8; i++) markovMatrix[i] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  for (let i = 0; i < races.length - 1; i++) {
    const c = races[i].winner, n = races[i+1].winner;
    if (markovMatrix[c] && markovMatrix[c][n] !== undefined) markovMatrix[c][n]++;
  }
  
  let markovTop = null;
  if (markovMatrix[lastWinner]) {
    const row = markovMatrix[lastWinner];
    const tot = Object.values(row).reduce((a,b) => a+b, 0);
    if (tot > 0) {
      const sorted = Object.entries(row).map(([d, c]) => ({ dog: Number(d), prob: (c/tot)*100 }))
        .sort((a,b) => b.prob - a.prob);
      markovTop = sorted[0];
    }
  }

  // 2. Perro con mayor sequía (deuda estadística)
  let maxDrought = 0;
  let droughtDog = null;
  for (let i = 1; i <= 8; i++) {
    const drought = lastSeen[i] === 999 ? total : lastSeen[i];
    if (drought > maxDrought && i !== lastWinner) {
      maxDrought = drought;
      droughtDog = i;
    }
  }

  // 3. Frecuencia reciente (últimas 5)
  let recentCounts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  races.slice(0, Math.min(5, total)).forEach(r => recentCounts[r.winner]++);
  let leastRecent = null;
  let minRecent = 999;
  for (let i = 1; i <= 8; i++) {
    if (recentCounts[i] < minRecent && i !== lastWinner) {
      minRecent = recentCounts[i];
      leastRecent = i;
    }
  }

  // 4. Score combinado
  let scores = {};
  for (let i = 1; i <= 8; i++) {
    if (i === lastWinner) continue;
    scores[i] = 0;
    
    // Markov (40%)
    if (markovTop && markovTop.dog === i) scores[i] += 40;
    
    // Sequía (30%)
    const drought = lastSeen[i] === 999 ? total : lastSeen[i];
    scores[i] += Math.min(drought * 3, 30);
    
    // No reciente (30%)
    if (recentCounts[i] === 0) scores[i] += 30;
  }

  let bestDog = null;
  let bestScore = 0;
  for (let i = 1; i <= 8; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestDog = i;
    }
  }

  // Palé: segundo mejor score
  let secondBest = null;
  let secondScore = 0;
  for (let i = 1; i <= 8; i++) {
    if (i !== bestDog && i !== lastWinner && scores[i] > secondScore) {
      secondScore = scores[i];
      secondBest = i;
    }
  }

  // Confianza
  let confidence = "Baja";
  if (bestScore >= 60) confidence = "Alta";
  else if (bestScore >= 40) confidence = "Media";

  return {
    dog: bestDog,
    pale: secondBest,
    confidence,
    score: bestScore,
    reason: `Markov: ${markovTop ? markovTop.dog : '-'}, Sequía: ${droughtDog}, No reciente: ${leastRecent}`
  };
}

// ============ MOTOR DE ANÁLISIS ============
async function loadAndAnalyzeRaces() {
  try {
    const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(200));
    const querySnapshot = await getDocs(q);
    let races = [];
    querySnapshot.forEach((doc) => races.push(doc.data()));

    const total = races.length;
    
    if (total === 0) {
      proximaCarreraEl.innerHTML = `<div class="proxima-box"><p>Registra al menos 3 carreras para obtener predicción</p></div>`;
      totalCarrerasEl.textContent = "0";
      ultimoGanadorEl.textContent = "#-";
      secuenciaEl.textContent = "-";
      topRecomendacionesEl.innerHTML = "<p>Registra carreras</p>";
      historyList.innerHTML = "<li>Sin registros</li>";
      desglosePerrosEl.innerHTML = "<p>Sin datos</p>";
      markov1El.innerHTML = "<p>Sin datos</p>";
      palesDirEl.innerHTML = "<p>Sin datos</p>";
      eliminarEl.innerHTML = "<p>Sin datos</p>";
      alertasEl.innerHTML = "<p>Sin datos</p>";
      regimenContainer.innerHTML = "<p>Sin datos</p>";
      combosContainer.innerHTML = "<p>Sin datos</p>";
      return;
    }

    // Frecuencias
    let counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0};
    races.forEach(r => { if(counts[r.winner] !== undefined) counts[r.winner]++; });

    // Sequías
    let lastSeen = {1:999, 2:999, 3:999, 4:999, 5:999, 6:999, 7:999, 8:999};
    races.forEach((r, index) => {
      if (lastSeen[r.winner] === 999) lastSeen[r.winner] = index;
    });

    // Último ganador y secuencia
    const lastWinner = races[0] ? races[0].winner : null;
    const sequence = races.slice(0, 5).map(r => r.winner);
    totalCarrerasEl.textContent = total;
    ultimoGanadorEl.textContent = `#${lastWinner || '-'}`;
    secuenciaEl.textContent = sequence.map(s => `#${s}`).join(' → ');

    // 🆕 PREDICCIÓN INMEDIATA
    const prediccion = generarPrediccionInmediata(races, total, counts, lastSeen, lastWinner);
    
    let htmlProxima = `
      <div class="proxima-title">🎯 PRÓXIMA CARRERA - QUÉ JUGAR AHORA</div>
    `;

    if (prediccion.dog) {
      htmlProxima += `
        <div class="proxima-main">
          <div class="proxima-label">🥇 GANADOR RECOMENDADO</div>
          <div class="proxima-dog">Perro #${prediccion.dog}</div>
        </div>
      `;

      if (prediccion.pale) {
        htmlProxima += `
          <div class="proxima-pale">
            <div class="proxima-pale-item">
              <div class="proxima-pale-dog">#${prediccion.dog}</div>
              <div class="proxima-pale-label">1ro</div>
            </div>
            <div style="font-size:1.5rem;">→</div>
            <div class="proxima-pale-item">
              <div class="proxima-pale-dog">#${prediccion.pale}</div>
              <div class="proxima-pale-label">2do</div>
            </div>
          </div>
        `;
      }

      htmlProxima += `
        <div class="proxima-confidence">
          Confianza: ${prediccion.confidence} | Score: ${prediccion.score}/100
        </div>
      `;
    } else {
      htmlProxima += `<p>${prediccion.reason}</p>`;
    }

    proximaCarreraEl.innerHTML = htmlProxima;

    // Recomendaciones
    let recommendations = [];
    for (let i = 1; i <= 8; i++) {
      let freqPercent = (counts[i] / total) * 100;
      let drought = lastSeen[i] === 999 ? total : lastSeen[i];
      let score = (drought * 1.5) - freqPercent;
      recommendations.push({ dog: i, score, drought, freqPercent: freqPercent.toFixed(1) });
    }
    recommendations.sort((a, b) => b.score - a.score);

    // Renderizar recomendaciones
    let htmlRec = "";
    recommendations.slice(0, 4).forEach((rec, idx) => {
      const isPrincipal = idx === 0 ? 'principal' : '';
      const badge = idx === 0 ? '🔥' : '';
      htmlRec += `
        <div class="rec-card ${isPrincipal}">
          <div class="dog-num">Perro #${rec.dog} ${badge}</div>
          <div class="rec-detail">Ausente: ${rec.drought} carreras</div>
          <div class="rec-detail">Frecuencia: ${rec.freqPercent}%</div>
        </div>
      `;
    });
    topRecomendacionesEl.innerHTML = htmlRec;

    // Markov 1°
    let markovMatrix = {};
    for (let i = 1; i <= 8; i++) markovMatrix[i] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
    for (let i = 0; i < races.length - 1; i++) {
      const c = races[i].winner, n = races[i+1].winner;
      if (markovMatrix[c] && markovMatrix[c][n] !== undefined) markovMatrix[c][n]++;
    }
    
    let htmlMarkov = "";
    if (lastWinner && markovMatrix[lastWinner]) {
      const row = markovMatrix[lastWinner];
      const tot = Object.values(row).reduce((a,b) => a+b, 0);
      if (tot > 0) {
        const sorted = Object.entries(row).map(([d, c]) => ({ dog: Number(d), prob: (c/tot)*100 }))
          .sort((a,b) => b.prob - a.prob).slice(0, 3);
        sorted.forEach((p, i) => {
          htmlMarkov += `<div class="badge-markov">${['🥇','🥈','🥉'][i]} #${p.dog} <span class="pct">${p.prob.toFixed(1)}%</span></div>`;
        });
      }
    }
    markov1El.innerHTML = htmlMarkov || "<p>Sin datos suficientes</p>";

    // Palés direccionales
    let paleCounts = {};
    races.forEach(r => {
      if (r.winner && r.secondPlace) {
        let pair = `${r.winner}→${r.secondPlace}`;
        paleCounts[pair] = (paleCounts[pair] || 0) + 1;
      }
    });
    let sortedPales = Object.entries(paleCounts).sort((a, b) => b[1] - a[1]);

    let htmlPales = "";
    sortedPales.slice(0, 5).forEach(([pair, count]) => {
      htmlPales += `<div class="badge-pale"><strong>#${pair.replace('→',' → #')}</strong> <span class="count">(${count}x)</span></div>`;
    });
    palesDirEl.innerHTML = htmlPales || "<p>Sin palés registrados</p>";

    // Eliminar
    let htmlElim = "";
    for (let i = 1; i <= 8; i++) {
      const last5 = races.slice(0, Math.min(5, total)).filter(r => r.winner === i).length;
      if (last5 >= 2 || lastSeen[i] < 2) {
        const reason = last5 >= 2 ? "racha caliente" : "acaba de ganar";
        htmlElim += `<div><strong>Perro #${i}</strong>: ${reason}</div>`;
      }
    }
    eliminarEl.innerHTML = htmlElim || "<p>Sin perros a eliminar</p>";

    // Alertas
    let htmlAlert = "";
    for (let i = 1; i <= 8; i++) {
      if (lastSeen[i] > 20) {
        htmlAlert += `<div>🚨 Perro #${i}: sequía de ${lastSeen[i]} carreras</div>`;
      }
    }
    alertasEl.innerHTML = htmlAlert || "<p>Sin alertas</p>";

    // Historial
    let htmlHistory = "";
    races.slice(0, 20).forEach(r => {
      const paleText = r.secondPlace ? `<span class="pale">Palé: #${r.winner}→#${r.secondPlace}</span>` : '';
      htmlHistory += `
        <li>
          <span class="race-id">${r.raceId}</span>
          <span>🥇 #${r.winner}</span>
          ${paleText}
        </li>
      `;
    });
    historyList.innerHTML = htmlHistory;

    // Desglose
    let htmlStats = "";
    for (let i = 1; i <= 8; i++) {
      const pct = ((counts[i]/total)*100).toFixed(0);
      const drought = lastSeen[i];
      htmlStats += `
        <div class="stat-box">
          <div class="dog-label">P${i}</div>
          <div class="wins">${counts[i]}</div>
          <div class="percent">${pct}%</div>
          <div class="drought">Seq: ${drought}</div>
        </div>
      `;
    }
    desglosePerrosEl.innerHTML = htmlStats;

    // Régimen
    const window = Math.min(15, total);
    const recent = races.slice(0, window);
    const recentFreq = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
    recent.forEach(r => recentFreq[r.winner]++);

    const activeDogs = Object.entries(recentFreq)
      .filter(([_, count]) => count > 0)
      .map(([dog, count]) => ({ dog: Number(dog), count }))
      .sort((a,b) => b.count - a.count);

    let regimeType = activeDogs.length <= 3 ? "CONCENTRADO 🔥" : activeDogs.length <= 5 ? "EQUILIBRADO ⚖️" : "DISTRIBUIDO 🎲";
    
    let htmlRegime = `
      <div class="regime-box">
        <div class="regime-title">🌡️ ${regimeType}</div>
        <div class="regime-desc">Últimas ${window} carreras | ${activeDogs.length} perros activos</div>
        <div class="regime-dogs">
          ${activeDogs.map(d => `<span class="regime-dog">#${d.dog} (${d.count}x)</span>`).join('')}
        </div>
      </div>
    `;
    regimenContainer.innerHTML = htmlRegime;

    // Combinaciones
    const top3 = recommendations.slice(0, 3);
    let htmlCombos = "";
    
    htmlCombos += `
      <div class="combo-item main">
        <div class="combo-header">
          <span class="combo-type">🎯 Apuesta Principal</span>
          <span class="combo-confidence">Alta</span>
        </div>
        <div class="combo-detail">Ganador: Perro #${top3[0].dog}</div>
        <div class="combo-dogs"><span class="combo-dog-badge">#${top3[0].dog}</span></div>
        <div class="combo-stake"> 3-5% del bankroll</div>
      </div>
    `;

    if (top3[1]) {
      htmlCombos += `
        <div class="combo-item box">
          <div class="combo-header">
            <span class="combo-type">🔗 Palé Box</span>
            <span class="combo-confidence">Alta</span>
          </div>
          <div class="combo-detail">#${top3[0].dog}→#${top3[1].dog} y viceversa</div>
          <div class="combo-dogs">
            <span class="combo-dog-badge">#${top3[0].dog}</span>
            <span class="combo-dog-badge">#${top3[1].dog}</span>
          </div>
          <div class="combo-stake">💰 2-3% del bankroll</div>
        </div>
      `;
    }

    combosContainer.innerHTML = htmlCombos;

  } catch (error) {
    console.error("Error: ", error);
  }
}

loadAndAnalyzeRaces();
