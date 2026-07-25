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
const raceForm = document.getElementById("raceForm");
const historyList = document.getElementById("historyList");
const statsContainer = document.getElementById("statsContainer");

let cachedRaces = [];
let ocrParsedRaces = [];

// ============ 🆕 PARSER ESPECIALIZADO FORMATO RAZA ============
// Formato real del ticket: "0287  25/07/2026 15:07:30  5 - 2"
function parseRazaFormat(text) {
  const results = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  for (const line of lines) {
    // Patrón Raza: 4 dígitos al inicio, luego fecha/hora, luego "X - Y" al final
    // Ejemplo: "0287  25/07/2026 15:07:30  5 - 2"
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
          secondPlace: second,
          format: 'raza'
        });
        continue;
      }
    }

    // Fallback: parser genérico para otros formatos
    const numbers = line.match(/\d+/g);
    if (numbers && numbers.length >= 3) {
      // Buscar combinación válida al final de la línea (los últimos 2 números son 1ro y 2do)
      const lastNum = parseInt(numbers[numbers.length - 1]);
      const secondLast = parseInt(numbers[numbers.length - 2]);
      const firstNum = numbers[0];

      if (lastNum >= 1 && lastNum <= 8 && secondLast >= 1 && secondLast <= 8 && lastNum !== secondLast) {
        results.push({
          raw: line,
          valid: true,
          raceId: `C${firstNum}`,
          winner: secondLast,
          secondPlace: lastNum,
          format: 'generic'
        });
        continue;
      }
    }

    // Si no se pudo parsear
    if (line.length > 3 && !line.includes('RESULTADOS') && !line.includes('Raza') && !line.includes('Fecha')) {
      results.push({ raw: line, valid: false, error: "Formato no reconocido" });
    }
  }

  return results;
}

// Parser para carga masiva manual (mantiene compatibilidad)
function parseBulkInput(text) {
  return parseRazaFormat(text);
}

// ============ 🆕 SISTEMA OCR - SUBIR FOTO ============
const ocrStatus = document.getElementById("ocrStatus");
const ocrImagePreview = document.getElementById("ocrImagePreview");
const ocrResult = document.getElementById("ocrResult");

