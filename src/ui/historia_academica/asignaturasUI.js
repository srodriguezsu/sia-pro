import { areAsignaturasAvailable, extractAsignaturasFromDom } from "../../scraper/domScraper.js";
import { saveCachedAsignaturas, loadCachedAsignaturas } from "../../domain/historyManager.js";
import { buildHistorySummary } from "../../domain/historySummary.js";

/**
 * Enables mouse drag-to-scroll functionality horizontally on a given container element.
 * Useful for horizontal layouts like semester lists on desktop screens.
 * 
 * @param {HTMLElement} container - The DOM element to apply drag-to-scroll behavior.
 * @returns {void}
 */
function enableDragScroll(container) {
    let isDown = false;
    let startX;
    let scrollLeft;

    // Track when mouse button is pressed down within the container
    container.addEventListener("mousedown", (e) => {
        isDown = true;
        container.classList.add("dragging");
        startX = e.pageX - container.offsetLeft;
        scrollLeft = container.scrollLeft;
    });

    // Reset status when mouse cursor leaves container boundary
    container.addEventListener("mouseleave", () => {
        isDown = false;
    });

    // Reset status when mouse button is released
    container.addEventListener("mouseup", () => {
        isDown = false;
    });

    // Scroll the container horizontally depending on drag movement distance
    container.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - container.offsetLeft;
        const walk = (x - startX) * 1.2; // Speed multiplier for smooth dragging
        container.scrollLeft = scrollLeft - walk;
    });
}

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
 * Builds the overall summary bar shown above the semesters.
 *
 * @param {ReturnType<typeof buildHistorySummary>["overall"]} overall - Overall metrics.
 * @returns {HTMLElement} Summary bar element.
 */
function buildOverviewBar(overall) {
    const bar = document.createElement("div");
    bar.className = "sia-hist-overview";
    bar.append(
        metric("PAPA", formatGpa(overall.papa), overall.papa != null && overall.papa < 3 ? "failing" : ""),
        metric("Créditos aprobados", String(overall.creditosAprobados)),
        metric("Asignaturas reprobadas", String(overall.reprobadas), overall.reprobadas > 0 ? "failing" : "")
    );
    if (overall.best) bar.append(metric(`Mejor semestre · ${overall.best.key}`, formatGpa(overall.best.gpa), "good"));
    if (overall.worst) bar.append(metric(`Semestre más bajo · ${overall.worst.key}`, formatGpa(overall.worst.gpa)));
    return bar;
}

/**
 * Builds the metrics block of a semester column, always with the same fields.
 *
 * @param {ReturnType<typeof buildHistorySummary>["semesters"][number]} s - Semester metrics.
 * @returns {HTMLElement} Metrics element.
 */
function buildSemesterMetrics(s) {
    const metrics = document.createElement("div");
    metrics.className = "sia-semester-metrics";

    let trendClass = "";
    let trendText = "";
    if (s.delta != null && Math.abs(s.delta) >= 0.005) {
        trendClass = s.delta > 0 ? "up" : "down";
        trendText = ` ${s.delta > 0 ? "▲" : "▼"} ${Math.abs(s.delta).toFixed(2)}`;
    }

    const avg = metric("Promedio del semestre", formatGpa(s.gpa) + trendText, trendClass);
    avg.title = "Promedio ponderado por créditos; la flecha compara con el semestre anterior";
    const papa = metric("PAPA acumulado", formatGpa(s.papa));
    papa.title = "Promedio acumulado hasta este semestre (incluido)";
    metrics.append(
        avg,
        papa,
        metric("Créd. aprobados", String(s.creditosAprobados)),
        metric("Créd. reprobados", String(s.creditosReprobados), s.creditosReprobados > 0 ? "failing" : "")
    );
    if (s.otras > 0) {
        const other = metric("Créd. sin estado final", String(s.creditosOtros));
        other.title = "Asignaturas sin estado APROBADA o REPROBADA (por ejemplo, en curso): no cuentan como reprobadas";
        metrics.append(other);
    }
    return metrics;
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
    wrapper.className = "sia-semester-wrapper";

    // Bind horizontal scrolling behaviour
    enableDragScroll(wrapper);

    const title = document.createElement("h2");
    title.textContent = "Historia Académica por Semestre";
    title.className = "sia-semester-header";

    container.appendChild(title);

    const summary = buildHistorySummary(data);
    container.appendChild(buildOverviewBar(summary.overall));

    // Most recent semester first
    const semesterSummaries = [...summary.semesters].reverse();

    for (const semesterSummary of semesterSummaries) {
        const semestre = semesterSummary.key;
        const semestreData = data[semestre];
        const materias = [...(semestreData.asignaturas || [])];

        // Sort subjects by grade descending, placing ungraded or pending ones (null) at the end
        materias.sort((a, b) => {
            if (a.calificacion == null) return 1;
            if (b.calificacion == null) return -1;
            return b.calificacion - a.calificacion;
        });

        const column = document.createElement("div");
        column.className = "sia-semester-column";

        const title = document.createElement("h3");
        title.textContent = semestre;
        title.className = "sia-semester-title";

        const metrics = buildSemesterMetrics(semesterSummary);

        column.appendChild(title);
        column.appendChild(metrics);

        // Render cards for each course
        for (const asignatura of materias) {
            const card = document.createElement("div");
            card.className = "sia-asignatura-card";

            // Normalize state classes to lowercase with hyphens for CSS styling
            const estadoClass = asignatura.estado
                ?.toLowerCase()
                .replace(/\s+/g, "-");

            card.innerHTML = `
                <div class="sia-asig-nombre"></div>
                <div class="sia-asig-meta">
                    <span class="sia-asig-creditos"></span>
                    <span class="sia-asig-componente"></span>
                </div>
                <div class="sia-asig-estado ${estadoClass || ""}"></div>
            `;
            // Scraped text is set with textContent to avoid interpreting it as HTML
            card.querySelector(".sia-asig-nombre").textContent = asignatura.nombre;
            card.querySelector(".sia-asig-creditos").textContent = `${asignatura.creditos ?? "?"} créditos`;
            card.querySelector(".sia-asig-componente").textContent = asignatura.componente || "";
            card.querySelector(".sia-asig-estado").textContent = `${asignatura.calificacion ?? "-"} ${asignatura.estado || ""}`.trim();

            column.appendChild(card);
        }

        wrapper.appendChild(column);
    }

    container.appendChild(wrapper);
}
