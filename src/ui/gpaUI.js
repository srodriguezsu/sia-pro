import { SELECTORS } from "../utils/selectors.js";
import { calculateCurrentGPA, normalizeSubjectName, calculateSemesterGPA, roundGrade } from "../domain/gpaCalculator.js";
import {
    extractActivitiesFromDom,
    extractSubjectName,
    extractSubjectMeta,
    areGradeContainersAvailable
} from "../scraper/domScraper.js";
import {
    saveGpaSimulationForSubject,
    loadGpaSimulationForSubject,
    saveGpaCachedSubject,
    loadAllGpaCachedSubjects,
    loadAllGpaSubjectMeta,
    loadGoalSimulationForSubject,
    saveGoalSimulationForSubject
} from "../domain/historyManager.js";

/**
 * Clears all injected required grade status elements from the DOM.
 * 
 * @returns {void}
 */
export function clearRequiredGradeUi() {
    document.querySelectorAll(SELECTORS.requiredGradeUi).forEach((el) => el.remove());
}

/**
 * Injects a label displaying the minimum grade needed to approve in the DOM container of each pending activity.
 * Displays a skull symbol if the required grade exceeds the maximum possible score (5.0).
 * 
 * @param {Object} data - The required grade calculation details.
 * @param {number} data.requiredGrade - The grade needed.
 * @param {Array.<Object>} data.activities - List of activities to update in the UI.
 * @returns {void}
 */
export function injectRequiredGradeUi(data) {
    if (!data || !data.activities) return;

    const { requiredGrade, activities } = data;
    // GPA grading system in UNAL is 0.0 - 5.0. Above 5.0 is impossible.
    const isNotPossible = requiredGrade > 5;

    activities.forEach((activity) => {
        if (!activity.container) return;

        const resultDiv = document.createElement("div");
        resultDiv.setAttribute("data-required-grade-ui", "true");
        resultDiv.classList.add("gpa-required-grade");

        // Format grade display. Append skull emoji if the grade is mathematically impossible.
        const gradeDisplay = isNotPossible
            ? Number(requiredGrade).toFixed(1) + " 💀"
            : Number(requiredGrade).toFixed(1);

        resultDiv.innerHTML = `
            <strong class="${isNotPossible ? "gpa-grade-impossible" : "gpa-grade-possible"}">Calificación mínima para aprobar: ${gradeDisplay}</strong>
        `;

        activity.container.appendChild(resultDiv);
    });
}

/**
 * Creates and injects a floating UI box in the bottom right corner showing the calculated GPA.
 * 
 * @param {number|string} gpaValue - The current calculated GPA score.
 * @param {string} [title="Promedio calculado"] - Header title for the GPA box.
 * @returns {void}
 */
export function injectGpaBox(gpaValue, title = "Promedio calculado") {
    if (gpaValue == null) return;
    if (document.querySelector(SELECTORS.gpaBox)) return;

    const box = document.createElement("div");
    box.id = SELECTORS.gpaBox.replace("#", "");
    const gpaText = (typeof gpaValue === "number") ? gpaValue.toFixed(1) : gpaValue;

    box.innerHTML = `
        <strong id="gpa-subject-name">📊 ${title}</strong>
        <div class="gpa-value">${gpaText}</div>
        <button id="gpa-refresh-btn">🔄 Calcular</button>
    `;

    document.body.appendChild(box);
}

/**
 * Updates the GPA value displayed inside the floating GPA box.
 * 
 * @param {number} gpaValue - The new GPA value.
 * @returns {void}
 */
export function updateGpaDisplay(gpaValue) {
    const gpaValueDiv = document.querySelector(SELECTORS.gpaValue);
    if (gpaValueDiv) {
        gpaValueDiv.textContent = gpaValue.toFixed(1);
    }
}

/**
 * Updates the course name header inside the floating GPA box.
 * 
 * @param {string} subjectName - Name of the subject.
 * @returns {void}
 */
export function updateSubjectName(subjectName) {
    const subjectNameDiv = document.querySelector(SELECTORS.gpaSubjectName);
    if (subjectNameDiv) {
        subjectNameDiv.textContent = `📊 ${subjectName}`;
    }
}

/**
 * Registers a callback function for when the recalculate/refresh button in the GPA box is clicked.
 * 
 * @param {function} onRefresh - Callback function to execute.
 * @returns {void}
 */
export function bindRefreshButton(onRefresh) {
    const refreshBtn = document.querySelector(SELECTORS.refreshButton);
    if (refreshBtn) {
        refreshBtn.addEventListener("click", onRefresh);
    }
}

const NO_PERIOD_KEY = "__sin_periodo__";

/**
 * Sorts period keys from most recent to oldest, leaving subjects without period last.
 *
 * @param {string} a - Period key.
 * @param {string} b - Period key.
 * @returns {number} Sort order.
 */
function comparePeriodsDesc(a, b) {
    if (a === NO_PERIOD_KEY) return 1;
    if (b === NO_PERIOD_KEY) return -1;
    return b.localeCompare(a, undefined, { numeric: true });
}

