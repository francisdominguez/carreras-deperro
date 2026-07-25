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

// ============ GUARDAR CARRERA ============
raceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raceId = document.getElementById("raceId").value;
  const winner = Number(document.getElementById("winner").value);
  const sp = document.getElementById("secondPlace").value;
  const tp = document.getElementById("thirdPlace").value;
  const odd = document.getElementById("odd").value;
  const bankroll = document.getElementById("bankroll").value;

  const secondPlace = sp ? Number(sp) : null;
  const thirdPlace = tp ? Number(tp) : null;
  const oddValue = odd ? Number(odd) : null;

  // Validación: no repetir perros en top 3
  const positions = [winner, secondPlace, thirdPlace].filter(x => x !== null);
  const unique = new Set(positions);
  if (unique.size !== positions.length) {
    alert("No puedes repetir el mismo perro en diferentes posiciones.");
    return;
  }

  try {
    await addDoc(collection(db, "races"), {
      raceId, winner, secondPlace, thirdPlace,
      odd: oddValue, bankroll: Number(bankroll) || 0,
      timestamp: new Date()
    });
    raceForm.reset();
    document.getElementById("bankroll").value = bankroll || 100;
    loadAndAnalyzeRaces();
  } catch (error) {
    console.error("Error al guardar: ", error);
    alert("Error al guardar la carrera.");
  }
});

// ============ MOTOR PRINCIPAL ============
async function loadAndAnalyzeRaces() {
  statsContainer.innerHTML = "<p>⚙️ Ejecutando 12 algoritmos predictivos...</p>";
  historyList.innerHTML = "<li>Cargando historial...</li>";

  try {
    const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(500));
    const querySnapshot = await getDocs(q);
    const races = [];
    querySnapshot.forEach((doc) => races.push(doc.data()));

    const total = races.length;
    if (total === 0) {
      statsContainer.innerHTML = "<p>Registra carreras para activar el motor.</p>";
      historyList.innerHTML = "<li>Sin registros.</li>";
      return;
    }

    // ============ EJECUTAR LOS 12 ANÁLISIS ============
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

    // ============ SCORE COMPUESTO FINAL ============
    const finalRecommendations = buildFinalScore(races, total, A1, A2, A3, A4, A11);
    const eliminationList = buildEliminationList(races, total, A2, A9);
    const stakingPlan = buildStakingPlan(finalRecommendations, races);
    const anomalies = detectAnomalies(races, total, A2, A10);
    const evAnalysis = analyzeEV(races);

    // ============ RENDERIZADO ============
    renderAll({
      total, races, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12,
      finalRecommendations, eliminationList, stakingPlan, anomalies, evAnalysis
    });

    // Historial
    let htmlHistory = "";
    races.slice(0, 15).forEach(r => {
      const paleText = r.secondPlace ? ` | <span class="pale">P: #${r.winner}→#${r.secondPlace}</span>` : '';
      const triText = r.thirdPlace ? `<span class="tri">T: #${r.thirdPlace}</span>` : '';
      htmlHistory += `<li><span>C: <strong>${r.raceId}</strong></span> <span class="winner">1ro: #${r.winner}</span>${paleText}${triText}</li>`;
    });
    historyList.innerHTML = htmlHistory;

  } catch (error) {
    console.error("Error: ", error);
    statsContainer.innerHTML = "<p>Error al procesar.</p>";
  }
}

// ============ A1: FRECUENCIAS EN MÚLTIPLES VENTANAS ============
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

