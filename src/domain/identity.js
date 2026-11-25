/**
 * Account the saved data belongs to. Everything the extension stores in this browser is tied to
 * one SIA account; if a different account logs in, the data is erased before anything is shown.
 */

const STORAGE_KEY_OWNER = "sia_pro_owner";

/**
 * @returns {{username: string, email: string|null, name: string|null}|null} Saved owner.
 */
export function loadOwner() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_OWNER) || "null");
    } catch (e) {
        return null;
    }
}

/**
 * @param {{username: string, email: string|null, name: string|null}} owner - Owner to save.
 * @returns {void}
 */
export function saveOwner(owner) {
    try {
        localStorage.setItem(STORAGE_KEY_OWNER, JSON.stringify(owner));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar la cuenta:", e);
    }
}

/** Erases everything the extension saved in this browser (all accounts' data). */
export function eraseAllExtensionData() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("sia_pro_") || key.startsWith("sia_prereq_"))) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
    try {
        Object.keys(sessionStorage).filter((k) => k.startsWith("sia_pro_")).forEach((k) => sessionStorage.removeItem(k));
    } catch (e) { /* ignore */ }
}

const usernameOf = (email) => (email || "").split("@")[0].trim().toLowerCase();

/**
 * Ties the saved data to the logged-in account. Data saved by another account is erased.
 * Data saved before this feature existed (no owner) is adopted by the current account.
 *
 * @param {string} username - SIA username of the session (top bar).
 * @returns {"same"|"new"|"erased"} What happened.
 */
export function ensureOwner(username) {
    const current = (username || "").trim().toLowerCase();
    if (!current) return "same";
    const owner = loadOwner();
    if (owner && owner.username === current) return "same";
    if (owner && owner.username !== current) {
        eraseAllExtensionData();
        saveOwner({ username: current, email: null, name: null });
        return "erased";
    }
    saveOwner({ username: current, email: null, name: null });
    return "new";
}

/**
 * Saves the email and name read from "Mis datos personales", only for the current owner
 * (identity is checked with the top-bar username, see ensureOwner).
 *
 * @param {string} email - Institutional email.
 * @param {string} fullName - "Nombres y apellidos" as shown by SIA.
 * @returns {void}
 */
export function recordPersonalData(email, fullName) {
    const owner = loadOwner();
    if (!owner || owner.username !== usernameOf(email)) return;
    saveOwner({ ...owner, email: email.trim().toLowerCase(), name: (fullName || "").trim() || null });
}

/**
 * Friendly first name ("SEBASTIAN RODRIGUEZ" → "Sebastian").
 *
 * @returns {string|null} First name, or null when unknown.
 */
export function getFirstName() {
    const first = (loadOwner()?.name || "").split(/\s+/)[0];
    if (!first) return null;
    const lower = first.toLocaleLowerCase("es");
    return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
}

/** @returns {boolean} True when the email and name are already known for the saved owner. */
export function hasPersonalData() {
    const owner = loadOwner();
    return Boolean(owner?.email && owner?.name);
}
