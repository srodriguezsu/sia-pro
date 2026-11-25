import { calculateSemesterGPA } from "./gpaCalculator.js";

/**
 * Classifies a subject from the academic history by its outcome.
 * SIA only uses "APROBADA" and "REPROBADA"; anything else (e.g. no status yet) is "otra".
 *
 * @param {{estado: string|null}} asignatura - Subject record.
 * @returns {"aprobada"|"reprobada"|"otra"} Outcome category.
 */
export function classifyAsignatura(asignatura) {
    const estado = (asignatura?.estado || "").trim().toUpperCase();
    if (estado === "APROBADA") return "aprobada";
    if (estado === "REPROBADA") return "reprobada";
    return "otra";
}

/**
 * Sorts semester keys chronologically (e.g. "2023-2S" before "2024-1S").
 * Keys that share year and term are ordered alphabetically.
 *
 * @param {Array.<string>} keys - Semester keys.
 * @returns {Array.<string>} New array sorted oldest first.
 */
export function sortSemesterKeys(keys) {
    const parse = (k) => {
        const m = k.match(/(\d{4})-(\d)/);
        return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [Infinity, Infinity];
    };
    return [...keys].sort((a, b) => {
        const [ya, ta] = parse(a);
        const [yb, tb] = parse(b);
        if (ya !== yb) return ya - yb;
        if (ta !== tb) return ta - tb;
        return a.localeCompare(b);
    });
}

/**
 * Builds per-semester and overall metrics from the academic history.
 * Everything is recomputed from the subject list, so older cached data
 * (with the previous failed-credit counting) is also shown correctly.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>} data - History grouped by semester.
 * @returns {{
 *   semesters: Array.<{
 *     key: string,
 *     gpa: number|null,
 *     papa: number|null,
 *     delta: number|null,
 *     creditosAprobados: number,
 *     creditosReprobados: number,
 *     creditosOtros: number,
 *     aprobadas: number,
 *     reprobadas: number,
 *     otras: number
 *   }>,
 *   overall: {
 *     papa: number|null,
 *     creditosAprobados: number,
 *     reprobadas: number,
 *     totalAsignaturas: number,
 *     best: {key: string, gpa: number}|null,
 *     worst: {key: string, gpa: number}|null
 *   }
 * }} Semesters in chronological order plus overall totals.
 */
export function buildHistorySummary(data) {
    const keys = sortSemesterKeys(Object.keys(data || {}));
    const allGraded = [];
    let previousGpa = null;
    let totalAprobados = 0;
    let totalReprobadas = 0;
    let totalAsignaturas = 0;

    const semesters = keys.map((key) => {
        const asignaturas = data[key]?.asignaturas || [];
        const s = {
            key,
            creditosAprobados: 0,
            creditosReprobados: 0,
            creditosOtros: 0,
            aprobadas: 0,
            reprobadas: 0,
            otras: 0
        };

        const graded = [];
        asignaturas.forEach((a) => {
            const kind = classifyAsignatura(a);
            const credits = Number.isFinite(a.creditos) ? a.creditos : 0;
            if (kind === "aprobada") { s.aprobadas++; s.creditosAprobados += credits; }
            else if (kind === "reprobada") { s.reprobadas++; s.creditosReprobados += credits; }
            else { s.otras++; s.creditosOtros += credits; }
            if (Number.isFinite(a.calificacion)) graded.push({ grade: a.calificacion, credits: a.creditos });
        });

        allGraded.push(...graded);
        s.gpa = calculateSemesterGPA(graded).gpa;
        s.papa = calculateSemesterGPA(allGraded).gpa;
        s.delta = s.gpa != null && previousGpa != null ? s.gpa - previousGpa : null;
        if (s.gpa != null) previousGpa = s.gpa;

        totalAprobados += s.creditosAprobados;
        totalReprobadas += s.reprobadas;
        totalAsignaturas += asignaturas.length;
        return s;
    });

    const withGpa = semesters.filter((s) => s.gpa != null);
    let best = null;
    let worst = null;
    if (withGpa.length >= 2) {
        best = withGpa.reduce((a, b) => (b.gpa > a.gpa ? b : a));
        worst = withGpa.reduce((a, b) => (b.gpa < a.gpa ? b : a));
    }

    return {
        semesters,
        overall: {
            papa: calculateSemesterGPA(allGraded).gpa,
            creditosAprobados: totalAprobados,
            reprobadas: totalReprobadas,
            totalAsignaturas,
            best: best && { key: best.key, gpa: best.gpa },
            worst: worst && { key: worst.key, gpa: worst.gpa }
        }
    };
}
