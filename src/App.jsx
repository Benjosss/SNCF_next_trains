import { useState, useEffect } from "react";
import "./App.css";

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
  const [loading, setLoading] = useState(false);
  const [dest, setDest] = useState(true); // true = Hagondange → Metz, false = Metz → Hagondange

  const status_label = {
    active: "En cours",
    past: "Passé",
    future: "Futur"
  };

  const severity_label = {
    "trip delayed": "Retardé",
    "trip canceled": "Annulé",
  };

  // Convertir HHMMSS en minutes
  const timeToMinutes = (timeStr) => {
    if (!timeStr || timeStr.length < 6) return 0;
    const hours = parseInt(timeStr.substr(0, 2));
    const minutes = parseInt(timeStr.substr(2, 2));
    const seconds = parseInt(timeStr.substr(4, 2));
    return hours * 60 + minutes + seconds / 60;
  };

  // Calculer le retard en minutes
  const calculateDelay = (baseTime, amendedTime) => {
    if (!baseTime || !amendedTime) return 0;
    const baseMinutes = timeToMinutes(baseTime);
    const amendedMinutes = timeToMinutes(amendedTime);
    return Math.round(amendedMinutes - baseMinutes);
  };

  // Appel API
  async function getTrains(direction) {
    try {
      setLoading(true);
      setError(null);
      const now = formatDate();
      // const now = "20250919T120000";
      const from = direction ? hagondange : metz;
      const to = direction ? metz : hagondange;

      const url = `https://api.sncf.com/v1/coverage/sncf/journeys?from=${encodeURIComponent(
        from
      )}&to=${encodeURIComponent(to)}&datetime=${now}&count=1`;

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

        // Compter les arrêts intermédiaires
        let stopCount = 0;
        if (journey.sections && Array.isArray(journey.sections)) {
          journey.sections.forEach((section) => {
            if (section.stop_date_times && Array.isArray(section.stop_date_times)) {
              // Soustrait 2 pour exclure les gares de départ et d'arrivée
              const sectionStops = section.stop_date_times.length - 2;
              if (sectionStops > 0) {
                stopCount += sectionStops;
              }
            }
          });
        }

        // Déterminer la destination
        const targetDestination = dest ? "Metz" : "Hagondange";

        // Filtrer les perturbations
        const relatedDisruptions = (data.disruptions || [])
          .filter((d) =>
            d.application_periods.some(
              (p) => dep >= p.begin && dep <= p.end // Départ dans la période
            )
          )
          .map((d) => {
            let delayMinutes = 0;
            let arrivalDelay = 0;

            // Chercher le point d'arrivée correspondant à la destination
            if (d.impacted_objects && d.impacted_objects.length > 0) {
              d.impacted_objects.forEach((impactedObj) => {
                if (impactedObj.impacted_stops) {
                  impactedObj.impacted_stops.forEach((stop) => {
                    const stopName = stop.stop_point?.name || "";
                    
                    if (stopName.includes(targetDestination)) {
                      // Calculer le retard à l'arrivée
                      const baseArrival = stop.base_arrival_time;
                      const amendedArrival = stop.amended_arrival_time;
                      
                      if (baseArrival && amendedArrival) {
                        arrivalDelay = calculateDelay(baseArrival, amendedArrival);
                      }

                      // Calculer le retard au départ
                      const baseDeparture = stop.base_departure_time;
                      const amendedDeparture = stop.amended_departure_time;
                      
                      if (baseDeparture && amendedDeparture) {
                        const departureDelay = calculateDelay(baseDeparture, amendedDeparture);
                        // Prendre le retard le plus important entre le retard au départ et le retard à l'arrivée
                        delayMinutes = Math.max(arrivalDelay, departureDelay);
                      } else {
                        delayMinutes = arrivalDelay;
                      }
                    }
                  });
                }
              });
            }

            return {
              id: d.id,
              status: d.status,
              severity: d.severity?.name,
              message: d.messages?.find((m) => m.text)?.text || "Pas de message",
              updatedAt: d.updated_at,
              update_format_time:
                d.updated_at.substr(9, 2) + ":" + d.updated_at.substr(11, 2),
              delayMinutes: delayMinutes,
              destination: targetDestination
            };
          });

        return { 
          depTime, 
          arrTime, 
          durationMin, 
          stopCount,
          disruptions: relatedDisruptions 
        };
      });

      setTrains(journeys);
      setError(null);
    } catch (err) {
      setError(err.message);
      setTrains([]);
    } finally{
      setLoading(false);
    }
  }

  useEffect(() => {
    getTrains(dest);
  }, [dest]);

  return (
    <div>
      <div className="head">
        <header>
          <h1 id="main_title">
            {dest
              ? "🚆 Prochains trains Hagondange → Metz"
              : "🚆 Prochains trains Metz → Hagondange"}
          </h1>
          <span className="buttons">
            <button
              id="refresh_btn"
              className="refresh"
              type="button"
              onClick={() => {getTrains(dest);}}
            >
              <strong>🔄</strong>
            </button>
            <button
              id="change_btn"
              className="change"
              type="button"
              onClick={() => setDest((prev) => !prev)}
            >
              <strong>🔀</strong>
            </button>
          </span>
        </header>
      </div>

      {loading && <p>⏳ Chargement des trains...</p>}
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
              <div className="time_bottom">
                <div className="time">
                  <strong>⇌ {t.durationMin} min</strong>
                </div>
              </div>
              <div className="stops_bottom">
                <div className="stop_count">
                  <strong>📍{t.stopCount}</strong>
                </div>
              </div>
              {t.disruptions.length > 0 && (
                <div className="disruptions">
                  <h4>Perturbations :</h4>
                  {t.disruptions.map((d) => (
                    <span key={d.id}>
                      ⁉️ {severity_label[d.severity] || d.severity}
                      <br />
                      💬 {d.message}
                      <br />
                      <span className="update">
                        ⏱️ Mis à jour : {d.update_format_time} •{" "}
                        {status_label[d.status]}
                      </span>
                      {d.delayMinutes > 0 && (
                        <div className="delay_bottom">
                        <div className="time">
                          <strong>⌚ {d.delayMinutes} min</strong>
                        </div>
                      </div>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {t.disruptions.length <= 0 &&(
                <div className="disruptions">
                  <h3 className="no_disruptions">Aucune perturbation, bon voyage !</h3>
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
