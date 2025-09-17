import { useState, useEffect, process } from "react";
import "./App.css";

// const apiKey = import.meta.env.VITE_SNFC_API_KEY;
const apiKey = "55659429-0fc0-41ab-926f-d48d2e7472d3";
const hagondange = "stop_area:SNCF:87191114";
const metz = "stop_area:SNCF:87192039";

function formatDate(date = new Date()) {
  const pad = (n) => (n < 10 ? "0" + n : n);
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "T" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

function App() {
  const [trains, setTrains] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function getTrains() {
      const now = formatDate();
      const url = `https://api.sncf.com/v1/coverage/sncf/journeys?from=${encodeURIComponent(
        hagondange
      )}&to=${encodeURIComponent(metz)}&datetime=${now}&count=1`;

      try {
        const response = await fetch(url, {
          headers: {
            Authorization: "Basic " + btoa(apiKey + ":"),
          },
        });

        if (!response.ok) throw new Error(`Erreur HTTP: ${response.status}`);
        const data = await response.json();

        if (!data.journeys || !Array.isArray(data.journeys))
          throw new Error("Aucun trajet trouvé");

        const journeys = data.journeys.map((journey) => {
          const dep = journey.departure_date_time;
          const arr = journey.arrival_date_time;
          const depTime = dep.substr(9, 2) + ":" + dep.substr(11, 2);
          const arrTime = arr.substr(9, 2) + ":" + arr.substr(11, 2);
          const durationMin = journey.duration
            ? Math.floor(journey.duration / 60)
            : 0;

          // Trouver les disruptions qui concernent ce train
          const relatedDisruptions =
            (data.disruptions || []).filter((d) =>
              d.application_periods.some(
                (p) =>
                  dep >= p.begin && dep <= p.end // le départ est dans la période
              )
            ).map((d) => ({
              id: d.id,
              status: d.status,
              severity: d.severity?.name,
              message: d.messages?.find((m) => m.text)?.text || "Pas de message",
              updatedAt: d.updated_at,
              update_format_time: d.updated_at.substr(9, 2) + ":" + d.updated_at.substr(11, 2)
            }));

          return { depTime, arrTime, durationMin, disruptions: relatedDisruptions };
        });

        setTrains(journeys);
      } catch (err) {
        setError(err.message);
      }
    }

    getTrains();
  }, []);

  return (
    <div>
      <div className="head">
        <header>
          <h1>🚆 Prochains trains Hagondange → Metz</h1>
        </header>
      </div>
      

      {error && <p style={{ color: "red" }}>Erreur : {error}</p>}

      <div className="container">
        {trains.map((t, i) => (
          <div className="notification" key={i}>
            <div className="notiglow"></div>
            <div className="notiborderglow"></div>

            <div className="notititle">
              🚆 Départ : {t.depTime} → Arrivée : {t.arrTime}
            </div>

            <div className="notibody">
              <div className="time"><strong>⇌ {t.durationMin} min</strong></div>
              {t.disruptions.length > 0 && (
                <div className="disruptions">
                  <h4>Perturbations :</h4>
                  <ul>
                    {t.disruptions.map((d) => (
                      <li key={d.id}>
                        <strong>{d.severity}</strong> – {d.status}
                        <br />
                        📝 {d.message}
                        <br />
                        <span className="update">
                          ⏱️ Mis à jour : {d.update_format_time}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      
    </div>
  );
}

export default App;
