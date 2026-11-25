/**
 * Schedule generator: builds group combinations without time clashes that respect the
 * student's preferences, ranked from most to least convenient.
 */

const STORAGE_KEY_PREFS = "sia_pro_generator_prefs";

/** Weekdays in display order, normalized like SIA's day names (no accents, uppercase). */
export const WEEK_DAYS = [
    { key: "LUNES", label: "Lun" },
    { key: "MARTES", label: "Mar" },
    { key: "MIERCOLES", label: "Mié" },
    { key: "JUEVES", label: "Jue" },
    { key: "VIERNES", label: "Vie" },
    { key: "SABADO", label: "Sáb" }
];

/** Default preferences: no limits, try to keep the days compact. */
export const DEFAULT_PREFS = {
    earliest: null,         // minutes since midnight, e.g. 480 = no classes before 8:00
    latest: null,           // minutes since midnight, e.g. 1080 = no classes after 18:00
    freeDays: [],           // day keys with no classes
    avoidProfessors: [],    // professor names to avoid
    onlyWithSeats: true,    // skip groups with no available seats
    allowOmit: false,       // allow leaving out subjects when no full combination exists
    minCredits: 10,         // with allowOmit: minimum credits a combination must keep (carga mínima)
    excludeGroupTypes: []   // special group prefixes to skip, e.g. "CARI-01"
};

/**
 * Special group prefix: SIA names groups "(1) Grupo 1"; special ones use a code
 * instead of a number, e.g. "(CARI-01) PAET - Caribe Grupo 01".
 *
 * @param {string} groupName - Group name.
 * @returns {string|null} Prefix code, or null for regular (numbered) groups.
 */
export function specialGroupType(groupName) {
    const m = (groupName || "").match(/^\s*\(([^)]+)\)/);
    if (!m || /^\d+$/.test(m[1].trim())) return null;
    return m[1].trim().toUpperCase();
}

/**
 * Special group prefixes present in the subjects' groups.
 *
 * @param {Array.<Object>} subjects - Subjects with groups.
 * @returns {Array.<string>} Sorted prefixes.
 */
export function listSpecialGroupTypes(subjects) {
    const set = new Set();
    subjects.forEach((s) => (s.groups || []).forEach((g) => {
        const t = specialGroupType(g.name);
        if (t) set.add(t);
    }));
    return [...set].sort();
}

/**
 * @returns {typeof DEFAULT_PREFS} Saved preferences merged over the defaults.
 */
export function loadGeneratorPrefs() {
    try {
        return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(STORAGE_KEY_PREFS) || "{}") };
    } catch (e) {
        return { ...DEFAULT_PREFS };
    }
}

/**
 * @param {typeof DEFAULT_PREFS} prefs - Preferences to save.
 * @returns {void}
 */
export function saveGeneratorPrefs(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(prefs));
    } catch (e) {
        console.error("[SIA Pro] Error al guardar preferencias del generador:", e);
    }
}