/**
 * Computes a subject's grade with saved simulations applied (ungraded activities count as 0).
 *
 * @param {string} subjectName - Subject name.
 * @param {Array.<Object>} activities - Cached activities.
 * @returns {{ grade: number, evaluatedWeight: number }} Accumulated grade and evaluated weight (0-1).
 */
function computeSubjectGrade(subjectName, activities) {
    const sims = loadGpaSimulationForSubject(subjectName);
    const applied = activities.map(a => ({
        ...a,
        grade: sims[a.description] !== undefined ? sims[a.description] : a.grade
    }));
    const { currentGPA } = calculateCurrentGPA(applied);
    const evaluatedWeight = applied.reduce((sum, a) => sum + (Number.isFinite(a.grade) ? a.percentage : 0), 0);
    const remainingWeight = applied.reduce((sum, a) => sum + (Number.isFinite(a.grade) ? 0 : a.percentage), 0);

    // Same projection as the subject simulator: pending activities get the grade needed for the target
    const goal = loadGoalSimulationForSubject(subjectName);
    if (goal?.active && Number.isFinite(goal.target) && remainingWeight > 0.001) {
        const maxReachable = currentGPA + remainingWeight * 5;
        const projected = Math.min(Math.max(goal.target, currentGPA), maxReachable);
        return { grade: projected, evaluatedWeight: 1 };
    }
    return { grade: currentGPA, evaluatedWeight };
}

/**
 * Renders the interactive GPA simulator panel inside the modal tab.
 * Subjects are grouped by academic period: the user picks a semester, sees its
 * credit-weighted PAPA and subject list, and then simulates a single subject.
 *
 * @param {HTMLElement} container - The container element to mount the simulator inside.
 * @returns {void}
 */
