import { getPlannedCredits } from "../../domain/scheduleManager.js";
import { detectOngoingSemester } from "../../domain/historySummary.js";
import { getAsignaturas, getCreditos } from "../../domain/historyData.js";
import {
    buildProgressData,
    calcularPromedioPorSemestre,
    proyectarSemestres
} from "../../domain/historiaAcademica.js";
import {
    loadAllGpaCachedSubjects,
    loadAllGpaSubjectMeta
} from "../../domain/historyManager.js";





import Chart from "chart.js/auto";

/**
 * Renders a Chart.js line chart showing chronological credit progress and projections.
 * Plugs two datasets (real progress and future projection) into a canvas element.
 * 
 * @param {HTMLElement} container - Container element where the canvas will be injected.
 * @param {Array.<{
 *   semestre: string,
 *   acumulado: number,
 *   creditosDelSemestre: number
 * }>} progressData - Historical credit progress records.
 * @param {Array.<{
 *   semestre: string,
 *   acumulado: number
 * }>} proyeccion - Simulated future semesters projection.
 * @param {number} totalExigidos - Total credits required for graduation.
 * @returns {void}
 */
function renderChart(container, progressData, proyeccion, totalExigidos) {
    // Create tab buttons for switching chart metric
    const btnContainer = document.createElement("div");
    btnContainer.className = "sia-chart-tabs";
    btnContainer.innerHTML = `
        <button type="button" class="sia-chart-tab-btn active" data-metric="credits">Créditos</button>
        <button type="button" class="sia-chart-tab-btn" data-metric="papa">PAPA</button>
    `;
    container.appendChild(btnContainer);

    const canvasWrapper = document.createElement("div");
    canvasWrapper.className = "sia-chart-canvas-wrapper";
    container.appendChild(canvasWrapper);

    let activeMetric = "credits";
    let chartInstance = null;

    const renderChartInstance = (metric) => {
        // Destroy existing instance if there is one
        if (chartInstance) {
            chartInstance.destroy();
        }
        canvasWrapper.innerHTML = "";

        const canvas = document.createElement("canvas");
        canvas.style.maxHeight = "400px";
        canvasWrapper.appendChild(canvas);

        if (metric === "credits") {
            // Set horizontal axis labels combining past/current semesters and projection steps
            const labels = [
                ...progressData.map(p => p.semestre.replace(" Ordinaria", "")),
                ...proyeccion.map(p => p.semestre)
            ];

            // Real progress dataset (e.g. [16, 36, 52, 68])
            const dataReal = progressData.map(p => p.acumulado);

            // Projection dataset. Offset it with null values so it aligns seamlessly with the end of real data
            const dataProy = [
                ...Array(progressData.length - 1).fill(null),
                progressData.at(-1).acumulado, // Connect projection line directly to the last real data point
                ...proyeccion.map(p => p.acumulado)
            ];

            chartInstance = new Chart(canvas, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "Avance",
                            data: dataReal,
                            borderColor: "#0f6d59",
                            backgroundColor: "rgba(15,109,89,0.06)",
                            borderWidth: 2,
                            tension: 0.3,
                            fill: true,
                            pointRadius: 3,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#0f6d59"
                        },
                        {
                            label: "Proyección",
                            data: dataProy,
                            // Projection in grey dashes: an estimate, not a second data series
                            borderColor: "#94a3b8",
                            backgroundColor: "transparent",
                            borderDash: [5, 5],
                            borderWidth: 2,
                            tension: 0.3,
                            fill: false,
                            pointRadius: 3,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#94a3b8"
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += ((context.parsed.y / totalExigidos) * 100).toFixed(1) + '% (' + context.parsed.y + ' créditos)';
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: totalExigidos + 10,
                            ticks: {
                                stepSize: 20,
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            title: {
                                display: true,
                                text: 'Créditos acumulados',
                                font: {
                                    size: 13,
                                    weight: '600'
                                }
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Semestre',
                                font: {
                                    size: 13,
                                    weight: '600'
                                }
                            }
                        }
                    }
                }
            });
        } else if (metric === "papa") {
            // For PAPA, we only show historical semesters (no projection)
            const labels = progressData.map(p => p.semestre.replace(" Ordinaria", ""));
            const dataPapa = progressData.map(p => p.papaAcumulado);

            chartInstance = new Chart(canvas, {
                type: "line",
                data: {
                    labels,
                    datasets: [
                        {
                            label: "PAPA",
                            data: dataPapa,
                            borderColor: "#0f6d59",
                            backgroundColor: "rgba(15,109,89,0.06)",
                            borderWidth: 2,
                            tension: 0.2,
                            fill: true,
                            pointRadius: 3,
                            pointHoverRadius: 5,
                            pointBackgroundColor: "#0f6d59"
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        mode: 'index',
                        intersect: false,
                    },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                padding: 15,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            padding: 12,
                            titleFont: {
                                size: 14
                            },
                            bodyFont: {
                                size: 13
                            },
                            callbacks: {
                                label: function (context) {
                                    let label = context.dataset.label || '';
                                    if (label) {
                                        label += ': ';
                                    }
                                    if (context.parsed.y !== null) {
                                        label += context.parsed.y.toFixed(2);
                                    }
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            min: 0,
                            max: 5,
                            ticks: {
                                stepSize: 1,
                                font: {
                                    size: 11
                                }
                            },
                            grid: {
                                color: 'rgba(0, 0, 0, 0.05)'
                            },
                            title: {
                                display: true,
                                text: 'PAPA',
                                font: {
                                    size: 13,
                                    weight: '600'
                                }
                            }
                        },
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                font: {
                                    size: 10
                                }
                            },
                            grid: {
                                display: false
                            },
                            title: {
                                display: true,
                                text: 'Semestre',
                                font: {
                                    size: 13,
                                    weight: '600'
                                }
                            }
                        }
                    }
                }
            });
        }
    };

    // Render initial chart
    renderChartInstance(activeMetric);

    // Event listener for tab switching
    btnContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".sia-chart-tab-btn");
        if (!btn || btn.classList.contains("active")) return;

        // Toggle active button style
        btnContainer.querySelectorAll(".sia-chart-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        activeMetric = btn.dataset.metric;
        renderChartInstance(activeMetric);
    });
}

