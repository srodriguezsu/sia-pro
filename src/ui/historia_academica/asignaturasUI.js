import { areAsignaturasAvailable, extractAsignaturasFromDom } from "../../scraper/domScraper.js";
import { saveCachedAsignaturas, loadCachedAsignaturas, loadCachedCreditos } from "../../domain/historyManager.js";
import { buildHistorySummary, findRetakes, normalizeHistoryName, classifyAsignatura } from "../../domain/historySummary.js";
import { calculateSemesterGPA, roundGrade } from "../../domain/gpaCalculator.js";
import { findCalculatorSubject, openCalculatorForSubject } from "../gpaUI.js";
import { tipologiaClass, compareTipologias, getTipologiaKey, formatTipologiaName } from "../../utils/tipologias.js";

const formatGpa = (v) => (v != null ? v.toFixed(2) : "—");

/**
 * Builds a metric element with a label and a value.
 *
 * @param {string} label - Metric label.
 * @param {string} value - Metric value.
 * @param {string} [extraClass] - Optional modifier class for the value.
 * @returns {HTMLElement} Metric element.
 */
function metric(label, value, extraClass = "") {
    const el = document.createElement("div");
    el.className = "sia-hist-metric";
    const v = document.createElement("span");
    v.className = "sia-hist-metric-value" + (extraClass ? " " + extraClass : "");
    v.textContent = value;
    const l = document.createElement("span");
    l.className = "sia-hist-metric-label";
    l.textContent = label;
    el.append(v, l);
    return el;
}

/**
 * Fills the summary bar above the semesters.
 * Without filters it shows the whole history (PAPA); while filtering, the same metrics
 * are recomputed for the subjects currently shown.
 *
 * @param {HTMLElement} bar - Summary bar element to fill.
 * @param {ReturnType<typeof buildHistorySummary>["overall"]} overall - Whole-history metrics.
 * @param {Array.<Object>|null} shown - Subjects shown while filtering, or null when not filtering.
 * @returns {void}
 */
function renderOverviewBar(bar, overall, shown) {
    bar.innerHTML = "";
    bar.classList.toggle("filtered", Boolean(shown));

    let average = overall.papa;
    let creditosAprobados = overall.creditosAprobados;
    let reprobadas = overall.reprobadas;
    let averageLabel = "PAPA";

    if (shown) {
        average = calculateSemesterGPA(
            shown.filter((a) => Number.isFinite(a.calificacion)).map((a) => ({ grade: a.calificacion, credits: a.creditos }))
        ).gpa;
        creditosAprobados = shown
            .filter((a) => classifyAsignatura(a) === "aprobada")
            .reduce((sum, a) => sum + (Number.isFinite(a.creditos) ? a.creditos : 0), 0);
        reprobadas = shown.filter((a) => classifyAsignatura(a) === "reprobada").length;
        averageLabel = "Promedio";
    }

    const avgMetric = metric(averageLabel, formatGpa(average), average != null && average < 3 ? "failing" : "");
    avgMetric.title = shown
        ? "Promedio ponderado por créditos de las asignaturas mostradas"
        : "Promedio aritmético ponderado acumulado de toda la historia";

    // The subject count always goes first, so the bar keeps the same four slots
    // and, while filtering, the rest reads as "of these subjects"
    bar.append(
        shown
            ? metric("Asignaturas mostradas", String(shown.length))
            : metric("Asignaturas cursadas", String(overall.totalAsignaturas)),
        avgMetric,
        metric("Créditos aprobados", String(creditosAprobados)),
        metric("Asignaturas reprobadas", String(reprobadas), reprobadas > 0 ? "failing" : "")
    );
}

/**
 * Builds the one-line header of a semester block: name, average with trend, PAPA and credits.
 *
 * @param {ReturnType<typeof buildHistorySummary>["semesters"][number]} s - Semester metrics.
 * @param {number} subjectCount - Number of subjects shown in the block.
 * @param {boolean} [showStats=true] - Whether to show the semester stats and badges (hidden while filtering).
 * @param {{best: string|null, worst: string|null}} [highlights] - Keys of the best and lowest semesters.
 * @returns {HTMLElement} Summary element for the <details> block.
 */
