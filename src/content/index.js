import { renderGpa } from "../ui/gpaUI.js";
import { renderHistoriaAcademica } from "../ui/historia_academica/asignaturasUI.js";
import { renderMiCarrera } from "../ui/historia_academica/miCarreraUI.js";
import { renderHorario } from "../ui/horarioUI.js";
import { renderExportTab } from "../ui/exportUI.js";
import { injectAddSubjectButton } from "../ui/originalUiInjector.js";
import {
    areGradeContainersAvailable,
    areAsignaturasAvailable,
    areCreditosAvailable,
    extractSubjectName,
    extractSubjectMeta,
    extractActivitiesFromDom,
    extractSessionUsername,
    extractPersonalData
} from "../scraper/domScraper.js";
import { saveGpaCachedSubject } from "../domain/historyManager.js";
import { refreshNewGradesBadge } from "../ui/newGradesBadge.js";
import { getAsignaturas, getCreditos } from "../domain/historyData.js";
import { consumeReturnTab, goToSiaPage } from "../utils/siaNavigation.js";
import { ensureOwner, recordPersonalData, hasPersonalData, getFirstName } from "../domain/identity.js";
import { showLoading, updateLoading, hideLoading, isLoadingShown } from "../ui/loadingOverlay.js";
import { loadAllPeriodsGrades, isGradesListPage, isAutoLoading } from "../utils/gradesAutoLoader.js";
import { normalizeSubjectName } from "../domain/gpaCalculator.js";

/** @type {MutationObserver} MutationObserver to detect DOM ready state for scraping */
let observer;

/* =============================
   ROOT + FLOATING BUTTON
============================= */

/**
 * Creates and mounts the main container div (`#sia-unal-root`) to the document body.
 * Injects the HTML structure containing the floating trigger button and the tabbed modal.
 * Finally, registers DOM event handlers by calling {@link bindUIEvents}.
 * 
 * @returns {void}
 */
function mountApp() {
    // Prevent double mounting if the app is already loaded
    if (document.getElementById("sia-unal-root")) return;

    const root = document.createElement("div");
    root.id = "sia-unal-root";

    root.innerHTML = `
        <button id="sia-floating-btn" class="sia-floating-btn">
            <span id="sia-new-badge" class="sia-new-badge" hidden></span>
            <img src="https://raw.githubusercontent.com/srodriguezsu/sia-pro/refs/heads/master/public/icon.png" alt="SIA-PRO" class="sia-floating-icon" style="max-width:100%;max-height:100%;object-fit:contain;display:block;" />
        </button>

        <div id="sia-modal" class="sia-modal">
            <div class="sia-modal-content">
                <button id="sia-close-btn" class="sia-close-btn" aria-label="Cerrar modal">
                    <svg viewBox="0 0 24 24">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <div id="sia-greeting" class="sia-greeting" hidden></div>
                <div class="sia-tabs">
                    <button class="sia-tab active" data-tab="gpa">Calculadora Promedio</button>
                    <button class="sia-tab" data-tab="historia">Historia</button>
                    <button class="sia-tab" data-tab="carrera">Mi carrera</button>
                    <button class="sia-tab" data-tab="horario">Horario</button>
                    <button class="sia-tab" data-tab="export">Exportar</button>
                </div>
    
                <div class="sia-tab-content active" id="tab-gpa"></div>
                <div class="sia-tab-content" id="tab-historia"></div>
                <div class="sia-tab-content" id="tab-carrera"></div>
                <div class="sia-tab-content" id="tab-horario"></div>
                <div class="sia-tab-content" id="tab-export"></div>
            </div>
        </div>
    `;

    document.body.appendChild(root);

    bindUIEvents();
}

/** True once the session's account was compared with the owner of the saved data. */
let identityChecked = false;

/**
 * Compares the logged-in SIA account (top bar) with the owner of the saved data and erases the
 * data if it belongs to another account. Runs until the top bar is available.
 *
 * @returns {boolean} True when the account is known (it is then safe to read and save data).
 */
function checkIdentity() {
    if (identityChecked) return true;
    const username = extractSessionUsername();
    if (!username) return false;
    identityChecked = true;
    if (ensureOwner(username) === "erased") onDataErased();
    return true;
}

/** Refreshes the UI after the data of another account was erased. */
function onDataErased() {
    refreshNewGradesBadge();
    const modal = document.getElementById("sia-modal");
    if (modal?.classList.contains("active")) renderAllTabs();
    showToast("Se borraron los datos guardados de otra cuenta en este navegador.");
}

/**
 * The first time the window is opened for an account, reads its institutional email and name
 * from "Mis datos personales" (in the background, with the loading state shown).
 *
 * @returns {Promise.<void>}
 */
