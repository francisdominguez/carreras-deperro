import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "tu-id",
    appId: "tu-app-id"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const raceForm = document.getElementById("raceForm");
const historyList = document.getElementById("historyList");
const statsContainer = document.getElementById("statsContainer");

// Guardar carrera en Firebase
raceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const raceId = document.getElementById("raceId").value;
    const winner = Number(document.getElementById("winner").value);

    try {
        await addDoc(collection(db, "races"), {
            raceId,
            winner,
            timestamp: new Date()
        });
        raceForm.reset();
        loadAndAnalyzeRaces();
    } catch (error) {
        console.error("Error al guardar: ", error);
        alert("Error al guardar la carrera.");
    }
});

// Análisis exhaustivo de patrones, frecuencias y probabilidades
async function loadAndAnalyzeRaces() {
    statsContainer.innerHTML = "<p>Calculando patrones y probabilidades...</p>";
    historyList.innerHTML = "<li>Cargando historial...</li>";

    try {
        // Traemos las últimas 200 carreras para tener una muestra sólida de patrones
        const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(200));
        const querySnapshot = await getDocs(q);
        
        let races = [];
        querySnapshot.forEach((doc) => {
            races.push(doc.data());
        });

        // Como vienen ordenadas de más reciente a más antigua, invertimos para analizar cronológicamente
        let chronologicalRaces = [...races].reverse();
        let total = races.length;

        if (total === 0) {
            statsContainer.innerHTML = "<p>Comienza a registrar carreras para que el algoritmo calcule los patrones.</p>";
            historyList.innerHTML = "<li>No hay registros.</li>";
            return;
        }

        // 1. Conteo de Frecuencias Absolutas
        let counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0};
        races.forEach(r => {
            if(counts[r.winner] !== undefined) counts[r.winner]++;
        });

        // 2. Cálculo de Rachas (Carreras sin ganar de cada perro)
        let lastSeen = {1:999, 2:999, 3:999, 4:999, 5:999, 6:999, 7:999, 8:999};
        races.forEach((r, index) => {
            // El índice 0 es el más reciente
            if (lastSeen[r.winner] === 999) {
                lastSeen[r.winner] = index; // Distancia desde el presente
            }
        });

        // 3. Matriz de Transición Simple (¿Quién gana después del último ganador actual?)
        let lastWinner = races[0] ? races[0].winner : null;
        let transitions = {};
        for(let i = 0; i < chronologicalRaces.length - 1; i++) {
            let current = chronologicalRaces[i].winner;
            let next = chronologicalRaces[i+1].winner;
            if(!transitions[current]) transitions[current] = {};
            transitions[current][next] = (transitions[current][next] || 0) + 1;
        }

        // Generar sugerencias ponderadas combinando variables
        let recommendations = [];
        for (let i = 1; i <= 8; i++) {
            let freqPercent = (counts[i] / total) * 100;
            let drought = lastSeen[i] === 999 ? total : lastSeen[i]; // Cuántas carreras lleva sin ganar
            
            // Puntuación heurística combinada: 
            // - Premia al perro si lleva mucho tiempo sin salir (drought alto)
            // - Considera su frecuencia histórica
            let score = (drought * 1.5) - freqPercent;
            recommendations.push({ dog: i, score, drought, freqPercent: freqPercent.toFixed(1) });
        }

        // Ordenar de mayor recomendación a menor
        recommendations.sort((a, b) => b.score - a.score);

        // Renderizar Estadísticas y Predicciones en Pantalla
        let htmlStats = `
            <div style="margin-bottom: 15px;">
                <p>Total analizadas: <strong>${total} carreras</strong> | Último ganador: <strong style="color:#6366f1;">Perro #${lastWinner || 'N/A'}</strong></p>
            </div>
            
            <h3 style="font-size: 0.95rem; color: #a5b4fc; margin-bottom: 8px;">🎯 Top Recomendaciones para la Siguiente Jugada:</h3>
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

        htmlStats += `</div><h3 style="font-size: 0.95rem; color: #a5b4fc; margin-bottom: 8px;">📊 Desglose por Perro (Frecuencia y Sequía):</h3>
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

        // Renderizar Historial Reciente
        let htmlHistory = "";
        races.slice(0, 15).forEach(r => {
            htmlHistory += `<li><span>Carrera: <strong>${r.raceId}</strong></span> <span style="color: #6366f1;">Ganó: Perro #${r.winner}</span></li>`;
        });
        historyList.innerHTML = htmlHistory;

    } catch (error) {
        console.error("Error al analizar datos: ", error);
        statsContainer.innerHTML = "<p>Error al procesar las estadísticas.</p>";
    }
}

// Cargar al iniciar
loadAndAnalyzeRaces();