async function processOCRImage(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    ocrImagePreview.innerHTML = `<img src="${e.target.result}" alt="Ticket">`;
    ocrImagePreview.classList.add("show");
  };
  reader.readAsDataURL(file);

  ocrStatus.className = "ocr-status show processing";
  ocrStatus.innerHTML = `️ Inicializando motor OCR...
    <div class="progress-bar"><div class="progress-fill" id="progressFill" style="width:0%"></div></div>`;

  try {
    const result = await Tesseract.recognize(file, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          const pct = Math.round(m.progress * 100);
          document.getElementById("progressFill").style.width = pct + "%";
          ocrStatus.innerHTML = `🔍 Reconociendo texto... ${pct}%
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`;
        } else if (m.status === 'loading tesseract core') {
          ocrStatus.innerHTML = `📦 Cargando motor OCR...`;
        } else if (m.status === 'initializing tesseract') {
          ocrStatus.innerHTML = `⚙️ Inicializando...`;
        } else if (m.status === 'loading language traineddata') {
          ocrStatus.innerHTML = `🌐 Cargando idioma...`;
        }
      }
    });

    const extractedText = result.data.text;
    
    ocrStatus.className = "ocr-status show success";
    ocrStatus.innerHTML = `✅ Texto extraído correctamente`;

    let html = `<div><strong> Texto detectado:</strong></div>`;
    html += `<div class="ocr-extracted">${extractedText || '(vacío)'}</div>`;

    ocrParsedRaces = parseRazaFormat(extractedText);
    const valid = ocrParsedRaces.filter(r => r.valid);
    const invalid = ocrParsedRaces.filter(r => !r.valid);

    html += `<div style="margin-top:10px;"><strong>📊 Resultados:</strong> ${valid.length} carreras detectadas | ${invalid.length} líneas ignoradas</div>`;

    if (ocrParsedRaces.length > 0) {
      html += `<table class="ocr-table"><thead><tr><th>Carrera</th><th>1ro</th><th>2do</th><th>Estado</th></tr></thead><tbody>`;
      ocrParsedRaces.forEach(r => {
        if (r.valid) {
          html += `<tr class="valid"><td>${r.raceId}</td><td>#${r.winner}</td><td>#${r.secondPlace}</td><td class="status-ok">✓</td></tr>`;
        } else {
          html += `<tr class="invalid"><td colspan="3" style="font-size:0.75rem;">${r.error || r.raw}</td><td class="status-err"></td></tr>`;
        }
      });
      html += `</tbody></table>`;
    }

    if (valid.length > 0) {
      html += `<div class="ocr-actions">
        <button class="btn-ocr-action btn-ocr-save" id="btnOcrSave"> Guardar ${valid.length} en Firebase</button>
        <button class="btn-ocr-action btn-ocr-bulk" id="btnOcrBulk"> Pasar a Carga Masiva</button>
        <button class="btn-ocr-action btn-ocr-clear" id="btnOcrClear">🗑️ Limpiar</button>
      </div>`;
    } else {
      html += `<div style="color:#fca5a5;margin-top:10px;">
        ⚠️ No se detectaron carreras. Consejos:
        <ul style="margin-top:6px;padding-left:20px;font-size:0.8rem;">
          <li>Toma la foto con buena iluminación</li>
          <li>Asegúrate que el ticket esté plano</li>
          <li>Los números deben verse claros</li>
        </ul>
      </div>`;
      html += `<div class="ocr-actions">
        <button class="btn-ocr-action btn-ocr-bulk" id="btnOcrBulk">📋 Pasar texto a Carga Masiva</button>
        <button class="btn-ocr-action btn-ocr-clear" id="btnOcrClear">🗑️ Limpiar</button>
      </div>`;
    }

    ocrResult.className = "ocr-result show success";
    ocrResult.innerHTML = html;
    ocrResult.dataset.extractedText = extractedText;

    const btnSave = document.getElementById("btnOcrSave");
    if (btnSave) btnSave.addEventListener("click", saveOCRToFirebase);
    
    const btnBulk = document.getElementById("btnOcrBulk");
    if (btnBulk) btnBulk.addEventListener("click", passOCRToBulk);
    
    const btnClear = document.getElementById("btnOcrClear");
    if (btnClear) btnClear.addEventListener("click", clearOCR);

  } catch (err) {
    console.error("Error OCR: ", err);
    ocrStatus.className = "ocr-status show error";
    ocrStatus.innerHTML = `❌ Error: ${err.message}`;
  }
}

async function saveOCRToFirebase() {
  const valid = ocrParsedRaces.filter(r => r.valid);
  if (valid.length === 0) {
    alert("❌ No hay datos válidos para guardar.");
    return;
  }

  if (!confirm(`Se guardarán ${valid.length} carreras en Firebase. ¿Continuar?`)) return;

  try {
    const batchSize = 10;
    let saved = 0;
    for (let i = 0; i < valid.length; i += batchSize) {
      const batch = valid.slice(i, i + batchSize);
      const promises = batch.map((r, idx) => addDoc(collection(db, "races"), {
        raceId: r.raceId,
        winner: r.winner,
        secondPlace: r.secondPlace,
        timestamp: new Date(Date.now() - (valid.length - i - idx) * 1000)
      }));
      await Promise.all(promises);
      saved += batch.length;
    }

    ocrStatus.className = "ocr-status show success";
    ocrStatus.innerHTML = `✅ <strong>${saved} carreras guardadas.</strong> Recalculando análisis...`;
    clearOCR();
    loadAndAnalyzeRaces();
  } catch (error) {
    alert("❌ Error al guardar: " + error.message);
  }
}