function buildSemesterHeader(s, subjectCount, showStats = true, highlights = {}) {
    const header = document.createElement("summary");
    header.className = "sia-sem-header";

    const name = document.createElement("span");
    name.className = "sia-sem-name";
    name.textContent = s.key;

    const count = document.createElement("span");
    count.className = "sia-sem-count";
    // While filtering, the count refers to matching subjects only
    count.textContent = showStats
        ? `${subjectCount} asignatura${subjectCount === 1 ? "" : "s"}`
        : `${subjectCount} coincidencia${subjectCount === 1 ? "" : "s"}`;

    // Main number: cumulative PAPA after this semester; credits as secondary grey text
    const stats = document.createElement("span");
    stats.className = "sia-sem-stats";

    const papa = document.createElement("span");
    papa.className = "sia-sem-papa";
    papa.title = "PAPA acumulado hasta este semestre (incluido); la flecha indica cuánto cambió respecto al semestre anterior";
    papa.innerHTML = `<span class="sia-sem-stat-label">PAPA</span> <b></b>`;
    const papaValue = papa.querySelector("b");
    papaValue.textContent = formatGpa(s.papa);
    if (s.papa != null && s.papa < 3) papaValue.classList.add("failing");
    // The trend slot is always present (empty when there is no change) so every header lines up
    const trend = document.createElement("span");
    trend.className = "sia-sem-trend";
    if (s.papaDelta != null && Math.abs(s.papaDelta) >= 0.005) {
        trend.textContent = `${s.papaDelta > 0 ? "▲" : "▼"}${Math.abs(s.papaDelta).toFixed(2)}`;
    }
    papa.appendChild(trend);

    const credits = document.createElement("span");
    credits.className = "sia-sem-credits";
    credits.textContent = `${s.creditosAprobados} créd.`;
    credits.title = "Créditos aprobados en este semestre";

    stats.append(credits, papa);

    // Exceptions are badges next to the name, so every header keeps the same aligned columns
    const badges = document.createElement("span");
    badges.className = "sia-sem-badges";
    if (s.key === highlights.best) {
        const best = document.createElement("span");
        best.className = "sia-sem-badge good";
        best.textContent = "Mejor semestre";
        best.title = "Semestre con las mejores notas (promedio del semestre más alto)";
        badges.appendChild(best);
    }
    if (s.key === highlights.worst) {
        const worst = document.createElement("span");
        worst.className = "sia-sem-badge low";
        worst.textContent = "Semestre más bajo";
        worst.title = "Semestre con las notas más bajas (promedio del semestre más bajo)";
        badges.appendChild(worst);
    }
    if (s.reprobadas > 0) {
        const failed = document.createElement("span");
        failed.className = "sia-sem-badge failing";
        failed.textContent = `${s.reprobadas} reprobada${s.reprobadas === 1 ? "" : "s"}`;
        failed.title = `${s.creditosReprobados} créditos reprobados`;
        badges.appendChild(failed);
    }
    if (s.otras > 0) {
        const other = document.createElement("span");
        other.className = "sia-sem-badge muted";
        other.textContent = `${s.otras} sin estado final`;
        other.title = `${s.creditosOtros} créditos sin estado APROBADA o REPROBADA (por ejemplo, en curso): no cuentan como reprobados`;
        badges.appendChild(other);
    }

    const titleGroup = document.createElement("span");
    titleGroup.className = "sia-sem-title-group";
    titleGroup.append(name, count);
    if (showStats && badges.childElementCount > 0) titleGroup.appendChild(badges);

    header.appendChild(titleGroup);
    if (showStats) header.appendChild(stats);
    return header;
}

/**
 * Value used to filter by typology. Typologies are matched by their shared key, so
 * spellings like "FUND. OBLIGATORIA" and "Fundamentación Obligatoria" select the same subjects.
 *
 * @param {string|null} name - Typology name.
 * @returns {string} Filter value.
 */
function tipologiaFilterValue(name) {
    return getTipologiaKey(name) || `raw:${(name || "").trim().toUpperCase()}`;
}

/** Typology filter requested from another tab, applied on the next render. */
let pendingTipologia = null;

/**
 * Opens the Historia tab already filtered by a typology (used by the credit cards in "Mi carrera").
 *
 * @param {string} tipologia - Typology name.
 * @returns {void}
 */
export function openHistoriaWithTipologia(tipologia) {
    const tabButton = document.querySelector('.sia-tab[data-tab="historia"]');
    const tabContent = document.getElementById("tab-historia");
    if (!tabButton || !tabContent) return;
    pendingTipologia = tipologiaFilterValue(tipologia);
    tabButton.click();
    renderHistoriaAcademica(tabContent);
    tabContent.scrollIntoView({ block: "start" });
}

