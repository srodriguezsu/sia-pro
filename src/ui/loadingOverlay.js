/**
 * Loading state shown inside the SIA Pro window while the extension works in SIA underneath
 * (opening pages, loading every subject). The window stays open and covers SIA, so the student
 * sees the progress and does not click on the page meanwhile.
 */

let timeoutId = null;

function overlay() {
    const content = document.querySelector("#sia-modal .sia-modal-content");
    if (!content) return null;
    let el = content.querySelector(".sia-loading");
    if (!el) {
        el = document.createElement("div");
        el.className = "sia-loading";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.innerHTML = `
            <div class="sia-loading-spinner" aria-hidden="true"></div>
            <div class="sia-loading-title"></div>
            <div class="sia-loading-detail"></div>
            <div class="sia-loading-status"></div>
        `;
        content.appendChild(el);
    }
    return el;
}

/**
 * Opens the SIA Pro window (if closed) and shows the loading state.
 *
 * @param {string} title - What is happening.
 * @param {string} [detail] - Extra note.
 * @param {number} [timeoutMs] - Hides itself with an error message after this time (0 = never).
 * @returns {void}
 */
export function showLoading(title, detail = "Tarda unos segundos. No hagas clic en el SIA mientras tanto.", timeoutMs = 0) {
    document.getElementById("sia-modal")?.classList.add("active");
    const el = overlay();
    if (!el) return;
    el.querySelector(".sia-loading-title").textContent = title;
    el.querySelector(".sia-loading-detail").textContent = detail;
    el.querySelector(".sia-loading-status").textContent = "";
    el.classList.remove("is-error");
    el.hidden = false;
    // The window scrolls: keep the overlay over the visible area
    const content = el.parentElement;
    content.scrollTop = 0;
    content.classList.add("is-loading");
    clearTimeout(timeoutId);
    if (timeoutMs > 0) {
        timeoutId = setTimeout(() => showLoadingError("El SIA está tardando más de lo normal. Intenta de nuevo desde el menú del SIA."), timeoutMs);
    }
}

/**
 * Updates the progress line.
 *
 * @param {string} text - Progress text.
 * @returns {void}
 */
export function updateLoading(text) {
    const el = overlay();
    if (el) el.querySelector(".sia-loading-status").textContent = text;
}

/**
 * Turns the loading state into an error the student can close.
 *
 * @param {string} text - Error message.
 * @returns {void}
 */
export function showLoadingError(text) {
    clearTimeout(timeoutId);
    const el = overlay();
    if (!el) return;
    el.classList.add("is-error");
    el.querySelector(".sia-loading-title").textContent = "No se pudo completar";
    el.querySelector(".sia-loading-detail").textContent = text;
    el.querySelector(".sia-loading-status").innerHTML = "";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sia-loading-close";
    close.textContent = "Entendido";
    close.addEventListener("click", hideLoading);
    el.querySelector(".sia-loading-status").appendChild(close);
}

/** @returns {boolean} True while the loading state is visible. */
export function isLoadingShown() {
    const el = document.querySelector("#sia-modal .sia-loading");
    return Boolean(el && !el.hidden);
}

/** Hides the loading state. */
export function hideLoading() {
    clearTimeout(timeoutId);
    const el = document.querySelector("#sia-modal .sia-loading");
    if (el) {
        el.hidden = true;
        el.parentElement.classList.remove("is-loading");
    }
}