async function verifyAccountOnce() {
    if (!identityChecked || hasPersonalData()) return;
    try {
        if (sessionStorage.getItem("sia_pro_account_checked") === "1") return;
        sessionStorage.setItem("sia_pro_account_checked", "1");
    } catch (e) { /* ignore */ }
    const activeTab = document.querySelector(".sia-tab.active")?.dataset.tab || "gpa";
    showLoading(
        "Preparando SIA Pro…",
        "Leemos tu nombre en Mis datos personales. Solo pasa la primera vez; no hagas clic en el SIA mientras tanto.",
        15000
    );
    if (!(await goToSiaPage("datosPersonales", activeTab))) hideLoading();
}

/** Greeting above the tabs with the student's first name. */
function renderGreeting() {
    const el = document.getElementById("sia-greeting");
    if (!el) return;
    const name = getFirstName();
    el.textContent = name ? `Hola, ${name}` : "";
    el.hidden = !name;
}

/**
 * Renders every tab of the modal with fresh data.
 *
 * @returns {void}
 */
function renderAllTabs() {
    renderGreeting();
    renderHistoriaAcademica(document.getElementById("tab-historia"));
    renderGpa(document.getElementById("tab-gpa"));
    renderMiCarrera(document.getElementById("tab-carrera"));
    renderHorario(document.getElementById("tab-horario"));
    renderExportTab(document.getElementById("tab-export"));
    refreshNewGradesBadge();
}

/**
 * Opens the modal on a given tab (used after the extension navigated SIA to a page).
 *
 * @param {string} tabName - Tab name (data-tab value).
 * @returns {void}
 */
function openModalOnTab(tabName) {
    const modal = document.getElementById("sia-modal");
    if (!modal) return;
    modal.classList.add("active");
    renderAllTabs();
    document.querySelector(`.sia-tab[data-tab="${tabName}"]`)?.click();
}

/**
 * Whether the "load all grades" offer was already shown in this session (marks it as shown).
 *
 * @returns {boolean} True when it was shown before.
 */
function gradesOfferShown() {
    try {
        if (sessionStorage.getItem("sia_pro_grades_offer") === "1") return true;
        sessionStorage.setItem("sia_pro_grades_offer", "1");
    } catch (e) { /* ignore */ }
    return false;
}

/**
 * Shows a short message above the floating button.
 *
 * @param {string} text - Message.
 * @returns {void}
 */
function showToast(text, action) {
    const root = document.getElementById("sia-unal-root");
    if (!root) return;
    root.querySelector(".sia-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "sia-toast";
    toast.setAttribute("role", "status");
    toast.textContent = text;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sia-toast-close";
    close.setAttribute("aria-label", "Cerrar");
    close.textContent = "×";
    close.addEventListener("click", () => toast.remove());
    toast.appendChild(close);
    if (action) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sia-toast-action";
        btn.textContent = action.label;
        btn.addEventListener("click", () => action.onClick(toast));
        toast.appendChild(btn);
    }
    root.appendChild(toast);
    if (!action) setTimeout(() => toast.remove(), 15000);
    return toast;
}

/**
 * Loads every subject's grades from the "Mis calificaciones" list, with progress in a toast,
 * then opens the calculator.
 *
 * @returns {Promise.<void>}
 */
async function runGradesAutoLoad() {
    // Progress inside the SIA Pro window, which covers SIA while the subjects are opened underneath
    showLoading(
        getFirstName() ? `${getFirstName()}, estamos cargando tus calificaciones…` : "Cargando tus calificaciones…",
        "Abrimos cada asignatura de todos tus semestres. Tarda unos segundos: no hagas clic en el SIA mientras tanto."
    );
    const result = await loadAllPeriodsGrades(updateLoading);
    hideLoading();
    refreshNewGradesBadge();
    if (result.total === 0) {
        openModalOnTab("gpa");
        return;
    }
    const short = (list) => list.map((n) => n.replace(/\s*\(\d+\)$/, "")).join(", ");
    const parts = [`${getFirstName() ? `Listo, ${getFirstName()}. ` : ""}Se cargaron ${result.loaded} ${result.loaded === 1 ? "asignatura" : "asignaturas"}.`];
    if (result.empty.length > 0) parts.push(`Aún sin actividades publicadas: ${short(result.empty)}.`);
    if (result.failed.length > 0) parts.push(`No se pudo abrir: ${short(result.failed)}.`);
    showToast(parts.join(" "));
    openModalOnTab("gpa");
}

/**
 * Binds click event handlers for the floating button (to open/close the modal)
 * and for the modal tab buttons (to switch views). When the modal opens, it triggers
 * rendering of all tabs dynamically.
 * 
 * @returns {void}
 */
