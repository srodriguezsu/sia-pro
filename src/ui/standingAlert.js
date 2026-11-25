import { getFirstName } from "../domain/identity.js";
import { loadCachedAsignaturas } from "../domain/historyManager.js";
import {
    PAPA_MINIMO,
    PAPA_REINGRESO,
    PAPA_MARGEN,
    historyTotals,
    neededAverage,
    standingLevel
} from "../domain/academicStanding.js";

/** Credits assumed for "next semester" when nothing better is known. */
const DEFAULT_NEXT_CREDITS = 15;

/**
 * Builds an encouraging academic-standing notice for a PAPA close to or below the statute
 * minimum, with a concrete goal ("con 3.6 en tus próximos 15 créditos vuelves a 3.0").
 * Returns null when the PAPA is comfortably above the margin.
 *
 * @param {number|null} papa - PAPA to evaluate.
 * @param {{projected?: boolean, nextCredits?: number}} [options] - Whether the PAPA is a projection,
 *   and the credits to plan the goal with.
 * @returns {HTMLElement|null} Notice element.
 */
export function createStandingAlert(papa, { projected = false, nextCredits } = {}) {
    const level = standingLevel(papa);
    if (!level || level === "ok") return null;

    const credits = nextCredits > 0 ? nextCredits : DEFAULT_NEXT_CREDITS;
    const totals = historyTotals(loadCachedAsignaturas());
    const name = getFirstName();
    const which = `${name ? `${name}, tu` : "Tu"} PAPA${projected ? " proyectado" : ""}`;
    const value = papa.toFixed(2);

    let title;
    let body;
    if (level === "margen") {
        title = `${which} es ${value}: tienes margen, cuídalo`;
        const keep = neededAverage(totals, credits, PAPA_MARGEN);
        body = !projected && keep != null && keep > 0 && keep <= 5
            ? `Con un promedio de <b>${keep.toFixed(1)}</b> en tus próximos ${credits} créditos subes a ${PAPA_MARGEN.toFixed(1)} y te alejas del mínimo (${PAPA_MINIMO.toFixed(1)}).`
            : `El mínimo para conservar la calidad de estudiante es ${PAPA_MINIMO.toFixed(1)}. Cada semestre por encima de tu promedio te da más tranquilidad.`;
    } else {
        title = level === "reingreso"
            ? `${which} es ${value}: aún estás a tiempo`
            : `${which} es ${value}: vale la pena actuar ya`;
        const need = neededAverage(totals, credits, PAPA_MINIMO);
        // A projection still depends on this semester's pending grades, so the goal is about them
        const goal = projected
            ? "Las notas que faltan este semestre todavía pueden cambiar este resultado: prueba en la calculadora qué necesitas."
            : need == null || totals.credits === 0
            ? ""
            : need <= 5
                ? `Con un promedio de <b>${Math.max(need, 0).toFixed(1)}</b> en tus próximos ${credits} créditos vuelves a ${PAPA_MINIMO.toFixed(1)}.`
                : `Subir a ${PAPA_MINIMO.toFixed(1)} tomará más de un semestre: cada nota por encima de ${PAPA_MINIMO.toFixed(1)} te acerca.`;
        const rule = level === "reingreso"
            ? `Con un PAPA menor a ${PAPA_MINIMO.toFixed(1)} se pierde la calidad de estudiante, pero desde ${PAPA_REINGRESO.toFixed(1)} se puede solicitar reingreso (una sola vez).`
            : `Por debajo de ${PAPA_REINGRESO.toFixed(1)} ya no es posible solicitar reingreso, así que cada punto cuenta.`;
        body = `${goal} ${rule} Bienestar Universitario y tu tutor pueden ayudarte a planear.`;
    }

    const el = document.createElement("div");
    el.className = `sia-standing sia-standing-${level}`;
    el.setAttribute("role", "status");
    el.innerHTML = `
        <div class="sia-standing-title">${title}</div>
        <div class="sia-standing-body">${body}</div>
        <div class="sia-standing-source">Según el Estatuto Estudiantil de la UNAL (Acuerdo 008 de 2008), para pregrado. Confirma tu caso con tu facultad.</div>
    `;
    return el;
}
