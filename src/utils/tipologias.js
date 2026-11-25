/**
 * Shared typology (tipología) identity: every typology gets a fixed color family
 * so it looks the same across the whole UI (Mi carrera, Historia, Calculadora, Horario).
 * Colors live in public/css/tipologias.css as .sia-tipo-<key> classes.
 */

/**
 * Maps any typology spelling used by SIA ("FUND. OBLIGATORIA", "Fundamentación Obligatoria",
 * "LIBRE ELECCIÓN"...) to a stable key, or null when it is unknown (neutral style).
 *
 * @param {string|null} name - Typology name as shown by SIA.
 * @returns {"fund-obl"|"fund-opt"|"disc-obl"|"disc-opt"|"libre"|"nivelacion"|"trabajo-grado"|null} Typology key.
 */
export function getTipologiaKey(name) {
    const n = (name || "")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase();
    if (!n.trim()) return null;
    if (n.includes("NIVELACION")) return "nivelacion";
    if (n.includes("TRABAJO DE GRADO")) return "trabajo-grado";
    if (n.includes("LIBRE")) return "libre";
    const optativa = n.includes("OPTATIV");
    if (n.includes("FUND")) return optativa ? "fund-opt" : "fund-obl";
    if (n.includes("DISCIPLINAR") || n.includes("PROFESIONAL")) return optativa ? "disc-opt" : "disc-obl";
    return null;
}

/**
 * CSS class that sets the typology color variables (--tipo-color, --tipo-text, --tipo-soft).
 *
 * @param {string|null} name - Typology name.
 * @returns {string} Class name ("sia-tipo-neutral" for unknown typologies).
 */
export function tipologiaClass(name) {
    return `sia-tipo-${getTipologiaKey(name) || "neutral"}`;
}

/**
 * Creates a small colored tag with the typology name.
 *
 * @param {string|null} name - Typology name.
 * @returns {HTMLElement|null} Tag element, or null when there is no typology.
 */
export function createTipologiaTag(name) {
    if (!name || !name.trim()) return null;
    const tag = document.createElement("span");
    tag.className = `sia-tipo-tag ${tipologiaClass(name)}`;
    tag.textContent = name.trim();
    tag.title = `Tipología: ${name.trim()}`;
    return tag;
}

/** Display order of typologies across the UI; unknown typologies go last. */
const TIPOLOGIA_ORDER = ["nivelacion", "fund-obl", "fund-opt", "libre", "disc-obl", "disc-opt", "trabajo-grado"];

/**
 * Comparator that orders typology names: Nivelación, Fundamentación (obligatoria, optativa), Libre elección,
 * Disciplinar (obligatoria, optativa), Trabajo de grado, then uncategorized (alphabetically).
 *
 * @param {string|null} a - Typology name.
 * @param {string|null} b - Typology name.
 * @returns {number} Sort order.
 */
export function compareTipologias(a, b) {
    const rank = (name) => {
        const i = TIPOLOGIA_ORDER.indexOf(getTipologiaKey(name));
        return i === -1 ? TIPOLOGIA_ORDER.length : i;
    };
    return rank(a) - rank(b) || (a || "").localeCompare(b || "");
}
