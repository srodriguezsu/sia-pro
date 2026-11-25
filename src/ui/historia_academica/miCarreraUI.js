import { renderCreditosProgress } from "./creditosUI.js";
import { renderAvanceProgress } from "./avanceUI.js";
import { getCreditos } from "../../domain/historyData.js";

/**
 * Renders the "Mi carrera" tab: academic progress projection followed by a card with credits by typology.
 *
 * @param {HTMLElement} container - The DOM container for the tab.
 * @returns {void}
 */
export function renderMiCarrera(container) {
    if (!container) return;
    container.innerHTML = "";

    // Both sections depend on the academic history; show a single helper message when it is missing
    const creditos = getCreditos();
    if (!creditos || creditos.length === 0) {
        container.innerHTML = "<p>No hay historia académica disponible.<br><br>Navega a <b>Información académica > Historia académica</b> para cargar tus datos por primera vez.</p>";
        return;
    }

    const creditosSection = document.createElement("section");
    creditosSection.className = "sia-carrera-section sia-carrera-creditos-card";
    const avanceSection = document.createElement("section");
    avanceSection.className = "sia-carrera-section";
    container.append(avanceSection, creditosSection);

    renderAvanceProgress(avanceSection);
    renderCreditosProgress(creditosSection);
}