export function renderGpa(container) {
    if (!container) return;
    container.innerHTML = "";

    // 1. Scrape and cache the active subject from the DOM if we are on the grades page
    if (areGradeContainersAvailable()) {
        const domSubjectName = normalizeSubjectName(extractSubjectName());
        if (domSubjectName && domSubjectName !== "N/A") {
            const domActivities = extractActivitiesFromDom();
            saveGpaCachedSubject(domSubjectName, domActivities, extractSubjectMeta());
            localStorage.setItem("sia_pro_gpa_selected_subject", domSubjectName);
        }
    }

    // 2. Load cached subjects and their metadata
    const cachedSubjects = loadAllGpaCachedSubjects();
    const subjectMeta = loadAllGpaSubjectMeta();
    const cachedSubjectNames = Object.keys(cachedSubjects);

    // 3. Fallback if no subjects have been cached
    if (cachedSubjectNames.length === 0) {
        container.innerHTML = "<p>No hay datos disponibles.<br><br>Navega a <b>Información académica > Mis calificaciones</b> y selecciona una asignatura para comenzar.</p>";
        return;
    }

    // 4. Group subjects by period
    const periodOf = (name) => subjectMeta[name]?.period || NO_PERIOD_KEY;
    const groups = {};
    cachedSubjectNames.forEach((name) => {
        const key = periodOf(name);
        (groups[key] ||= []).push(name);
    });
    const periods = Object.keys(groups).sort(comparePeriodsDesc);
    periods.forEach((p) => groups[p].sort((a, b) => a.localeCompare(b)));

    // 5. Determine currently selected subject (and therefore semester)
    let selectedSubject = localStorage.getItem("sia_pro_gpa_selected_subject");
    if (!selectedSubject || !cachedSubjects[selectedSubject]) {
        selectedSubject = groups[periods[0]][0];
        localStorage.setItem("sia_pro_gpa_selected_subject", selectedSubject);
    }
    let selectedPeriod = periodOf(selectedSubject);

    // Live grades per subject; the selected one is updated by the details simulator.
    // Original grades (real scraped data, no simulations) are kept to show the simulated delta.
    const liveGrades = {};
    const originalGrades = {};
    cachedSubjectNames.forEach((name) => {
        liveGrades[name] = computeSubjectGrade(name, cachedSubjects[name]);
        originalGrades[name] = calculateCurrentGPA(cachedSubjects[name]).currentGPA;
    });

    /**
     * Formats "X (+/-delta)" the same way the subject simulator shows original grades.
     * @param {number} original - Original value.
     * @param {number} simulated - Simulated value.
     * @param {number} decimals - Decimals to display.
     * @returns {string} Formatted comparison text.
     */
    const formatOriginalDelta = (original, simulated, decimals) => {
        const delta = simulated - original;
        const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
        return `${original.toFixed(decimals)} (${sign}${delta.toFixed(decimals)})`;
    };
    const isSimulated = (original, simulated) => Math.abs(simulated - original) > 0.0001;

    // 6. Two-column layout: semester overview (left) + subject simulator (right).
    // Collapses to a single column on narrow containers (see required-grade.css).
    const layoutWrapper = document.createElement("div");
    layoutWrapper.className = "gpa-layout-wrapper";
    const layout = document.createElement("div");
    layout.className = "gpa-layout";
    const semesterColumn = document.createElement("div");
    semesterColumn.className = "gpa-layout-semester";
    const subjectColumn = document.createElement("div");
    subjectColumn.className = "gpa-layout-subject";
    layout.append(semesterColumn, subjectColumn);
    layoutWrapper.appendChild(layout);
    container.appendChild(layoutWrapper);

    // Semester chips
    const periodBar = document.createElement("div");
    periodBar.className = "gpa-period-bar";
    semesterColumn.appendChild(periodBar);

    // Semester summary (PAPA + subject list)
    const semesterCard = document.createElement("div");
    semesterCard.className = "gpa-semester-card";
    semesterColumn.appendChild(semesterCard);

    // Subject details container
    const detailsContainer = document.createElement("div");
    detailsContainer.id = "gpa-calc-details-container";
    subjectColumn.appendChild(detailsContainer);

    const periodLabel = (p) => (p === NO_PERIOD_KEY ? "Sin periodo" : p);

    const renderPeriodBar = () => {
        periodBar.innerHTML = "";
        periods.forEach((p) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "gpa-period-chip" + (p === selectedPeriod ? " active" : "");
            chip.textContent = `${periodLabel(p)} (${groups[p].length})`;
            chip.addEventListener("click", () => {
                if (p === selectedPeriod) return;
                selectedPeriod = p;
                selectSubject(groups[p][0]);
            });
            periodBar.appendChild(chip);
        });
    };

    const renderSemesterCard = () => {
        const names = groups[selectedPeriod];
        const rows = names.map((name) => ({
            name,
            credits: subjectMeta[name]?.credits ?? null,
            typology: subjectMeta[name]?.typology ?? null,
            ...liveGrades[name]
        }));
        const { gpa, totalCredits } = calculateSemesterGPA(rows);
        const { gpa: originalGpa } = calculateSemesterGPA(rows.map(r => ({ grade: originalGrades[r.name], credits: r.credits })));
        const semesterSimulated = gpa != null && originalGpa != null && isSimulated(originalGpa, gpa);
        const missingCredits = rows.filter(r => !Number.isFinite(r.credits)).length;
        const inProgress = rows.some(r => r.evaluatedWeight < 0.999);

        const notes = [];
        if (inProgress) notes.push("Incluye asignaturas en curso: las actividades sin nota cuentan como 0 (usa el simulador para proyectarlas).");
        if (missingCredits > 0) notes.push(`${missingCredits} asignatura(s) sin créditos conocidos no se incluyen. Vuelve a abrirlas en <b>Mis calificaciones</b> para actualizar sus datos.`);

        semesterCard.innerHTML = `
            <div class="gpa-semester-header">
                <div>
                    <div class="gpa-semester-title">📅 ${periodLabel(selectedPeriod)}</div>
                    <div class="gpa-semester-sub">${rows.length} asignaturas · ${totalCredits} créditos</div>
                </div>
                <div class="gpa-semester-papa" title="Promedio ponderado por créditos, con cada nota redondeada a una cifra decimal">
                    <span class="gpa-semester-papa-label">Promedio ponderado del semestre</span>
                    <span class="gpa-semester-papa-value ${gpa != null && gpa < 2.96 ? "failing" : ""}">${gpa != null ? gpa.toFixed(2) : "—"}</span>
                    <span class="gpa-semester-original${semesterSimulated ? "" : " is-hidden"}" title="Promedio real sin simulaciones">${semesterSimulated ? formatOriginalDelta(originalGpa, gpa, 2) : "&nbsp;"}</span>
                </div>
            </div>
            <div class="gpa-semester-list"></div>
            ${notes.map(n => `<div class="gpa-semester-note">${n}</div>`).join("")}
        `;

        const list = semesterCard.querySelector(".gpa-semester-list");
        rows.forEach((r) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "gpa-semester-row" + (r.name === selectedSubject ? " active" : "");
            const failing = r.grade < 2.96 ? " failing" : "";
            const original = originalGrades[r.name];
            const simulated = isSimulated(original, r.grade);
            if (simulated) row.classList.add("simulated");
            row.innerHTML = `
                <span class="gpa-semester-row-name"></span>
                <span class="gpa-semester-row-meta">
                    <span class="gpa-semester-row-pct" title="Porcentaje evaluado"></span>
                    <span class="gpa-semester-row-details"></span>
                </span>
                <span class="gpa-semester-row-grades">
                    <span class="gpa-semester-row-grade${failing}">${roundGrade(r.grade).toFixed(1)}</span>
                    <span class="gpa-semester-original${simulated ? "" : " is-hidden"}" title="Nota real sin simulaciones">${simulated ? formatOriginalDelta(roundGrade(original), roundGrade(r.grade), 1) : "&nbsp;"}</span>
                </span>
            `;
            const nameEl = row.querySelector(".gpa-semester-row-name");
            nameEl.textContent = r.name;
            row.title = r.name; // full name on hover when clamped
            // Evaluated percentage goes first with a fixed width so every row lines up
            const pctEl = row.querySelector(".gpa-semester-row-pct");
            pctEl.textContent = `${Math.round(Math.min(r.evaluatedWeight, 1) * 100)}%`;
            row.querySelector(".gpa-semester-row-details").textContent = [
                Number.isFinite(r.credits) ? `${r.credits} créd.` : "créditos ?",
                r.typology
            ].filter(Boolean).join(" · ");
            row.addEventListener("click", () => selectSubject(r.name));
            list.appendChild(row);
        });
    };

    const selectSubject = (name) => {
        selectedSubject = name;
        selectedPeriod = periodOf(name);
        localStorage.setItem("sia_pro_gpa_selected_subject", name);
        // Re-read saved simulations so the list reflects any edits made in the previous subject
        liveGrades[name] = computeSubjectGrade(name, cachedSubjects[name]);
        renderPeriodBar();
        renderSemesterCard();
        renderGpaDetails(detailsContainer, name, cachedSubjects[name], (grade, evaluatedWeight) => {
            liveGrades[name] = { grade, evaluatedWeight };
            renderSemesterCard();
        });
    };

    selectSubject(selectedSubject);
}

