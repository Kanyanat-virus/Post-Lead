/* ============================================================
   report.js – Logic for daily / cumulative report page (report.html)

   Data sources (same Google Apps Script API as index.html):
     - branches  → ชีทรายที่ทำการ    → maps branchCode to province/team/branchName
     - leads     → ชีทกรอกข้อมูล Lead
     - visits    → ชีทกรอกข้อมูลเข้าพบ (returned by API as 'visits')

   Table columns (matching the example screenshot):
     ทีมสังกัด ปข.6/เขต | รายชื่อที่ทำการ
     Lead: e-Commerce | บริการระหว่างประเทศ | Fuze | รวม
     การเข้าพบ: e-Commerce | บริการระหว่างประเทศ | Fuze | รวม
     ผลการเข้าพบ: ปิดได้ | ปิดไม่ได้
   ============================================================ */

'use strict';

/* ── Config ────────────────────────────────────────────────── */
const API_URL = 'https://script.google.com/macros/s/AKfycbyfbWtEkj7c9ImlU4z3izMX5HeH1DFum061ZjJQjIthlKJ3PMwHReN7stwvxveCRd1TUQ/exec';

/* ── Constants ──────────────────────────────────────────────── */
const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                     "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

const PROVINCE_ORDER = ["นครสวรรค์","อุทัยธานี","กำแพงเพชร","ตาก",
                        "สุโขทัย","พิษณุโลก","พิจิตร","เพชรบูรณ์"];

// Lead product types expected in the data
// Key = column header suffix used in table, Value = field value to match
const LEAD_TYPES = [
    { label: 'e-Commerce',                key: 'ecommerce' },
    { label: 'บริการระหว่างประเทศ',       key: 'inter' },
    { label: 'Fuze',                      key: 'fuze' },
];

const TEAM_BRANCH_MAPPING = {
    "นครสวรรค์ทีม 1": "ปจ.นครสวรรค์",
    "นครสวรรค์ทีม 2": "ปณ.สวรรค์วิถี/จิรประวัติ/ปณ.หนองเบน/คปณ.บิ๊กซี นครสวรรค์",
    "นครสวรรค์โซน A": "ปณ.ชุมแสง/หนองบัว/ทับกฤช",
    "นครสวรรค์โซน B": "ปณ.พยุหะคีรี/โกรกพระ",
    "นครสวรรค์โซน C": "ปณ.ตาคลี/ตากฟ้า/ช่องแค/จันเสน",
    "นครสวรรค์โซน D": "ปณ.ลาดยาว/แม่วงก์",
    "นครสวรรค์โซน E": "ปณ.ท่าตะโก/ไพศาลี",
    "นครสวรรค์โซน F": "ปณ.บรรพตพิสัย/เก้าเลี้ยว",
    "อุทัยธานี": "ปจ.อุทัยธานี /ปณ.หนองขาหย่าง",
    "อุทัยธานีโซน A": "ปณ.หนองฉาง/ทัพทัน/สว่างอารมณ์",
    "อุทัยธานีโซน B": "ปณ.บ้านไร่/ลานสัก/เขาบางแกรก/เมืองการุ้ง",
    "กำแพงเพชร": "ปจ.กำแพงเพชร/ปากดง/ทุ่งทราย/ระหาน",
    "กำแพงเพชรโซน A": "ปณ.พรานกระต่าย/ไทรงาม/ลานกระบือ",
    "กำแพงเพชรโซน B": "ปณ.คลองลาน/คลองขลุง/ขาณุวรลักษบุรี/สลกบาตร",
    "ตาก": "ปจ.ตาก",
    "ตากโซน A": "ปณ.บ้านตาก/สามเงา/วังเจ้า",
    "ตากโซน B": "ปณ.แม่สอด/พบพระ/แม่ระมาด/ท่าสองยาง/อุ้มผาง",
    "สุโขทัย": "ปจ.สุโขทัย",
    "สุโขทัยโซน A": "ปณ.สวรรคโลก/ศรีสัชนาลัย/ท่าชัย/บ้านใหม่ไชยมงคล/ทุ่งเสลี่ยม",
    "สุโขทัยโซน B": "ปณ.ศรีสำโรง/ศรีนคร/กงไกรลาศ/ปณ.บ้านสวน",
    "สุโขทัยโซน C": "ปณ.คีรีมาศ/บ้านด่านลานหอย/เมืองเก่า",
    "พิษณุโลกทีม 1": "ปจ.พิษณุโลก",
    "พิษณุโลกทีม 2": "ปจ.พิษณุโลก/อรัญญิก",
    "พิษณุโลกโซน A": "ปณ.บางกระทุ่ม/เนินกุ่ม/วัดพริก",
    "พิษณุโลกโซน B": "ปณ.นครไทย/ชาติตระการ",
    "พิษณุโลกโซน C": "ปณ.วังทอง/เนินมะปราง/แก่งโสภา",
    "พิษณุโลกโซน D": "ปณ.บางระกำ/ชุมแสงสงคราม",
    "พิษณุโลกโซน E": "ปณ.พรหมพิราม/วัดโบสถ์/หนองตม",
    "พิจิตร": "ปจ.พิจิตร/สากเหล็ก/หัวดง/วังทรายพูน",
    "พิจิตรโซน A": "ปณ.ตะพานหิน/ทับคล้อ/เขาทราย",
    "พิจิตรโซน B": "ปณ.สามง่าม/โพธิ์ประทับช้าง/ปณ.กำแพงดิน",
    "พิจิตรโซน C": "ปณ.โพธิ์ทะเล/บางมูลนาก/วังตะกู",
    "เพชรบูรณ์": "ปจ.เพชรบูรณ์/ท่าพล",
    "เพชรบูรณ์โซน A": "ปณ.หล่มสัก/หล่มเก่า/เขาค้อ/น้ำหนาว/แคมป์สน",
    "เพชรบูรณ์โซน B": "ปณ.หนองไผ่/นาเฉลียง/วังชมภู",
    "เพชรบูรณ์โซน C": "ปณ.บึงสามพัน/วิเชียรบุรี/ศรีเทพ/ปณ.พุเตย/วังพิกุล",
    "เพชรบูรณ์โซน D": "ปณ.วังโป่ง/ชนแดน/ดงขุย"
};

