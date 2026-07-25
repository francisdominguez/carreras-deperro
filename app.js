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
const topRecomendacionesEl = document.getElementById("topRecomendaciones");
const desglosePerrosEl = document.getElementById("desglosePerros");
const palesFrecuentesEl = document.getElementById("palesFrecuentes");

// Sistema de Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Remover active de todos
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    // Activar el seleccionado
    btn.classList.add('active');
    const tabId = btn.dataset.tab;
    document.getElementById(`tab-${tabId}`).classList.add('active');
  });
});

// Guardar carrera
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
    console.error("Error al guardar: ", error);
    alert("Error al guardar la carrera.");
  }
});

// Cargar y analizar datos
async function loadAndAnalyzeRaces() {
  try {
    const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(200));
    const querySnapshot = await getDocs(q);
    let races = [];
    querySnapshot.forEach((doc) => races.push(doc.data()));

    const total = races.length;
    
    if (total === 0) {
      totalCarrerasEl.textContent = "0";
      ultimoGanadorEl.textContent = "#-";
      topRecomendacionesEl.innerHTML = "<p>Registra carreras para ver análisis.</p>";
      historyList.innerHTML = "<li>Sin registros</li>";
      desglosePerrosEl.innerHTML = "<p>Sin datos</p>";
      palesFrecuentesEl.innerHTML = "<p>Sin datos</p>";
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

    // Último ganador
    const lastWinner = races[0] ? races[0].winner : null;
    totalCarrerasEl.textContent = total;
    ultimoGanadorEl.textContent = `#${lastWinner || '-'}`;

    // Recomendaciones
    let recommendations = [];
    for (let i = 1; i <= 8; i++) {
      let freqPercent = (counts[i] / total) * 100;
      let drought = lastSeen[i] === 999 ? total : lastSeen[i];
      let score = (drought * 1.5) - freqPercent;
      recommendations.push({ dog: i, score, drought, freqPercent: freqPercent.toFixed(1) });
    }
    recommendations.sort((a, b) => b.score - a.score);

    // Renderizar recomendaciones (TAB 1)
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

    // Historial (TAB 2)
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

    // Desglose por perro (TAB 3)
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

    // Palés frecuentes (TAB 4)
    let paleCounts = {};
    races.forEach(r => {
      if (r.winner && r.secondPlace) {
        let pair = [r.winner, r.secondPlace].sort((a, b) => a - b).join(" - ");
        paleCounts[pair] = (paleCounts[pair] || 0) + 1;
      }
    });
    let sortedPales = Object.entries(paleCounts).sort((a, b) => b[1] - a[1]);

    let htmlPales = "";
    if (sortedPales.length > 0) {
      sortedPales.slice(0, 10).forEach(([pair, count]) => {
        htmlPales += `
          <div class="pale-item">
            <span class="dogs">#${pair.replace(' - ', ' → #')}</span>
            <span class="count">${count}x</span>
          </div>
        `;
      });
    } else {
      htmlPales = "<p>Sin palés registrados</p>";
    }
    palesFrecuentesEl.innerHTML = htmlPales;

  } catch (error) {
    console.error("Error al analizar datos: ", error);
  }
}

// Cargar al inicio
loadAndAnalyzeRaces();