/**
 * Renders the academic progress view with statistics, chart, and detailed table.
 * Shows historical progress and future projections based on average performance.
 * 
 * @param {HTMLElement} container - Container element where the progress view will be rendered.
 * @returns {void}
 */
export function renderAvanceProgress(container) {
    if (!container) return;
    container.innerHTML = "";

    // Scraped from the page when possible, otherwise the saved copies
    const creditos = getCreditos();
    const asignaturas = getAsignaturas();

    // If no cached or DOM data exists, display helper instructions
    if (!creditos || creditos.length === 0 || !asignaturas || Object.keys(asignaturas).length === 0) {
        container.innerHTML = "<p>No hay historia académica disponible.<br><br>Abre <b>Información académica > Mi historia académica</b> para cargar tus datos por primera vez.</p>";
        return;
    }

    // Fetch graduation threshold (TOTAL component row in credit table)
    const totalData = creditos.find(c => c.componente?.toUpperCase() === "TOTAL");
    if (!totalData) {
        container.innerHTML = "<p>No se encontró el total de créditos exigidos.</p>";
        return;
    }

    const totalExigidos = totalData.exigidos;

    // Build historical progress dataset
    const progressData = buildProgressData(asignaturas);

    if (progressData.length === 0) {
        container.innerHTML = "<p>No hay suficientes datos para generar la proyección.</p>";
        return;
    }

    // Project semesters needed to reach graduation requirements
    // Ongoing semester, deduced from the calculator (see detectOngoingSemester).
    // If it already appears in the history (subjects that finished early), it is taken out of the
    // real data so its partial credits do not lower the average, and shown as one projected row
    // with those credits plus the enrolled ones. If it cannot be detected, enrollment is not projected.
    const upcoming = [];
    const meta = loadAllGpaSubjectMeta();
    const calculatorSubjects = Object.keys(loadAllGpaCachedSubjects()).map((name) => ({ name, period: meta[name]?.period || null }));
    const ongoing = (totalData.inscritos || 0) > 0 ? detectOngoingSemester(asignaturas, calculatorSubjects) : null;
    if (ongoing) {
        let earlyCredits = 0;
        const last = progressData.at(-1);
        if (ongoing.historyKey && last && last.semestre === ongoing.historyKey && progressData.length > 1) {
            progressData.pop();
            earlyCredits = last.creditosDelSemestre;
        }
        upcoming.push({
            label: "en curso",
            semestre: `${(ongoing.historyKey || ongoing.period).replace(" Ordinaria", "")} (en curso)`,
            credits: earlyCredits + totalData.inscritos
        });
    }
    // Then the plan in Horario for the next semester
    upcoming.push({ label: "Horario", credits: getPlannedCredits().total });
    const proyeccion = proyectarSemestres(progressData, totalExigidos, upcoming);

    // Create container elements
    const title = document.createElement("h2");
    title.textContent = "Proyección de avance";
    title.className = "sia-avance-header";

    // Chart container
    const chartContainer = document.createElement("div");
    chartContainer.className = "sia-chart-container";

    // Detailed table container
    const tableContainer = document.createElement("details");
    tableContainer.className = "sia-progress-table-container";

    // Detail table is collapsible: the chart and the key figures already answer the main question
    const tableTitle = document.createElement("summary");
    tableTitle.textContent = "Ver detalle por semestre";
    tableTitle.className = "sia-progress-table-title";

    const table = document.createElement("table");
    table.className = "sia-progress-table";

    let tableHTML = `
        <thead>
            <tr>
                <th>Semestre</th>
                <th>Créditos del semestre</th>
                <th>Créditos acumulados</th>
                <th>% del total</th>
                <th>PAPA</th>
            </tr>
        </thead>
        <tbody>
    `;

    // Populate table with real historical records
    for (const item of progressData) {
        const porcentaje = ((item.acumulado / totalExigidos) * 100).toFixed(1);
        tableHTML += `
            <tr>
                <td class="semestre-name">${item.semestre.replace(" Ordinaria", "")}</td>
                <td class="creditos-semestre">${item.creditosDelSemestre}</td>
                <td class="creditos-acumulado">${item.acumulado}</td>
                <td class="porcentaje">${porcentaje}%</td>
                <td class="papa-acumulado">${item.papaAcumulado ? item.papaAcumulado.toFixed(2) : "-"}</td>
            </tr>
        `;
    }

    // Populate table with simulated/projected rows
    for (let i = 0; i < proyeccion.length; i++) {
        const item = proyeccion[i];
        const creditosDelSemestre = i === 0
            ? item.acumulado - progressData.at(-1).acumulado
            : item.acumulado - proyeccion[i - 1].acumulado;
        const porcentaje = ((item.acumulado / totalExigidos) * 100).toFixed(1);

        tableHTML += `
            <tr class="proyeccion-row">
                <td class="semestre-name">${item.semestre}</td>
                <td class="creditos-semestre">${creditosDelSemestre}</td>
                <td class="creditos-acumulado">${item.acumulado}</td>
                <td class="porcentaje">${porcentaje}%</td>
                <td class="papa-acumulado">-</td>
            </tr>
        `;
    }

    tableHTML += `
        </tbody>
    `;

    table.innerHTML = tableHTML;
    tableContainer.appendChild(tableTitle);
    tableContainer.appendChild(table);

    // Explain where the first projected semesters come from
    const sources = [];
    if (proyeccion.some((p) => p.fuente === "en curso")) sources.push("el semestre en curso (lo que ya aprobaste más lo que tienes inscrito)");
    if (proyeccion.some((p) => p.fuente === "Horario")) sources.push("los créditos que planeaste en Horario");
    if (sources.length > 0) {
        const note = document.createElement("p");
        note.className = "sia-progress-table-note";
        note.textContent = `Las primeras filas proyectadas usan ${sources.join(" y ")}; las siguientes, tu promedio histórico de créditos por semestre.`;
        tableContainer.appendChild(note);
    }

    // Key figures: the answer to "how far am I?" before any chart
    const lastReal = progressData.at(-1).acumulado;
    const pct = Math.round((lastReal / totalExigidos) * 100);
    const remainingSemesters = proyeccion.length;
    const keyFigures = document.createElement("div");
    keyFigures.className = "sia-avance-key";
    keyFigures.innerHTML = `
        <div class="sia-avance-key-item"><b></b><span>créditos aprobados</span></div>
        <div class="sia-avance-key-item"><b></b><span>del plan</span></div>
        <div class="sia-avance-key-item"><b></b><span></span></div>
    `;
    const [k1, k2, k3] = keyFigures.querySelectorAll(".sia-avance-key-item");
    k1.querySelector("b").textContent = `${lastReal} / ${totalExigidos}`;
    k2.querySelector("b").textContent = `${pct}%`;
    if (remainingSemesters > 0) {
        k3.querySelector("b").textContent = `≈ ${remainingSemesters}`;
        k3.querySelector("span").textContent = remainingSemesters === 1 ? "semestre para graduarte" : "semestres para graduarte";
        k3.title = "Estimado con tus créditos en curso, lo planeado en Horario y tu promedio de créditos por semestre";
    } else {
        k3.querySelector("b").textContent = "✓";
        k3.querySelector("span").textContent = "créditos completos";
    }

    // Append child components to main view container
    container.appendChild(title);
    container.appendChild(keyFigures);
    container.appendChild(chartContainer);
    container.appendChild(tableContainer);

    // Render visual line graph
    renderChart(chartContainer, progressData, proyeccion, totalExigidos);
}