/* ── State ──────────────────────────────────────────────────── */
let branchDict = {}; // branchCode → { province, branchName, team }
let allLeads   = []; // parsed lead rows
let allVisits  = []; // parsed visit rows
let currentView = 'daily'; // 'daily' | 'cumulative'

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', init);

async function fetchWithCache(url, expiryMinutes = 5) {
    const cacheKey = 'dashboardData_v7';
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < expiryMinutes * 60 * 1000) {
                console.log("Using cached API data in report");
                return parsed.data;
            }
        } catch (e) {
            console.warn("Cache parse failed", e);
        }
    }
    
    console.log("Fetching fresh API data in report");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    
    if (data.status === 'success') {
        // Cleanup old dashboardData cache keys to prevent quota exceeded errors
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('dashboardData')) {
                localStorage.removeItem(k);
            }
        });

        localStorage.setItem(cacheKey, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));
    }
    return data;
}

async function init() {
    setDateToToday();

    try {
        const data = await fetchWithCache(API_URL);
        if (data.status === 'error') throw new Error(data.message);

        parseBranches(data.branches || []);
        
        // Use data.rawLeads (from "กรอกข้อมูล Lead") if available, fallback to data.leads (from "รางวัล")
        const leadsData = (data.rawLeads && data.rawLeads.length > 0) ? data.rawLeads : (data.leads || []);
        allLeads  = parseRows(leadsData, 'วันที่สร้าง');
        allVisits = parseRows(data.visits || [], 'วันที่');

        document.getElementById('report-loader').style.display  = 'none';
        document.getElementById('report-content').style.display = 'block';

        renderReport();
        setupEventListeners();

    } catch (err) {
        document.getElementById('report-loader').innerHTML =
            `<p class="text-orange" style="text-align:center;">เกิดข้อผิดพลาด: ${err.message}</p>`;
    }
}

/* ── Helpers: Parsing ───────────────────────────────────────── */
function parseBranches(rows) {
    rows.forEach(row => {
        const code = String(row['รหัสไปรษณีย์'] || '').trim();
        if (code) {
            branchDict[code] = {
                province:   String(row['จังหวัด']  || '-').trim(),
                branchName: String(row['ที่ทำการ'] || '-').trim(),
                team:       String(row['ทีม']       || '-').trim(),
            };
        }
    });
}

