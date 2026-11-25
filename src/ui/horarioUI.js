import { tipologiaClass, compareTipologias, getTipologiaKey, formatTipologiaName } from "../utils/tipologias.js";
import { findApprovedAttempt } from "../domain/historySummary.js";
import {
    loadSelectedSubjects,
    loadSelectedGroups,
    saveSelectedGroups,
    removeSubject,
    getConflictsForGroup,
    doSchedulesOverlap
} from "../domain/scheduleManager.js";
import { updateButtonState } from "./originalUiInjector.js";
import { renderScheduleGenerator } from "./scheduleGeneratorUI.js";
import { isSubjectApproved, loadCachedAsignaturas, loadCachedCreditos } from "../domain/historyManager.js";
import { isSubjectAdded } from "../domain/scheduleManager.js";

/**
 * Renders the Horario simulator view inside the tab container.
 * Displays the list of selected subjects, group selectors with conflict alerts,
 * and a visual weekly calendar grid showing classes and overlaps.
 * 
 * @param {HTMLElement} container - The DOM element where the Horario view will be mounted.
 * @returns {void}
 */
export function renderHorario(container) {
    if (!container) return;
    container.innerHTML = "";

    const subjects = loadSelectedSubjects().sort((a, b) => {
        // 1. Sort by tipologia (alphabetically)
        const tipoA = (a.tipologia || "").toUpperCase();
        const tipoB = (b.tipologia || "").toUpperCase();
        if (tipoA !== tipoB) {
            return tipoA.localeCompare(tipoB);
        }
        
        // 2. Sort by credits (descending: more credits first)
        const credA = parseInt(a.creditos, 10) || 0;
        const credB = parseInt(b.creditos, 10) || 0;
        if (credA !== credB) {
            return credB - credA;
        }
        
        // 3. Sort by name (alphabetically)
        const nameA = (a.name || "").toUpperCase();
        const nameB = (b.name || "").toUpperCase();
        return nameA.localeCompare(nameB);
    });
    const selections = loadSelectedGroups();

    const wrapper = document.createElement("div");
    wrapper.className = "sia-horario-wrapper";

    if (subjects.length === 0) {
        // Render empty state if no subjects are added
        const emptyState = document.createElement("div");
        emptyState.className = "sia-horario-empty-state";
        emptyState.innerHTML = `
            <div class="empty-icon">📅</div>
            <h3>Tu horario está vacío</h3>
            <p>Navega a <strong>Proceso de inscripción > Asignaturas disponibles para cursar</strong> y haz clic en <strong>➕ Agregar al Horario</strong> en las asignaturas que deseas tomar.</p>
        `;
        wrapper.appendChild(emptyState);
        container.appendChild(wrapper);
        return;
    }

    // Split view: Left for settings, Right for visual calendar
    const splitView = document.createElement("div");
    splitView.className = "sia-horario-split-view";

    const configPanel = document.createElement("div");
    configPanel.className = "sia-horario-config-panel";

    const panelTitle = document.createElement("h3");
    panelTitle.textContent = "Asignaturas seleccionadas";
    panelTitle.className = "sia-horario-panel-title";
    configPanel.appendChild(panelTitle);

    // Calculate credit metrics (only for subjects with a group selected)
    let totalCredits = 0;
    let totalSubjectsWithGroup = 0;

    subjects.forEach((subject) => {
        const selectedGroupVal = selections[subject.name];
        if (selectedGroupVal) {
            const credits = parseInt(subject.creditos, 10) || 0;
            totalCredits += credits;
            totalSubjectsWithGroup++;
        }
    });

    const creditsSummary = document.createElement("div");
    creditsSummary.className = "sia-horario-credits-summary";

    // Compact summary: one line instead of a card
    const conflictCount = subjects.filter((subj) => {
        const g = subj.groups?.find((x) => x.name === selections[subj.name]);
        return g && getConflictsForGroup(subj.name, g).length > 0;
    }).length;
    creditsSummary.classList.add("is-compact");
    creditsSummary.innerHTML = `
        <span><b>${totalCredits}</b> ${totalCredits === 1 ? "crédito" : "créditos"}</span>
        <span class="credits-summary-sep">·</span>
        <span>${totalSubjectsWithGroup} ${totalSubjectsWithGroup === 1 ? "asignatura" : "asignaturas"} con grupo</span>
        ${conflictCount > 0 ? `<span class="credits-summary-sep">·</span><span class="credits-summary-conflicts">${conflictCount} con cruce de horario</span>` : ""}
    `;
    configPanel.appendChild(creditsSummary);

    // Schedule generator (the calendar preview is wired once the calendar exists)
    let previewHandler = () => {};
    configPanel.appendChild(renderScheduleGenerator(subjects, {
        onApply: () => renderHorario(container),
        onPreview: (sel, label) => previewHandler(sel, label)
    }));

    const subjectsList = document.createElement("div");
    subjectsList.className = "sia-horario-subjects-list";

    // Academic history and credits by typology, used to warn while planning
    const planningHistory = loadCachedAsignaturas();
    const remainingByTipo = new Map();
    (loadCachedCreditos() || []).forEach((c) => {
        const key = getTipologiaKey(c.componente);
        if (!key || !Number.isFinite(c.pendientes)) return;
        // Same "Faltan" as the credit cards: pending credits not covered by current enrollment
        remainingByTipo.set(key, Math.max(0, c.pendientes - (c.inscritos || 0)));
    });

    // Group subjects by typology
    const subjectsByTypology = {};
    subjects.forEach((subject) => {
        const tipo = subject.tipologia || "No especificada";
        if (!subjectsByTypology[tipo]) {
            subjectsByTypology[tipo] = [];
        }
        subjectsByTypology[tipo].push(subject);
    });

    // Sort typologies in the shared typology order
    const sortedTypologies = Object.keys(subjectsByTypology).sort(compareTipologias);

    sortedTypologies.forEach((tipo) => {
        const typologySubjects = subjectsByTypology[tipo];
        
        // Calculate total selected credits for this typology
        let selectedCreditsForTipo = 0;
        typologySubjects.forEach((subject) => {
            const selectedGroupVal = selections[subject.name];
            if (selectedGroupVal) {
                selectedCreditsForTipo += parseInt(subject.creditos, 10) || 0;
            }
        });

        // Create a section container for this typology
        const section = document.createElement("div");
        section.className = `sia-horario-typology-section ${tipologiaClass(tipo)}`;

        const sectionHeader = document.createElement("div");
        sectionHeader.className = "sia-horario-typology-header";

        const formattedTipoName = formatTipologiaName(tipo);
        
        const remaining = remainingByTipo.get(getTipologiaKey(tipo));
        const hasRemaining = Number.isFinite(remaining);
        const exceeds = hasRemaining && selectedCreditsForTipo > remaining;
        const creditsText = hasRemaining
            ? `${selectedCreditsForTipo} / ${remaining} ${remaining === 1 ? "crédito" : "créditos"}`
            : `${selectedCreditsForTipo} ${selectedCreditsForTipo === 1 ? "crédito" : "créditos"}`;

        sectionHeader.innerHTML = `
            <h4 class="sia-horario-typology-title"><span class="sia-tipo-dot"></span>${formattedTipoName}</h4>
            <span class="sia-horario-typology-credits${exceeds ? " exceeds" : ""}"></span>
        `;
        const creditsBadge = sectionHeader.querySelector(".sia-horario-typology-credits");
        creditsBadge.textContent = creditsText;
        creditsBadge.title = hasRemaining
            ? `${selectedCreditsForTipo} créditos planeados de ${remaining} que te faltan en esta tipología`
            : "Créditos planeados (con grupo seleccionado)";
        section.appendChild(sectionHeader);

        if (exceeds) {
            const warning = document.createElement("div");
            warning.className = "sia-horario-warning";
            const extra = selectedCreditsForTipo - remaining;
            warning.textContent = remaining === 0
                ? `Ya no te faltan créditos de ${formattedTipoName}: estos ${selectedCreditsForTipo} créditos no sumarían a esta tipología.`
                : `Planeas ${extra} ${extra === 1 ? "crédito" : "créditos"} más de los que te faltan en ${formattedTipoName} (${remaining}).`;
            section.appendChild(warning);
        }

        const sectionBody = document.createElement("div");
        sectionBody.className = "sia-horario-typology-body";

        typologySubjects.forEach((subject) => {
            const item = document.createElement("div");
            item.className = "sia-horario-subject-item";

            const header = document.createElement("div");
            header.className = "subject-item-header";
            header.innerHTML = `
                <div class="subject-item-info">
                    <h4></h4>
                    <span class="subject-item-meta">${subject.creditos || "?"} créditos</span>
                </div>
                <button type="button" class="remove-subject-btn" title="Quitar del horario">Quitar</button>
            `;

            header.querySelector("h4").textContent = subject.name;

            // Warn when the subject was already approved according to the academic history
            const approvedAttempt = findApprovedAttempt(planningHistory, subject.name);
            if (approvedAttempt) {
                const approvedBadge = document.createElement("span");
                approvedBadge.className = "subject-item-approved";
                approvedBadge.textContent = `Ya la aprobaste · ${approvedAttempt.semestre}${approvedAttempt.calificacion != null ? ` · ${approvedAttempt.calificacion.toFixed(1)}` : ""}`;
                approvedBadge.title = "Esta asignatura aparece como APROBADA en tu historia académica";
                header.querySelector(".subject-item-info").appendChild(approvedBadge);
                item.classList.add("is-approved");
            }

            // Bind remove event
            header.querySelector(".remove-subject-btn").addEventListener("click", () => {
                removeSubject(subject.name);
                // Update the injected page button if it is currently displayed on this page
                updateButtonState(subject.name);
                // Rerender Horario tab
                renderHorario(container);
            });

            // Group selector
            const selectorContainer = document.createElement("div");
            selectorContainer.className = "group-selector-container";

            const select = document.createElement("select");
            select.className = "group-select-input";
            select.setAttribute("aria-label", `Grupo de ${subject.name}`);

            // Default option (None selected)
            const optNone = document.createElement("option");
            optNone.value = "";
            optNone.textContent = "Elegir grupo";
            select.appendChild(optNone);

            const selectedGroupVal = selections[subject.name] || "";

            // Populate groups
            if (subject.groups) {
                const dayAbbrev = {
                    "LUNES": "Lun",
                    "MARTES": "Mar",
                    "MIERCOLES": "Mié",
                    "MIÉRCOLES": "Mié",
                    "JUEVES": "Jue",
                    "VIERNES": "Vie",
                    "SABADO": "Sáb",
                    "SÁBADO": "Sáb",
                    "DOMINGO": "Dom"
                };

                subject.groups.forEach((g) => {
                    const opt = document.createElement("option");
                    opt.value = g.name;

                    // Format the schedule string for the option description
                    const scheduleText = g.horarios ? g.horarios.map(h => {
                        const day = dayAbbrev[h.dia.toUpperCase()] || h.dia;
                        return `${day} ${h.horaInicio}-${h.horaFin}`;
                    }).join(", ") : "";

                    // Check for conflicts if this group were to be selected
                    const conflicts = getConflictsForGroup(subject.name, g);
                    const isCurrentlySelected = selectedGroupVal === g.name;

                    // Short option: group · schedule · seats, plus a clash note for other groups
                    const parts = [g.name];
                    if (scheduleText) parts.push(scheduleText);
                    if (typeof g.cuposDisponibles === "number") parts.push(`${g.cuposDisponibles} cupos`);
                    if (conflicts.length > 0 && !isCurrentlySelected) {
                        parts.push(`se cruza con ${conflicts.map(c => c.subjectName).join(", ")}`);
                    }
                    opt.textContent = parts.join(" · ");
                    opt.title = g.profesor || "Sin profesor";
                    select.appendChild(opt);
                });
            }

            select.value = selectedGroupVal;

            // Listen for group selection changes
            select.addEventListener("change", (e) => {
                const val = e.target.value;
                const currentSelections = loadSelectedGroups();
                if (val) {
                    currentSelections[subject.name] = val;
                } else {
                    delete currentSelections[subject.name];
                }
                saveSelectedGroups(currentSelections);
                // Re-render Horario tab to update schedule calendar and conflict indicators
                renderHorario(container);
            });

            selectorContainer.appendChild(select);

            // Prerequisites logic and UI
            if (subject.prerrequistios && subject.prerrequistios.length > 0) {
                const prereqContainer = document.createElement("div");
                prereqContainer.className = "subject-prereq-container";
                const prereqToggle = document.createElement("button");
                prereqToggle.type = "button";
                prereqToggle.className = "subject-prereq-toggle";
                const prereqPanel = document.createElement("div");
                prereqPanel.className = "subject-prereq-panel";

                const historyData = loadCachedAsignaturas();
                const hasHistory = !!(historyData && Object.keys(historyData).length > 0);
                const getKnownApprovalStatus = (identifier) => {
                    if (!hasHistory) {
                        return { state: "unknown-history", label: "Historia académica no cargada" };
                    }

                    const approved = isSubjectApproved(identifier);
                    if (approved) {
                        return { state: "approved", label: "Aprobada" };
                    }

                    return { state: "not-approved", label: "No aprobada o no encontrada en la historia" };
                };

                const prereqStateKey = `sia_prereq_open_${subject.name}`;
                const storedState = localStorage.getItem(prereqStateKey);
                let prereqOpen = storedState === null ? false : storedState === "true";

                // Overall status, shown on the toggle so it is visible even when collapsed
                let conditionsMet = 0;
                const syncToggle = () => {
                    const total = subject.prerrequistios.length;
                    let state;
                    let label;
                    if (!hasHistory) {
                        state = "unknown";
                        label = "Prerrequisitos · carga tu historia para verificarlos";
                    } else if (conditionsMet === total) {
                        state = "met";
                        label = "Prerrequisitos cumplidos";
                    } else {
                        state = "unmet";
                        label = total === 1
                            ? "Prerrequisitos sin cumplir"
                            : `Prerrequisitos sin cumplir · ${conditionsMet} de ${total} condiciones`;
                    }
                    prereqToggle.textContent = label;
                    prereqToggle.dataset.state = state;
                    prereqContainer.dataset.state = state;
                    prereqToggle.setAttribute("aria-expanded", prereqOpen ? "true" : "false");
                    prereqPanel.hidden = !prereqOpen;
                    prereqContainer.classList.toggle("is-open", prereqOpen);
                };

                prereqToggle.addEventListener("click", () => {
                    prereqOpen = !prereqOpen;
                    localStorage.setItem(prereqStateKey, String(prereqOpen));
                    syncToggle();
                });

                subject.prerrequistios.forEach((pr, idx) => {
                    const conditionCard = document.createElement("div");
                    conditionCard.className = "subject-prereq-condition";

                    const headerPr = document.createElement("div");
                    headerPr.className = "subject-prereq-group-title";
                    headerPr.textContent = `Condición ${idx + 1}`;

                    const typeDesc = document.createElement("div");
                    typeDesc.className = "subject-prereq-type-desc";
                    typeDesc.textContent = pr.tipoDescripcion || "Sin descripción";

                    const todasLine = document.createElement("div");
                    todasLine.className = "subject-prereq-todas";

                    const reqs = pr.asignaturas || [];
                    let satisfiedCount = 0;

                    const list = document.createElement("ul");
                    list.className = "subject-prereq-list";

                    reqs.forEach((asigStr) => {
                        const codeMatch = asigStr.match(/\(([^)]+)\)$/);
                        const code = codeMatch ? codeMatch[1].trim() : null;
                        const name = asigStr.replace(/\([^)]*\)$/, "").trim();

                        const approvalStatus = getKnownApprovalStatus(code || name || asigStr);
                        const enrolledSimult = isSubjectAdded(name) || (code && isSubjectAdded(code));
                        const countsAsSatisfied = approvalStatus.state === "approved" || (pr.tipo === "E" && enrolledSimult);

                        if (countsAsSatisfied) {
                            satisfiedCount++;
                        }

                        const li = document.createElement("li");
                        li.className = "subject-prereq-item";

                        const status = document.createElement("span");
                        status.className = `prereq-status-dot prereq-status-dot-${approvalStatus.state}`;
                        if (approvalStatus.state === "approved") {
                            status.textContent = "✓";
                        } else if (approvalStatus.state === "unknown-history") {
                            status.textContent = "?";
                        } else {
                            status.textContent = "✖";
                        }

                        const text = document.createElement("span");
                        text.className = "subject-prereq-item-name";
                        text.textContent = asigStr;

                        li.appendChild(status);
                        li.appendChild(text);
                        list.appendChild(li);
                    });

                    const blockSatisfied = pr.todas ? (satisfiedCount === (reqs.length || 0)) : (satisfiedCount > 0);
                    if (blockSatisfied) conditionsMet++;

                    todasLine.textContent = pr.todas ? "Requiere todas las asignaturas listadas." : "Basta con aprobar al menos una asignatura listada.";
                    todasLine.classList.toggle("is-satisfied", blockSatisfied);
                    todasLine.classList.toggle("is-unsatisfied", !blockSatisfied);

                    conditionCard.appendChild(headerPr);
                    conditionCard.appendChild(typeDesc);
                    conditionCard.appendChild(todasLine);
                    conditionCard.appendChild(list);
                    prereqPanel.appendChild(conditionCard);
                });

                prereqContainer.appendChild(prereqToggle);
                prereqContainer.appendChild(prereqPanel);
                syncToggle();
                item._prereqContainer = prereqContainer;
            }

            // Display current selections conflict warning banner if exists
            const currentGroup = subject.groups?.find(g => g.name === selectedGroupVal);
            if (currentGroup) {
                // Selected group details as one grey line
                const details = document.createElement("div");
                details.className = "group-selection-details";
                details.textContent = [
                    currentGroup.profesor || "Sin profesor",
                    typeof currentGroup.cuposDisponibles === "number" ? `${currentGroup.cuposDisponibles} cupos disponibles` : null
                ].filter(Boolean).join(" · ");
                selectorContainer.appendChild(details);

                const activeConflicts = getConflictsForGroup(subject.name, currentGroup);
                if (activeConflicts.length > 0) {
                    const warning = document.createElement("div");
                    warning.className = "group-selection-warning-banner";
                    warning.textContent = `Se cruza con ${activeConflicts.map(c => `${c.subjectName} (${c.groupName})`).join(", ")}`;
                    selectorContainer.appendChild(warning);
                    item.classList.add("has-conflict-border");
                }
            }

            item.appendChild(header);
            item.appendChild(selectorContainer);
            if (item._prereqContainer) {
                item.appendChild(item._prereqContainer);
            }
            sectionBody.appendChild(item);
        });

        section.appendChild(sectionBody);
        subjectsList.appendChild(section);
    });

    configPanel.appendChild(subjectsList);
    splitView.appendChild(configPanel);

    // Right side: Visual calendar grid
    const calendarPanel = document.createElement("div");
    calendarPanel.className = "sia-horario-calendar-panel";

    const calendarHeader = document.createElement("div");
    calendarHeader.className = "sia-horario-calendar-header";

    const calendarTitle = document.createElement("h3");
    calendarTitle.textContent = "Calendario semanal";
    calendarTitle.className = "sia-horario-panel-title";
    calendarHeader.appendChild(calendarTitle);

    let hasAnyConflict = false;
    subjects.forEach((subj) => {
        const selectedGroupName = selections[subj.name];
        if (selectedGroupName) {
            const selectedGroup = subj.groups?.find(g => g.name === selectedGroupName);
            if (selectedGroup) {
                const activeConflicts = getConflictsForGroup(subj.name, selectedGroup);
                if (activeConflicts.length > 0) {
                    hasAnyConflict = true;
                }
            }
        }
    });

    const printBtn = document.createElement("button");
    printBtn.className = "sia-horario-print-btn";
    printBtn.textContent = "Guardar PDF";
    if (hasAnyConflict) {
        printBtn.disabled = true;
        printBtn.title = "No puedes guardar el PDF si existen conflictos en tu horario.";
    } else {
        printBtn.addEventListener("click", () => {
            printSchedule(calendarPanel, subjects, selections);
        });
    }
    calendarHeader.appendChild(printBtn);

    calendarPanel.appendChild(calendarHeader);

    let calendarGrid = renderCalendarGrid(subjects, selections);
    calendarPanel.appendChild(calendarGrid);

    // Preview of a generated combination, without saving it
    const previewBar = document.createElement("div");
    previewBar.className = "sia-gen-preview-bar";
    previewBar.hidden = true;
    calendarPanel.insertBefore(previewBar, calendarGrid);
    previewHandler = (previewSelections, label) => {
        const next = renderCalendarGrid(subjects, previewSelections || selections);
        calendarGrid.replaceWith(next);
        calendarGrid = next;
        printBtn.hidden = Boolean(previewSelections);
        previewBar.hidden = !previewSelections;
        if (previewSelections) {
            previewBar.innerHTML = `<span>Vista previa: <b>${label}</b></span>`;
            const exit = document.createElement("button");
            exit.type = "button";
            exit.className = "sia-gen-link";
            exit.textContent = "Volver a mi horario";
            exit.addEventListener("click", () => previewHandler(null));
            previewBar.appendChild(exit);
        }
    };

    splitView.appendChild(calendarPanel);
    wrapper.appendChild(splitView);
    container.appendChild(wrapper);
}

