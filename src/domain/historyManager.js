const STORAGE_KEY_ASIGNATURAS = "sia_pro_cached_asignaturas";
const STORAGE_KEY_CREDITOS = "sia_pro_cached_creditos";

/**
 * Saves the academic history subjects data to localStorage cache.
 * 
 * @param {Object} asignaturas - Scraped subject data grouped by semester.
 * @returns {void}
 */
export function saveCachedAsignaturas(asignaturas) {
    if (!asignaturas || Object.keys(asignaturas).length === 0) return;
    try {
        localStorage.setItem(STORAGE_KEY_ASIGNATURAS, JSON.stringify(asignaturas));
        markUpdated("historia");
    } catch (e) {
        console.error("[SIA Pro] Error al guardar asignaturas en caché:", e);
    }
}

/**
 * Loads the cached academic history subjects data from localStorage.
 * 
 * @returns {Object|null} Cached subject data or null if not present.
 */
export function loadCachedAsignaturas() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_ASIGNATURAS);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error("[SIA Pro] Error al cargar asignaturas de caché:", e);
        return null;
    }
}

/**
 * Saves the credits breakdown data to localStorage cache.
 * 
 * @param {Array.<Object>} creditos - Scraped credits summary array.
 * @returns {void}
 */
export function saveCachedCreditos(creditos) {
    if (!creditos || creditos.length === 0) return;
    try {
        localStorage.setItem(STORAGE_KEY_CREDITOS, JSON.stringify(creditos));
        markUpdated("creditos");
    } catch (e) {
        console.error("[SIA Pro] Error al guardar créditos en caché:", e);
    }
}

/**
 * Loads the cached credits breakdown data from localStorage.
 * 
 * @returns {Array.<Object>|null} Cached credits data or null if not present.
 */
export function loadCachedCreditos() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_CREDITOS);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error("[SIA Pro] Error al cargar créditos de caché:", e);
        return null;
    }
}

const STORAGE_KEY_GPA_SIMULATIONS = "sia_pro_gpa_simulations";

/**
 * Loads all GPA simulations from localStorage.
 * 
 * @returns {Object.<string, Object.<string, number>>} Dictionary of subject names to their respective activity-grade mappings.
 */
export function loadAllGpaSimulations() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_GPA_SIMULATIONS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("[SIA Pro] Error al cargar simulaciones de promedio:", e);
        return {};
    }
}

/**
 * Saves all GPA simulations to localStorage.
 * 
 * @param {Object.<string, Object.<string, number>>} simulations - The simulations dictionary to save.
 * @returns {void}
 */
export function saveAllGpaSimulations(simulations) {
    try {
        localStorage.setItem(STORAGE_KEY_GPA_SIMULATIONS, JSON.stringify(simulations));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar simulaciones GPA:", e);
    }
}

/**
 * Saves the simulated grades for a specific subject.
 * 
 * @param {string} subjectName - Name of the subject.
 * @param {Object.<string, number>} activitySimulations - Object mapping activity description to simulated grade.
 * @returns {void}
 */
export function saveGpaSimulationForSubject(subjectName, activitySimulations) {
    if (!subjectName) return;
    const simulations = loadAllGpaSimulations();
    simulations[subjectName] = activitySimulations;
    saveAllGpaSimulations(simulations);
}

/**
 * Loads the simulated grades for a specific subject.
 * 
 * @param {string} subjectName - Name of the subject.
 * @returns {Object.<string, number>} Object mapping activity description to simulated grade, or empty object if none.
 */
export function loadGpaSimulationForSubject(subjectName) {
    if (!subjectName) return {};
    const simulations = loadAllGpaSimulations();
    return simulations[subjectName] || {};
}

const STORAGE_KEY_GPA_CACHED_SUBJECTS = "sia_pro_gpa_cached_subjects";

/**
 * Saves the scraped subject data (original activities and grades) to localStorage.
 * Filters out DOM references to prevent circular serialization errors.
 * 
 * @param {string} subjectName - Name of the subject.
 * @param {Array.<Object>} activities - Scraped activities array.
 * @param {{period: string|null, credits: number|null, typology: string|null}} [meta] - Optional subject metadata.
 * @returns {void}
 */
export function saveGpaCachedSubject(subjectName, activities, meta) {
    if (!subjectName || !activities) return;
    try {
        const subjects = loadAllGpaCachedSubjects();
        // Compare with the previous copy to detect grades that appeared or changed
        recordNewGrades(subjectName, subjects[subjectName], activities);
        // Keep only descriptions, percentages, and grade values, ignoring DOM elements
        subjects[subjectName] = activities.map(activity => ({
            description: activity.description,
            percentage: activity.percentage,
            grade: activity.grade
        }));
        localStorage.setItem(STORAGE_KEY_GPA_CACHED_SUBJECTS, JSON.stringify(subjects));
        markUpdated("calificaciones");
    } catch (e) {
        console.error("[SIA Pro] Error al guardar asignatura GPA en caché:", e);
    }
    if (meta) saveGpaSubjectMeta(subjectName, meta);
}