// ============ A2: SEQUÍAS Y RACHAS ============
function analyzeStreaks(races, total) {
  const lastSeen = {1:999,2:999,3:999,4:999,5:999,6:999,7:999,8:999};
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

// ============ A3: DEUDA ESTADÍSTICA ============
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

// ============ A4: MARKOV 1er ORDEN ============
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

// ============ A5: MARKOV 2do ORDEN ============
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

// ============ A6: CORRELACIÓN (cuando gana X, ¿quién queda 2do?) ============
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

// ============ A7: PALÉS (exactos y revueltos) ============
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

// ============ A8: TRIFECTAS ============
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

// ============ A9: PATRONES PAR/IMPAR Y RANGOS ============
function analyzePatterns(races, total) {
  let par = 0, impar = 0;
  let bajo = 0, alto = 0; // 1-4 vs 5-8
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

// ============ A10: DETECCIÓN DE CICLOS ============
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

// ============ A11: MOMENTUM (últimas 5) ============
function analyzeMomentum(races) {
  const last5 = races.slice(0, 5);
  const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
  last5.forEach(r => counts[r.winner]++);
  const sequence = last5.map(r => r.winner);
  return { counts, sequence };
}

// ============ A12: PATRONES ESPEJO ============
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

// ============ SCORE FINAL COMPUESTO ============
function buildFinalScore(races, total, A1, A2, A3, A4, A11) {
  const recs = [];
  for (let i = 1; i <= 8; i++) {
    const drought = A2[i].drought;
    const freqGlobal = (A1.global[i] / total) * 100;
    const freq10 = (A1.last10[i] / Math.min(10, total)) * 100;
    const freq5 = (A1.last5[i] / Math.min(5, total)) * 100;
    const debt = parseFloat(A3[i].debt);
    const momentum = A11.counts[i] * 10;

    // Markov boost
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
      droughtScore * 0.25 +
      recentScore * 0.25 +
      debtScore * 0.20 +
      hotBonus * 0.15 +
      momentum * 0.10 +
      markovBoost * 0.05
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

// ============ LISTA DE ELIMINACIÓN ============
function buildEliminationList(races, total, A2, A9) {
  const eliminate = [];
  for (let i = 1; i <= 8; i++) {
    let reasons = [];
    if (A2[i].status === "hot 🔥" && A2[i].last5 >= 2) {
      reasons.push("racha caliente (puede enfriar)");
    }
    if (A2[i].drought < 2) reasons.push("acaba de ganar");
    if (reasons.length > 0) eliminate.push({ dog: i, reasons });
  }
  return eliminate;
}

// ============ PLAN DE STAKING ============
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
    dog: top.dog,
    type: "Ganador",
    stakePct,
    amount: (lastBankroll * stakePct / 100).toFixed(2),
    confidence: top.confidence
  });

  // Palé con el 2do
  if (recs[1]) {
    plan.push({
      dog: `${top.dog}→${recs[1].dog}`,
      type: "Palé Exacto",
      stakePct: Math.max(stakePct - 1, 1),
      amount: (lastBankroll * Math.max(stakePct - 1, 1) / 100).toFixed(2),
      confidence: "Media ⭐⭐"
    });
  }
  return { plan, bankroll: lastBankroll };
}

// ============ ANOMALÍAS ============
function detectAnomalies(races, total, A2, A10) {
  const anomalies = [];
  for (let i = 1; i <= 8; i++) {
    if (A2[i].drought > 20) {
      anomalies.push(`🚨 Perro #${i}: sequía de ${A2[i].drought} carreras (anomalía)`);
    }
    if (A10[i].avgGap && Math.abs(A10[i].lastGap - parseFloat(A10[i].avgGap)) > parseFloat(A10[i].avgGap) * 1.5) {
      anomalies.push(`⏰ Perro #${i}: su ciclo promedio es ${A10[i].avgGap} pero lleva ${A10[i].lastGap} (posible rebote)`);
    }
  }
  if (total >= 3 && races[0].winner === races[1].winner && races[1].winner === races[2].winner) {
    anomalies.push(`⚠️ Perro #${races[0].winner} ganó 3 seguidas (racha inusual)`);
  }
  return anomalies;
}

// ============ VALOR ESPERADO ============
function analyzeEV(races) {
  const withOdd = races.filter(r => r.odd);
  if (withOdd.length < 5) return null;
  const totalInvested = withOdd.length; // 1 unidad cada uno
  let totalReturn = 0;
  withOdd.forEach(r => { totalReturn += r.odd; });
  const roi = ((totalReturn - totalInvested) / totalInvested) * 100;
  const avgOdd = totalReturn / withOdd.length;
  return { roi: roi.toFixed(2), avgOdd: avgOdd.toFixed(2), samples: withOdd.length };
}

// ============ RENDERIZADO ============
function renderAll(data) {
  const { total, races, A1, A2, A3, A4, A5, A6, A7, A8, A9, A10, A11, A12,
          finalRecommendations, eliminationList, stakingPlan, anomalies, evAnalysis } = data;

  let html = `
    <div class="info-bar">
      📊 <strong>${total}</strong> carreras analizadas |
      Último ganador: <strong class="highlight">#${races[0]?.winner || 'N/A'}</strong> |
      Sequencia: <span class="seq">${A11.sequence.map(s => '#'+s).join(' → ')}</span>
    </div>

    <h3 class="section-title">🎯 RECOMENDACIÓN FINAL (Score Compuesto)</h3>
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
        <div class="pick-detail">Frec. (10): ${rec.freq10}% | (5): ${rec.freq5}%</div>
        <div class="pick-detail">Deuda: ${rec.debt} | Mom: ${rec.momentum}</div>
        <div class="pick-conf">${rec.confidence}</div>
      </div>
    `;
  });
  html += `</div>`;

  // PLAN DE STAKING
  html += `
    <h3 class="section-title">💰 PLAN DE APUESTA (Bankroll: $${stakingPlan.bankroll})</h3>
    <div class="staking-box">
  `;
  stakingPlan.plan.forEach(p => {
    html += `
      <div class="stake-item">
        <div><strong>${p.type}:</strong> Perro ${p.dog}</div>
        <div>Apostar: <strong class="money">$${p.amount}</strong> (${p.stakePct}%)</div>
        <div class="conf-small">${p.confidence}</div>
      </div>
    `;
  });
  html += `</div>`;

  // MARKOV 1er ORDEN
  if (A4.prediction) {
    html += `<h3 class="section-title">🔀 MARKOV 1° (después de #${A4.lastWinner})</h3><div class="flex-wrap">`;
    A4.prediction.forEach((p, i) => {
      html += `<div class="badge-markov">${['🥇','🥈','🥉'][i]} #${p.dog} <span class="pct">${p.prob.toFixed(1)}%</span></div>`;
    });
    html += `</div>`;
  }

  // MARKOV 2do ORDEN
  if (A5.prediction) {
    html += `<h3 class="section-title">🔀🔀 MARKOV 2° (después de #${A5.last2[0]}→#${A5.last2[1]})</h3><div class="flex-wrap">`;
    A5.prediction.forEach((p, i) => {
      html += `<div class="badge-markov">${['🥇','🥈','🥉'][i]} #${p.dog} <span class="pct">${p.prob.toFixed(1)}%</span></div>`;
    });
    html += `</div>`;
  }

  // PALÉS
  if (A7.topExact.length > 0) {
    html += `<h3 class="section-title pale-title">🔗 PALÉS DIRECCIONALES</h3><div class="flex-wrap">`;
    A7.topExact.forEach(([pair, count]) => {
      html += `<div class="badge-pale"><strong>#${pair.replace('→',' → #')}</strong> <span class="count">(${count}x)</span></div>`;
    });
    html += `</div>`;
  }

  // TRIFECTAS
  if (A8.length > 0) {
    html += `<h3 class="section-title tri-title">🏆 TRIFECTAS MÁS FRECUENTES</h3><div class="flex-wrap">`;
    A8.forEach(([tri, count]) => {
      html += `<div class="badge-tri"><strong>#${tri.replace(/-/g,' → #')}</strong> <span class="count">(${count}x)</span></div>`;
    });
    html += `</div>`;
  }

  // CORRELACIÓN
  const lastW = races[0]?.winner;
  if (lastW) {
    const row = A6[lastW];
    const sorted = Object.entries(row).filter(([d]) => Number(d) !== lastW).sort((a,b) => b[1]-a[1]).slice(0, 3);
    if (sorted.some(s => s[1] > 0)) {
      html += `<h3 class="section-title">🔗 CORRELACIÓN (cuando gana #${lastW}, queda 2do...)</h3><div class="flex-wrap">`;
      sorted.forEach(([dog, count]) => {
        if (count > 0) html += `<div class="badge-corr">#${dog} <span class="count">(${count}x)</span></div>`;
      });
      html += `</div>`;
    }
  }

  // PATRONES
  html += `
    <h3 class="section-title">🎲 PATRONES DE DISTRIBUCIÓN</h3>
    <div class="patterns-box">
      <div><strong>Par:</strong> ${A9.par}% | <strong>Impar:</strong> ${A9.impar}%</div>
      <div><strong>Bajo (1-4):</strong> ${A9.bajo}% | <strong>Alto (5-8):</strong> ${A9.alto}%</div>
    </div>
  `;

  // CICLOS
  html += `<h3 class="section-title">⏰ CICLOS PROMEDIO (cada cuántas vuelve)</h3><div class="grid-4">`;
  for (let i = 1; i <= 8; i++) {
    const c = A10[i];
    const avg = c.avgGap ? `${c.avgGap}` : '—';
    const last = c.lastGap === 999 ? 'N/A' : c.lastGap;
    html += `<div class="cycle-box"><strong>P${i}</strong><br><span class="cycle-avg">μ=${avg}</span><br><span class="cycle-last">Actual: ${last}</span></div>`;
  }
  html += `</div>`;

  // ESPEJOS
  if (A12.length > 0) {
    html += `<h3 class="section-title">🪞 PATRONES ESPEJO</h3><div class="flex-wrap">`;
    A12.forEach(m => {
      html += `<div class="badge-mirror">#${m.pair.replace('-','→#')} <span class="count">(${m.count}x)</span> ↔ #${m.reverse.replace('-','→#')} <span class="count">(${m.reverseCount}x)</span></div>`;
    });
    html += `</div>`;
  }

  // ELIMINACIÓN
  if (eliminationList.length > 0) {
    html += `<h3 class="section-title elim-title">❌ PERROS A ELIMINAR (no apostar)</h3><div class="elim-box">`;
    eliminationList.forEach(e => {
      html += `<div><strong>Perro #${e.dog}</strong>: ${e.reasons.join(', ')}</div>`;
    });
    html += `</div>`;
  }

  // ANOMALÍAS
  if (anomalies.length > 0) {
    html += `<h3 class="section-title anom-title">⚠️ ALERTAS DEL SISTEMA</h3><div class="anom-box">`;
    anomalies.forEach(a => { html += `<div>${a}</div>`; });
    html += `</div>`;
  }

  // EV
  if (evAnalysis) {
    html += `
      <h3 class="section-title">💹 RENDIMIENTO HISTÓRICO (EV)</h3>
      <div class="ev-box">
        <div>ROI: <strong class="${parseFloat(evAnalysis.roi) >= 0 ? 'positive' : 'negative'}">${evAnalysis.roi}%</strong></div>
        <div>Cuota promedio: <strong>${evAnalysis.avgOdd}</strong></div>
        <div>Muestras: <strong>${evAnalysis.samples}</strong></div>
      </div>
    `;
  }

  // DESGLOSE
  html += `<h3 class="section-title">📊 DESGLOSE COMPLETO</h3><div class="grid-4">`;
  for (let i = 1; i <= 8; i++) {
    const rec = finalRecommendations.find(r => r.dog === i);
    html += `
      <div class="dog-box">
        <strong>P${i}</strong><br>
        <span class="stat">G: ${A1.global[i]} (${rec.freqGlobal}%)</span><br>
        <span class="stat drought">Seq: ${rec.drought}</span><br>
        <span class="stat status">${rec.status}</span>
      </div>
    `;
  }
  html += `</div>`;

  statsContainer.innerHTML = html;
}

loadAndAnalyzeRaces();