/**
 * Converts "HH:MM" (or "HH") to minutes since midnight.
 *
 * @param {string} time - Time text.
 * @returns {number|null} Minutes, or null when it cannot be parsed.
 */
function toMinutes(time) {
    const m = (time || "").match(/(\d{1,2})(?::(\d{2}))?/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

/**
 * Generates the weekly calendar grid with the selected groups.
 * Only shows the days and hours in use (Monday to Friday always, weekends only when needed,
 * 6:00-20:00 by default, extended only when a class starts earlier or ends later), with
 * half-hour precision so classes like 21:00-21:30 keep their real length. Each block uses its
 * typology so the calendar follows the same color code as the rest of the extension.
 *
 * @param {Array.<Object>} subjects - List of all selected subjects.
 * @param {Object.<string, string>} selections - Map of subject name to selected group name.
 * @returns {HTMLElement} The calendar grid container element.
 */
function renderCalendarGrid(subjects, selections) {
    const grid = document.createElement("div");
    grid.className = "sia-calendar-grid";

    const normalizeDay = (d) => (d || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    const allDays = [
        { key: "LUNES", label: "Lun" },
        { key: "MARTES", label: "Mar" },
        { key: "MIERCOLES", label: "Mié" },
        { key: "JUEVES", label: "Jue" },
        { key: "VIERNES", label: "Vie" },
        { key: "SABADO", label: "Sáb" },
        { key: "DOMINGO", label: "Dom" }
    ];

    // Collect the blocks first, to know which days and hours are actually used
    const blocks = [];
    subjects.forEach((subj) => {
        const selectedGroup = subj.groups?.find(g => g.name === selections[subj.name]);
        if (!selectedGroup || !selectedGroup.horarios) return;
        // Checked against the selections being drawn (they may be a preview, not the saved ones)
        const hasConflicts = subjects.some((other) => {
            if (other.name === subj.name) return false;
            const otherGroup = other.groups?.find((g) => g.name === selections[other.name]);
            return (otherGroup?.horarios || []).some((a) => (selectedGroup.horarios || []).some((b) => doSchedulesOverlap(a, b)));
        });
        selectedGroup.horarios.forEach((h) => {
            const start = toMinutes(h.horaInicio);
            const end = toMinutes(h.horaFin);
            if (start == null || end == null || end <= start) return;
            blocks.push({ subj, group: selectedGroup, h, day: normalizeDay(h.dia), start, end, hasConflicts });
        });
    });

    const usedDays = new Set(blocks.map((b) => b.day));
    const days = allDays.filter((d, i) => i < 5 || usedDays.has(d.key));
    // 6:00-20:00 by default; widened to whole hours when a class falls outside it
    const firstHour = Math.min(6, ...blocks.map((b) => Math.floor(b.start / 60)));
    const lastHour = Math.max(20, ...blocks.map((b) => Math.ceil(b.end / 60)));
    const hourCount = lastHour - firstHour;
    // Two rows per hour (half-hour slots); row 1 is the header
    const slotRow = (minutes) => Math.round((minutes - firstHour * 60) / 30) + 2;

    grid.style.display = "grid";
    grid.style.gridTemplateColumns = `56px repeat(${days.length}, 1fr)`;
    grid.style.gridTemplateRows = `36px repeat(${hourCount * 2}, 20px)`;

    // Column headers
    ["", ...days.map((d) => d.label)].forEach((label, index) => {
        const header = document.createElement("div");
        header.className = "calendar-header-cell";
        header.textContent = label;
        header.style.gridColumn = `${index + 1}`;
        header.style.gridRow = "1";
        grid.appendChild(header);
    });

    // Hour labels
    for (let hour = firstHour; hour < lastHour; hour++) {
        const label = document.createElement("div");
        label.className = "calendar-hour-label";
        label.textContent = `${hour}:00`;
        label.style.gridColumn = "1";
        label.style.gridRow = `${slotRow(hour * 60)} / span 2`;
        grid.appendChild(label);
    }

    // Background cells
    for (let col = 2; col <= days.length + 1; col++) {
        for (let hour = firstHour; hour < lastHour; hour++) {
            const cell = document.createElement("div");
            cell.className = "calendar-bg-cell";
            cell.style.gridColumn = `${col}`;
            cell.style.gridRow = `${slotRow(hour * 60)} / span 2`;
            grid.appendChild(cell);
        }
    }

    // Class blocks, colored by typology (conflicts keep their warning style)
    blocks.forEach(({ subj, group, h, day, start, end, hasConflicts }) => {
        const dayIndex = days.findIndex((d) => d.key === day);
        if (dayIndex === -1) return;

        const block = document.createElement("div");
        block.className = `calendar-event-block ${tipologiaClass(subj.tipologia)}${hasConflicts ? " conflict" : ""}`;
        block.style.gridColumn = `${dayIndex + 2}`;
        // At least one half-hour slot, so very short classes stay visible
        block.style.gridRow = `${slotRow(start)} / ${Math.max(slotRow(end), slotRow(start) + 1)}`;

        const tooltipParts = [
            subj.name,
            group.name,
            `${subj.creditos || "?"} créditos · ${subj.tipologia ? formatTipologiaName(subj.tipologia) : "Sin tipología"}`,
            `Profesor: ${group.profesor || "Sin profesor"}`,
            `${h.dia} ${h.horaInicio}-${h.horaFin}`,
            `Aula: ${h.aula || "Sin aula"}`
        ];
        if (typeof group.cuposDisponibles === "number") {
            tooltipParts.push(`${group.cuposDisponibles} cupos disponibles`);
        }
        block.title = tooltipParts.join("\n");

        block.innerHTML = `
            <div class="event-title"></div>
            <div class="event-meta"></div>
            ${hasConflicts ? `<div class="event-conflict-badge">Cruce</div>` : ""}
        `;
        block.querySelector(".event-title").textContent = shortenCourseName(subj.name);
        block.querySelector(".event-meta").textContent = [group.name, h.aula].filter(Boolean).join(" · ");

        grid.appendChild(block);
    });

    return grid;
}

/**
 * Creates a hidden iframe, extracts current stylesheets, injects the calendar panel HTML,
 * detailed course list, and academic metrics, and triggers Chrome's native print dialog.
 * 
 * @param {HTMLElement} calendarPanel - The visual calendar element.
 * @param {HTMLElement} creditsSummary - The sidebar credits metrics container.
 * @param {Array.<Object>} subjects - List of all selected subjects.
 * @param {Object.<string, string>} selections - Map of subject name to selected group name.
 * @returns {void}
 */
/**
 * Creates a hidden iframe, extracts current stylesheets, injects the calendar panel HTML
 * and the detailed course list, and triggers Chrome's native print dialog.
 * 
 * @param {HTMLElement} calendarPanel - The visual calendar element.
 * @param {Array.<Object>} subjects - List of all selected subjects.
 * @param {Object.<string, string>} selections - Map of subject name to selected group name.
 * @returns {void}
 */
function printSchedule(calendarPanel, subjects, selections) {
    const printIframe = document.createElement("iframe");
    printIframe.style.position = "fixed";
    printIframe.style.right = "0";
    printIframe.style.bottom = "0";
    printIframe.style.width = "0";
    printIframe.style.height = "0";
    printIframe.style.border = "0";
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;

    // Extract all stylesheets currently loaded in the DOM to preserve extension colors & designs
    let cssText = "";
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                cssText += rule.cssText + "\n";
            }
        } catch (e) {
            // Ignore cross-origin stylesheet errors
        }
    }

    // Generate detailed table HTML for selected subjects
    let subjectsTableHTML = `
        <table class="print-subjects-table">
            <thead>
                <tr>
                    <th>Asignatura</th>
                    <th>Grupo</th>
                    <th>Créditos</th>
                    <th>Tipología</th>
                    <th>Profesor</th>
                    <th>Horario / Aula</th>
                </tr>
            </thead>
            <tbody>
    `;

    let hasSelectedSubjects = false;
    subjects.forEach(subj => {
        const selectedGroupName = selections[subj.name];
        if (!selectedGroupName) return;

        const selectedGroup = subj.groups?.find(g => g.name === selectedGroupName);
        if (!selectedGroup) return;

        hasSelectedSubjects = true;
        const scheduleStrings = selectedGroup.horarios.map(h => `${h.dia}: ${h.horaInicio}-${h.horaFin} (${h.aula})`).join("<br>");
        const componentText = subj.tipologia || "-";

        subjectsTableHTML += `
            <tr>
                <td><strong>${subj.name}</strong></td>
                <td>${selectedGroup.name}</td>
                <td>${subj.creditos}</td>
                <td>${componentText}</td>
                <td>${selectedGroup.profesor || "Sin prof."}</td>
                <td>${scheduleStrings}</td>
            </tr>
        `;
    });

    subjectsTableHTML += `
            </tbody>
        </table>
    `;

    if (!hasSelectedSubjects) {
        subjectsTableHTML = "<p class='no-subjects'>No has seleccionado grupos para tu horario.</p>";
    }

    doc.write(`
        <!DOCTYPE html>
        <html>
            <head>
                <title>Horario SIA Pro</title>
                <style>
                    ${cssText}
                </style>
                <style>
                    @page {
                        size: landscape;
                        margin: 10mm;
                    }
                    body { 
                        padding: 0; 
                        margin: 0;
                        background: white !important; 
                        font-family: system-ui, -apple-system, sans-serif; 
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .sia-horario-calendar-panel { 
                        box-shadow: none !important; 
                        border: none !important; 
                        width: 100% !important; 
                        margin: 0 !important; 
                    }
                    /* Hide print action button in the output PDF */
                    .sia-horario-print-btn {
                        display: none !important;
                    }
                    
                    /* Force visible borders for the grid when printing */
                    .calendar-bg-cell {
                        border-bottom: 1px solid #cbd5e1 !important;
                        border-right: 1px solid #cbd5e1 !important;
                    }
                    .calendar-hour-label {
                        border-right: 2px solid #94a3b8 !important;
                        border-bottom: 1px solid #cbd5e1 !important;
                    }
                    .calendar-header-cell {
                        border-bottom: 2px solid #94a3b8 !important;
                        border-right: 1px solid #cbd5e1 !important;
                    }
                    
                    /* Detailed view styling for printing */
                    .print-details-container {
                        margin-top: 24px;
                        page-break-inside: avoid;
                    }
                    .print-details-container h3 {
                        margin-top: 0;
                        margin-bottom: 12px;
                        color: #0f6d59;
                        border-bottom: 2px solid #edf2f7;
                        padding-bottom: 8px;
                        font-size: 13px;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .print-subjects-table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 10.5px;
                    }
                    .print-subjects-table th, .print-subjects-table td {
                        padding: 8px 10px;
                        text-align: left;
                        border-bottom: 1px solid #edf2f7;
                        line-height: 1.3;
                    }
                    .print-subjects-table th {
                        font-weight: 700;
                        color: #475569;
                        background: #f8fafc;
                        border-bottom: 2px solid #e2e8f0;
                    }
                    .print-subjects-table td {
                        color: #334155;
                    }
                    
                    /* The calendar keeps the styles copied from the live view (see inlineComputedStyles) */
                    .sia-horario-calendar-panel {
                        position: static !important;
                        padding: 0 !important;
                    }
                </style>
            </head>
            <body>
                <div class="sia-horario-calendar-panel">
                    ${printableCalendarHtml(calendarPanel)}
                </div>
                <div class="print-details-container">
                    <h3>Detalle de Asignaturas Seleccionadas</h3>
                    ${subjectsTableHTML}
                </div>
            </body>
        </html>
    `);
    doc.close();

    // Temporarily swap document title so Chrome uses it as the default PDF file name
    const originalTitle = document.title;
    document.title = "Mi Horario - SIA Pro";

    // Trigger printing and cleanup directly from content script (safe from CSP inline-script blocks)
    setTimeout(() => {
        printIframe.contentWindow.print();
        
        // Restore parent page title immediately after print dialog opens
        document.title = originalTitle;
        
        setTimeout(() => {
            printIframe.remove();
        }, 500);
    }, 500);
}

