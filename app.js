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
const regimeContainer = document.getElementById("regimeContainer");
const combosContainer = document.getElementById("combosContainer");

let cachedRaces = [];

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
    console.error("Error: ", error);
    alert("Error al guardar.");
  }
});

// ============ PARSER TOLERANTE ============
function parseBulkInput(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const results = [];
  for (const line of lines) {
    const numbers = line.match(/\d+/g);
    if (!numbers || numbers.length < 3) {
      results.push({ raw: line, valid: false, error: "Faltan números" });
      continue;
    }
    let raceNum = numbers[0];
    let winner = parseInt(numbers[1]);
    let second = parseInt(numbers[2]);

    if (winner < 1 || winner > 8) {
      results.push({ raw: line, valid: false, error: `1ro inválido: ${winner}` });
      continue;
    }
    if (second < 1 || second > 8) {
      results.push({ raw: line, valid: false, error: `2do inválido: ${second}` });
      continue;
    }
    if (winner === second) {
      results.push({ raw: line, valid: false, error: "1ro y 2do iguales" });
      continue;
    }
    results.push({ raw: line, valid: true, raceId: `C${raceNum}`, winner, secondPlace: second });
  }
  return results;
}

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
        html += `<tr class="valid"><td>${i+1}</td><td>${r.raceId}</td><td>#${r.winner}</td><td>#${r.secondPlace}</td><td class="status-ok">✓</td></tr>`;
      } else {
        html += `<tr class="invalid"><td>${i+1}</td><td colspan="3">${r.raw}</td><td class="status-err">✗ ${r.error}</td></tr>`;
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
    bulkPreview.innerHTML = `✅ <strong>${saved} carreras guardadas.</strong> Las combinaciones se recalculan automáticamente.`;
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
  regimeContainer.innerHTML = "<p>Analizando régimen...</p>";
  combosContainer.innerHTML = "<p>Generando combinaciones...</p>";

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
      regimeContainer.innerHTML = "<p>Sin datos.</p>";
      combosContainer.innerHTML = "<p>Sin datos.</p>";
      return;
    }

    // Análisis base
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

    // NUEVO: Régimen del día + Combinaciones múltiples
    const regime = detectDayRegime(races, total, A1, A2, A11);
    const combos = generateMultipleCombos(races, total, A1, A2, A3, A4, A7, A11, finalRecommendations);

    renderAll({
      total, races, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12,
      finalRecommendations, eliminationList, stakingPlan, anomalies, evAnalysis
    });
    renderRegime(regime);
    renderCombos(combos, races[0]?.bankroll || 100);

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

// ============ NUEVO: DETECTOR DE RÉGIMEN DEL DÍA ============
function detectDayRegime(races, total, A1, A2, A11) {
  // Analiza las últimas 10-15 carreras para determinar el patrón ACTUAL
  const window = Math.min(15, total);
  const recent = races.slice(0, window);

  // Frecuencia reciente
  const recentFreq = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  recent.forEach(r => recentFreq[r.winner]++);

  // Perros "activos HOY" (ganaron al menos 1 vez en las últimas 15)
  const activeDogs = Object.entries(recentFreq)
    .filter(([_, count]) => count > 0)
    .map(([dog, count]) => ({ dog: Number(dog), count }))
    .sort((a,b) => b.count - a.count);

  // Perros "fríos HOY" (0 victorias recientes + sequía larga)
  const coldDogs = [];
  for (let i = 1; i <= 8; i++) {
    if (recentFreq[i] === 0 && A2[i].drought >= 8) {
      coldDogs.push(i);
    }
  }

  // Determinar tipo de régimen
  let regimeType, regimeDesc;
  const uniqueWinners = activeDogs.length;

  if (uniqueWinners <= 3) {
    regimeType = "CONCENTRADO 🔥";
    regimeDesc = `Solo ${uniqueWinners} perros están ganando hoy. El patrón es cerrado. Juega solo los activos.`;
  } else if (uniqueWinners <= 5) {
    regimeType = "EQUILIBRADO ⚖️";
    regimeDesc = `${uniqueWinners} perros activos. Patrón normal. Mezcla activos + 1 frío en rebote.`;
  } else {
    regimeType = "DISTRIBUIDO 🎲";
    regimeDesc = `${uniqueWinners} perros ganando. Patrón abierto. Usa coberturas amplias.`;
  }

  // Detectar sesgo par/impar reciente
  let parRecent = 0, imparRecent = 0;
  recent.forEach(r => {
    if (r.winner % 2 === 0) parRecent++; else imparRecent++;
  });
  const sesgo = parRecent > imparRecent ? "PAR" : "IMPAR";

  // Detectar sesgo bajo/alto
  let bajoRecent = 0, altoRecent = 0;
  recent.forEach(r => {
    if (r.winner <= 4) bajoRecent++; else altoRecent++;
  });
  const sesgoRango = bajoRecent > altoRecent ? "BAJO (1-4)" : "ALTO (5-8)";

  return {
    type: regimeType,
    desc: regimeDesc,
    activeDogs,
    coldDogs,
    sesgo,
    sesgoRango,
    windowSize: window
  };
}

