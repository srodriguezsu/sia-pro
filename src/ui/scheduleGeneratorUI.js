import {
    WEEK_DAYS,
    generateSchedules,
    listProfessors,
    loadGeneratorPrefs,
    saveGeneratorPrefs,
    splitProfessors,
    listSpecialGroupTypes
} from "../domain/scheduleGenerator.js";
import { loadSelectedGroups, saveSelectedGroups } from "../domain/scheduleManager.js";

/** Selections before the last "Usar este horario", so it can be undone. */
let undoState = null;
/** Whether the generator section was left open, kept across re-renders. */
let sectionOpen = false;
/** Last results, kept across re-renders while the subjects do not change. */
let lastRun = null;

const PAGE_SIZE = 5;

/** Ways to order the results. */
const SORTS = [
    { value: "comodo", label: "Más cómodo" },
    { value: "dias", label: "Menos días" },
    { value: "tarde", label: "Empieza más tarde" },
    { value: "temprano", label: "Termina más temprano" }
];

/**
 * Orders the combinations; ties fall back to the default ranking (the original order).
 *
 * @param {Array.<Object>} combos - Combinations in default order.
 * @param {string} sort - Sort key.
 * @returns {Array.<Object>} Sorted copy.
 */
function sortCombos(combos, sort) {
    const indexed = combos.map((c, i) => ({ c, i }));
    const key = {
        comodo: () => 0,
        dias: ({ c }) => c.days,
        tarde: ({ c }) => -(c.earliest ?? 0),
        temprano: ({ c }) => c.latest ?? 0
    }[sort] || (() => 0);
    return indexed
        .sort((a, b) => a.c.omitted.length - b.c.omitted.length || key(a) - key(b) || a.i - b.i)
        .map(({ c }) => c);
}

