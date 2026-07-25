import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Tus credenciales reales configuradas
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

// Guardar carrera y palé en Firebase
raceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raceId = document.getElementById("raceId").value;
    const winner = Number(document.getElementById("winner").value);
    const secondPlaceValue = document.getElementById("secondPlace").value;
    const secondPlace = secondPlaceValue ? Number(secondPlaceValue) : null;

    // Validación para evitar que elijan el mismo perro en 1ro y 2do
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

// Análisis exhaustivo de patrones, frecuencias, probabilidades y palés
async function loadAndAnalyzeRaces() {
    statsContainer.innerHTML = "<p>Calculando patrones, probabilidades y palés...</p>";
    historyList.innerHTML = "<li>Cargando historial...</li>";

    try {
        const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(200));
        const querySnapshot = await getDocs(q);
        
        let races = [];
        querySnapshot.forEach((doc) => {
            races.push(doc.data());
        });

        let total = races.length;

        if (total === 0) {
            statsContainer.innerHTML = "<p>Comienza a registrar carreras para que el algoritmo calcule los patrones.</p>";
            historyList.innerHTML = "<li>No hay registros.</li>";
            return;
        }

        let counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0};
        races.forEach(r => {
            if(counts[r.winner] !== undefined) counts[r.winner]++;
        });

        let lastSeen = {1:999, 2:999, 3:999, 4:999, 5:999, 6:999, 7:999, 8:999};
        races.forEach((r, index) => {
            if (lastSeen[r.winner] === 999) {
                lastSeen[r.winner] = index;
            }
        });

        let lastWinner = races[0] ? races[0].winner : null;

        // Análisis de combinaciones de Palé más frecuentes
        let paleCounts = {};
        races.forEach(r => {
            if (r.winner && r.secondPlace) {
                let pair = [r.winner, r.secondPlace].sort((a, b) => a - b).join(" - ");
                paleCounts[pair] = (paleCounts[pair] || 0) + 1;
            }
        });
        let sortedPales = Object.entries(paleCounts).sort((a, b) => b[1] - a[1]);

        let recommendations = [];
        for (let i = 1; i <= 8; i++) {
            let freqPercent = (counts[i] / total) * 100;
            let drought = lastSeen[i] === 999 ? total : lastSeen[i];
            let score = (drought * 1.5) - freqPercent;
            recommendations.push({ dog: i, score, drought, freqPercent: freqPercent.toFixed(1) });
        }

        recommendations.sort((a, b) => b.score - a.score);

        let htmlStats = `
            <div style="margin-bottom: 15px;">
                <p>Total analizadas: <strong>${total} carreras</strong> | Último ganador: <strong style="color:#6366f1;">Perro #${lastWinner || 'N/A'}</strong></p>
            </div>
            
            <h3 style="font-size: 0.95rem; color: #a5b4fc; margin-bottom: 8px;">🎯 Top Recomendaciones para Ganador:</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 15px;">
        `;

        recommendations.slice(0, 4).forEach((rec, idx) => {
            let badgeColor = idx === 0 ? '#4f46e5' : '#1f2937';
            htmlStats += `
                <div style="background:${badgeColor}; border: 1px solid #374151; padding: 10px; border-radius: 8px;">
                    <div style="font-weight: bold; font-size: 1rem;">Perro #${rec.dog} ${idx === 0 ? '🔥 [Principal]' : ''}</div>
                    <div style="font-size: 0.8rem; color: #9ca3af;">Ausente hace: ${rec.drought} carreras</div>
                    <div style="font-size: 0.8rem; color: #9ca3af;">Frecuencia global: ${rec.freqPercent}%</div>
                </div>
            `;
        });

        // Sección de Palés más recurrentes
        if (sortedPales.length > 0) {
            htmlStats += `</div><h3 style="font-size: 0.95rem; color: #f43f5e; margin-bottom: 8px;">🔗 Palés más recurrentes en tus registros:</h3>
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 15px;">`;
            
            sortedPales.slice(0, 3).forEach(([pair, count]) => {
                htmlStats += `<div style="background:#1f2937; border: 1px solid #f43f5e; padding:6px 10px; border-radius:6px; font-size:0.85rem;">
                    <strong>#${pair.replace(' - ', ' y #')}</strong> <span style="color:#9ca3af;">(${count} veces)</span>
                </div>`;
            });
            htmlStats += `</div>`;
        } else {
            htmlStats += `</div>`;
        }

        htmlStats += `<h3 style="font-size: 0.95rem; color: #a5b4fc; margin-bottom: 8px;">📊 Desglose por Perro (Frecuencia y Sequía):</h3>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">`;

        for (let i = 1; i <= 8; i++) {
            htmlStats += `
                <div style="background:#1f2937; padding:6px; border-radius:6px; text-align:center;">
                    <small>P${i}</small><br>
                    <strong>${counts[i]}</strong> <span style="font-size:0.7rem; color:#9ca3af;">(${((counts[i]/total)*100).toFixed(0)}%)</span><br>
                    <span style="font-size:0.65rem; color:#f87171;">Sequía: ${lastSeen[i]}</span>
                </div>`;
        }
        htmlStats += `</div>`;
        statsContainer.innerHTML = htmlStats;

        let htmlHistory = "";
        races.slice(0, 15).forEach(r => {
            let paleText = r.secondPlace ? ` | <span style="color:#f43f5e;">Palé: #${r.winner} y #${r.secondPlace}</span>` : '';
            htmlHistory += `<li><span>Carrera: <strong>${r.raceId}</strong></span> <span style="color: #6366f1;">1ro: #${r.winner}</span>${paleText}</li>`;
        });
        historyList.innerHTML = htmlHistory;

    } catch (error) {
        console.error("Error al analizar datos: ", error);
        statsContainer.innerHTML = "<p>Error al procesar las estadísticas.</p>";
    }
}

loadAndAnalyzeRaces();
