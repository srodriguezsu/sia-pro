import {
    loadCachedAsignaturas,
    loadAllGpaCachedSubjects,
    loadAllGpaSimulations
} from "../domain/historyManager.js";
import {
    loadSelectedSubjects,
    loadSelectedGroups
} from "../domain/scheduleManager.js";
import { renderGpa } from "./gpaUI.js";
import { eraseAllExtensionData } from "../domain/identity.js";
import { refreshNewGradesBadge } from "./newGradesBadge.js";
import { renderHistoriaAcademica } from "./historia_academica/asignaturasUI.js";
import { renderMiCarrera } from "./historia_academica/miCarreraUI.js";
import { renderHorario } from "./horarioUI.js";


/**
 * Converts headers and row arrays into a UTF-8 compatible CSV string with a BOM.
 * 
 * @param {Array.<string>} headers - CSV column names.
 * @param {Array.<Array.<*>>} rows - Two-dimensional array of row values.
 * @returns {string} The CSV formatted string.
 */
function convertToCSV(headers, rows) {
    const csvRows = [];
    // Format headers with quotes
    csvRows.push(headers.map(header => `"${header.replace(/"/g, '""')}"`).join(","));

    // Format data rows
    rows.forEach(row => {
        csvRows.push(row.map(value => {
            const strVal = value === null || value === undefined ? "" : String(value);
            return `"${strVal.replace(/"/g, '""')}"`;
        }).join(","));
    });

    // Excel friendly UTF-8 prefix (BOM)
    return "\uFEFF" + csvRows.join("\n");
}

/**
 * Prompts the browser to download a text blob as a file.
 * 
 * @param {string} content - File content.
 * @param {string} filename - Target file name.
 * @param {string} contentType - MIME type of the file.
 * @returns {void}
 */