/**
 * Parse raw API rows into normalised objects.
 * @param {Object[]} rows
 * @param {string}   dateField - field name containing the date string
 */
function parseRows(rows, dateField) {
    return rows.map(row => {
        const branchCode = String(row['รหัสที่ทำการไปรษณีย์'] || row['รหัสไปรษณีย์'] || '').trim();
        const info       = branchDict[branchCode] || {
            province:   'ไม่ระบุ',
            branchName: String(row['ชื่อที่ทำการไปรษณีย์'] || 'ไม่ระบุ').trim(),
            team:       'ไม่ระบุ',
        };

        const dateStr = String(row['วันที่สร้าง'] || row['วันที่'] || row[dateField] || '').trim();
        const dateObj = parseAnyDate(dateStr);
        if (!dateObj) return null;

        return {
            dateObj,
            dateKey:    toDateKey(dateObj),
            province:   info.province,
            branchName: info.branchName,
            team:       info.team,
            branchCode,
            raw:        row,
        };
    }).filter(Boolean);
}

/** Parse any date strings including JS Dates and M/D/Y */
function parseAnyDate(dateStr) {
    if (!dateStr) return null;
    
    let jsDate = new Date(dateStr);
    
    if (isNaN(jsDate) && dateStr.includes('/')) {
        const parts = dateStr.split(' ')[0].split('/');
        if (parts.length >= 3) {
            let p0 = parseInt(parts[0], 10);
            let p1 = parseInt(parts[1], 10);
            let yStr = parts[2];
            let y = parseInt(yStr, 10);
            
            if (y > 2500) y -= 543;
            
            let d, m;
            if (p0 > 12) { d = p0; m = p1; } 
            else if (p1 > 12) { m = p0; d = p1; }
            else { m = p0; d = p1; } // Default M/D/Y
            
            jsDate = new Date(y, m - 1, d);
        }
    }
    
    if (isNaN(jsDate)) {
        // Handle Google Sheets stringified date like "Sat Apr 29 2569 00:00:00 GMT+0700"
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const match = dateStr.match(/([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})/);
        if (match) {
            const mIndex = months.indexOf(match[1]);
            if (mIndex !== -1) {
                let d = parseInt(match[2], 10);
                let y = parseInt(match[3], 10);
                if (y > 2500) y -= 543;
                jsDate = new Date(y, mIndex, d);
            }
        }
    }
    
    if (isNaN(jsDate)) return null;
    
    if (jsDate.getFullYear() > 2500) {
        jsDate.setFullYear(jsDate.getFullYear() - 543);
    }
    
    return jsDate;
}

function toDateKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/**
 * Determine lead type from the row.
 * Maps to one of: 'ecommerce' | 'inter' | 'fuze' | 'other'
 */
function detectLeadType(row) {
    const src = (row['ประเภทบริการ ลูกค้าสนใจ'] || row['ประเภท'] || row['ช่องทาง'] || row['ProductType'] || '').toLowerCase();
    if (src.includes('ecommerce') || src.includes('e-commerce') || src.includes('อีคอมเมิร์ซ') || src.includes('ems')) return 'ecommerce';
    if (src.includes('inter') || src.includes('ระหว่างประเทศ') || src.includes('ต่างประเทศ')) return 'inter';
    if (src.includes('fuze')) return 'fuze';
    return 'other'; // counted in total but not in a specific column
}

/**
 * Visit result: did the visit close a deal?
 * Returns true | false | null (unknown)
 */
function detectClosed(row) {
    const val = (row['ผลการเข้าพบ'] || row['ผลลัพธ์'] || row['ปิดการขาย'] || '').trim();
    if (!val) return null;
    if (val.includes('ปิด') && !val.includes('ไม่')) return true;
    if (val.includes('ไม่')) return false;
    return null;
}

/* ── Helpers: Province/Team ordering ───────────────────────── */
function provinceOrder(p) {
    const i = PROVINCE_ORDER.indexOf(p);
    return i === -1 ? 999 : i;
}