function bindUIEvents() {
    const btn = document.getElementById("sia-floating-btn");
    const modal = document.getElementById("sia-modal");

    // Toggle modal visibility and render contents if opened
    btn.addEventListener("click", () => {
        if (isLoadingShown()) return; // keep the window open while loading
        modal.classList.toggle("active");
        if (modal.classList.contains("active")) {
            renderAllTabs();
            verifyAccountOnce();
        }
    });

    // Close modal on close button click
    const closeBtn = document.getElementById("sia-close-btn");
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isLoadingShown()) return;
            modal.classList.remove("active");
        });
    }

    // Close modal when clicking outside the modal content (backdrop)
    modal.addEventListener("click", (e) => {
        if (e.target === modal && !isLoadingShown()) {
            modal.classList.remove("active");
        }
    });

    // Close modal on Escape key press
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("active") && !isLoadingShown()) {
            modal.classList.remove("active");
        }
    });

    const tabs = document.querySelectorAll(".sia-tab");

    // Tab switching event logic
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            // Remove active classes from all tab headers and contents
            document.querySelectorAll(".sia-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".sia-tab-content").forEach(c => c.classList.remove("active"));

            // Add active class to clicked tab header
            tab.classList.add("active");

            // Add active class to corresponding tab panel
            const target = document.getElementById(`tab-${tab.dataset.tab}`);
            target.classList.add("active");

            // "Mi carrera" uses the plan from Horario, so refresh it whenever it is opened
            if (tab.dataset.tab === "carrera") renderMiCarrera(target);
        });
    });
}


/* =============================
   INIT
============================= */

/**
 * Main initialization entry point. Runs once when the page is fully interactive.
 * Mounts the UI structures and configures a MutationObserver to stop watching the DOM
 * once all required elements for the extension's views are fully parsed/available.
 * 
 * @returns {void}
 */
/** Last subject scraped from the grades page, used to detect real page navigation. */
let lastScrapedSubject = null;
/** Debounce timer for saving the academic history while SIA renders it. */
let historySaveTimer = null;

function initWhenReady() {
    console.log("SIA Pro Activado");

    mountApp();
    checkIdentity();
    refreshNewGradesBadge();

    // Observe changes to detect when SIA has populated the relevant pages and inject buttons
    observer = new MutationObserver((mutations) => {
        // Ignore mutations triggered by our own extension DOM nodes to prevent infinite loop crashes
        const isExtensionMutation = mutations.every((mutation) => {
            const target = mutation.target;
            return (
                target.id === "sia-pro-add-to-schedule-btn" ||
                target.classList?.contains("sia-pro-injected-btn") ||
                target.id === "sia-unal-root" ||
                (target.closest && target.closest("#sia-unal-root"))
            );
        });

        if (isExtensionMutation) return;

        // Security: tie the saved data to the logged-in account before reading or saving anything
        if (!checkIdentity()) return;

        injectAddSubjectButton();

        // "Mis datos personales": save the institutional email and name of the account
        const personal = extractPersonalData();
        if (personal) {
            recordPersonalData(personal.email, personal.name);
            const tab = consumeReturnTab("datosPersonales");
            if (tab) {
                hideLoading();
                openModalOnTab(tab);
            }
        }

        // Arrived from the extension: load every subject right away.
        // Arrived by hand: offer it once per session.
        if (!isAutoLoading() && isGradesListPage()) {
            if (consumeReturnTab("calificaciones")) {
                runGradesAutoLoad();
            } else if (!gradesOfferShown()) {
                showToast("SIA Pro puede cargar automáticamente las notas de todas tus asignaturas y semestres en la calculadora. Tarda unos segundos y no debes hacer clic en nada mientras tanto.", {
                    label: "Cargar automáticamente",
                    onClick: (toast) => {
                        toast.remove();
                        runGradesAutoLoad();
                    }
                });
            }
        }

        // Save the academic history whenever the student is on that page (debounced)
        if (areAsignaturasAvailable()) {
            clearTimeout(historySaveTimer);
            historySaveTimer = setTimeout(() => {
                const saved = getAsignaturas();
                getCreditos();
                if (saved && Object.keys(saved).length > 0) {
                    const tab = consumeReturnTab("historia");
                    if (tab) {
                        hideLoading();
                        openModalOnTab(tab);
                    }
                }
            }, 400);
        }

        // Automatically scrape and cache grade sheets when visited
        if (areGradeContainersAvailable() && !isAutoLoading()) {
            const subjectName = normalizeSubjectName(extractSubjectName());
            if (subjectName && subjectName !== "N/A") {
                const activities = extractActivitiesFromDom();
                saveGpaCachedSubject(subjectName, activities, extractSubjectMeta());
                refreshNewGradesBadge();

                // Only follow the page when the user actually opens a different subject in SIA.
                // Comparing against the last scraped subject (instead of the stored selection)
                // lets the user freely browse other subjects inside the calculator.
                if (lastScrapedSubject !== subjectName) {
                    lastScrapedSubject = subjectName;
                    localStorage.setItem("sia_pro_gpa_selected_subject", subjectName);
                    // Rerender GPA tab if currently active and opened
                    const tab_gpa = document.getElementById("tab-gpa");
                    if (tab_gpa && tab_gpa.classList.contains("active")) {
                        renderGpa(tab_gpa);
                    }
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

// Ensure initWhenReady is called only when the document is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWhenReady, { once: true });
} else {
    initWhenReady();
}