/**
 * Properties copied from the live calendar into the printed copy. The extension's stylesheets
 * are not reliably available inside the print iframe, so the calendar is printed with its
 * actual computed look (typology colors, layout, fonts) inlined on each element.
 */
const PRINT_STYLE_PROPS = [
    "display", "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "flex-direction", "align-items", "justify-content", "align-self", "gap",
    "background-color", "color", "border-top", "border-right", "border-bottom", "border-left", "border-radius",
    "padding", "margin", "font-size", "font-weight", "line-height", "text-align",
    "overflow", "white-space", "word-break", "z-index",
    "-webkit-line-clamp", "-webkit-box-orient"
];

/**
 * Returns the calendar panel HTML with its computed styles inlined, ready for printing.
 *
 * @param {HTMLElement} calendarPanel - Live calendar panel (must be rendered and visible).
 * @returns {string} HTML of the panel's contents.
 */
function printableCalendarHtml(calendarPanel) {
    const clone = calendarPanel.cloneNode(true);
    const source = [calendarPanel, ...calendarPanel.querySelectorAll("*")];
    const target = [clone, ...clone.querySelectorAll("*")];
    source.forEach((el, i) => {
        const computed = getComputedStyle(el);
        const css = PRINT_STYLE_PROPS
            .map((prop) => `${prop}: ${computed.getPropertyValue(prop)}`)
            .join("; ");
        target[i].setAttribute("style", `${target[i].getAttribute("style") || ""}; ${css}`);
    });
    clone.querySelectorAll(".sia-horario-print-btn").forEach((b) => b.remove());
    return clone.innerHTML;
}

/**
 * Truncates course names to their first characters to fit cleanly inside calendar blocks.
 * 
 * @param {string} name - The original course name.
 * @returns {string} The shortened course name.
 */
function shortenCourseName(name) {
    if (!name) return "";
    if (name.length > 15) {
        return name.slice(0, 15).trim() + "...";
    }
    return name;
}