function downloadBlob(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Published privacy policy (GitHub Pages). */
const PRIVACY_URL = "https://srodriguezsu.github.io/sia-pro/privacy.html";

/**
 * Re-renders every other tab after the saved data changed (clear or restore).
 *
 * @returns {void}
 */
function rerenderOtherTabs() {
    renderHistoriaAcademica(document.getElementById("tab-historia"));
    renderGpa(document.getElementById("tab-gpa"));
    renderMiCarrera(document.getElementById("tab-carrera"));
    renderHorario(document.getElementById("tab-horario"));
    refreshNewGradesBadge();
}

/**
 * Renders the Export Data view and interactive Data Dictionary inside the modal tab.
 * 
 * @param {HTMLElement} container - The container element to render inside.
 * @returns {void}
 */
export function renderExportTab(container) {
    if (!container) return;
    container.innerHTML = "";

    // Load active cached data
    const asignaturasCached = loadCachedAsignaturas();
    const gpaCached = loadAllGpaCachedSubjects();
    const gpaSims = loadAllGpaSimulations();
    const scheduleSubjects = loadSelectedSubjects();
    const scheduleSelections = loadSelectedGroups();

    // Calculate item counts for display states
    let historiaCount = 0;
    if (asignaturasCached) {
        Object.keys(asignaturasCached).forEach(semestre => {
            historiaCount += asignaturasCached[semestre].asignaturas.length;
        });
    }

    const gpaCount = Object.keys(gpaCached).length;
    const scheduleCount = scheduleSubjects.length;

    // Outer container
    const exportDiv = document.createElement("div");
    exportDiv.className = "sia-export-container";

    const hasStoredData = historiaCount > 0 || gpaCount > 0 || scheduleCount > 0;

    // A plain list of downloads; empty states are grey notes, not warnings
    const exportRow = (id, title, desc, count, countLabel, emptyNote, buttonLabel) => `
        <div class="sia-export-row">
            <div class="sia-export-row-info">
                <div class="sia-export-row-title">${title}</div>
                <div class="sia-export-row-desc">${desc}</div>
                <div class="sia-export-row-count">${count > 0 ? `${count} ${countLabel}` : emptyNote}</div>
            </div>
            <button type="button" id="${id}" class="sia-export-btn" ${count === 0 ? "disabled" : ""}>${buttonLabel}</button>
        </div>
    `;

    exportDiv.innerHTML = `
        <h2 class="sia-export-title">Exportar datos</h2>
        <p class="sia-export-intro">Descarga tu información en CSV (funciona en Excel y Google Sheets).</p>
        <p class="sia-export-privacy">Todo lo que usa SIA Pro se guarda solo en este navegador, en tu dispositivo: nada se envía a servidores externos. <a href="${PRIVACY_URL}" target="_blank" rel="noopener noreferrer">Política de privacidad</a></p>

        <div class="sia-export-list">
            ${exportRow("btn-export-historia", "Historia académica", "Asignaturas cursadas por semestre, con créditos, tipología y nota final.",
                historiaCount, "asignaturas", "Sin datos: abre <b>Mi historia académica</b> en el SIA para guardarla.", "Descargar CSV")}
            ${exportRow("btn-export-gpa", "Calificaciones parciales", "Actividades y porcentajes de tus asignaturas, con tus notas reales y las de la calculadora.",
                gpaCount, "asignaturas", "Sin datos: abre asignaturas en <b>Mis calificaciones</b> para guardarlas.", "Descargar CSV")}
            ${exportRow("btn-export-horario", "Horario", "Asignaturas de tu horario con grupo, profesor, aula y horas.",
                scheduleCount, "asignaturas", "Sin datos: agrega asignaturas desde la inscripción en el SIA.", "Descargar CSV")}
        </div>

        <details class="sia-dict-section">
            <summary class="sia-dict-title">Ver qué contiene cada archivo</summary>
            <div class="sia-dict-tabs">
                <button type="button" class="sia-dict-tab-btn active" data-dict="historia">Historia académica</button>
                <button type="button" class="sia-dict-tab-btn" data-dict="gpa">Calificaciones parciales</button>
                <button type="button" class="sia-dict-tab-btn" data-dict="horario">Horario</button>
            </div>
            <div class="sia-dict-table-container">
                <table id="sia-dict-table-el" class="sia-dict-table"></table>
            </div>
        </details>

        <!-- Destructive action, apart from the downloads, with an inline confirmation -->
        <div class="sia-export-danger">
            <div class="sia-export-row-info">
                <div class="sia-export-row-title">Borrar datos guardados</div>
                <div class="sia-export-row-desc">Borra todo lo que la extensión guardó en este navegador: historia, notas, lo calculado, tu horario, preferencias y la cuenta asociada.</div>
            </div>
            <button type="button" id="btn-clear-cache" class="sia-export-clear" ${hasStoredData ? "" : "disabled"}>${hasStoredData ? "Borrar datos" : "No hay datos guardados"}</button>
            <div class="sia-export-confirm" hidden>
                <span>¿Seguro? Esto no se puede deshacer.</span>
                <button type="button" class="sia-export-confirm-cancel">Cancelar</button>
                <button type="button" class="sia-export-confirm-ok">Borrar todo</button>
            </div>
            <div class="sia-export-cleared" hidden>Listo: se borraron los datos guardados.</div>
        </div>
    `;

    container.appendChild(exportDiv);

    // Bind exports
    const btnHistoria = exportDiv.querySelector("#btn-export-historia");
    if (btnHistoria) {
        btnHistoria.addEventListener("click", () => {
            const headers = ["Semestre", "Asignatura", "Créditos", "Tipología", "Calificación", "Estado"];
            const rows = [];
            if (asignaturasCached) {
                Object.keys(asignaturasCached).forEach(semestre => {
                    const list = asignaturasCached[semestre].asignaturas;
                    list.forEach(asig => {
                        rows.push([
                            semestre,
                            asig.nombre || "",
                            asig.creditos || "",
                            asig.componente || "",
                            asig.calificacion || "",
                            asig.estado || ""
                        ]);
                    });
                });
            }
            const csv = convertToCSV(headers, rows);
            downloadBlob(csv, "sia_pro_historia_academica.csv", "text/csv;charset=utf-8;");
        });
    }

    const btnGpa = exportDiv.querySelector("#btn-export-gpa");
    if (btnGpa) {
        btnGpa.addEventListener("click", () => {
            const headers = ["Asignatura", "Actividad", "Porcentaje", "Calificación Original", "Calificación Estimada"];
            const rows = [];
            Object.keys(gpaCached).forEach(subjectName => {
                const activities = gpaCached[subjectName];
                const subjSims = gpaSims[subjectName] || {};
                activities.forEach(act => {
                    const simGrade = subjSims[act.description];
                    rows.push([
                        subjectName,
                        act.description,
                        act.percentage !== undefined ? `${(act.percentage * 100).toFixed(1)}%` : "",
                        Number.isFinite(act.grade) ? act.grade.toFixed(2) : "",
                        simGrade !== undefined ? Number(simGrade).toFixed(2) : (Number.isFinite(act.grade) ? act.grade.toFixed(2) : "")
                    ]);
                });
            });
            const csv = convertToCSV(headers, rows);
            downloadBlob(csv, "sia_pro_calificaciones.csv", "text/csv;charset=utf-8;");
        });
    }

    const btnHorario = exportDiv.querySelector("#btn-export-horario");
    if (btnHorario) {
        btnHorario.addEventListener("click", () => {
            const headers = ["Asignatura", "Tipología", "Créditos", "Grupo", "Profesor", "Día", "Hora Inicio", "Hora Fin", "Aula"];
            const rows = [];
            scheduleSubjects.forEach(subj => {
                const selectedGroupName = scheduleSelections[subj.name];
                const group = subj.groups?.find(g => g.name === selectedGroupName);
                if (group) {
                    const schedules = group.horarios || [];
                    if (schedules.length === 0) {
                        rows.push([
                            subj.name,
                            subj.tipologia || "",
                            subj.creditos || "",
                            group.name,
                            group.profesor || "",
                            "", "", "", ""
                        ]);
                    } else {
                        schedules.forEach(sched => {
                            rows.push([
                                subj.name,
                                subj.tipologia || "",
                                subj.creditos || "",
                                group.name,
                                group.profesor || "",
                                sched.dia || "",
                                sched.horaInicio || "",
                                sched.horaFin || "",
                                sched.aula || ""
                            ]);
                        });
                    }
                } else {
                    rows.push([
                        subj.name,
                        subj.tipologia || "",
                        subj.creditos || "",
                        "Sin grupo seleccionado",
                        "", "", "", "", ""
                    ]);
                }
            });
            const csv = convertToCSV(headers, rows);
            downloadBlob(csv, "sia_pro_horario.csv", "text/csv;charset=utf-8;");
        });
    }

    const btnClearCache = exportDiv.querySelector("#btn-clear-cache");
    const confirmBox = exportDiv.querySelector(".sia-export-danger .sia-export-confirm");
    if (btnClearCache && confirmBox) {
        // Inline confirmation instead of the browser's confirm()/alert() dialogs
        btnClearCache.addEventListener("click", () => {
            btnClearCache.hidden = true;
            confirmBox.hidden = false;
            confirmBox.querySelector(".sia-export-confirm-cancel").focus();
        });
        confirmBox.querySelector(".sia-export-confirm-cancel").addEventListener("click", () => {
            confirmBox.hidden = true;
            btnClearCache.hidden = false;
        });
        confirmBox.querySelector(".sia-export-confirm-ok").addEventListener("click", () => {
            // Everything, including the account the data was tied to
            eraseAllExtensionData();
            rerenderOtherTabs();

            // Re-render this tab and show the confirmation message
            renderExportTab(container);
            const cleared = container.querySelector(".sia-export-cleared");
            if (cleared) cleared.hidden = false;
        });
    }

    // Data Dictionaries Definitions
    const dictionaries = {
        historia: {
            headers: ["Columna", "Descripción", "Tipo de dato", "Ejemplo"],
            rows: [
                ["Semestre", "Identificador del semestre académico de la asignatura.", "Texto", "2024-1S"],
                ["Asignatura", "Nombre oficial de la asignatura.", "Texto", "Cálculo Diferencial"],
                ["Créditos", "Cantidad de créditos académicos que otorga la materia.", "Numérico (Entero)", "4"],
                ["Tipología", "Componente del plan de estudios al que pertenece la asignatura.", "Texto", "Fundamentación Obligatoria"],
                ["Calificación", "Calificación numérica final obtenida (de 0.0 a 5.0).", "Numérico (Decimal)", "4.3"],
                ["Estado", "Estado académico en el que finalizó (por ejemplo: APROBADA, REPROBADA, etc.).", "Texto", "APROBADA"]
            ]
        },
        gpa: {
            headers: ["Columna", "Descripción", "Tipo de dato", "Ejemplo"],
            rows: [
                ["Asignatura", "Nombre de la asignatura con notas parciales.", "Texto", "Física Mecánica"],
                ["Actividad", "Descripción o nombre de la evaluación parcial.", "Texto", "Parcial 1"],
                ["Porcentaje", "Porcentaje de peso que equivale la evaluación en la materia.", "Texto (Porcentaje)", "25.0%"],
                ["Calificación Original", "La nota original extraída directamente del SIA.", "Numérico (Decimal)", "3.8"],
                ["Calificación Estimada", "La nota que pusiste en la calculadora de promedio (si no la cambiaste, es la original).", "Numérico (Decimal)", "4.5"]
            ]
        },
        horario: {
            headers: ["Columna", "Descripción", "Tipo de dato", "Ejemplo"],
            rows: [
                ["Asignatura", "Nombre de la asignatura en el horario.", "Texto", "Álgebra Lineal"],
                ["Tipología", "Componente o tipología de la materia.", "Texto", "Fundamentación Obligatoria"],
                ["Créditos", "Créditos de la materia.", "Numérico (Entero)", "4"],
                ["Grupo", "Grupo preinscrito o seleccionado.", "Texto", "Grupo 3"],
                ["Profesor", "Nombre del profesor asignado al grupo.", "Texto", "Juan Pérez"],
                ["Día", "Día en el que se dicta la clase correspondiente.", "Texto", "LUNES"],
                ["Hora Inicio", "Hora de inicio de la clase (formato de 24 horas).", "Texto", "14:00"],
                ["Hora Fin", "Hora de finalización de la clase (formato de 24 horas).", "Texto", "16:00"],
                ["Aula", "Edificio, bloque y salón donde se dicta la clase.", "Texto", "BLOQUE M8B - SALÓN 101"]
            ]
        }
    };

    const dictTableEl = exportDiv.querySelector("#sia-dict-table-el");

    /**
     * Renders a specific data dictionary in the table element.
     * 
     * @param {string} key - Dictionary key ('historia', 'gpa', or 'horario').
     */
    const renderDictionaryTable = (key) => {
        const dict = dictionaries[key];
        if (!dict) return;

        let html = `
            <thead>
                <tr>
                    ${dict.headers.map(h => `<th>${h}</th>`).join("")}
                </tr>
            </thead>
            <tbody>
                ${dict.rows.map(row => `
                    <tr>
                        ${row.map(val => `<td>${val}</td>`).join("")}
                    </tr>
                `).join("")}
            </tbody>
        `;
        dictTableEl.innerHTML = html;
    };

    // Initial render
    renderDictionaryTable("historia");

    // Bind Dictionary Tab Switchers
    const dictTabButtons = exportDiv.querySelectorAll(".sia-dict-tab-btn");
    dictTabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            dictTabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            renderDictionaryTable(btn.dataset.dict);
        });
    });
}
