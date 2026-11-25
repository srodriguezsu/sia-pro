import {
    areAsignaturasAvailable,
    extractAsignaturasFromDom,
    areCreditosAvailable,
    extractCreditosFromDom
} from "../scraper/domScraper.js";
import {
    saveCachedAsignaturas,
    loadCachedAsignaturas,
    saveCachedCreditos,
    loadCachedCreditos
} from "./historyManager.js";

/**
 * Returns the academic history: freshly scraped when the current page really is the
 * "Historia académica" page and the scrape produced data, otherwise the saved copy.
 * An empty scrape (e.g. another SIA page with similar tables) never hides the saved data.
 *
 * @returns {Object|null} History grouped by semester, or null when nothing is available.
 */
export function getAsignaturas() {
    if (areAsignaturasAvailable()) {
        const scraped = extractAsignaturasFromDom();
        if (scraped && Object.keys(scraped).length > 0) {
            saveCachedAsignaturas(scraped);
            return scraped;
        }
    }
    return loadCachedAsignaturas();
}

/**
 * Checks that a scraped credits table looks like the real one (it has the TOTAL row).
 *
 * @param {Array.<Object>|null} creditos - Scraped credits rows.
 * @returns {boolean} True when the data is usable.
 */
function isValidCreditos(creditos) {
    return Array.isArray(creditos) && creditos.some(
        (c) => (c.componente || "").trim().toUpperCase() === "TOTAL" && Number.isFinite(c.exigidos)
    );
}

/**
 * Returns the credits by typology: freshly scraped when the page has a valid credits table,
 * otherwise the saved copy. Invalid scrapes are neither shown nor saved.
 *
 * @returns {Array.<Object>|null} Credits rows, or null when nothing is available.
 */
export function getCreditos() {
    if (areCreditosAvailable()) {
        const scraped = extractCreditosFromDom();
        if (isValidCreditos(scraped)) {
            saveCachedCreditos(scraped);
            return scraped;
        }
    }
    return loadCachedCreditos();
}