function passOCRToBulk() {
  const extractedText = ocrResult.dataset.extractedText || "";
  const bulkInput = document.getElementById("bulkInput");
  
  const valid = ocrParsedRaces.filter(r => r.valid);
  let textToBulk = "";
  
  if (valid.length > 0) {
    textToBulk = valid.map(r => `${r.raceId} ${r.winner} ${r.secondPlace}`).join('\n');
  } else if (extractedText.trim()) {
    textToBulk = extractedText;
  }

  if (textToBulk) {
    bulkInput.value = bulkInput.value ? bulkInput.value + '\n' + textToBulk : textToBulk;
    alert(`✅ Texto pasado a "Carga Masiva Manual". Revisa y edita si es necesario.`);
    document.querySelector('.bulk-card').scrollIntoView({ behavior: 'smooth', block: 'center' });
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
  const file = e.target.files[0];
  if (file) processOCRImage(file);
});

document.getElementById("fileGallery").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) processOCRImage(file);
});

// ============ GUARDAR CARRERA INDIVIDUAL ============
raceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raceId = document.getElementById("raceId").value;
  const winner = Number(document.getElementById("winner").value);
  const sp = document.getElementById("secondPlace").value;
  const secondPlace = sp ? Number(sp) : null;

  if (secondPlace && winner === secondPlace) {
    alert("El primer y segundo lugar no pueden ser el mismo perro.");
    return;
  }

  try {
    await addDoc(collection(db, "races"), {
      raceId, winner, secondPlace, timestamp: new Date()
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
  parsedRaces = parseBulkInput(text);
  const validCount = parsedRaces.filter(r => r.valid).length;
  const invalidCount = parsedRaces.length - validCount;

  let html = `<div><strong>📊 Resultado:</strong> ${validCount} válidas | ${invalidCount} con error</div>`;
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
  bulkPreview.className = `bulk-preview show ${invalidCount === 0 ? 'success' : 'error'}`;
  bulkPreview.innerHTML = html;
});

document.getElementById("btnBulkSave").addEventListener("click", async () => {
  if (parsedRaces.length === 0) {
    const text = bulkInput.value;
    if (!text.trim()) { alert("⚠️ Campo vacío."); return; }
    parsedRaces = parseBulkInput(text);
  }
  const validRaces = parsedRaces.filter(r => r.valid);
  if (validRaces.length === 0) { alert("❌ No hay carreras válidas."); return; }

  const invalidCount = parsedRaces.length - validRaces.length;
  const msg = invalidCount > 0
    ? `Se guardarán ${validRaces.length} válidas. ${invalidCount} con error serán ignoradas. ¿Continuar?`
    : `Se guardarán ${validRaces.length} carreras. ¿Continuar?`;
  if (!confirm(msg)) return;

  try {
    const batchSize = 10;
    let saved = 0;
    for (let i = 0; i < validRaces.length; i += batchSize) {
      const batch = validRaces.slice(i, i + batchSize);
      const promises = batch.map((r, idx) => addDoc(collection(db, "races"), {
        raceId: r.raceId, winner: r.winner, secondPlace: r.secondPlace,
        timestamp: new Date(Date.now() - (validRaces.length - i - idx) * 1000)
      }));
      await Promise.all(promises);
      saved += batch.length;
    }
    bulkPreview.className = "bulk-preview show success";
    bulkPreview.innerHTML = `✅ <strong>${saved} carreras guardadas.</strong>`;
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

// ============ MOTOR DE ANÁLISIS ============
async function loadAndAnalyzeRaces() {
  statsContainer.innerHTML = "<p>⚙️ Procesando...</p>";
  historyList.innerHTML = "<li>Cargando...</li>";

  try {
    const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(500));
    const querySnapshot = await getDocs(q);
    const races = [];
    querySnapshot.forEach((doc) => races.push(doc.data()));

    cachedRaces = races;
    const total = races.length;

    if (total === 0) {
      statsContainer.innerHTML = "<p>Registra carreras para activar.</p>";
      historyList.innerHTML = "<li>Sin registros.</li>";
      return;
    }

    const A1 = analyzeFrequencies(races, total);
    const A2 = analyzeStreaks(races, total);
    const A3 = analyzeDebt(races, total);
    const A4 = analyzeMarkov1(races);
    const A5 = analyzeMarkov2(races);
    const A6 = analyzeCorrelation(races);
    const A7 = analyzePales(races);
    const A8 = analyzeTrifectas(races);
    const A9 = analyzePatterns(races, total);
    const A10 = analyzeCycles(races, total);
    const A11 = analyzeMomentum(races);
    const A12 = analyzeMirror(races);

    const finalRecommendations = buildFinalScore(races, total, A1, A2, A3, A4, A11);
    const eliminationList = buildEliminationList(races, total, A2);
    const stakingPlan = buildStakingPlan(finalRecommendations, races);
    const anomalies = detectAnomalies(races, total, A2, A10);
    const evAnalysis = analyzeEV(races);

    renderAll({
      total, races, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12,
      finalRecommendations, eliminationList, stakingPlan, anomalies, evAnalysis
    });

    let htmlHistory = "";
    races.slice(0, 15).forEach(r => {
      const paleText = r.secondPlace ? ` | <span class="pale">P: #${r.winner}→#${r.secondPlace}</span>` : '';
      htmlHistory += `<li><span>C: <strong>${r.raceId}</strong></span> <span class="winner">1ro: #${r.winner}</span>${paleText}</li>`;
    });
    historyList.innerHTML = htmlHistory;

  } catch (error) {
    console.error("Error: ", error);
    statsContainer.innerHTML = "<p>Error al procesar.</p>";
  }
}

// ============ 12 ALGORITMOS DE ANÁLISIS ============
function analyzeFrequencies(races, total) {
  const windows = { global: total, last50: 50, last20: 20, last10: 10, last5: 5 };
  const result = {};
  for (const [key, size] of Object.entries(windows)) {
    const slice = races.slice(0, Math.min(size, total));
    const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
    slice.forEach(r => { if(counts[r.winner] !== undefined) counts[r.winner]++; });
    result[key] = counts;
  }
  return result;
}

function analyzeStreaks(races, total) {
  const lastSeen = {1:999,2:999,3:999,4:999,5:999,6:999,7:999,8:999};
  races.forEach((r, idx) => { if (lastSeen[r.winner] === 999) lastSeen[r.winner] = idx; });
  const status = {};
  for (let i = 1; i <= 8; i++) {
    const last5 = races.slice(0, Math.min(5, total)).filter(r => r.winner === i).length;
    const last10 = races.slice(0, Math.min(10, total)).filter(r => r.winner === i).length;
    const last15 = races.slice(0, Math.min(15, total)).filter(r => r.winner === i).length;
    let s = "neutral";
    if (last5 >= 2) s = "hot 🔥";
    else if (last15 === 0 && lastSeen[i] >= 15) s = "cold 🧊";
    else if (last10 === 0 && lastSeen[i] >= 10) s = "cool ️";
    status[i] = { status: s, last5, last10, drought: lastSeen[i] === 999 ? total : lastSeen[i] };
  }
  return status;
}

function analyzeDebt(races, total) {
  const expected = 12.5;
  const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  races.forEach(r => counts[r.winner]++);
  const debt = {};
  for (let i = 1; i <= 8; i++) {
    const real = (counts[i] / total) * 100;
    debt[i] = { real: real.toFixed(2), debt: (expected - real).toFixed(2) };
  }
  return debt;
}

function analyzeMarkov1(races) {
  const matrix = {};
  for (let i = 1; i <= 8; i++) matrix[i] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  for (let i = 0; i < races.length - 1; i++) {
    const c = races[i].winner, n = races[i+1].winner;
    if (matrix[c] && matrix[c][n] !== undefined) matrix[c][n]++;
  }
  const lastWinner = races[0]?.winner;
  let prediction = null;
  if (lastWinner) {
    const row = matrix[lastWinner];
    const tot = Object.values(row).reduce((a,b) => a+b, 0);
    if (tot > 0) {
      prediction = Object.entries(row).map(([d, c]) => ({ dog: Number(d), prob: (c/tot)*100 }))
        .sort((a,b) => b.prob - a.prob).slice(0, 3);
    }
  }
  return { matrix, lastWinner, prediction };
}

function analyzeMarkov2(races) {
  const matrix = {};
  for (let i = 1; i <= 8; i++) {
    matrix[i] = {};
    for (let j = 1; j <= 8; j++) matrix[i][j] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  }
  for (let i = 0; i < races.length - 2; i++) {
    const a = races[i+2].winner, b = races[i+1].winner, c = races[i].winner;
    if (matrix[a]?.[b]?.[c] !== undefined) matrix[a][b][c]++;
  }
  const last2 = [races[1]?.winner, races[0]?.winner].filter(x => x);
  let prediction = null;
  if (last2.length === 2) {
    const row = matrix[last2[0]][last2[1]];
    const tot = Object.values(row).reduce((a,b) => a+b, 0);
    if (tot >= 2) {
      prediction = Object.entries(row).map(([d, c]) => ({ dog: Number(d), prob: (c/tot)*100 }))
        .sort((a,b) => b.prob - a.prob).slice(0, 3);
    }
  }
  return { last2, prediction };
}

function analyzeCorrelation(races) {
  const matrix = {};
  for (let i = 1; i <= 8; i++) matrix[i] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  races.forEach(r => {
    if (r.winner && r.secondPlace && r.winner !== r.secondPlace) {
      matrix[r.winner][r.secondPlace]++;
    }
  });
  return matrix;
}

function analyzePales(races) {
  const exact = {}, mixed = {};
  races.forEach(r => {
    if (r.winner && r.secondPlace) {
      const e = `${r.winner}→${r.secondPlace}`;
      exact[e] = (exact[e] || 0) + 1;
      const m = [r.winner, r.secondPlace].sort((a,b) => a-b).join("-");
      mixed[m] = (mixed[m] || 0) + 1;
    }
  });
  const topExact = Object.entries(exact).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const topMixed = Object.entries(mixed).sort((a,b) => b[1]-a[1]).slice(0, 5);
  return { topExact, topMixed };
}

function analyzeTrifectas(races) {
  const tri = {};
  races.forEach(r => {
    if (r.winner && r.secondPlace && r.thirdPlace) {
      const k = `${r.winner}-${r.secondPlace}-${r.thirdPlace}`;
      tri[k] = (tri[k] || 0) + 1;
    }
  });
  return Object.entries(tri).sort((a,b) => b[1]-a[1]).slice(0, 5);
}

function analyzePatterns(races, total) {
  let par = 0, impar = 0, bajo = 0, alto = 0;
  races.forEach(r => {
    if (r.winner % 2 === 0) par++; else impar++;
    if (r.winner <= 4) bajo++; else alto++;
  });
  return {
    par: ((par/total)*100).toFixed(1), impar: ((impar/total)*100).toFixed(1),
    bajo: ((bajo/total)*100).toFixed(1), alto: ((alto/total)*100).toFixed(1)
  };
}

function analyzeCycles(races, total) {
  const appearances = {1:[],2:[],3:[],4:[],5:[],6:[],7:[],8:[]};
  races.forEach((r, idx) => appearances[r.winner].push(idx));
  const cycles = {};
  for (let i = 1; i <= 8; i++) {
    const arr = appearances[i];
    if (arr.length >= 2) {
      const gaps = [];
      for (let j = 0; j < arr.length - 1; j++) gaps.push(arr[j+1] - arr[j]);
      const avg = gaps.reduce((a,b) => a+b, 0) / gaps.length;
      cycles[i] = { avgGap: avg.toFixed(1), gaps, lastGap: arr[0] };
    } else {
      cycles[i] = { avgGap: null, gaps: [], lastGap: arr[0] };
    }
  }
  return cycles;
}

function analyzeMomentum(races) {
  const last5 = races.slice(0, 5);
  const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  last5.forEach(r => counts[r.winner]++);
  const sequence = last5.map(r => r.winner);
  return { counts, sequence };
}

function analyzeMirror(races) {
  const mirrors = [];
  const paleMap = {};
  races.forEach(r => {
    if (r.winner && r.secondPlace) {
      const k = `${r.winner}-${r.secondPlace}`;
      paleMap[k] = (paleMap[k] || 0) + 1;
    }
  });
  for (const key in paleMap) {
    const [a, b] = key.split("-");
    const reverse = `${b}-${a}`;
    if (paleMap[reverse]) {
      mirrors.push({ pair: key, count: paleMap[key], reverse, reverseCount: paleMap[reverse] });
    }
  }
  return mirrors.slice(0, 5);
}

function buildFinalScore(races, total, A1, A2, A3, A4, A11) {
  const recs = [];
  for (let i = 1; i <= 8; i++) {
    const drought = A2[i].drought;
    const freqGlobal = (A1.global[i] / total) * 100;
    const freq10 = (A1.last10[i] / Math.min(10, total)) * 100;
    const freq5 = (A1.last5[i] / Math.min(5, total)) * 100;
    const debt = parseFloat(A3[i].debt);
    const momentum = A11.counts[i] * 10;
    let markovBoost = 0;
    if (A4.prediction) {
      const pos = A4.prediction.findIndex(p => p.dog === i);
      if (pos === 0) markovBoost = 20;
      else if (pos === 1) markovBoost = 10;
      else if (pos === 2) markovBoost = 5;
    }
    const droughtScore = Math.min(drought * 2.5, 100);
    const recentScore = freq10 * 2.5 + freq5 * 1.5;
    const debtScore = Math.max(debt * 3, 0);
    const hotBonus = A2[i].status.includes("hot") ? 15 : 0;
    const composite = (
      droughtScore * 0.25 + recentScore * 0.25 + debtScore * 0.20 +
      hotBonus * 0.15 + momentum * 0.10 + markovBoost * 0.05
    );
    let confidence = "Baja ⭐";
    if (composite >= 55) confidence = "Muy Alta ⭐⭐⭐⭐";
    else if (composite >= 45) confidence = "Alta ⭐⭐⭐";
    else if (composite >= 35) confidence = "Media ⭐⭐";
    recs.push({
      dog: i, score: composite.toFixed(1), drought, freqGlobal: freqGlobal.toFixed(1),
      freq10: freq10.toFixed(1), freq5: freq5.toFixed(1), debt: A3[i].debt,
      status: A2[i].status, confidence, momentum
    });
  }
  return recs.sort((a,b) => b.score - a.score);
}

function buildEliminationList(races, total, A2) {
  const eliminate = [];
  for (let i = 1; i <= 8; i++) {
    let reasons = [];
    if (A2[i].status === "hot 🔥" && A2[i].last5 >= 2) reasons.push("racha caliente");
    if (A2[i].drought < 2) reasons.push("acaba de ganar");
    if (reasons.length > 0) eliminate.push({ dog: i, reasons });
  }
  return eliminate;
}

function buildStakingPlan(recs, races) {
  const lastBankroll = races[0]?.bankroll || 100;
  const plan = [];
  const top = recs[0];
  let stakePct = 0;
  if (top.score >= 55) stakePct = 5;
  else if (top.score >= 45) stakePct = 3;
  else if (top.score >= 35) stakePct = 2;
  else stakePct = 1;
  plan.push({
    dog: top.dog, type: "Ganador", stakePct,
    amount: (lastBankroll * stakePct / 100).toFixed(2),
    confidence: top.confidence
  });
  if (recs[1]) {
    plan.push({
      dog: `${top.dog}→${recs[1].dog}`, type: "Palé Exacto",
      stakePct: Math.max(stakePct - 1, 1),
      amount: (lastBankroll * Math.max(stakePct - 1, 1) / 100).toFixed(2),
      confidence: "Media ⭐⭐"
    });
  }
  return { plan, bankroll: lastBankroll };
}

function detectAnomalies(races, total, A2, A10) {
  const anomalies = [];
  for (let i = 1; i <= 8; i++) {
    if (A2[i].drought > 20) anomalies.push(`🚨 Perro #${i}: sequía de ${A2[i].drought}`);
    if (A10[i].avgGap && Math.abs(A10[i].lastGap - parseFloat(A10[i].avgGap)) > parseFloat(A10[i].avgGap) * 1.5) {
      anomalies.push(`⏰ Perro #${i}: ciclo ${A10[i].avgGap}, actual ${A10[i].lastGap}`);
    }
  }
  if (total >= 3 && races[0].winner === races[1].winner && races[1].winner === races[2].winner) {
    anomalies.push(`⚠️ Perro #${races[0].winner} ganó 3 seguidas`);
  }
  return anomalies;
}

function analyzeEV(races) {
  const withOdd = races.filter(r => r.odd);
  if (withOdd.length < 5) return null;
  const totalInvested = withOdd.length;
  let totalReturn = 0;
  withOdd.forEach(r => { totalReturn += r.odd; });
  const roi = ((totalReturn - totalInvested) / totalInvested) * 100;
  const avgOdd = totalReturn / withOdd.length;
  return { roi: roi.toFixed(2), avgOdd: avgOdd.toFixed(2), samples: withOdd.length };
}

function renderAll(data) {
  const { total, races, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12,
          finalRecommendations, eliminationList, stakingPlan, anomalies, evAnalysis } = data;

  let html = `
    <div class="info-bar">
      📊 <strong>${total}</strong> carreras |
      Último: <strong class="highlight">#${races[0]?.winner || 'N/A'}</strong> |
      Secuencia: <span class="seq">${A11.sequence.map(s => '#'+s).join(' → ')}</span>
    </div>
    <h3 class="section-title">🎯 TOP 4 RECOMENDACIONES</h3>
    <div class="grid-2">
  `;

  finalRecommendations.slice(0, 4).forEach((rec, idx) => {
    const badge = idx === 0 ? 'main-pick' : 'pick';
    const label = idx === 0 ? '🔥 PRINCIPAL' : '';
    html += `
      <div class="${badge}">
        <div class="pick-header">Perro #${rec.dog} ${label}</div>
        <div class="pick-score">Score: <strong>${rec.score}</strong></div>
        <div class="pick-detail">Sequía: ${rec.drought} | ${rec.status}</div>
        <div class="pick-detail">Frec (10): ${rec.freq10}% | (5): ${rec.freq5}%</div>
        <div class="pick-conf">${rec.confidence}</div>
      </div>
    `;
  });
  html += `</div>`;

  if (A4.prediction) {
    html += `<h3 class="section-title"> MARKOV 1° (después de #${A4.lastWinner})</h3><div class="flex-wrap">`;
    A4.prediction.forEach((p, i) => {
      html += `<div class="badge-markov">${['🥇','🥈','🥉'][i]} #${p.dog} <span class="pct">${p.prob.toFixed(1)}%</span></div>`;
    });
    html += `</div>`;
  }

  if (A7.topExact.length > 0) {
    html += `<h3 class="section-title pale-title">🔗 PALÉS DIRECCIONALES</h3><div class="flex-wrap">`;
    A7.topExact.forEach(([pair, count]) => {
      html += `<div class="badge-pale"><strong>#${pair.replace('→',' → #')}</strong> <span class="count">(${count}x)</span></div>`;
    });
    html += `</div>`;
  }

  if (eliminationList.length > 0) {
    html += `<h3 class="section-title elim-title">❌ ELIMINAR</h3><div class="elim-box">`;
    eliminationList.forEach(e => {
      html += `<div><strong>Perro #${e.dog}</strong>: ${e.reasons.join(', ')}</div>`;
    });
    html += `</div>`;
  }

  if (anomalies.length > 0) {
    html += `<h3 class="section-title anom-title">⚠️ ALERTAS</h3><div class="anom-box">`;
    anomalies.forEach(a => { html += `<div>${a}</div>`; });
    html += `</div>`;
  }

  html += `<h3 class="section-title">📊 DESGLOSE</h3><div class="grid-4">`;
  for (let i = 1; i <= 8; i++) {
    const rec = finalRecommendations.find(r => r.dog === i);
    html += `<div class="dog-box">
      <strong>P${i}</strong><br>
      <span class="stat">G: ${A1.global[i]}</span><br>
      <span class="stat drought">Seq: ${rec.drought}</span><br>
      <span class="stat status">${rec.status}</span>
    </div>`;
  }
  html += `</div>`;

  statsContainer.innerHTML = html;
}

loadAndAnalyzeRaces();
