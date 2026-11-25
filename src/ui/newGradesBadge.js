import { countNewGrades } from "../domain/historyManager.js";

/**
 * Shows the number of unseen new grades on the floating button.
 *
 * @returns {void}
 */
export function refreshNewGradesBadge() {
    const badge = document.getElementById("sia-new-badge");
    if (!badge) return;
    const count = countNewGrades();
    badge.hidden = count === 0;
    badge.textContent = count > 9 ? "9+" : String(count);
    const btn = document.getElementById("sia-floating-btn");
    if (btn) btn.title = count > 0 ? `${count} ${count === 1 ? "nota nueva" : "notas nuevas"}` : "SIA Pro";
}
