import { calculateSemesterGPA } from "./gpaCalculator.js";

/**
 * Undergraduate thresholds from the UNAL student statute (Acuerdo 008 de 2008 del CSU):
 * a PAPA below 3.0 means losing student status, and readmission (reingreso, only once)
 * is possible only with a PAPA of at least 2.7.
 */
export const PAPA_MINIMO = 3.0;
export const PAPA_REINGRESO = 2.7;
/** Margin above the minimum where a gentle heads-up is shown. */
export const PAPA_MARGEN = 3.3;

/**
 * Sums of the graded history (weighted grade and credits), the base of the PAPA.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>|null} historyData - Academic history.
 * @returns {{weighted: number, credits: number}} Sums over graded subjects.
 */
export function historyTotals(historyData) {
    const graded = [];
    Object.values(historyData || {}).forEach((s) => (s?.asignaturas || []).forEach((a) => {
        if (Number.isFinite(a.calificacion)) graded.push({ grade: a.calificacion, credits: a.creditos });
    }));
    const { gpa, totalCredits } = calculateSemesterGPA(graded);
    return { weighted: (gpa || 0) * totalCredits, credits: totalCredits };
}

/**
 * Average needed in the next `credits` credits so the PAPA reaches `target`.
 *
 * @param {{weighted: number, credits: number}} totals - History sums.
 * @param {number} credits - Credits of the next semester.
 * @param {number} target - Target PAPA.
 * @returns {number|null} Needed average (may be <= 0 when already safe, > 5 when out of reach in one semester).
 */
export function neededAverage(totals, credits, target) {
    if (!credits || credits <= 0) return null;
    return (target * (totals.credits + credits) - totals.weighted) / credits;
}

/**
 * Classifies a PAPA against the statute thresholds.
 *
 * @param {number|null} papa - PAPA (actual or projected).
 * @returns {"sin-reingreso"|"reingreso"|"margen"|"ok"|null} Level, or null without data.
 */
export function standingLevel(papa) {
    if (!Number.isFinite(papa)) return null;
    if (papa < PAPA_REINGRESO) return "sin-reingreso";
    if (papa < PAPA_MINIMO) return "reingreso";
    if (papa < PAPA_MARGEN) return "margen";
    return "ok";
}
