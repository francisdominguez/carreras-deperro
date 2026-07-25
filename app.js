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
  const secondPlaceValue = document.getElementById("secondPlace").value;
  const secondPlace = secondPlaceValue ? Number(secondPlaceValue) : null;

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
    console.error("Error al guardar: ", error);
    alert("Error al guardar la carrera.");
  }
});

// ============ MOTOR DE ANÁLISIS PROFESIONAL ============
async function loadAndAnalyzeRaces() {
  statsContainer.innerHTML = "<p>Procesando análisis profundo de patrones...</p>";
  historyList.innerHTML = "<li>Cargando historial...</li>";

  try {
    const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(500));
    const querySnapshot = await getDocs(q);
    const races = [];
    querySnapshot.forEach((doc) => races.push(doc.data()));

    const total = races.length;
    if (total === 0) {
      statsContainer.innerHTML = "<p>Registra carreras para activar el motor de análisis.</p>";
      historyList.innerHTML = "<li>Sin registros.</li>";
      return;
    }

    // ============ 1. FRECUENCIAS EN MÚLTIPLES VENTANAS ============
    const windows = { global: total, last50: 50, last20: 20, last10: 10 };
    const freqByWindow = {};
    for (const [key, size] of Object.entries(windows)) {
      const slice = races.slice(0, Math.min(size, total));
      const counts = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
      slice.forEach(r => { if(counts[r.winner] !== undefined) counts[r.winner]++; });
      freqByWindow[key] = counts;
    }

    // ============ 2. SEQUÍAS Y ÚLTIMA APARICIÓN ============
    const lastSeen = {1:999,2:999,3:999,4:999,5:999,6:999,7:999,8:999};
    races.forEach((r, idx) => {
      if (lastSeen[r.winner] === 999) lastSeen[r.winner] = idx;
    });

    // ============ 3. DETECCIÓN DE RACHAS (HOT / COLD) ============
    // Hot: ganó ≥2 veces en últimas 10. Cold: 0 veces en últimas 15.
    const streakStatus = {};
    for (let i = 1; i <= 8; i++) {
      const last10 = freqByWindow.last10[i] || 0;
      const last15 = races.slice(0, Math.min(15, total)).filter(r => r.winner === i).length;
      let status = "neutral";
      if (last10 >= 2) status = "hot 🔥";
      else if (last15 === 0 && lastSeen[i] >= 15) status = "cold 🧊";
      streakStatus[i] = { status, last10Wins: last10 };
    }

    // ============ 4. DEUDA ESTADÍSTICA (Expected Value) ============
    // Probabilidad esperada = 1/8 = 12.5%. Si ganó menos → está "en deuda".
    const expectedPct = 12.5;
    const debt = {};
    for (let i = 1; i <= 8; i++) {
      const realPct = (freqByWindow.global[i] / total) * 100;
      debt[i] = (expectedPct - realPct).toFixed(2); // positivo = en deuda
    }

    // ============ 5. MATRIZ DE TRANSICIÓN (Markov) ============
    // Después del perro X, ¿quién suele ganar?
    const transition = {};
    for (let i = 1; i <= 8; i++) transition[i] = {1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:0};
    for (let i = 0; i < races.length - 1; i++) {
      const curr = races[i].winner;
      const next = races[i+1].winner;
      if (transition[curr] && transition[curr][next] !== undefined) {
        transition[curr][next]++;
      }
    }
    // Predicción basada en el último ganador
    const lastWinner = races[0] ? races[0].winner : null;
    let markovPrediction = null;
    if (lastWinner) {
      const row = transition[lastWinner];
      const totalTrans = Object.values(row).reduce((a,b) => a+b, 0);
      if (totalTrans > 0) {
        const probs = Object.entries(row).map(([dog, count]) => ({
          dog: Number(dog), prob: (count / totalTrans) * 100
        }));
        probs.sort((a,b) => b.prob - a.prob);
        markovPrediction = probs.slice(0, 3);
      }
    }

    // ============ 6. PALÉS DIRECCIONALES (1ro → 2do) ============
    const directionalPale = {};
    races.forEach(r => {
      if (r.winner && r.secondPlace) {
        const key = `${r.winner}→${r.secondPlace}`;
        directionalPale[key] = (directionalPale[key] || 0) + 1;
      }
    });
    const topDirectionalPales = Object.entries(directionalPale)
      .sort((a,b) => b[1] - a[1]).slice(0, 5);

    // ============ 7. SCORE COMPUESTO PONDERADO ============
    // Combina: sequía (30%) + tendencia reciente (25%) + deuda (25%) + racha (20%)
    const recommendations = [];
    for (let i = 1; i <= 8; i++) {
      const drought = lastSeen[i] === 999 ? total : lastSeen[i];
      const freqGlobal = (freqByWindow.global[i] / total) * 100;
      const freqRecent = (freqByWindow.last10[i] / Math.min(10, total)) * 100;
      const debtVal = parseFloat(debt[i]);
      const hotBonus = streakStatus[i].status === "hot 🔥" ? 15 : 0;

      // Normalización (0-100)
      const droughtScore = Math.min(drought * 3, 100);
      const recentScore = freqRecent * 3;
      const debtScore = Math.max(debtVal * 4, 0);

      const composite = (
        droughtScore * 0.30 +
        recentScore * 0.25 +
        debtScore  * 0.25 +
        hotBonus   * 0.20
      );

      // Nivel de confianza
      let confidence = "Baja";
      if (composite >= 55) confidence = "Alta ⭐⭐⭐";
      else if (composite >= 40) confidence = "Media ⭐⭐";
      else if (composite >= 25) confidence = "Baja ⭐";

      recommendations.push({
        dog: i,
        score: composite.toFixed(1),
        drought,
        freqGlobal: freqGlobal.toFixed(1),
        freqRecent: freqRecent.toFixed(1),
        debt: debt[i],
        status: streakStatus[i].status,
        confidence
      });
    }
    recommendations.sort((a,b) => b.score - a.score);

    // ============ 8. DETECCIÓN DE ANOMALÍAS ============
    const anomalies = [];
    // Perro con sequía > 20 carreras
    for (let i = 1; i <= 8; i++) {
      if (lastSeen[i] > 20 && lastSeen[i] !== 999) {
        anomalies.push(`🚨 Perro #${i} lleva ${lastSeen[i]} carreras sin ganar (anomalía estadística)`);
      }
    }
    // Repetición del mismo ganador 3+ veces seguidas
    if (total >= 3 && races[0].winner === races[1].winner && races[1].winner === races[2].winner) {
      anomalies.push(`⚠️ Perro #${races[0].winner} ganó 3 carreras seguidas (racha inusual)`);
    }

    // ============ RENDERIZADO ============
    let html = `
      <div style="margin-bottom:12px; padding:10px; background:#0f172a; border-radius:8px; border:1px solid #334155;">
        <p style="font-size:0.85rem; color:#94a3b8; margin:0;">
          📊 Analizadas: <strong style="color:#fff;">${total}</strong> carreras |
          Último ganador: <strong style="color:#6366f1;">#${lastWinner || 'N/A'}</strong>
        </p>
      </div>

      <h3 style="font-size:0.95rem; color:#a5b4fc; margin-bottom:8px;">🎯 Top Recomendaciones (Score Compuesto):</h3>
      <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:8px; margin-bottom:15px;">
    `;

    recommendations.slice(0, 4).forEach((rec, idx) => {
      const badge = idx === 0 ? '#4f46e5' : '#1f2937';
      const label = idx === 0 ? '🔥 PRINCIPAL' : '';
      html += `
        <div style="background:${badge}; border:1px solid #374151; padding:10px; border-radius:8px;">
          <div style="font-weight:bold; font-size:1rem;">Perro #${rec.dog} ${label}</div>
          <div style="font-size:0.75rem; color:#9ca3af;">Score: <strong style="color:#fff;">${rec.score}</strong></div>
          <div style="font-size:0.75rem; color:#9ca3af;">Sequía: ${rec.drought} | Estado: ${rec.status}</div>
          <div style="font-size:0.75rem; color:#9ca3af;">Frec. reciente (10): ${rec.freqRecent}%</div>
          <div style="font-size:0.75rem; color:#9ca3af;">Deuda: ${rec.debt}</div>
          <div style="font-size:0.75rem; color:#fbbf24; margin-top:3px;">Confianza: ${rec.confidence}</div>
        </div>
      `;
    });
    html += `</div>`;

    // ============ MATRIZ DE TRANSICIÓN (Markov) ============
    if (markovPrediction && markovPrediction.length > 0) {
      html += `
        <h3 style="font-size:0.95rem; color:#a5b4fc; margin-bottom:8px;">🔀 Predicción Markov (después de #${lastWinner}):</h3>
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:15px;">
      `;
      markovPrediction.forEach((p, i) => {
        html += `
          <div style="background:#1f2937; border:1px solid #6366f1; padding:6px 10px; border-radius:6px; font-size:0.85rem;">
            ${i===0?'🥇':i===1?'🥈':'🥉'} #${p.dog} <span style="color:#9ca3af;">(${p.prob.toFixed(1)}%)</span>
          </div>
        `;
      });
      html += `</div>`;
    }

    // ============ PALÉS DIRECCIONALES ============
    if (topDirectionalPales.length > 0) {
      html += `<h3 style="font-size:0.95rem; color:#f43f5e; margin-bottom:8px;">🔗 Palés Direccionales (1ro → 2do):</h3>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:15px;">`;
      topDirectionalPales.forEach(([pair, count]) => {
        html += `<div style="background:#1f2937; border:1px solid #f43f5e; padding:6px 10px; border-radius:6px; font-size:0.85rem;">
          <strong>#${pair.replace('→', ' → #')}</strong> <span style="color:#9ca3af;">(${count}x)</span>
        </div>`;
      });
      html += `</div>`;
    }

    // ============ ANOMALÍAS ============
    if (anomalies.length > 0) {
      html += `<h3 style="font-size:0.95rem; color:#fbbf24; margin-bottom:8px;">⚠️ Alertas del Sistema:</h3>
      <div style="background:#1f2937; border:1px solid #fbbf24; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.85rem;">`;
      anomalies.forEach(a => { html += `<div style="margin-bottom:4px;">${a}</div>`; });
      html += `</div>`;
    }

    // ============ DESGLOSE COMPLETO ============
    html += `<h3 style="font-size:0.95rem; color:#a5b4fc; margin-bottom:8px;">📊 Desglose Completo (8 perros):</h3>
    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">`;
    for (let i = 1; i <= 8; i++) {
      const rec = recommendations.find(r => r.dog === i);
      html += `
        <div style="background:#1f2937; padding:6px; border-radius:6px; text-align:center; font-size:0.75rem;">
          <strong>P${i}</strong><br>
          <span style="color:#9ca3af;">G: ${freqByWindow.global[i]} (${rec.freqGlobal}%)</span><br>
          <span style="color:#f87171;">Seq: ${rec.drought}</span><br>
          <span style="color:#fbbf24;">${rec.status}</span>
        </div>`;
    }
    html += `</div>`;

    statsContainer.innerHTML = html;

    // ============ HISTORIAL ============
    let htmlHistory = "";
    races.slice(0, 15).forEach(r => {
      const paleText = r.secondPlace ? ` | <span style="color:#f43f5e;">Palé: #${r.winner}→#${r.secondPlace}</span>` : '';
      htmlHistory += `<li><span>Carrera: <strong>${r.raceId}</strong></span> <span style="color:#6366f1;">1ro: #${r.winner}</span>${paleText}</li>`;
    });
    historyList.innerHTML = htmlHistory;

  } catch (error) {
    console.error("Error al analizar datos: ", error);
    statsContainer.innerHTML = "<p>Error al procesar las estadísticas.</p>";
  }
}

loadAndAnalyzeRaces();