export const normalizeDay = (d) => (d || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const normalizeName = (n) => (n || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

function toMinutes(time) {
    const m = (time || "").match(/(\d{1,2})(?::(\d{2}))?/);
    return m ? parseInt(m[1], 10) * 60 + (m[2] ? parseInt(m[2], 10) : 0) : null;
}

/**
 * Splits a group's professor field into individual names (SIA may list several).
 *
 * @param {string|undefined} profesor - Professor text.
 * @returns {Array.<string>} Names.
 */
export function splitProfessors(profesor) {
    return (profesor || "")
        .split(/[,;\n]| - | y /)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p && !/^(sin asignar|por asignar|n\/a)$/i.test(p));
}

/**
 * Every professor across the subjects' groups, for the "avoid" list, with the subjects they teach.
 *
 * @param {Array.<Object>} subjects - Subjects with groups.
 * @returns {Array.<{name: string, subjects: Array.<string>}>} Professors sorted by name.
 */
export function listProfessors(subjects) {
    const map = new Map();
    subjects.forEach((s) => (s.groups || []).forEach((g) => splitProfessors(g.profesor).forEach((p) => {
        const key = normalizeName(p);
        if (!map.has(key)) map.set(key, { name: p, subjects: new Set() });
        map.get(key).subjects.add(s.name);
    })));
    return [...map.values()]
        .map((p) => ({ name: p.name, subjects: [...p.subjects] }))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

/** Time slots of a group, parsed; null when the group has no usable schedule. */
function groupSlots(group) {
    const slots = (group.horarios || [])
        .map((h) => ({ day: normalizeDay(h.dia), start: toMinutes(h.horaInicio), end: toMinutes(h.horaFin) }))
        .filter((s) => s.day && s.start != null && s.end != null && s.end > s.start);
    return slots.length > 0 ? slots : null;
}

/**
 * Reason a group is excluded by the preferences, or null when it is allowed.
 *
 * @param {Object} group - Group.
 * @param {Array.<Object>} slots - Parsed slots.
 * @param {typeof DEFAULT_PREFS} prefs - Preferences.
 * @param {Set.<string>} avoid - Normalized professors to avoid.
 * @returns {string|null} Reason.
 */
function exclusionReason(group, slots, prefs, avoid) {
    const type = specialGroupType(group.name);
    if (type && (prefs.excludeGroupTypes || []).includes(type)) return "grupo excluido";
    if (prefs.onlyWithSeats && Number.isFinite(group.cuposDisponibles) && group.cuposDisponibles <= 0) return "sin cupos";
    if (splitProfessors(group.profesor).some((p) => avoid.has(normalizeName(p)))) return "profesor evitado";
    if (prefs.earliest != null && slots.some((s) => s.start < prefs.earliest)) return "muy temprano";
    if (prefs.latest != null && slots.some((s) => s.end > prefs.latest)) return "muy tarde";
    if (prefs.freeDays.length > 0 && slots.some((s) => prefs.freeDays.includes(s.day))) return "día libre";
    return null;
}

const overlaps = (a, b) => a.some((x) => b.some((y) => x.day === y.day && x.start < y.end && y.start < x.end));

/**
 * Metrics of a combination: days with classes, idle minutes between classes, first and last hour.
 *
 * @param {Array.<{slots: Array.<Object>}>} picks - Chosen groups.
 * @returns {{days: number, gapMinutes: number, earliest: number|null, latest: number|null}} Metrics.
 */
function comboMetrics(picks) {
    const byDay = new Map();
    picks.forEach((p) => p.slots.forEach((s) => {
        if (!byDay.has(s.day)) byDay.set(s.day, []);
        byDay.get(s.day).push(s);
    }));
    let gapMinutes = 0;
    let earliest = null;
    let latest = null;
    byDay.forEach((slots) => {
        slots.sort((a, b) => a.start - b.start);
        let end = slots[0].end;
        for (let i = 1; i < slots.length; i++) {
            if (slots[i].start > end) gapMinutes += slots[i].start - end;
            end = Math.max(end, slots[i].end);
        }
        earliest = earliest == null ? slots[0].start : Math.min(earliest, slots[0].start);
        latest = latest == null ? end : Math.max(latest, end);
    });
    return { days: byDay.size, gapMinutes, earliest, latest };
}

/** Search limits so huge subject lists stay responsive. */
const MAX_RESULTS = 300;
const MAX_STEPS = 200000;

/**
 * Generates clash-free combinations of one group per subject.
 *
 * @param {Array.<Object>} subjects - Subjects added to Horario (with groups).
 * @param {typeof DEFAULT_PREFS} prefs - Preferences.
 * @returns {{
 *   combos: Array.<{selections: Object.<string, string>, omitted: Array.<string>, days: number, gapMinutes: number, earliest: number|null, latest: number|null}>,
 *   total: number,
 *   blocked: Array.<{subject: string, reasons: Object.<string, number>}>,
 *   truncated: boolean
 * }} Ranked combinations, subjects left with no allowed group, and whether the search was cut short.
 */
export function generateSchedules(subjects, prefs) {
    const avoid = new Set(prefs.avoidProfessors.map(normalizeName));
    const options = [];
    const blocked = [];

    subjects.forEach((subject) => {
        const reasons = {};
        const allowed = [];
        (subject.groups || []).forEach((group) => {
            const slots = groupSlots(group);
            if (!slots) {
                reasons["sin horario"] = (reasons["sin horario"] || 0) + 1;
                return;
            }
            const reason = exclusionReason(group, slots, prefs, avoid);
            if (reason) reasons[reason] = (reasons[reason] || 0) + 1;
            else allowed.push({ name: group.name, slots });
        });
        if (allowed.length === 0) blocked.push({ subject: subject.name, reasons });
        options.push({ subject: subject.name, credits: parseInt(subject.creditos, 10) || 0, allowed });
    });

    // Fewest options first keeps the search small
    const ordered = options.filter((o) => o.allowed.length > 0 || prefs.allowOmit)
        .sort((a, b) => a.allowed.length - b.allowed.length);
    if (!prefs.allowOmit && blocked.length > 0) return { combos: [], total: 0, blocked, truncated: false };

    const combos = [];
    let steps = 0;
    let truncated = false;
    const picks = [];
    const omitted = [];

    const search = (i) => {
        if (++steps > MAX_STEPS) {
            truncated = true;
            return;
        }
        if (i === ordered.length) {
            if (picks.length === 0) return;
            const credits = picks.reduce((sum, p) => sum + p.credits, 0);
            // Leaving subjects out is only allowed while keeping the minimum load
            if (omitted.length > 0 && credits < (Number(prefs.minCredits) || 0)) return;
            const selections = {};
            picks.forEach((p) => { selections[p.subject] = p.name; });
            // Same weekly timetable regardless of which equivalent group was chosen
            const signature = picks
                .flatMap((p) => p.slots.map((x) => `${p.subject}@${x.day}${x.start}-${x.end}`))
                .sort().join("|") + `#${omitted.slice().sort().join(",")}`;
            combos.push({ selections, omitted: [...omitted], credits, signature, ...comboMetrics(picks) });
            return;
        }
        const { subject, allowed } = ordered[i];
        for (const group of allowed) {
            if (truncated) return;
            if (picks.some((p) => overlaps(p.slots, group.slots))) continue;
            picks.push({ subject, name: group.name, slots: group.slots, credits: ordered[i].credits });
            search(i + 1);
            picks.pop();
        }
        if (prefs.allowOmit) {
            omitted.push(subject);
            search(i + 1);
            omitted.pop();
        }
    };
    search(0);

    // Most subjects first, then fewer idle hours, fewer days, and a shorter day span
    combos.sort((a, b) =>
        a.omitted.length - b.omitted.length ||
        a.gapMinutes - b.gapMinutes ||
        a.days - b.days ||
        (a.latest - a.earliest) - (b.latest - b.earliest)
    );
    // Combinations with the exact same timetable are shown as one option with alternatives
    const merged = [];
    const bySignature = new Map();
    combos.forEach((c) => {
        const existing = bySignature.get(c.signature);
        if (!existing) {
            const option = { ...c, alternatives: {} };
            bySignature.set(c.signature, option);
            merged.push(option);
            return;
        }
        Object.entries(c.selections).forEach(([subject, group]) => {
            if (group === existing.selections[subject]) return;
            const list = (existing.alternatives[subject] ||= []);
            if (!list.includes(group)) list.push(group);
        });
    });
    if (merged.length > MAX_RESULTS) merged.length = MAX_RESULTS;
    return { combos: merged, total: combos.length, blocked, truncated };
}