const formatHour = (minutes) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
const formatGap = (minutes) => {
    if (minutes === 0) return "sin huecos";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h > 0 ? `${h} h` : ""}${h > 0 && m > 0 ? " " : ""}${m > 0 ? `${m} min` : ""} de huecos`;
};

/**
 * Renders the "Generar horarios" section: preferences, generate button and ranked results.
 *
 * @param {Array.<Object>} subjects - Subjects added to Horario.
 * @param {{onApply: function(): void, onPreview: function(Object|null, string=): void}} handlers -
 *   onApply re-renders Horario after saving; onPreview shows a combination on the calendar (null to exit).
 * @returns {HTMLElement} Section element.
 */
export function renderScheduleGenerator(subjects, { onApply, onPreview }) {
    const prefs = loadGeneratorPrefs();
    const subjectsKey = subjects.map((s) => s.name).sort().join("|");
    if (lastRun && lastRun.subjectsKey !== subjectsKey) lastRun = null;

    const section = document.createElement("details");
    section.className = "sia-gen";
    section.open = sectionOpen || Boolean(undoState);
    section.addEventListener("toggle", () => { sectionOpen = section.open; });

    const summary = document.createElement("summary");
    summary.className = "sia-gen-summary";
    summary.innerHTML = `<span class="sia-gen-title">Generar horarios</span><span class="sia-gen-hint">Combinaciones sin cruces según tus preferencias</span>`;
    section.appendChild(summary);

    const body = document.createElement("div");
    body.className = "sia-gen-body";
    section.appendChild(body);

    // Undo banner after applying a combination
    if (undoState) {
        const banner = document.createElement("div");
        banner.className = "sia-gen-undo";
        banner.innerHTML = `<span>Se aplicó la ${undoState.label.toLowerCase()}.</span>`;
        const undo = document.createElement("button");
        undo.type = "button";
        undo.className = "sia-gen-link";
        undo.textContent = "Deshacer";
        undo.addEventListener("click", () => {
            saveSelectedGroups(undoState.selections);
            undoState = null;
            onApply();
        });
        banner.appendChild(undo);
        body.appendChild(banner);
    }

    const save = () => saveGeneratorPrefs(prefs);

    // Hours
    const hourSelect = (label, key, values) => {
        const wrap = document.createElement("label");
        wrap.className = "sia-gen-field";
        wrap.innerHTML = `<span class="sia-gen-label">${label}</span>`;
        const select = document.createElement("select");
        select.className = "sia-gen-select";
        select.innerHTML = `<option value="">Sin límite</option>` +
            values.map((h) => `<option value="${h * 60}">${h}:00</option>`).join("");
        select.value = prefs[key] == null ? "" : String(prefs[key]);
        select.addEventListener("change", () => {
            prefs[key] = select.value === "" ? null : parseInt(select.value, 10);
            save();
        });
        wrap.appendChild(select);
        return wrap;
    };
    const hours = document.createElement("div");
    hours.className = "sia-gen-row";
    hours.append(
        hourSelect("Empezar desde", "earliest", [6, 7, 8, 9, 10, 11, 12]),
        hourSelect("Terminar antes de", "latest", [12, 13, 14, 15, 16, 17, 18, 19, 20, 21])
    );
    body.appendChild(hours);

    // Chip group helper (multi-select)
    const chipGroup = (label, items, selected, onToggle) => {
        const group = document.createElement("div");
        group.className = "sia-gen-group";
        group.innerHTML = `<span class="sia-gen-label">${label}</span>`;
        const chips = document.createElement("div");
        chips.className = "sia-gen-chips";
        items.forEach((item) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "sia-hist-chip" + (selected.includes(item.value) ? " active" : "");
            chip.textContent = item.label;
            if (item.title) chip.title = item.title;
            chip.setAttribute("aria-pressed", String(selected.includes(item.value)));
            chip.addEventListener("click", () => {
                onToggle(item.value);
                const on = selected.includes(item.value);
                chip.classList.toggle("active", on);
                chip.setAttribute("aria-pressed", String(on));
                save();
            });
            chips.appendChild(chip);
        });
        group.appendChild(chips);
        return group;
    };
    const toggleIn = (list, value) => {
        const i = list.indexOf(value);
        if (i === -1) list.push(value);
        else list.splice(i, 1);
    };

    body.appendChild(chipGroup(
        "Días libres",
        WEEK_DAYS.map((d) => ({ value: d.key, label: d.label })),
        prefs.freeDays,
        (v) => toggleIn(prefs.freeDays, v)
    ));

    // Professors: only those teaching a subject with more than one professor to choose from
    const professors = listProfessors(subjects).filter((p) => p.subjects.some((name) => {
        const subj = subjects.find((s) => s.name === name);
        const names = new Set((subj?.groups || []).flatMap((g) => splitProfessors(g.profesor)));
        return names.size > 1;
    }));
    if (professors.length > 0) {
        const profGroup = chipGroup(
            "Evitar profesores",
            professors.map((p) => ({ value: p.name, label: p.name, title: p.subjects.join(", ") })),
            prefs.avoidProfessors,
            (v) => toggleIn(prefs.avoidProfessors, v)
        );
        profGroup.classList.add("sia-gen-professors");
        body.appendChild(profGroup);
    }

    // Special groups (e.g. "(CARI-01) ..."), shown by their code
    const specialTypes = listSpecialGroupTypes(subjects);
    if (specialTypes.length > 0) {
        prefs.excludeGroupTypes ||= [];
        body.appendChild(chipGroup(
            "Excluir grupos",
            specialTypes.map((t) => ({ value: t, label: `(${t})` })),
            prefs.excludeGroupTypes,
            (v) => toggleIn(prefs.excludeGroupTypes, v)
        ));
    }

    // Options
    const check = (label, key) => {
        const wrap = document.createElement("label");
        wrap.className = "sia-gen-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = Boolean(prefs[key]);
        input.addEventListener("change", () => {
            prefs[key] = input.checked;
            save();
        });
        wrap.append(input, label);
        return wrap;
    };
    const checks = document.createElement("div");
    checks.className = "sia-gen-row";
    const omitCheck = check("Permitir dejar asignaturas por fuera", "allowOmit");
    checks.append(check("Solo grupos con cupos", "onlyWithSeats"), omitCheck);
    body.appendChild(checks);

    // Minimum load, only relevant when subjects can be left out
    const minField = document.createElement("label");
    minField.className = "sia-gen-field sia-gen-min";
    minField.innerHTML = `<span class="sia-gen-label">Carga mínima (créditos)</span>`;
    const minInput = document.createElement("input");
    minInput.type = "number";
    minInput.min = "0";
    minInput.max = "40";
    minInput.className = "sia-gen-select sia-gen-min-input";
    minInput.value = String(prefs.minCredits ?? 10);
    minInput.addEventListener("change", () => {
        const n = parseInt(minInput.value, 10);
        prefs.minCredits = Number.isFinite(n) ? Math.min(40, Math.max(0, n)) : 10;
        minInput.value = String(prefs.minCredits);
        save();
    });
    const minHint = document.createElement("span");
    minHint.className = "sia-gen-hint";
    minHint.textContent = "Las opciones que dejan asignaturas por fuera mantienen al menos estos créditos.";
    minField.append(minInput, minHint);
    minField.hidden = !prefs.allowOmit;
    omitCheck.querySelector("input").addEventListener("change", (e) => { minField.hidden = !e.target.checked; });
    body.appendChild(minField);

    const run = document.createElement("button");
    run.type = "button";
    run.className = "sia-gen-run";
    run.textContent = "Generar";
    body.appendChild(run);

    const results = document.createElement("div");
    results.className = "sia-gen-results";
    body.appendChild(results);

    const renderResults = () => {
        results.innerHTML = "";
        if (!lastRun) return;
        const { combos, blocked, truncated } = lastRun.result;

        if (combos.length === 0) {
            const msg = document.createElement("div");
            msg.className = "sia-gen-empty";
            if (blocked.length > 0) {
                msg.innerHTML = `<b>Ningún grupo cumple tus preferencias en:</b>`;
                const list = document.createElement("ul");
                blocked.forEach((b) => {
                    const li = document.createElement("li");
                    const reasons = Object.entries(b.reasons).map(([r, n]) => `${n} ${r}`).join(", ");
                    li.textContent = `${b.subject}${reasons ? ` (${reasons})` : ""}`;
                    list.appendChild(li);
                });
                msg.appendChild(list);
                msg.insertAdjacentHTML("beforeend", `<span>Relaja alguna preferencia o activa <i>Permitir dejar asignaturas por fuera</i>.</span>`);
            } else if (prefs.allowOmit) {
                msg.textContent = `No hay combinaciones sin cruces con al menos ${prefs.minCredits} créditos. Prueba bajar la carga mínima o relajar alguna preferencia.`;
            } else {
                msg.textContent = "No hay combinaciones sin cruces con estas preferencias.";
            }
            results.appendChild(msg);
            return;
        }

        const head = document.createElement("div");
        head.className = "sia-gen-count";
        const merged = lastRun.result.total - combos.length;
        head.textContent = `${combos.length}${truncated ? "+" : ""} ${combos.length === 1 ? "horario distinto" : "horarios distintos"}`
            + (merged > 0 ? ` (${merged} combinaciones con el mismo horario agrupadas)` : "");
        results.appendChild(head);

        // Order of the results
        const sortBar = document.createElement("div");
        sortBar.className = "sia-gen-chips sia-gen-sort";
        SORTS.forEach((opt) => {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "sia-hist-chip" + (lastRun.sort === opt.value ? " active" : "");
            chip.textContent = opt.label;
            chip.addEventListener("click", () => {
                lastRun.sort = opt.value;
                lastRun.page = 0;
                renderResults();
            });
            sortBar.appendChild(chip);
        });
        results.appendChild(sortBar);

        const sorted = sortCombos(combos, lastRun.sort);
        const pages = Math.ceil(sorted.length / PAGE_SIZE);
        lastRun.page = Math.min(lastRun.page, pages - 1);
        const start = lastRun.page * PAGE_SIZE;

        sorted.slice(start, start + PAGE_SIZE).forEach((combo, i) => {
            const index = start + i;
            const label = `Opción ${index + 1}`;
            const card = document.createElement("div");
            card.className = "sia-gen-option";
            const facts = [
                `${combo.credits} créditos`,
                `${combo.days} ${combo.days === 1 ? "día" : "días"}`,
                formatGap(combo.gapMinutes),
                combo.earliest != null ? `${formatHour(combo.earliest)}–${formatHour(combo.latest)}` : null
            ].filter(Boolean).join(" · ");
            card.innerHTML = `
                <div class="sia-gen-option-head"><b>${label}</b><span>${facts}</span></div>
                <div class="sia-gen-option-groups"></div>
            `;
            const groupsEl = card.querySelector(".sia-gen-option-groups");
            Object.entries(combo.selections).forEach(([subjectName, groupName]) => {
                const subj = subjects.find((s) => s.name === subjectName);
                const group = subj?.groups?.find((g) => g.name === groupName);
                const line = document.createElement("div");
                line.textContent = [subjectName, groupName, group?.profesor].filter(Boolean).join(" · ");
                const alternatives = combo.alternatives?.[subjectName];
                if (alternatives?.length) {
                    const alt = document.createElement("span");
                    alt.className = "sia-gen-alt";
                    alt.textContent = ` · mismo horario en ${alternatives.join(", ")}`;
                    alt.title = alternatives.map((name) => {
                        const g = subj?.groups?.find((x) => x.name === name);
                        return [name, g?.profesor].filter(Boolean).join(": ");
                    }).join("\n");
                    line.appendChild(alt);
                }
                groupsEl.appendChild(line);
            });
            if (combo.omitted.length > 0) {
                const omitted = document.createElement("div");
                omitted.className = "sia-gen-omitted";
                omitted.textContent = `Sin: ${combo.omitted.join(", ")}`;
                groupsEl.appendChild(omitted);
            }

            const actions = document.createElement("div");
            actions.className = "sia-gen-option-actions";
            const preview = document.createElement("button");
            preview.type = "button";
            preview.className = "sia-gen-link";
            preview.textContent = "Ver en el calendario";
            preview.addEventListener("click", () => onPreview(combo.selections, label));
            const apply = document.createElement("button");
            apply.type = "button";
            apply.className = "sia-gen-apply";
            apply.textContent = "Usar este horario";
            apply.addEventListener("click", () => {
                undoState = { selections: loadSelectedGroups(), label };
                const next = loadSelectedGroups();
                subjects.forEach((s) => { delete next[s.name]; });
                saveSelectedGroups({ ...next, ...combo.selections });
                onApply();
            });
            actions.append(preview, apply);
            card.appendChild(actions);
            results.appendChild(card);
        });

        // Pagination
        if (pages > 1) {
            const pager = document.createElement("div");
            pager.className = "sia-gen-pager";
            const go = (page) => {
                lastRun.page = page;
                renderResults();
                results.scrollIntoView({ block: "start", behavior: "smooth" });
            };
            const prev = document.createElement("button");
            prev.type = "button";
            prev.className = "sia-gen-page-btn";
            prev.textContent = "‹ Anterior";
            prev.disabled = lastRun.page === 0;
            prev.addEventListener("click", () => go(lastRun.page - 1));
            // Editable page number: "Página [n] de N"
            const info = document.createElement("label");
            info.className = "sia-gen-page-info";
            const input = document.createElement("input");
            input.type = "number";
            input.min = "1";
            input.max = String(pages);
            input.value = String(lastRun.page + 1);
            input.className = "sia-gen-page-input";
            input.setAttribute("aria-label", "Número de página");
            const commit = () => {
                const n = parseInt(input.value, 10);
                const page = Number.isFinite(n) ? Math.min(pages, Math.max(1, n)) - 1 : lastRun.page;
                if (page !== lastRun.page) go(page);
                else input.value = String(lastRun.page + 1);
            };
            input.addEventListener("change", commit);
            input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
            info.append("Página ", input, ` de ${pages}`);
            const next = document.createElement("button");
            next.type = "button";
            next.className = "sia-gen-page-btn";
            next.textContent = "Siguiente ›";
            next.disabled = lastRun.page >= pages - 1;
            next.addEventListener("click", () => go(lastRun.page + 1));
            pager.append(prev, info, next);
            results.appendChild(pager);
        }
    };

    run.addEventListener("click", () => {
        undoState = null;
        section.querySelector(".sia-gen-undo")?.remove();
        lastRun = { subjectsKey, result: generateSchedules(subjects, prefs), page: 0, sort: "comodo" };
        onPreview(null);
        renderResults();
    });

    renderResults();
    return section;
}
