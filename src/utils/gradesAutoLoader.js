import {
    areGradeContainersAvailable,
    extractSubjectName,
    extractSubjectMeta,
    extractActivitiesFromDom
} from "../scraper/domScraper.js";
import { saveGpaCachedSubject } from "../domain/historyManager.js";
import { normalizeSubjectName } from "../domain/gpaCalculator.js";

/**
 * Opens every subject listed in "Mis calificaciones" one by one, saves its grades and goes back
 * to the list with SIA's own "Volver" button, for every period of SIA's period selector.
 */

let running = false;
/** True during the whole multi-period run (between periods too). */
let periodsRunning = false;

const normalize = (t) => (t || "").replace(/\s+/g, " ").trim();

/** Subject links of the list page, e.g. "Estadística III (3009137)". */
export function gradeListLinks() {
    return [...document.querySelectorAll("a.af_link")].filter((a) =>
        a.offsetParent && !a.closest("#sia-unal-root") && /\(\d{6,9}\)\s*$/.test(a.textContent.trim()));
}

/** @returns {boolean} True on the subject list of "Mis calificaciones". */
export function isGradesListPage() {
    return gradeListLinks().length > 0 && !document.querySelector("span.titulo-nombre-asignatura");
}

/** @returns {boolean} True while the loader is running. */
export function isAutoLoading() {
    return running || periodsRunning;
}

const wait = async (check, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const value = check();
        if (value) return value;
        await new Promise((r) => setTimeout(r, 150));
    }
    return null;
};

const findBackButton = () => [...document.querySelectorAll("a.af_button_link, button")]
    .find((b) => b.offsetParent && !b.closest("#sia-unal-root") && b.textContent.trim() === "Volver");

/** SIA's period selector ("Periodo académico") of the grades list. */
const periodSelect = () => [...document.querySelectorAll("select")]
    .find((sel) => /soc1::content$/.test(sel.id) && !sel.closest("#sia-unal-root"));

const listSignature = () => gradeListLinks().map((a) => normalize(a.textContent)).join("|");

/**
 * Selects a period in SIA's selector and waits for the subject list to reload.
 *
 * @param {string} value - Option value.
 * @returns {Promise.<boolean>} True when the list is shown for that period.
 */
async function selectPeriod(value) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const select = periodSelect();
        if (!select) return false;
        if (select.value === value && attempt > 0) return true;
        const before = listSignature();
        await new Promise((r) => setTimeout(r, attempt === 0 ? 300 : 800));
        select.value = value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        // The list changes when the new period loads (two periods never list the same subjects)
        if (await wait(() => isGradesListPage() && listSignature() !== before, 4000)) return true;
    }
    // Same list after retries: a period may also have no subjects shown; continue with what is there
    return isGradesListPage();
}

/**
 * Loads the grades of every subject of every period in SIA's selector, then leaves the
 * selector on the period it had.
 *
 * @param {function(string): void} [onProgress] - Called with a progress message.
 * @returns {Promise.<{loaded: number, failed: Array.<string>, empty: Array.<string>, total: number}>} Totals.
 */
export async function loadAllPeriodsGrades(onProgress) {
    const total = { loaded: 0, failed: [], empty: [], total: 0 };
    if (periodsRunning) return total;
    periodsRunning = true;
    try {
        await loadPeriods(total, onProgress);
    } finally {
        periodsRunning = false;
    }
    return total;
}

async function loadPeriods(total, onProgress) {
    const select = periodSelect();
    const periods = select ? [...select.options].map((o) => ({ value: o.value, label: o.text.trim() })) : [null];
    const original = select?.value;
    for (let p = 0; p < periods.length; p++) {
        const period = periods[p];
        if (period && periodSelect()?.value !== period.value) {
            if (!(await selectPeriod(period.value))) continue;
        }
        const result = await loadAllSubjectGrades((i, n, name) => {
            const where = period ? `${period.label} (${p + 1} de ${periods.length})` : "";
            onProgress?.(`${where} · ${i + 1} de ${n}: ${name.replace(/\s*\(\d+\)$/, "")}`);
        });
        total.loaded += result.loaded;
        total.total += result.total;
        total.failed.push(...result.failed);
        total.empty.push(...result.empty);
    }
    if (original != null && periodSelect()?.value !== original) await selectPeriod(original);
}

/**
 * Loads the grades of every subject in the list.
 *
 * @param {function(number, number, string): void} [onProgress] - Called before each subject (index, total, name).
 * @returns {Promise.<{loaded: number, failed: Array.<string>, empty: Array.<string>, total: number}>} Result
 *   (empty = opened but without published activities).
 */
export async function loadAllSubjectGrades(onProgress) {
    if (running || !isGradesListPage()) return { loaded: 0, failed: [], empty: [], total: 0 };
    running = true;
    const names = gradeListLinks().map((a) => normalize(a.textContent));
    const failed = [];
    const empty = [];
    let loaded = 0;
    try {
        for (let i = 0; i < names.length; i++) {
            const name = names[i];
            onProgress?.(i, names.length, name);
            const isOpen = () => normalize(document.querySelector("span.titulo-nombre-asignatura")?.textContent) === name;
            // SIA (ADF) ignores clicks while it is busy with a previous request, so retry a few times
            let opened = false;
            for (let attempt = 0; attempt < 4 && !opened; attempt++) {
                const link = gradeListLinks().find((a) => normalize(a.textContent) === name);
                if (!link) break;
                await new Promise((r) => setTimeout(r, attempt === 0 ? 300 : 600));
                link.click();
                opened = Boolean(await wait(isOpen, 3000));
            }
            if (!opened) {
                failed.push(name);
                continue; // still on the list: try the next subject
            }
            // Wait for the activities to be drawn
            await wait(areGradeContainersAvailable, 3000);
            await new Promise((r) => setTimeout(r, 300));
            if (areGradeContainersAvailable()) {
                const subjectName = normalizeSubjectName(extractSubjectName());
                saveGpaCachedSubject(subjectName, extractActivitiesFromDom(), extractSubjectMeta());
                loaded++;
            } else {
                empty.push(name); // opened, but the professor has not published activities yet
            }
            // Back to the list (also retried)
            let back = false;
            for (let attempt = 0; attempt < 4 && !back; attempt++) {
                const button = findBackButton();
                if (!button) break;
                await new Promise((r) => setTimeout(r, attempt === 0 ? 200 : 600));
                button.click();
                back = Boolean(await wait(isGradesListPage, 3000));
            }
            if (!back) {
                failed.push(...names.slice(i + 1));
                break;
            }
        }
    } finally {
        running = false;
    }
    return { loaded, failed, empty, total: names.length };
}
