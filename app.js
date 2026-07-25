// Importa Firebase desde los CDNs oficiales
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Reemplaza con tus credenciales de Firebase Console
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "tu-proyecto.firebaseapp.com",
    projectId: "tu-proyecto",
    storageBucket: "tu-proyecto.appspot.com",
    messagingSenderId: "tu-id",
    appId: "tu-app-id"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const raceForm = document.getElementById("raceForm");
const historyList = document.getElementById("historyList");
const statsContainer = document.getElementById("statsContainer");

// Manejar el envío del formulario para guardar en Firebase
raceForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const raceId = document.getElementById("raceId").value;
    const winner = document.getElementById("winner").value;

    try {
        await addDoc(collection(db, "races"), {
            raceId: raceId,
            winner: Number(winner),
            timestamp: new Date()
        });

        raceForm.reset();
        loadRaces(); // Recargar datos
    } catch (error) {
        console.error("Error al guardar la carrera: ", error);
        alert("Hubo un error al guardar.");
    }
});

// Cargar historial y calcular frecuencias básicas
async function loadRaces() {
    historyList.innerHTML = "<li>Cargando historial...</li>";
    
    try {
        const q = query(collection(db, "races"), orderBy("timestamp", "desc"), limit(50));
        const querySnapshot = await getDocs(q);
        
        let htmlHistory = "";
        let counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0};
        let total = 0;

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            counts[data.winner] = (counts[data.winner] || 0) + 1;
            total++;
            
            htmlHistory += `<li><span>Carrera: <strong>${data.raceId}</strong></span> <span style="color: #6366f1;">Ganó: Perro #${data.winner}</span></li>`;
        });

        historyList.innerHTML = htmlHistory || "<li>No hay carreras registradas todavía.</li>";

        // Mostrar un resumen sencillo de cuántas veces ha ganado cada uno
        if (total > 0) {
            let statsHtml = `<p>Total de carreras analizadas: <strong>${total}</strong></p><br><div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;">`;
            for (let i = 1; i <= 8; i++) {
                let percent = ((counts[i] / total) * 100).toFixed(1);
                statsHtml += `<div style="background:#1f2937; padding:8px; border-radius:6px; text-align:center;"><small>P${i}</small><br><strong>${counts[i]}</strong> <span style="font-size:0.75rem; color:#9ca3af;">(${percent}%)</span></div>`;
            }
            statsHtml += `</div>`;
            statsContainer.innerHTML = statsHtml;
        } else {
            statsContainer.innerHTML = "<p>Comienza a registrar carreras para ver las estadísticas.</p>";
        }

    } catch (error) {
        console.error("Error al cargar datos: ", error);
        statsContainer.innerHTML = "<p>Error al cargar las estadísticas.</p>";
    }
}

// Cargar al iniciar la página
loadRaces();