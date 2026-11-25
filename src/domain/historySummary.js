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

/**
 * Normalizes a subject name to compare attempts of the same subject across semesters.
 *
 * @param {string|null} name - Subject name.
 * @returns {string} Accent-free, upper-case, single-spaced name.
 */
export function normalizeHistoryName(name) {
    return (name || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

/**
 * Finds subjects taken more than once and lists their attempts in chronological order.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>} data - History grouped by semester.
 * @returns {Map.<string, Array.<{semestre: string, calificacion: number|null, estado: string|null}>>}
 *   Map from normalized name to its attempts; only subjects with 2+ attempts are included.
 */
export function findRetakes(data) {
    const attempts = new Map();
    sortSemesterKeys(Object.keys(data || {})).forEach((semestre) => {
        (data[semestre]?.asignaturas || []).forEach((a) => {
            const key = normalizeHistoryName(a.nombre);
            if (!key) return;
            if (!attempts.has(key)) attempts.set(key, []);
            attempts.get(key).push({ semestre, calificacion: a.calificacion, estado: a.estado });
        });
    });
    for (const [key, list] of attempts) {
        if (list.length < 2) attempts.delete(key);
    }
    return attempts;
}

/**
 * Extracts "YYYY-T" from a period or semester key ("2025-1S", "2025-1S Ordinaria" → "2025-1").
 *
 * @param {string|null} key - Period or semester key.
 * @returns {string|null} Normalized year-term, or null.
 */
function yearTerm(key) {
    const m = (key || "").match(/(\d{4})\s*-\s*(\d)/);
    return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Detects the semester currently in progress by comparing the calculator with the history.
 * A period is in progress when the calculator has subjects of that period that are not yet in
 * the history with a final grade. Subjects that finished early appear in both; ongoing ones only
 * in the calculator. If every calculator subject is already graded in the history, the calculator
 * data is from a finished semester and nothing is detected.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>|null} historyData - Academic history.
 * @param {Array.<{name: string, period: string|null}>} calculatorSubjects - Cached calculator subjects.
 * @returns {{period: string, historyKey: string|null, pendingNames: Array.<string>}|null}
 *   Ongoing period (calculator key), the matching history semester key if it already has
 *   early-finished subjects, and the calculator subjects still pending; or null.
 */
export function detectOngoingSemester(historyData, calculatorSubjects) {
    const periods = [...new Set(calculatorSubjects.map((s) => s.period).filter((p) => yearTerm(p)))];
    if (periods.length === 0) return null;
    // Most recent calculator period
    const period = periods.sort((a, b) => yearTerm(b).localeCompare(yearTerm(a), undefined, { numeric: true }))[0];
    const term = yearTerm(period);

    const historyKey = Object.keys(historyData || {}).find((k) => yearTerm(k) === term) || null;
    const gradedInPeriod = historyKey
        ? (historyData[historyKey].asignaturas || []).filter((a) => classifyAsignatura(a) !== "otra")
        : [];

    const pendingNames = calculatorSubjects
        .filter((s) => yearTerm(s.period) === term)
        .filter((s) => !gradedInPeriod.some((a) => isSameSubjectName(a.nombre, s.name)))
        .map((s) => s.name);

    if (pendingNames.length === 0) return null;

    // A calculator period older than the latest history semester is stale data
    const latestHistory = sortSemesterKeys(Object.keys(historyData || {})).map(yearTerm).filter(Boolean).at(-1);
    if (latestHistory && term.localeCompare(latestHistory, undefined, { numeric: true }) < 0) return null;

    return { period, historyKey, pendingNames };
}

/**
 * Projects the PAPA after the given period, combining the final grades of the academic history
 * with the (possibly calculated) grades of the calculator for that period.
 * Subjects of that period already graded in the history (e.g. finished early) keep their final
 * grade; only the ones still pending use the calculator grade. Returns null when nothing of that
 * period is pending (the semester is over), to avoid counting subjects twice.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>|null} historyData - Academic history.
 * @param {string} period - Calculator period key (e.g. "2025-1S").
 * @param {Array.<{name: string, grade: number, credits: number|null}>} currentSubjects - Calculator subjects of that period.
 * @returns {{current: number|null, projected: number|null}|null} Current and projected PAPA, or null when not applicable.
 */
export function projectPapa(historyData, period, currentSubjects) {
    if (!historyData || Object.keys(historyData).length === 0) return null;
    const term = yearTerm(period);
    if (!term) return null;

    const graded = [];
    const gradedInPeriod = [];
    Object.entries(historyData).forEach(([semestre, s]) => {
        const samePeriod = yearTerm(semestre) === term;
        (s?.asignaturas || []).forEach((a) => {
            if (!Number.isFinite(a.calificacion)) return;
            graded.push({ grade: a.calificacion, credits: a.creditos });
            if (samePeriod) gradedInPeriod.push(a);
        });
    });

    const pending = currentSubjects.filter((s) => !gradedInPeriod.some((a) => isSameSubjectName(a.nombre, s.name)));
    if (pending.length === 0) return null;

    const current = calculateSemesterGPA(graded).gpa;
    const projected = calculateSemesterGPA([
        ...graded,
        ...pending.map((s) => ({ grade: s.grade, credits: s.credits }))
    ]).gpa;
    return { current, projected };
}

/**
 * Finds the approved attempt of a subject in the academic history, matching by exact
 * normalized name or by the code in "Name (CODE)" identifiers.
 *
 * @param {Object.<string, {asignaturas: Array.<Object>}>|null} historyData - Academic history.
 * @param {string} identifier - Subject name, optionally with its code in parentheses.
 * @returns {{semestre: string, calificacion: number|null}|null} Approved attempt, or null.
 */
export function findApprovedAttempt(historyData, identifier) {
    if (!historyData || !identifier) return null;
    const codeMatch = identifier.match(/\(([^)]+)\)\s*$/);
    const code = codeMatch ? normalizeHistoryName(codeMatch[1]) : null;
    const name = normalizeHistoryName(identifier.replace(/\([^)]*\)\s*$/, ""));

    for (const semestre of sortSemesterKeys(Object.keys(historyData))) {
        for (const a of historyData[semestre]?.asignaturas || []) {
            if (classifyAsignatura(a) !== "aprobada") continue;
            const n = normalizeHistoryName(a.nombre);
            if ((name && n === name) || (code && n.includes(code))) {
                return { semestre, calificacion: a.calificacion };
            }
        }
    }
    return null;
}

/**
 * Compares two subject names ignoring accents, case, spacing and a trailing "(CODE)".
 *
 * @param {string|null} a - Subject name.
 * @param {string|null} b - Subject name.
 * @returns {boolean} True when both refer to the same subject.
 */
export function isSameSubjectName(a, b) {
    const clean = (n) => normalizeHistoryName((n || "").replace(/\([^)]*\)\s*$/, ""));
    const ca = clean(a);
    return Boolean(ca) && ca === clean(b);
}
