import { areCreditosAvailable, extractCreditosFromDom } from "../../scraper/domScraper.js";
import { saveCachedCreditos, loadCachedCreditos } from "../../domain/historyManager.js";
import { tipologiaClass, getTipologiaKey, compareTipologias } from "../../utils/tipologias.js";
import { openHistoriaWithTipologia } from "./asignaturasUI.js";
import { getPlannedCredits } from "../../domain/scheduleManager.js";

/**
 * Renders a visual breakdown of credit progress grouped by academic component/typology.
 * Sorts regular components in the shared typology order, placing totals at the bottom.
 * Displays progress bars showing approved credits and currently enrolled credits.
 * 
 * @param {HTMLElement} container - The DOM container where the credit progress UI will be rendered.
 * @returns {void}
 */
export function renderCreditosProgress(container) {
    if (!container) return;
    container.innerHTML = "";
    
    let data = null;

    // Try to scrape first if currently viewing the history page
    if (areCreditosAvailable()) {
        data = extractCreditosFromDom();
        saveCachedCreditos(data);
    } else {
        // Fallback to loaded cache
        data = loadCachedCreditos();
    }

    // If no data exists in DOM or cache, show loading helper
    if (!data || data.length === 0) {
        container.innerHTML = "<p>No hay historia académica disponible.<br><br>Navega a <b>Información académica > Historia académica</b> para cargar tus datos por primera vez.</p>";
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "sia-tipologias-wrapper";

    const title = document.createElement("h2");
    title.textContent = "Créditos por Tipología";
    title.className = "sia-tipologias-header";

    container.appendChild(title);

    // 🔹 Separate general totals from regular component typologies
    const total = data.find(
        item => item.componente?.toUpperCase() === "TOTAL"
    );

    const totalEstudiante = data.find(
        item => item.componente?.toUpperCase() === "TOTAL ESTUDIANTE"
    );

    // 🔹 Filter for standard components only (e.g., Fundamentación Obligatoria, Libre Elección, etc.)
    const normales = data.filter(item => {
        const nombre = item.componente?.toUpperCase();
        return nombre !== "TOTAL" && nombre !== "TOTAL ESTUDIANTE";
    });

    // 🔹 Sort standard components in the shared typology order (Nivelación, Fundamentación, Libre elección, Disciplinar, Trabajo de grado, others)
    normales.sort((a, b) => compareTipologias(a.componente, b.componente));

    // 🔹 Rebuild final sorted array placing standard components first, followed by totals
    const orderedData = [
        ...normales,
        ...(total ? [total] : []),
        ...(totalEstudiante ? [totalEstudiante] : [])
    ];

    // Credits planned in Horario, shown as a third segment on each typology bar
    const planned = getPlannedCredits();

    // Render credit typologies overview cards
    for (const item of orderedData) {
        const {
            componente,
            exigidos,
            aprobados,
            inscritos,
            pendientes
        } = item;

        // Calculate progress percentage for approved credits
        const porcentajeAprobado = exigidos
            ? (aprobados / exigidos) * 100
            : 0;

        // Calculate total progress percentage including enrolled (in-progress) courses
        const porcentajeConInscritos = exigidos
            ? ((aprobados + inscritos) / exigidos) * 100
            : 0;

        // Planned credits: per typology, or the overall plan on the TOTAL card
        const upper = (componente || "").toUpperCase();
        const planeados = upper === "TOTAL"
            ? planned.total
            : upper === "TOTAL ESTUDIANTE" ? 0 : (planned.byTipo.get(getTipologiaKey(componente)) || 0);
        const porcentajeConPlaneados = exigidos
            ? Math.min(100, ((aprobados + inscritos + planeados) / exigidos) * 100)
            : 0;

        const card = document.createElement("div");
        // Typology cards get their shared color; totals keep the default style
        const tipoKey = getTipologiaKey(componente);
        card.className = "sia-tipologia-card" + (tipoKey ? ` sia-tipologia-colored ${tipologiaClass(componente)}` : "");

        card.innerHTML = `
            <div class="sia-tipologia-header">
                <h3>${tipoKey ? '<span class="sia-tipo-dot"></span>' : ""}${componente}</h3>
                <span class="sia-tipologia-percent">
                    ${Math.round(porcentajeAprobado)}%
                </span>
            </div>

            <div class="sia-progress-bar">
                ${planeados > 0 ? `<div class="sia-progress-planeado" style="width: ${porcentajeConPlaneados}%" title="Incluye ${planeados} créditos planeados en Horario"></div>` : ""}
                <div 
                    class="sia-progress-aprobado"
                    style="width: ${porcentajeAprobado}%"
                ></div>
                <div 
                    class="sia-progress-inscrito"
                    style="width: ${porcentajeConInscritos}%"
                >
                    <span>${Math.round(porcentajeConInscritos)}%</span>
                </div>
            </div>

            <div class="sia-tipologia-metrics">
                <span><strong>${aprobados}</strong> / ${exigidos} créditos</span>
                <span>Inscritos: ${inscritos} - Faltan: ${pendientes - inscritos} </span>
                ${planeados > 0 ? `<span class="sia-tipologia-planned">Planeados en Horario: ${planeados}</span>` : ""}
            </div>
        `;

        // Typology cards open Historia filtered by that typology
        if (tipoKey) {
            card.classList.add("sia-tipologia-link");
            card.setAttribute("role", "button");
            card.tabIndex = 0;
            card.title = `Ver las asignaturas de ${componente} en Historia`;
            const cta = document.createElement("span");
            cta.className = "sia-tipologia-cta";
            cta.textContent = "Ver asignaturas →";
            card.querySelector(".sia-tipologia-metrics").appendChild(cta);
            const open = () => openHistoriaWithTipologia(componente);
            card.addEventListener("click", open);
            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
            });
        }

        wrapper.appendChild(card);
    }

    container.appendChild(wrapper);
}