/**
 * Renders the GPA details list (calculated GPA, original grades comparison, simulated input rows)
 * for a specific subject using cached or scraped data.
 * 
 * @param {HTMLElement} container - The container element to render details inside.
 * @param {string} subjectName - The name of the subject.
 * @param {Array.<Object>} originalActivities - The original grade activities array.
 * @param {function(number, number): void} [onGradeChange] - Called with the displayed (simulated) grade and the evaluated weight (0-1) whenever it changes.
 * @returns {void}
 */
export function renderGpaDetails(container, subjectName, originalActivities, onGradeChange) {
    if (!container || !subjectName || !originalActivities) return;
    container.innerHTML = "";

    // Clone/map the activities to prevent mutating the original cached objects in memory directly
    const activities = originalActivities.map(a => ({
        description: a.description,
        percentage: a.percentage,
        grade: a.grade,
        originalGrade: a.grade
    }));

    // Load saved GPA simulations for this subject
    const savedSimulations = loadGpaSimulationForSubject(subjectName);

    // Apply saved simulations if present
    activities.forEach((activity) => {
        const savedGrade = savedSimulations[activity.description];
        if (savedGrade !== undefined) {
            activity.grade = savedGrade;
        }
    });

    // Calculate baseline original GPA based on the original cached grades
    const originalGPAActivities = activities.map(a => ({
        grade: a.originalGrade,
        percentage: a.percentage,
        description: a.description
    }));
    const { currentGPA: originalGPA } = calculateCurrentGPA(originalGPAActivities);

    // Subject header
    const header = document.createElement("h2");
    header.textContent = subjectName;
    container.appendChild(header);

    // Current calculated GPA display
    const gpaDisplay = document.createElement("p");
    gpaDisplay.className = "gpa-calc-display";
    container.appendChild(gpaDisplay);

    // Baseline original GPA display (shows difference when modified)
    const originalGpaDisplay = document.createElement("p");
    originalGpaDisplay.className = "gpa-calc-original-display";
    originalGpaDisplay.textContent = `${originalGPA.toFixed(2)}`;
    container.appendChild(originalGpaDisplay);

    // --- GOAL GRADE SIMULATOR UI ---
    // The goal simulator allows users to set a target grade for the course.
    // When active, it calculates the required grade for ungraded elements to reach that goal.
    // By default, if the current grade is less than 2.96, we set the initial goal to 3.0.
    // The goal state is persisted per subject so it survives switching subject or semester.
    const savedGoal = loadGoalSimulationForSubject(subjectName);
    let targetGoalGrade = Number.isFinite(savedGoal?.target)
        ? savedGoal.target
        : (originalGPA < 2.96 ? 3.0 : Math.min(originalGPA, 5.0));
    let goalActive = !!savedGoal?.active; // Controls whether auto-filled goals are computed and shown
    const persistGoal = () => saveGoalSimulationForSubject(subjectName, { active: goalActive, target: targetGoalGrade });

    const goalCard = document.createElement("div");
    goalCard.className = "gpa-goal-card collapsed"; // Render as closed/inactive by default
    goalCard.innerHTML = `
        <div class="gpa-goal-header" title="Haz clic para activar/desactivar el simulador">
            <span class="gpa-goal-title">🎯 Simulador de Nota Objetivo</span>
            <span class="gpa-goal-arrow">▼</span>
        </div>
        <div class="gpa-goal-content">
            <div class="gpa-goal-description">Calcula la nota promedio que necesitas en las actividades restantes para obtener la nota final deseada.</div>
            <div class="gpa-goal-controls">
                <div class="gpa-goal-slider-wrapper">
                    <label for="gpa-goal-slider">Meta: <span id="gpa-goal-target-val">3.00</span> <span id="gpa-goal-target-delta" class="gpa-goal-delta"></span></label>
                    <div class="gpa-goal-track">
                        <input type="range" id="gpa-goal-slider" min="0" max="5" step="0.01" class="gpa-goal-slider">
                        <span class="gpa-goal-ref-mark" title="Nota mínima aprobatoria"><span>3.0</span></span>
                        <span class="gpa-goal-max-mark" title="Nota máxima alcanzable si obtienes 5.0 en todo lo restante"><span></span></span>
                    </div>
                </div>
                <div class="gpa-goal-number-wrapper">
                    <input type="number" id="gpa-goal-number" step="0.01" class="gpa-goal-number-input" min="0" max="5.00">
                </div>
            </div>
            <div id="gpa-goal-result" class="gpa-goal-result"></div>
        </div>
    `;

    const goalSlider = goalCard.querySelector("#gpa-goal-slider");
    const goalNumberInput = goalCard.querySelector("#gpa-goal-number");
    const goalResultDiv = goalCard.querySelector("#gpa-goal-result");
    const goalControlsDiv = goalCard.querySelector(".gpa-goal-controls");
    const goalDescDiv = goalCard.querySelector(".gpa-goal-description");
    const goalHeader = goalCard.querySelector(".gpa-goal-header");
    goalCard.classList.toggle("collapsed", !goalActive);

    const resetOrigGradeSpan = (act) => {
        if (!act.origGradeSpan) return;
        const isOrigNaN = !Number.isFinite(act.originalGrade);
        const isCurrNaN = !Number.isFinite(act.grade);
        const isChanged = isOrigNaN !== isCurrNaN || (!isOrigNaN && act.grade !== act.originalGrade);
        
        act.origGradeSpan.style.visibility = isChanged ? "visible" : "hidden";
        
        if (isChanged && !isCurrNaN) {
            const origVal = isOrigNaN ? 0 : act.originalGrade;
            const delta = act.grade - origVal;
            const sign = delta > 0 ? "+" : "";
            const origDisplay = isOrigNaN ? "-" : act.originalGrade;
            act.origGradeSpan.textContent = `${origDisplay} (${sign}${delta.toFixed(2)})`;
        } else {
            act.origGradeSpan.textContent = `${Number.isFinite(act.originalGrade) ? act.originalGrade : "-"}`;
        }
    };

    // Active-simulator messages. Rendered with worst-case numbers as invisible "ghosts" stacked
    // under the visible message, so the box keeps the height of the longest one and never jumps.
    const goalMessages = {
        impossible: (req, pct) => `❌ <strong>¡Matemáticamente imposible!</strong> Necesitarías un promedio de <strong>${req}</strong> en el <strong>${pct}%</strong> restante para alcanzar esta meta.`,
        secured: (pct, grade) => `🎉 <strong>¡Meta asegurada!</strong> Incluso si obtienes 0.0 en el <strong>${pct}%</strong> restante de la asignatura, tu nota final será de <strong>${grade}</strong>.`,
        needed: (req, pct) => `📈 Necesitas obtener un promedio de <strong>${req}</strong> en el <strong>${pct}%</strong> restante de la asignatura.`
    };
    const goalMessageGhosts = [
        goalMessages.impossible("00.00", "100"),
        goalMessages.secured("100", "0.00"),
        goalMessages.needed("0.00", "100")
    ];

    /**
     * Sets the goal result box content and status color.
     * @param {string} status - Status class (gpa-goal-status-secured, gpa-goal-status-possible, gpa-goal-status-warning, gpa-goal-status-impossible).
     * @param {string} html - Message HTML.
     * @param {boolean} [reserveHeight=false] - Stack invisible worst-case messages to keep a stable height.
     */
    const setGoalResult = (status, html, reserveHeight = false) => {
        goalResultDiv.className = `gpa-goal-result ${status}`;
        const ghosts = reserveHeight
            ? goalMessageGhosts.map(g => `<span class="gpa-goal-result-msg ghost" aria-hidden="true">${g}</span>`).join("")
            : "";
        goalResultDiv.innerHTML = `<div class="gpa-goal-result-stack"><span class="gpa-goal-result-msg">${html}</span>${ghosts}</div>`;
    };

    const updateGoalResult = () => {
        const { currentGPA } = calculateCurrentGPA(activities);
        const remainingWeight = activities.reduce((sum, act) => sum + (Number.isFinite(act.grade) ? 0 : act.percentage), 0);

        if (targetGoalGrade < currentGPA) {
            targetGoalGrade = currentGPA;
        }

        // The slider always spans 0-5; the range below the current grade is unreachable,
        // so it is painted as disabled (see .gpa-goal-slider in required-grade.css)
        goalSlider.min = "0";
        goalSlider.max = "5";
        goalSlider.value = targetGoalGrade.toFixed(2);
        goalSlider.style.setProperty("--gpa-invalid", String(Math.min(currentGPA, 5) / 5));
        goalSlider.style.setProperty("--gpa-value", String(targetGoalGrade / 5));

        // Highest reachable grade: 5.0 on every remaining activity. Above it the goal is impossible.
        const maxReachable = Math.min(5, currentGPA + remainingWeight * 5);
        goalSlider.style.setProperty("--gpa-max", String(maxReachable / 5));
        const hasImpossibleArea = maxReachable < 4.995;
        goalSlider.style.setProperty("--gpa-has-impossible", hasImpossibleArea ? "1" : "0");
        goalSlider.style.setProperty("--gpa-has-invalid", currentGPA > 0.005 ? "1" : "0");
        const maxMark = goalCard.querySelector(".gpa-goal-max-mark");
        if (maxMark) {
            maxMark.style.display = hasImpossibleArea ? "block" : "none";
            maxMark.style.setProperty("--gpa-max", String(maxReachable / 5));
            maxMark.querySelector("span").textContent = `máx ${maxReachable.toFixed(2)}`;
            // Avoid overlapping the 3.0 label when both marks are close
            maxMark.classList.toggle("near-ref", Math.abs(maxReachable - 3) < 0.6);
        }

        goalNumberInput.min = currentGPA.toFixed(2);
        goalNumberInput.max = "5.00";
        goalNumberInput.value = targetGoalGrade.toFixed(2);

        const goalValSpan = goalCard.querySelector("#gpa-goal-target-val");
        const goalDeltaSpan = goalCard.querySelector("#gpa-goal-target-delta");

        // Handle disabled / inactive state
        if (!goalActive) {
            goalSlider.disabled = true;
            goalNumberInput.disabled = true;
            
            if (goalValSpan) {
                goalValSpan.textContent = targetGoalGrade.toFixed(2);
            }
            if (goalDeltaSpan) {
                goalDeltaSpan.textContent = "";
                goalDeltaSpan.className = "gpa-goal-delta";
            }

            // Clear values and formatting on all ungraded inputs
            activities.forEach((act) => {
                if (act.inputElement) {
                    if (!Number.isFinite(act.grade)) {
                        act.inputElement.value = "";
                    }
                    act.inputElement.classList.remove("gpa-calc-grade-input-goal");
                    act.inputElement.classList.remove("gpa-calc-grade-input-impossible");
                    act.inputElement.title = "";
                    
                    resetOrigGradeSpan(act);
                }
            });

            setGoalResult("gpa-goal-status-secured", "💡 Activa el simulador para proyectar las notas requeridas.");
            return;
        }

        // Enable inputs if active
        goalSlider.disabled = false;
        goalNumberInput.disabled = false;

        // Update target value and delta display next to range label
        if (goalValSpan) {
            goalValSpan.textContent = targetGoalGrade.toFixed(2);
        }
        if (goalDeltaSpan) {
            const goalDelta = targetGoalGrade - originalGPA;
            if (Math.abs(goalDelta) > 0.001) {
                const goalDeltaSign = goalDelta > 0 ? "+" : "";
                goalDeltaSpan.textContent = `(${goalDeltaSign}${goalDelta.toFixed(2)})`;
                goalDeltaSpan.className = `gpa-goal-delta ${goalDelta > 0 ? 'positive' : 'negative'}`;
            } else {
                goalDeltaSpan.textContent = "";
                goalDeltaSpan.className = "gpa-goal-delta";
            }
        }

        if (remainingWeight < 0.001) {
            goalControlsDiv.style.display = "none";
            goalDescDiv.style.display = "none";
            setGoalResult("gpa-goal-status-secured", `✅ Todas las actividades ya tienen nota. Tu nota final es <strong>${currentGPA.toFixed(2)}</strong>.`);

            // Clear goal states on inputs since all are graded
            activities.forEach((act) => {
                if (act.inputElement) {
                    act.inputElement.classList.remove("gpa-calc-grade-input-goal");
                    act.inputElement.classList.remove("gpa-calc-grade-input-impossible");
                    act.inputElement.title = "";
                    
                    resetOrigGradeSpan(act);
                }
            });
            return;
        }

        goalControlsDiv.style.display = "flex";
        goalDescDiv.style.display = "block";

        const required = (targetGoalGrade - currentGPA) / remainingWeight;
        const showRequired = Number.isFinite(required);

        // Update inputs for ungraded activities
        activities.forEach((act) => {
            if (act.inputElement) {
                if (!Number.isFinite(act.grade)) {
                    // This is an ungraded activity
                    if (showRequired) {
                        // Clamp the displayed value to 0.0 - 5.0 for a realistic input grade
                        const clampedVal = Math.max(0, Math.min(5, required));
                        act.inputElement.value = clampedVal.toFixed(2);
                        act.inputElement.classList.add("gpa-calc-grade-input-goal");
                        
                        if (required > 5.0) {
                            act.inputElement.classList.add("gpa-calc-grade-input-impossible");
                            act.inputElement.title = `Requieres ${required.toFixed(2)} (imposible)`;
                        } else {
                            act.inputElement.classList.remove("gpa-calc-grade-input-impossible");
                            act.inputElement.title = `Nota sugerida por el simulador: ${required.toFixed(2)}`;
                        }

                        // Display original grade delta: compares simulator value with original grade
                        if (act.origGradeSpan) {
                            act.origGradeSpan.style.visibility = "visible";
                            const isOrigNaN = !Number.isFinite(act.originalGrade);
                            const origVal = isOrigNaN ? 0 : act.originalGrade;
                            const delta = clampedVal - origVal;
                            const sign = delta > 0 ? "+" : "";
                            const origDisplay = isOrigNaN ? "-" : act.originalGrade;
                            
                            act.origGradeSpan.textContent = `${origDisplay} (${sign}${delta.toFixed(2)})`;
                        }
                    } else {
                        act.inputElement.value = "";
                        act.inputElement.classList.remove("gpa-calc-grade-input-goal");
                        act.inputElement.classList.remove("gpa-calc-grade-input-impossible");
                        act.inputElement.title = "";
                        
                        resetOrigGradeSpan(act);
                    }
                } else {
                    // User has typed a manual grade, ensure no goal styling remains on it
                    act.inputElement.classList.remove("gpa-calc-grade-input-goal");
                    act.inputElement.classList.remove("gpa-calc-grade-input-impossible");
                    
                    resetOrigGradeSpan(act);
                }
            }
        });

        const pct = (remainingWeight * 100).toFixed(0);
        if (required > 5.0) {
            setGoalResult("gpa-goal-status-impossible", goalMessages.impossible(required.toFixed(2), pct), true);
        } else if (required <= 0.001) {
            setGoalResult("gpa-goal-status-secured", goalMessages.secured(pct, currentGPA.toFixed(2)), true);
        } else {
            const isEasy = required < 2.96;
            setGoalResult(isEasy ? "gpa-goal-status-possible" : "gpa-goal-status-warning", goalMessages.needed(required.toFixed(2), pct), true);
        }
    };

    const handleGoalChange = (val) => {
        let parsed = parseFloat(val);
        if (isNaN(parsed)) return;

        const { currentGPA } = calculateCurrentGPA(activities);
        const minVal = currentGPA;
        const maxVal = 5.0;

        if (parsed < minVal) parsed = minVal;
        if (parsed > maxVal) parsed = maxVal;

        targetGoalGrade = parsed;
        persistGoal();
        updateGoalResult();
        // Since goal grade changed, trigger display update to sync main GPA display
        updateDisplay();
    };

    goalSlider.addEventListener("input", (e) => {
        handleGoalChange(e.target.value);
    });

    goalNumberInput.addEventListener("change", (e) => {
        handleGoalChange(e.target.value);
    });

    // Toggle goal simulation via accordion header click
    goalHeader.addEventListener("click", () => {
        goalCard.classList.toggle("collapsed");
        goalActive = !goalCard.classList.contains("collapsed");
        
        // When enabling, keep the last target used for this subject (never below the current grade)
        if (goalActive) {
            const { currentGPA } = calculateCurrentGPA(activities);
            targetGoalGrade = Math.max(targetGoalGrade, currentGPA);
        } else {
            // When disabling the simulator, restore original grades & clear cached simulation
            activities.forEach((act) => {
                act.grade = act.originalGrade;
                if (act.inputElement) {
                    act.inputElement.value = Number.isFinite(act.originalGrade) ? act.originalGrade : "";
                    act.inputElement.classList.remove("failing");
                    if (Number.isFinite(act.grade) && act.grade < 2.96) {
                        act.inputElement.classList.add("failing");
                    }
                }
            });
            saveGpaSimulationForSubject(subjectName, {});
        }
        persistGoal();
        
        updateDisplay();
    });

    const gradesContainer = document.createElement("div");
    gradesContainer.className = "gpa-calc-grades-container";

    /**
     * Recalculates GPA and updates display values based on simulated inputs.
     */
    const updateDisplay = () => {
        const { currentGPA } = calculateCurrentGPA(activities);
        
        let finalSimulatedGPA = 0;
        const remainingWeight = activities.reduce((sum, act) => sum + (Number.isFinite(act.grade) ? 0 : act.percentage), 0);

        if (goalActive) {
            const required = remainingWeight > 0 ? (targetGoalGrade - currentGPA) / remainingWeight : 0;
            const clampedRequired = Math.max(0, Math.min(5, required));

            activities.forEach(act => {
                if (Number.isFinite(act.grade)) {
                    finalSimulatedGPA += act.grade * act.percentage;
                } else {
                    finalSimulatedGPA += clampedRequired * act.percentage;
                }
            });
        } else {
            // Simulator is inactive, GPA is just based on manual/real graded activities
            finalSimulatedGPA = currentGPA;
        }

        gpaDisplay.textContent = finalSimulatedGPA.toFixed(2);

        // Check if any of the grade inputs differ from original cached data
        let anyChanged = false;
        activities.forEach(a => {
            const isOrigNaN = !Number.isFinite(a.originalGrade);
            const isCurrNaN = !Number.isFinite(a.grade);
            if (isOrigNaN !== isCurrNaN || (!isOrigNaN && a.grade !== a.originalGrade)) {
                anyChanged = true;
            }
        });

        // Also count as changed if we are simulating empty activities via targetGoalGrade
        if (goalActive && remainingWeight > 0 && Math.abs(finalSimulatedGPA - originalGPA) > 0.001) {
            anyChanged = true;
        }

        // Show/hide comparison string depending on change detection
        originalGpaDisplay.style.visibility = anyChanged ? "visible" : "hidden";

        let delta = finalSimulatedGPA - originalGPA;
        if (Math.abs(delta) > 0.001) {
            const sign = delta > 0 ? "+" : "";
            originalGpaDisplay.textContent = `${originalGPA.toFixed(2)} (${sign}${delta.toFixed(2)})`;
        } else {
            originalGpaDisplay.textContent = `${originalGPA.toFixed(2)}`;
        }

        // Apply visual indicator class if GPA falls below the passing score of 2.96 (~3.0)
        gpaDisplay.classList.toggle("failing", finalSimulatedGPA < 2.96);

        // Update the goal calculator
        updateGoalResult();

        if (onGradeChange) {
            // With the goal simulator active, pending activities are projected, so the subject counts as fully evaluated
            const evaluatedWeight = goalActive ? 1 : 1 - remainingWeight;
            onGradeChange(finalSimulatedGPA, evaluatedWeight);
        }
    };

    // Render an input row for each course activity
    activities.forEach((activity) => {
        const originalGrade = activity.originalGrade;

        const item = document.createElement("div");
        item.className = "gpa-calc-grade-item";

        // Display description and weight
        const label = document.createElement("span");
        label.textContent = `${activity.description} (${(activity.percentage * 100).toFixed(1)}%)`;
        label.className = "gpa-calc-grade-label";

        const inputContainer = document.createElement("div");
        inputContainer.className = "gpa-calc-input-container";

        const input = document.createElement("input");
        activity.inputElement = input;
        input.type = "number";
        input.min = "0";
        input.max = "5";
        input.step = "0.1";
        // Show the simulated grade if available, otherwise fallback to original
        input.value = Number.isFinite(activity.grade) ? activity.grade : "";
        input.placeholder = "-";
        input.className = "gpa-calc-grade-input";

        const origGradeSpan = document.createElement("span");
        activity.origGradeSpan = origGradeSpan;
        origGradeSpan.textContent = `${Number.isFinite(originalGrade) ? originalGrade : "-"}`;
        origGradeSpan.className = "gpa-calc-original-grade-val";

        const isOrigNaN = !Number.isFinite(originalGrade);
        const isCurrNaN = !Number.isFinite(activity.grade);
        const isInitialChanged = isOrigNaN !== isCurrNaN || (!isOrigNaN && activity.grade !== originalGrade);
        if (isInitialChanged) {
            origGradeSpan.style.visibility = "visible";
            if (!isCurrNaN) {
                const origVal = isOrigNaN ? 0 : originalGrade;
                const delta = activity.grade - origVal;
                const sign = delta > 0 ? "+" : "";
                const origDisplay = isOrigNaN ? "-" : originalGrade;
                origGradeSpan.textContent = `${origDisplay} (${sign}${delta.toFixed(2)})`;
            } else {
                origGradeSpan.textContent = `${Number.isFinite(originalGrade) ? originalGrade : "-"}`;
            }
        }

        const updateInputColor = () => {
            input.classList.toggle("failing", Number.isFinite(activity.grade) && activity.grade < 2.96);
        };
        updateInputColor();

        // Register change listener on manual grade override
        input.addEventListener("input", (e) => {
            let val = parseFloat(e.target.value);
            // Cap simulation inputs strictly within academic limits
            if (val > 5) {
                val = 5;
                e.target.value = "5";
            } else if (val < 0) {
                val = 0;
                e.target.value = "0";
            }
            activity.grade = isNaN(val) ? NaN : val;

            // Remove goal indicator styles since this is now manual
            input.classList.remove("gpa-calc-grade-input-goal");
            input.classList.remove("gpa-calc-grade-input-impossible");
            input.title = "";

            // Save the updated simulation to localStorage
            const updatedSimulations = loadGpaSimulationForSubject(subjectName);
            if (Number.isFinite(activity.grade)) {
                updatedSimulations[activity.description] = activity.grade;
            } else {
                delete updatedSimulations[activity.description];
            }
            saveGpaSimulationForSubject(subjectName, updatedSimulations);

            const isOrigNaN = !Number.isFinite(originalGrade);
            const isCurrNaN = !Number.isFinite(activity.grade);
            const isChanged = isOrigNaN !== isCurrNaN || (!isOrigNaN && activity.grade !== originalGrade);

            origGradeSpan.style.visibility = isChanged ? "visible" : "hidden";

            if (isChanged && !isCurrNaN) {
                const origVal = isOrigNaN ? 0 : originalGrade;
                const delta = activity.grade - origVal;
                const sign = delta > 0 ? "+" : "";
                const origDisplay = isOrigNaN ? "-" : originalGrade;
                origGradeSpan.textContent = `${origDisplay} (${sign}${delta.toFixed(2)})`;
            } else {
                origGradeSpan.textContent = `${Number.isFinite(originalGrade) ? originalGrade : "-"}`;
            }

            updateInputColor();
            updateDisplay();
        });

        inputContainer.appendChild(input);
        inputContainer.appendChild(origGradeSpan);

        item.appendChild(label);
        item.appendChild(inputContainer);
        gradesContainer.appendChild(item);
    });

    container.appendChild(gradesContainer);
    container.appendChild(goalCard);
    updateDisplay();
}