const STORAGE_KEY_GPA_GOAL_SIMULATIONS = "sia_pro_gpa_goal_simulations";

/**
 * Loads the target-grade simulator state of every subject.
 *
 * @returns {Object.<string, {active: boolean, target: number}>} Goal state keyed by subject name.
 */
export function loadAllGoalSimulations() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_GPA_GOAL_SIMULATIONS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("[SIA Pro] Error al cargar simulaciones de nota objetivo:", e);
        return {};
    }
}

/**
 * Loads the target-grade simulator state of a subject.
 *
 * @param {string} subjectName - Name of the subject.
 * @returns {{active: boolean, target: number}|null} Saved state, or null if never used.
 */
export function loadGoalSimulationForSubject(subjectName) {
    if (!subjectName) return null;
    return loadAllGoalSimulations()[subjectName] || null;
}

/**
 * Saves the target-grade simulator state of a subject so it survives navigation.
 *
 * @param {string} subjectName - Name of the subject.
 * @param {{active: boolean, target: number}} state - Simulator state.
 * @returns {void}
 */
export function saveGoalSimulationForSubject(subjectName, state) {
    if (!subjectName || !state) return;
    try {
        const all = loadAllGoalSimulations();
        all[subjectName] = { active: !!state.active, target: state.target };
        localStorage.setItem(STORAGE_KEY_GPA_GOAL_SIMULATIONS, JSON.stringify(all));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar simulación de nota objetivo:", e);
    }
}

const STORAGE_KEY_GPA_SUBJECT_META = "sia_pro_gpa_subject_meta";

/**
 * Loads the metadata (period, credits, typology) of every cached GPA subject.
 *
 * @returns {Object.<string, {period: string|null, credits: number|null, typology: string|null}>} Metadata keyed by subject name.
 */
export function loadAllGpaSubjectMeta() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_GPA_SUBJECT_META);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("[SIA Pro] Error al cargar metadatos de asignaturas:", e);
        return {};
    }
}

/**
 * Saves metadata for a subject. Null fields never overwrite previously known values,
 * so a partially loaded page cannot erase credits or period already scraped.
 *
 * @param {string} subjectName - Name of the subject.
 * @param {{period: string|null, credits: number|null, typology: string|null}} meta - Subject metadata.
 * @returns {void}
 */
export function saveGpaSubjectMeta(subjectName, meta) {
    if (!subjectName || !meta) return;
    try {
        const all = loadAllGpaSubjectMeta();
        const prev = all[subjectName] || {};
        const merged = { ...prev };
        for (const key of ["period", "credits", "typology"]) {
            if (meta[key] != null) merged[key] = meta[key];
        }
        all[subjectName] = merged;
        localStorage.setItem(STORAGE_KEY_GPA_SUBJECT_META, JSON.stringify(all));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar metadatos de asignatura:", e);
    }
}

/**
 * Loads all GPA cached subjects from localStorage.
 * 
 * @returns {Object.<string, Array.<{description: string, percentage: number, grade: number}>>} Dictionary of cached subject names.
 */
export function loadAllGpaCachedSubjects() {
    try {
        const data = localStorage.getItem(STORAGE_KEY_GPA_CACHED_SUBJECTS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error("[SIA Pro] Error al cargar asignaturas GPA de caché:", e);
        return {};
    }
}

/**
 * Checks whether a subject (by name or code) exists in the cached academic history
 * and has an "APROBADA" status.
 *
 * @param {string} identifier - Subject name or code to check (e.g. "Nombre (COD123)" or "COD123").
 * @returns {boolean} True if the subject is present and approved, false otherwise.
 */
export function isSubjectApproved(identifier) {
    if (!identifier) return false;

    const data = loadCachedAsignaturas();
    if (!data) return false;

    // Normalize helper: remove diacritics and uppercase
    const normalize = (s) => s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

    // Try to extract code if identifier contains parentheses like "Name (CODE)"
    const codeMatch = identifier.match(/\(([^)]+)\)$/);
    const maybeCode = codeMatch ? codeMatch[1].trim() : null;
    const maybeName = identifier.replace(/\([^)]*\)$/, "").trim();

    const normId = normalize(identifier);
    const normCode = maybeCode ? normalize(maybeCode) : null;
    const normName = maybeName ? normalize(maybeName) : null;

    for (const semestreKey of Object.keys(data)) {
        const sem = data[semestreKey];
        if (!sem || !sem.asignaturas) continue;
        for (const asig of sem.asignaturas) {
            const nombre = asig.nombre || "";
            const normNombre = normalize(nombre);

            // Match by code if provided
            if (normCode && normNombre.includes(normCode)) {
                if (asig.estado === "APROBADA") return true;
            }

            // Match by name equality or containment
            if (normName && (normNombre === normName || normNombre.includes(normName))) {
                if (asig.estado === "APROBADA") return true;
            }

            // Fallback: match against full identifier
            if (normId && (normNombre === normId || normNombre.includes(normId))) {
                if (asig.estado === "APROBADA") return true;
            }
        }
    }

    return false;
}