// ============ NUEVO: GENERADOR DE COMBINACIONES MÚLTIPLES ============
function generateMultipleCombos(races, total, A1, A2, A3, A4, A7, A11, recs) {
  const combos = [];
  const top3 = recs.slice(0, 3);
  const top5 = recs.slice(0, 5);

  // 1) APUESTA PRINCIPAL (la más fuerte)
  combos.push({
    type: "main",
    name: "🎯 Apuesta Principal",
    desc: `Ganador: Perro #${top3[0].dog} (Score: ${top3[0].score})`,
    dogs: [top3[0].dog],
    strategy: "Apuesta fuerte al perro con mejor score compuesto.",
    stake: "3-5% del bankroll",
    confidence: top3[0].confidence
  });

  // 2) PALÉ BOX (cobertura en ambos órdenes)
  if (top3[1]) {
    const d1 = top3[0].dog, d2 = top3[1].dog;
    combos.push({
      type: "box",
      name: "🔗 Palé Box (2 perros)",
      desc: `Cubre ambos órdenes: #${d1}→#${d2} y #${d2}→#${d1}`,
      dogs: [d1, d2],
      strategy: "Si cualquiera de los 2 queda en top 2, ganas. Doble cobertura.",
      stake: "2-3% del bankroll",
      confidence: "Alta ⭐⭐⭐"
    });
  }

  // 3) TRIFECTA KEY (fijo 1 + los demás)
  if (top3[1] && top3[2]) {
    const fixed = top3[0].dog;
    const others = [top3[1].dog, top3[2].dog];
    combos.push({
      type: "key",
      name: "🔑 Trifecta Key",
      desc: `Fijo #${fixed} 1ro + ${others.map(d=>'#'+d).join(' y ')} en 2do/3ro`,
      dogs: [fixed, ...others],
      strategy: `Fijas al mejor perro en 1ro, y combinas los otros 2 en 2do y 3ro. Cubre 2 trifectas.`,
      stake: "2% del bankroll",
      confidence: "Media-Alta ⭐⭐⭐"
    });
  }

  // 4) TRIFECTA WHEEL (rueda con top 4)
  if (top5[3]) {
    const wheelDogs = top5.slice(0, 4).map(r => r.dog);
    combos.push({
      type: "wheel",
      name: "🔄 Trifecta Wheel (4 perros)",
      desc: `Cualquier combinación de ${wheelDogs.map(d=>'#'+d).join(', ')} en top 3`,
      dogs: wheelDogs,
      strategy: "Cubre TODAS las combinaciones posibles entre estos 4 perros. Más cara pero muy segura.",
      stake: "4-5% del bankroll",
      confidence: "Muy Alta ⭐⭐⭐⭐"
    });
  }

  // 5) COBERTURA AMPLIA (top 5 ganador)
  combos.push({
    type: "cover",
    name: "💰 Cobertura Ganador (5 perros)",
    desc: `Apuesta a los 5 mejores: ${top5.map(r=>'#'+r.dog).join(', ')}`,
    dogs: top5.map(r => r.dog),
    strategy: "Apuesta al ganador distribuyendo entre los 5 mejores. Si gana cualquiera, recuperas.",
    stake: "5% del bankroll (1% a cada uno)",
    confidence: "Alta ⭐⭐⭐"
  });

  // 6) PALÉ CON MARKOV (si Markov coincide con top 1)
  if (A4.prediction && A4.prediction.length > 0) {
    const markovTop = A4.prediction[0].dog;
    if (markovTop === top3[0].dog && top3[1]) {
      combos.push({
        type: "main",
        name: "⭐⭐ Palé Confirmado (Markov + Score)",
        desc: `#${top3[0].dog}→#${top3[1].dog} - Score y Markov coinciden`,
        dogs: [top3[0].dog, top3[1].dog],
        strategy: "Doble confirmación: el score lo recomienda Y Markov lo predice. Apuesta fuerte.",
        stake: "4% del bankroll",
        confidence: "Muy Alta ⭐⭐⭐⭐"
      });
    }
  }

  // 7) JUGADA AL FRÍO EN REBOTE (si hay perros con ciclo vencido)
  const coldRebound = [];
  for (let i = 1; i <= 8; i++) {
    if (A2[i].drought >= 12 && A3[i].debt > 5) {
      coldRebound.push(i);
    }
  }
  if (coldRebound.length > 0) {
    combos.push({
      type: "cover",
      name: "🧊 Rebote de Fríos",
      desc: `Perros en deuda: ${coldRebound.map(d=>'#'+d).join(', ')}`,
      dogs: coldRebound,
      strategy: "Perros que 'deben' ganar estadísticamente. Apuesta pequeña pero con valor.",
      stake: "1-2% del bankroll",
      confidence: "Media ⭐⭐"
    });
  }

  return combos;
}

