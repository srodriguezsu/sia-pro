import { showLoading, hideLoading } from "../ui/loadingOverlay.js";
/**
 * Navigation inside SIA. SIA is a single-URL app (Oracle ADF), so pages cannot be linked by
 * address: instead the extension clicks the corresponding entry of SIA's own menu.
 */

const RETURN_KEY = "sia_pro_return_tab";

/**
 * SIA menu entries the extension knows how to open. The side menu is an accordion: the entries
 * of a section only exist after the section is expanded, so the section is opened first.
 * `itemClass` is SIA's own stable class for the entry; `labels` are fallbacks by text.
 */
export const SIA_PAGES = {
    datosPersonales: {
        label: "Mis datos personales",
        section: "Datos personales",
        itemClass: "AC_DAT_PER",
        labels: ["Mis datos personales"],
        path: "Datos personales > Mis datos personales"
    },
    historia: {
        label: "Mi historia académica",
        section: "Información académica",
        itemClass: "AC_EXP_ALU",
        labels: ["Mi historia académica", "Historia académica"],
        path: "Información académica > Mi historia académica"
    },
    calificaciones: {
        label: "Mis calificaciones",
        section: "Información académica",
        itemClass: "AC_MIS_NOT",
        labels: ["Mis calificaciones"],
        path: "Información académica > Mis calificaciones"
    }
};

const normalize = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Finds the menu entry of a page (by SIA's class, then by text), outside the extension's UI.
 *
 * @param {Object} page - Entry of SIA_PAGES.
 * @returns {HTMLElement|null} Link to click.
 */
function findMenuEntry(page) {
    const byClass = document.querySelector(`a.${page.itemClass}`);
    if (byClass) return byClass;
    const wanted = page.labels.map(normalize);
    return [...document.querySelectorAll("a")]
        .find((a) => !a.closest("#sia-unal-root") && wanted.includes(normalize(a.textContent))) || null;
}

/**
 * Expands the accordion section that contains the page's entry.
 *
 * @param {string} section - Section title, e.g. "Información académica".
 * @returns {boolean} True when the section header was found and clicked.
 */
function expandSection(section) {
    const wanted = normalize(section);
    const header = [...document.querySelectorAll(".af_panelAccordion_header, .af_panelAccordion_header-subsequent")]
        .find((h) => normalize(h.textContent) === wanted);
    if (!header) return false;
    (header.querySelector("a") || header).click();
    return true;
}

/** Waits until `find` returns an element, or gives up after `timeout` ms. */
function waitFor(find, timeout = 4000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const tick = () => {
            const el = find();
            if (el || Date.now() - start > timeout) resolve(el || null);
            else setTimeout(tick, 150);
        };
        tick();
    });
}

/**
 * Opens a SIA page through its side menu, expanding the menu section if needed. When the page
 * loads, the extension reopens itself on `returnTab` (see consumeReturnTab).
 *
 * @param {"historia"|"calificaciones"} pageKey - Page to open.
 * @param {string} [returnTab] - Extension tab to reopen afterwards.
 * @returns {Promise.<boolean>} True when the menu entry was found and clicked.
 */
export async function goToSiaPage(pageKey, returnTab) {
    const page = SIA_PAGES[pageKey];
    let entry = findMenuEntry(page);
    if (!entry && expandSection(page.section)) {
        entry = await waitFor(() => findMenuEntry(page));
    }
    if (!entry) return false;
    try {
        if (returnTab) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ page: pageKey, tab: returnTab }));
    } catch (e) { /* ignore */ }
    entry.click();
    return true;
}

/**
 * Returns (and clears) the tab to reopen if the user was sent to `page` by the extension.
 *
 * @param {"historia"|"calificaciones"} page - Page that just loaded.
 * @returns {string|null} Extension tab name.
 */
export function consumeReturnTab(page) {
    try {
        const saved = JSON.parse(sessionStorage.getItem(RETURN_KEY) || "null");
        if (!saved || saved.page !== page) return null;
        sessionStorage.removeItem(RETURN_KEY);
        return saved.tab;
    } catch (e) {
        return null;
    }
}

/**
 * Button that opens a SIA page; if SIA's menu entry cannot be found it shows where to go.
 *
 * @param {"historia"|"calificaciones"} page - Page to open.
 * @param {string} returnTab - Extension tab to reopen afterwards.
 * @param {string} [text] - Button text.
 * @returns {HTMLElement} Wrapper with the button and its fallback hint.
 */
export function createGoToButton(page, returnTab, text) {
    const wrap = document.createElement("span");
    wrap.className = "sia-goto";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sia-goto-btn";
    btn.textContent = text || `Ir a ${SIA_PAGES[page].label}`;
    const hint = document.createElement("span");
    hint.className = "sia-goto-hint";
    btn.addEventListener("click", async () => {
        hint.textContent = "";
        // The SIA Pro window stays open with a loading state while SIA changes page underneath
        showLoading(
            page === "historia" ? "Cargando tu historia académica…" : "Cargando tus calificaciones…",
            page === "historia"
                ? "Abrimos Mi historia académica en el SIA y guardamos tus datos. No hagas clic en el SIA mientras tanto."
                : "Abrimos Mis calificaciones y cargamos cada asignatura de todos tus semestres. Tarda unos segundos: no hagas clic en el SIA mientras tanto.",
            page === "historia" ? 20000 : 30000
        );
        const ok = await goToSiaPage(page, returnTab);
        if (!ok) {
            hideLoading();
            hint.textContent = `Ábrela desde el menú del SIA: ${SIA_PAGES[page].path}.`;
        }
    });
    wrap.append(btn, hint);
    return wrap;
}