/**
 * Clears all cached academic, GPA, and schedule data from localStorage.
 * 
 * @returns {void}
 */
export function clearAllExtensionData() {
    const keys = [
        STORAGE_KEY_ASIGNATURAS,
        STORAGE_KEY_CREDITOS,
        STORAGE_KEY_GPA_SIMULATIONS,
        STORAGE_KEY_GPA_CACHED_SUBJECTS,
        STORAGE_KEY_GPA_SUBJECT_META,
        STORAGE_KEY_GPA_GOAL_SIMULATIONS,
        "sia_pro_gpa_selected_subject",
        "sia_pro_selected_subjects",
        "sia_pro_selected_groups",
        STORAGE_KEY_UPDATED,
        STORAGE_KEY_NEW_GRADES
    ];
    keys.forEach(key => {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error(`[SIA Pro] Error al eliminar clave ${key} de localStorage:`, e);
        }
    });
}



/* =============================
   LAST UPDATE DATES
============================= */

const STORAGE_KEY_UPDATED = "sia_pro_updated_at";

/**
 * Records when a kind of data was last read from SIA.
 *
 * @param {"historia"|"creditos"|"calificaciones"} kind - Data kind.
 * @returns {void}
 */
function markUpdated(kind) {
    try {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEY_UPDATED) || "{}");
        all[kind] = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY_UPDATED, JSON.stringify(all));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar la fecha de actualización:", e);
    }
}

/**
 * Returns when a kind of data was last read from SIA.
 *
 * @param {"historia"|"creditos"|"calificaciones"} kind - Data kind.
 * @returns {Date|null} Date, or null when unknown (e.g. data saved before this feature).
 */
export function getLastUpdated(kind) {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY_UPDATED) || "{}")[kind];
        return value ? new Date(value) : null;
    } catch (e) {
        return null;
    }
}

/* =============================
   NEW GRADE DETECTION
============================= */

const STORAGE_KEY_NEW_GRADES = "sia_pro_new_grades";

/**
 * Loads the unseen new grades.
 *
 * @returns {Object.<string, Object.<string, {grade: number, previous: number|null, detectedAt: string}>>}
 *   New grades keyed by subject, then by activity description.
 */
export function loadNewGrades() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_NEW_GRADES) || "{}");
    } catch (e) {
        return {};
    }
}

function saveNewGrades(all) {
    try {
        localStorage.setItem(STORAGE_KEY_NEW_GRADES, JSON.stringify(all));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar notas nuevas:", e);
    }
}

/**
 * Compares a subject's previous and fresh activities and records grades that appeared or changed.
 * The first time a subject is saved nothing is flagged (there is nothing to compare with).
 *
 * @param {string} subjectName - Subject name.
 * @param {Array.<Object>|undefined} previous - Previously saved activities.
 * @param {Array.<Object>} fresh - Freshly scraped activities.
 * @returns {void}
 */
function recordNewGrades(subjectName, previous, fresh) {
    if (!Array.isArray(previous)) return;
    const before = new Map(previous.map((a) => [a.description, a.grade]));
    const all = loadNewGrades();
    let changed = false;
    fresh.forEach((a) => {
        if (!Number.isFinite(a.grade)) return;
        const old = before.get(a.description);
        if (Number.isFinite(old) && old === a.grade) return;
        (all[subjectName] ||= {})[a.description] = {
            grade: a.grade,
            previous: Number.isFinite(old) ? old : null,
            detectedAt: new Date().toISOString()
        };
        changed = true;
    });
    if (changed) saveNewGrades(all);
}

/**
 * Counts the unseen new grades across all subjects.
 *
 * @returns {number} Number of new grades.
 */
export function countNewGrades() {
    return Object.values(loadNewGrades()).reduce((sum, acts) => sum + Object.keys(acts).length, 0);
}

/**
 * Marks the new grades of a subject as seen.
 *
 * @param {string} subjectName - Subject name.
 * @returns {void}
 */
export function markGradesSeen(subjectName) {
    const all = loadNewGrades();
    if (!all[subjectName]) return;
    delete all[subjectName];
    saveNewGrades(all);
}