/**
 * Renders the semester-grouped academic history overview inside the provided container.
 * Sorts semesters descending (most recent first) and displays subjects/courses inside
 * cards showing metadata like credits, component typology, and final grades.
 * 
 * @param {HTMLElement} container - The DOM container where the history UI will be rendered.
 * @returns {void}
 */
export function renderHistoriaAcademica(container) {
    if (!container) return;
    container.innerHTML = "";
    
    let data = null;

    // Try to scrape first if currently viewing the history page
    if (areAsignaturasAvailable()) {
        data = extractAsignaturasFromDom();
        saveCachedAsignaturas(data);
    } else {
        // Fallback to loaded cache
        data = loadCachedAsignaturas();
    }

    // If no data exists in DOM or cache, show loading helper
    if (!data || Object.keys(data).length === 0) {
        container.innerHTML = "<p>No hay historia académica disponible.<br><br>Navega a <b>Información académica > Historia académica</b> para cargar tus datos por primera vez.</p>";
        return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = "sia-sem-list";

    const title = document.createElement("h2");
    title.textContent = "Historia Académica";
    title.className = "sia-semester-header";

    container.appendChild(title);

    const summary = buildHistorySummary(data);
    const overviewBar = document.createElement("div");
    overviewBar.className = "sia-hist-overview";
    container.appendChild(overviewBar);

    const retakes = findRetakes(data);
    const filters = { text: "", componente: pendingTipologia || "", estado: "" };
    pendingTipologia = null;
    container.appendChild(buildFilterBar(data, filters, () => renderColumns()));

    const emptyMsg = document.createElement("p");
    emptyMsg.className = "sia-hist-empty";
    emptyMsg.textContent = "Ninguna asignatura coincide con la búsqueda o los filtros.";
    emptyMsg.hidden = true;
    container.appendChild(emptyMsg);

    // Most recent semester first
    const semesterSummaries = [...summary.semesters].reverse();

    const matches = (asignatura) => {
        if (filters.text && !normalizeHistoryName(asignatura.nombre).includes(normalizeHistoryName(filters.text))) return false;
        if (filters.componente && tipologiaFilterValue(asignatura.componente) !== filters.componente) return false;
        if (filters.estado === "aprobada" && classifyAsignatura(asignatura) !== "aprobada") return false;
        if (filters.estado === "reprobada" && classifyAsignatura(asignatura) !== "reprobada") return false;
        if (filters.estado === "repetida" && !retakes.has(normalizeHistoryName(asignatura.nombre))) return false;
        return true;
    };

    const highlights = {
        best: summary.overall.best?.key ?? null,
        worst: summary.overall.worst?.key ?? null
    };

    // Only the most recent semester starts open; the user's choices are kept across filter changes
    const openKeys = new Set(semesterSummaries.length ? [semesterSummaries[0].key] : []);
    const isFiltering = () => Boolean(filters.text || filters.componente || filters.estado);

    const renderColumns = () => {
        wrapper.innerHTML = "";
        const filtering = isFiltering();
        const shown = [];
        for (const semesterSummary of semesterSummaries) {
            const semestre = semesterSummary.key;
            const materias = (data[semestre].asignaturas || []).filter(matches);
            // Hide semesters without matching subjects while filtering
            if (materias.length === 0) continue;
            shown.push(...materias);

            // Sort subjects by grade descending, placing ungraded or pending ones (null) at the end
            materias.sort((a, b) => {
                if (a.calificacion == null) return 1;
                if (b.calificacion == null) return -1;
                return b.calificacion - a.calificacion;
            });

            const block = document.createElement("details");
            block.className = "sia-sem-block";
            // While filtering, every semester with matches opens so results are visible
            block.open = filtering || openKeys.has(semestre);
            block.addEventListener("toggle", () => {
                if (isFiltering()) return;
                if (block.open) openKeys.add(semestre); else openKeys.delete(semestre);
            });

            // Semester stats describe the whole semester, so they are hidden while filtering
            block.appendChild(buildSemesterHeader(semesterSummary, materias.length, !filtering, highlights));

            const rows = document.createElement("div");
            rows.className = "sia-sem-rows";
            for (const asignatura of materias) {
                rows.appendChild(buildSubjectCard(asignatura, semestre, retakes));
            }
            block.appendChild(rows);

            wrapper.appendChild(block);
        }
        renderOverviewBar(overviewBar, summary.overall, filtering ? shown : null);
        emptyMsg.hidden = wrapper.childElementCount > 0;
        wrapper.hidden = !emptyMsg.hidden;
    };

    renderColumns();
    container.appendChild(wrapper);
}

/**
 * Builds the filter area: a search box and a "Filtros" button that reveals status and typology
 * chips. The panel opens by itself when a filter is already active (e.g. coming from "Mi carrera"),
 * and a "Limpiar filtros" link appears whenever any filter is on.
 *
 * @param {Object} data - History grouped by semester.
 * @param {{text: string, componente: string, estado: string}} filters - Mutable filter state.
 * @param {function} onChange - Called after any filter change.
 * @returns {HTMLElement} Filter area element.
 */
function buildFilterBar(data, filters, onChange) {
    const area = document.createElement("div");
    area.className = "sia-hist-filter-area";

    const bar = document.createElement("div");
    bar.className = "sia-hist-filters";

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Buscar asignatura…";
    search.className = "sia-hist-search";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "sia-hist-filters-toggle";

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "sia-hist-clear";
    clear.textContent = "Limpiar filtros";

    bar.append(search, toggle, clear);

    const panel = document.createElement("div");
    panel.className = "sia-hist-filter-panel";

    const componentes = [...new Set(
        Object.values(data).flatMap((s) => (s.asignaturas || []).map((a) => a.componente).filter(Boolean))
    )].sort(compareTipologias);

    // Same chip style for both filters
    const estadoGroup = buildChipGroup("Estado", [
        { value: "", label: "Todos" },
        { value: "aprobada", label: "Aprobadas" },
        { value: "reprobada", label: "Reprobadas" },
        { value: "repetida", label: "Cursadas más de una vez" }
    ], filters, "estado", () => update());
    const tipoGroup = buildChipGroup("Tipología", tipologiaOptions(componentes), filters, "componente", () => update());
    panel.append(estadoGroup.el, tipoGroup.el);

    let open = Boolean(filters.componente || filters.estado);
    const activeCount = () => (filters.componente ? 1 : 0) + (filters.estado ? 1 : 0);
    const paint = () => {
        const n = activeCount();
        toggle.textContent = n > 0 ? `Filtros (${n})` : "Filtros";
        toggle.classList.toggle("active", n > 0);
        toggle.setAttribute("aria-expanded", String(open));
        panel.hidden = !open;
        clear.hidden = !(n > 0 || filters.text);
        estadoGroup.paint();
        tipoGroup.paint();
    };
    const update = () => { paint(); onChange(); };

    search.addEventListener("input", () => { filters.text = search.value.trim(); update(); });
    toggle.addEventListener("click", () => { open = !open; paint(); });
    clear.addEventListener("click", () => {
        filters.text = "";
        filters.componente = "";
        filters.estado = "";
        search.value = "";
        update();
    });

    paint();
    area.append(bar, panel);
    return area;
}

/**
 * Typology options for the filter: one per typology (different spellings merged),
 * in sentence case, with the credit progress in the tooltip.
 *
 * @param {Array.<string>} componentes - Typology names present in the history (ordered).
 * @returns {Array.<{value: string, label: string, className?: string, title?: string}>} Chip options.
 */
function tipologiaOptions(componentes) {
    const creditsByKey = new Map();
    (loadCachedCreditos() || []).forEach((c) => {
        const key = getTipologiaKey(c.componente);
        if (key) creditsByKey.set(key, c);
    });

    const seen = new Map();
    componentes.forEach((name) => {
        const value = tipologiaFilterValue(name);
        if (!seen.has(value)) seen.set(value, name);
    });

    const options = [{ value: "", label: "Todas" }];
    for (const [value, name] of seen) {
        const credit = creditsByKey.get(getTipologiaKey(name));
        options.push({
            value,
            label: formatTipologiaName(name),
            className: `has-dot ${tipologiaClass(name)}`,
            title: credit && Number.isFinite(credit.exigidos)
                ? `${credit.aprobados} de ${credit.exigidos} créditos aprobados`
                : undefined
        });
    }
    return options;
}

/**
 * Builds a labeled group of single-choice chips bound to one filter key.
 *
 * @param {string} label - Group label.
 * @param {Array.<{value: string, label: string, className?: string, title?: string}>} options - Chips.
 * @param {Object} filters - Mutable filter state.
 * @param {string} key - Filter key the group controls.
 * @param {function} onChange - Called after the selection changes.
 * @returns {{el: HTMLElement, paint: function}} Group element and a function to refresh its state.
 */
function buildChipGroup(label, options, filters, key, onChange) {
    const el = document.createElement("div");
    el.className = "sia-hist-chip-group";

    const title = document.createElement("span");
    title.className = "sia-hist-chip-group-label";
    title.textContent = label;

    const chips = document.createElement("div");
    chips.className = "sia-hist-chips";
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", label);

    const buttons = options.map((opt) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sia-hist-chip" + (opt.className ? ` ${opt.className}` : "");
        btn.textContent = opt.label;
        if (opt.title) btn.title = opt.title;
        btn.addEventListener("click", () => {
            // Clicking the active chip again goes back to "all"
            const next = filters[key] === opt.value ? "" : opt.value;
            if (next === filters[key]) return;
            filters[key] = next;
            onChange();
        });
        chips.appendChild(btn);
        return { btn, value: opt.value };
    });

    const paint = () => buttons.forEach(({ btn, value }) => {
        const active = filters[key] === value;
        btn.classList.toggle("active", active);
        btn.setAttribute("aria-pressed", String(active));
    });

    el.append(title, chips);
    return { el, paint };
}