/* ── Date helpers ───────────────────────────────────────────── */
function setDateToToday() {
    const today = new Date();
    const key   = toDateKey(today);
    
    // Set single date
    const inputDate = document.getElementById('report-date');
    if (inputDate) inputDate.value = key;
    
    // Set date range (start date to 1st of month, end date to today)
    const startInput = document.getElementById('report-start-date');
    const endInput = document.getElementById('report-end-date');
    if (startInput) {
        startInput.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-01`;
    }
    if (endInput) {
        endInput.value = key;
    }
}

function getSelectedDateRange() {
    if (currentView === 'daily') {
        const val = document.getElementById('report-date').value;
        return { start: val, end: val };
    } else {
        const start = document.getElementById('report-start-date').value;
        const end = document.getElementById('report-end-date').value;
        return { start, end };
    }
}

function formatDateThai(key) {
    if (!key) return '-';
    const [y, m, d] = key.split('-').map(Number);
    return `${d} ${THAI_MONTHS[m-1]} ${y + 543}`;
}

/* ── View switching ─────────────────────────────────────────── */
function switchView(view) {
    currentView = view;
    document.getElementById('btn-daily').classList.toggle('active', view === 'daily');
    document.getElementById('btn-cumulative').classList.toggle('active', view === 'cumulative');
    
    if (view === 'daily') {
        document.getElementById('date-single-group').style.display = 'flex';
        document.getElementById('date-range-group').style.display = 'none';
    } else {
        document.getElementById('date-single-group').style.display = 'none';
        document.getElementById('date-range-group').style.display = 'flex';
        // Always reset to current month default when switching to cumulative
        setDateToToday();
    }
    
    renderReport();
}

function resetReport() {
    setDateToToday();
    renderReport();
}

/* ── Event listeners ────────────────────────────────────────── */
function setupEventListeners() {
    document.getElementById('report-date').addEventListener('change', renderReport);
    document.getElementById('report-start-date').addEventListener('change', renderReport);
    document.getElementById('report-end-date').addEventListener('change', renderReport);

    // Scroll-to-top
    window.addEventListener('scroll', () => {
        const btn = document.getElementById('scrollTopBtn');
        if (btn) btn.classList.toggle('show', window.scrollY > 300);
    });
}

/* ── Main Render ────────────────────────────────────────────── */
function renderReport() {
    const range = getSelectedDateRange();
    if (!range.start || !range.end) return;

    // ── Filter rows ──────────────────────────────────────────
    let leads, visits;
    if (currentView === 'daily') {
        leads  = allLeads.filter(r => r.dateKey === range.start);
        visits = allVisits.filter(r => r.dateKey === range.start);
    } else {
        leads  = allLeads.filter(r => r.dateKey >= range.start && r.dateKey <= range.end);
        visits = allVisits.filter(r => r.dateKey >= range.start && r.dateKey <= range.end);
    }

    // ── Build province-team-branch map ───────────────────────
    // Group: province → team → array of branch names
    const structure = buildStructure();

    // ── Aggregate data ───────────────────────────────────────
    // Key: `${province}||${team}`
    const agg = aggregateData(leads, visits);

    // ── Titles ───────────────────────────────────────────────
    let totalTeams = 0;
    Object.values(structure).forEach(t => totalTeams += Object.keys(t).length);
    
    document.getElementById('report-main-title').textContent =
        `สรุปการหา Lead และการเข้าพบลูกค้าของทีมขายในสังกัด ปข.6 (จำนวน ${totalTeams} ทีม)`;
    document.getElementById('report-sub-title').textContent =
        currentView === 'daily'
            ? `ประจำวันที่ ${formatDateThai(range.start)}`
            : `สะสมตั้งแต่วันที่ ${formatDateThai(range.start)} ถึง ${formatDateThai(range.end)}`;
    document.getElementById('team-count-badge').innerHTML =
        `<i class="fa-solid fa-users"></i> ${totalTeams} ทีม`;

    // ── Render table ─────────────────────────────────────────
    renderHeader();
    renderBody(structure, agg);
    renderFooter(agg);
}

/** Build province → team from branchDict */
function buildStructure() {
    const map = {};
    Object.entries(branchDict).forEach(([code, info]) => {
        const { province, team } = info;
        // Exclude empty teams or non-teams
        if (!province || province === '-' || !team || team === '-' || team.includes('ไม่มี')) return;
        
        if (!map[province]) map[province] = {};
        if (!map[province][team]) map[province][team] = true;
    });
    
    // Also inject hardcoded teams just in case they have no branches mapped yet
    Object.keys(TEAM_BRANCH_MAPPING).forEach(team => {
        const prov = getProvinceFromTeam(team);
        if (prov) {
            if (!map[prov]) map[prov] = {};
            map[prov][team] = true;
        }
    });
    
    return map;
}

function getProvinceFromTeam(team) {
    for (let p of PROVINCE_ORDER) {
        if (team.startsWith(p)) return p;
    }
    return null;
}

/**
 * Aggregate leads and visits by province-team key.
 */
function aggregateData(leads, visits) {
    const agg = {};

    function getEntry(province, team) {
        const k = `${province}||${team}`;
        if (!agg[k]) {
            agg[k] = {
                lead:  { ecommerce:0, inter:0, fuze:0, total:0 },
                visit: { ecommerce:0, inter:0, fuze:0, total:0 },
                closed: 0, notClosed: 0,
            };
        }
        return agg[k];
    }

    leads.forEach(r => {
        if (!r.team || r.team === '-' || r.team.includes('ไม่มี')) return;
        const e = getEntry(r.province, r.team);
        
        if (r.raw['e-Commerce'] !== undefined || r.raw['Fuze'] !== undefined) {
            const eCom = parseInt(r.raw['e-Commerce'] || 0, 10);
            const inter = parseInt(r.raw['บริการระหว่างประเทศ'] || 0, 10);
            const fuze = parseInt(r.raw['Fuze'] || 0, 10);
            
            e.lead.ecommerce += eCom;
            e.lead.inter += inter;
            e.lead.fuze += fuze;
            e.lead.total += (eCom + inter + fuze);
        } else {
            // Fallback for old data
            const lType = detectLeadType(r.raw);
            e.lead.total++;
            if (lType in e.lead) e.lead[lType]++;
        }
    });

    visits.forEach(r => {
        if (!r.team || r.team === '-' || r.team.includes('ไม่มี')) return;
        const e = getEntry(r.province, r.team);
        
        // Check if the row comes from the "กรอกข้อมูลเข้าพบ" sheet directly (has numeric columns)
        if (r.raw['e-Commerce'] !== undefined || r.raw['ปิดได้'] !== undefined || r.raw['Fuze'] !== undefined) {
            const eCom = parseInt(r.raw['e-Commerce'] || 0, 10);
            const inter = parseInt(r.raw['บริการระหว่างประเทศ'] || 0, 10);
            const fuze = parseInt(r.raw['Fuze'] || 0, 10);
            const closed = parseInt(r.raw['ปิดได้'] || 0, 10);
            const notClosed = parseInt(r.raw['ปิดไม่ได้'] || 0, 10);
            
            e.visit.ecommerce += eCom;
            e.visit.inter += inter;
            e.visit.fuze += fuze;
            e.visit.total += (eCom + inter + fuze);
            
            e.closed += closed;
            e.notClosed += notClosed;
        } else {
            // Fallback: If it came from the Lead sheet, count row-by-row
            e.visit.total++;
            const lType = detectLeadType(r.raw);
            if (lType in e.visit) e.visit[lType]++;
            const closedStatus = detectClosed(r.raw);
            if (closedStatus === true)  e.closed++;
            if (closedStatus === false) e.notClosed++;
        }
    });

    return agg;
}

/* ── Table Header ───────────────────────────────────────────── */
function renderHeader() {
    const thead = document.getElementById('report-thead');
    thead.innerHTML = `
        <tr>
            <th class="col-team" rowspan="2">ทีมสังกัด ปข.6/เขต</th>
            <th class="col-branch" rowspan="2">รายชื่อที่ทำการ</th>
            <th colspan="4" class="th-lead-group">Lead</th>
            <th colspan="4" class="th-visit-group">การเข้าพบลูกค้า</th>
            <th colspan="2" class="th-result-group">ผลการเข้าพบ</th>
        </tr>
        <tr>
            ${LEAD_TYPES.map(t => `<th class="th-lead-group">${t.label}</th>`).join('')}
            <th class="th-lead-group">รวม</th>
            ${LEAD_TYPES.map(t => `<th class="th-visit-group">${t.label}</th>`).join('')}
            <th class="th-visit-group">รวม</th>
            <th class="th-result-group">ปิดได้</th>
            <th class="th-result-group">ปิดไม่ได้</th>
        </tr>`;
}

/* ── Table Body ─────────────────────────────────────────────── */
function renderBody(structure, agg) {
    const tbody = document.getElementById('report-tbody');
    const rows  = [];

    const provinces = Object.keys(structure).sort((a, b) => provinceOrder(a) - provinceOrder(b));

    provinces.forEach(prov => {
        const teams = structure[prov];
        const teamNames = Object.keys(teams).sort();

        teamNames.forEach(team => {
            // Use hardcoded mapping if available, otherwise just fallback
            const branchNamesStr = TEAM_BRANCH_MAPPING[team] || "-";
            const key  = `${prov}||${team}`;
            const data = agg[key] || emptyEntry();

            rows.push(`
                <tr>
                    <td class="col-team">${team}</td>
                    <td class="col-branch">${branchNamesStr}</td>
                    ${leadCols(data.lead)}
                    ${visitCols(data.visit)}
                    <td class="${data.closed    > 0 ? 'cell-close-yes' : 'cell-zero'}">${data.closed    || 0}</td>
                    <td class="${data.notClosed > 0 ? 'cell-close-no'  : 'cell-zero'}">${data.notClosed || 0}</td>
                </tr>`);
        });
    });

    tbody.innerHTML = rows.join('') || `<tr><td colspan="12" class="no-data-msg">ไม่พบข้อมูลในช่วงเวลาที่เลือก</td></tr>`;
}

/* ── Table Footer (Totals) ──────────────────────────────────── */
function renderFooter(agg) {
    const totals = { lead: emptyTypeObj(), visit: emptyTypeObj(), closed: 0, notClosed: 0 };
    Object.values(agg).forEach(e => {
        ['ecommerce','inter','fuze','total'].forEach(k => {
            totals.lead[k]  += e.lead[k]  || 0;
            totals.visit[k] += e.visit[k] || 0;
        });
        totals.closed    += e.closed    || 0;
        totals.notClosed += e.notClosed || 0;
    });

    document.getElementById('report-tfoot').innerHTML = `
        <tr>
            <td class="col-team cell-grand-total" colspan="2">รวมทั้งสิ้น</td>
            ${leadCols(totals.lead,  true)}
            ${visitCols(totals.visit, true)}
            <td class="cell-grand-total">${totals.closed}</td>
            <td class="cell-grand-total">${totals.notClosed}</td>
        </tr>`;
}

/* ── Cell helpers ───────────────────────────────────────────── */
function emptyEntry() {
    return { lead: emptyTypeObj(), visit: emptyTypeObj(), closed: 0, notClosed: 0 };
}

function emptyTypeObj() {
    return { ecommerce: 0, inter: 0, fuze: 0, total: 0 };
}

function leadCols(d, isFooter = false) {
    const base = isFooter ? 'cell-grand-total' : '';
    return LEAD_TYPES.map(t => {
        const v = d[t.key] || 0;
        const cls = base || (v > 0 ? 'cell-total-lead' : 'cell-zero');
        return `<td class="${cls}">${v || 0}</td>`;
    }).join('') +
    `<td class="${base || (d.total > 0 ? 'cell-total-lead' : 'cell-zero')}">${d.total || 0}</td>`;
}

function visitCols(d, isFooter = false) {
    const base = isFooter ? 'cell-grand-total' : '';
    return LEAD_TYPES.map(t => {
        const v = d[t.key] || 0;
        const cls = base || (v > 0 ? 'cell-total-visit' : 'cell-zero');
        return `<td class="${cls}">${v || 0}</td>`;
    }).join('') +
    `<td class="${base || (d.total > 0 ? 'cell-total-visit' : 'cell-zero')}">${d.total || 0}</td>`;
}

/* ── Screenshot ─────────────────────────────────────────────── */
async function captureReport() {
    const el  = document.getElementById('report-capture-area');
    const btn = document.querySelector('.report-capture-btn');
    if (btn) btn.style.visibility = 'hidden';

    try {
        const canvas = await html2canvas(el, { backgroundColor:'#fff', scale:2, useCORS:true, logging:false });
        if (btn) btn.style.visibility = '';
        const link = document.createElement('a');
        const sub  = document.getElementById('report-sub-title').textContent.replace('ประจำวันที่ ','').replace('สะสมถึงวันที่ ','');
        link.download = `Lead_Report_${currentView}_${sub}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch {
        if (btn) btn.style.visibility = '';
        alert('ไม่สามารถบันทึกภาพได้');
    }
}