// ============ RENDER RÉGIMEN ============
function renderRegime(regime) {
  let html = `
    <div class="regime-box">
      <div class="regime-title">🌡️ ${regime.type}</div>
      <div class="regime-desc">${regime.desc}</div>
      <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:8px;">
        📊 Análisis de últimas <strong>${regime.windowSize}</strong> carreras |
        Sesgo: <strong style="color:#fbbf24;">${regime.sesgo}</strong> |
        Rango: <strong style="color:#fbbf24;">${regime.sesgoRango}</strong>
      </div>
      <div style="font-size:0.8rem; color:#cbd5e1; margin-bottom:4px;">
        <strong>🔥 Perros activos HOY:</strong>
      </div>
      <div class="regime-dogs">
        ${regime.activeDogs.map(d => `<span class="regime-dog">#${d.dog} (${d.count}x)</span>`).join('')}
      </div>
      ${regime.coldDogs.length > 0 ? `
        <div style="font-size:0.8rem; color:#cbd5e1; margin-top:10px; margin-bottom:4px;">
          <strong>🧊 Perros fríos (posible rebote):</strong>
        </div>
        <div class="regime-dogs">
          ${regime.coldDogs.map(d => `<span class="regime-dog cold">#${d}</span>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  regimeContainer.innerHTML = html;
}

// ============ RENDER COMBINACIONES ============
function renderCombos(combos, bankroll) {
  let html = `<div style="background:#0f172a; padding:8px; border-radius:6px; font-size:0.8rem; color:#94a3b8; margin-bottom:10px;">
    💵 Bankroll actual: <strong style="color:#10b981;">$${bankroll}</strong> |
    🎰 <strong style="color:#6ee7b7;">${combos.length} combinaciones</strong> generadas con los mismos datos
  </div>`;

  combos.forEach(c => {
    html += `
      <div class="combo-item ${c.type}">
        <div class="combo-header">
          <span class="combo-type">${c.name}</span>
          <span class="combo-confidence">${c.confidence}</span>
        </div>
        <div class="combo-detail">${c.desc}</div>
        <div class="combo-detail" style="font-size:0.78rem; color:#94a3b8;">💡 ${c.strategy}</div>
        <div class="combo-dogs">
          ${c.dogs.map(d => `<span class="combo-dog-badge">#${d}</span>`).join('')}
        </div>
        <div class="combo-stake">💰 Sugerencia: <strong>${c.stake}</strong></div>
      </div>
    `;
  });

  html += `
    <div style="background:rgba(251, 191, 36, 0.1); border:1px solid #fbbf24; border-radius:8px; padding:10px; margin-top:10px; font-size:0.8rem; color:#fbbf24;">
      <strong>💡 Consejo:</strong> No juegues todas a la vez. Elige 2-3 combinaciones según tu presupuesto. 
      La <strong>Principal</strong> + <strong>Palé Box</strong> es la combinación más rentable.
    </div>
  `;

  combosContainer.innerHTML = html;
}

// ============ FUNCIONES DE ANÁLISIS (12 algoritmos) ============
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
  const lastSeen = {1:999,2:999,3:0,4:999,5:999,6:999,7:999,8:999};
  races.forEach((r, idx) => {
    if (lastSeen[r.winner] === 999) lastSeen[r.winner] = idx;
  });
  const status = {};
  for (let i = 1; i <= 8; i++) {
    const last5 = races.slice(0, Math.min(5, total)).filter(r => r.winner === i).length;
    const last10 = races.slice(0, Math.min(10, total)).filter(r => r.winner === i).length;
    const last15 = races.slice(0, Math.min(15, total)).filter(r => r.winner === i).length;
    let s = "neutral";
    if (last5 >= 2) s = "hot 🔥";
    else if (last15 === 0 && lastSeen[i] >= 15) s = "cold 🧊";
    else if (last10 === 0 && lastSeen[i] >= 10) s = "cool ❄️";
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
    par: ((par/total)*100).toFixed(1),
    impar: ((impar/total)*100).toFixed(1),
    bajo: ((bajo/total)*100).toFixed(1),
    alto: ((alto/total)*100).toFixed(1)
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
      anomalies.push(`⏰ Perro #${i}: ciclo promedio ${A10[i].avgGap}, actual ${A10[i].lastGap}`);
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
    html += `<h3 class="section-title">🔀 MARKOV 1° (después de #${A4.lastWinner})</h3><div class="flex-wrap">`;
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