/**
 * Builds the compact row of a subject, with a badge when it was taken more than once.
 *
 * @param {Object} asignatura - Subject record.
 * @param {string} semestre - Semester of this attempt.
 * @param {Map} retakes - Result of findRetakes.
 * @returns {HTMLElement} Row element.
 */
function buildSubjectCard(asignatura, semestre, retakes) {
    const row = document.createElement("div");
    const kind = classifyAsignatura(asignatura);
    row.className = `sia-asig-row ${kind}`;

    row.innerHTML = `
        <span class="sia-asig-row-main">
            <span class="sia-asig-row-name"></span>
            <span class="sia-asig-row-meta"></span>
        </span>
        <span class="sia-asig-row-grade"></span>
    `;
    // Scraped text is set with textContent to avoid interpreting it as HTML
    const nameEl = row.querySelector(".sia-asig-row-name");
    nameEl.textContent = asignatura.nombre;
    row.querySelector(".sia-asig-row-meta").textContent = [
        asignatura.componente && formatTipologiaName(asignatura.componente),
        `${asignatura.creditos ?? "?"} créd.`
    ].filter(Boolean).join(" · ");
    // Typology shown only as a dot before the name (no colored border) to keep the list calm
    if (asignatura.componente) {
        row.classList.add(tipologiaClass(asignatura.componente));
        nameEl.classList.add("sia-tipo-name");
    }

    const grade = row.querySelector(".sia-asig-row-grade");
    grade.textContent = asignatura.calificacion != null ? asignatura.calificacion.toFixed(1) : "—";
    grade.title = asignatura.estado || "Sin estado final";

    // Subjects still in progress: provisional grade from the calculator and a shortcut to simulate it
    if (kind === "otra") {
        const calc = findCalculatorSubject(asignatura.nombre);
        const actions = document.createElement("span");
        actions.className = "sia-asig-row-actions";
        if (calc) {
            const evaluated = Math.round(Math.min(calc.evaluatedWeight, 1) * 100);
            grade.textContent = roundGrade(calc.grade).toFixed(1);
            grade.classList.add("provisional");
            grade.title = `Nota provisional según la calculadora (${evaluated}% evaluado; lo pendiente cuenta como 0)`;

            const provisional = document.createElement("span");
            provisional.className = "sia-asig-provisional";
            provisional.textContent = `Provisional · ${evaluated}% evaluado`;
            actions.appendChild(provisional);

            const simulate = document.createElement("button");
            simulate.type = "button";
            simulate.className = "sia-asig-simulate";
            simulate.textContent = "Abrir en calculadora";
            simulate.title = "Abrir esta asignatura en la calculadora de promedio";
            simulate.addEventListener("click", () => openCalculatorForSubject(calc.name));
            actions.appendChild(simulate);
        } else {
            const hint = document.createElement("span");
            hint.className = "sia-asig-provisional";
            hint.textContent = "Ábrela en Mis calificaciones para usarla en la calculadora";
            actions.appendChild(hint);
        }
        row.querySelector(".sia-asig-row-main").appendChild(actions);
    }

    const attempts = retakes.get(normalizeHistoryName(asignatura.nombre));
    if (attempts) {
        const index = attempts.findIndex((t) => t.semestre === semestre);
        const badge = document.createElement("span");
        badge.className = "sia-asig-retake";
        badge.textContent = `Intento ${index + 1}/${attempts.length}`;
        badge.title = attempts
            .map((t) => `${t.semestre}: ${t.calificacion ?? "-"} ${t.estado || ""}`.trim())
            .join("\n");
        nameEl.after(badge);
    }
    return row;
}
