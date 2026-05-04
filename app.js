// ใส่ URL ของ Google Apps Script Web App ที่ได้จากการ Deploy ที่นี่
const API_URL = 'https://script.google.com/macros/s/AKfycbyfbWtEkj7c9ImlU4z3izMX5HeH1DFum061ZjJQjIthlKJ3PMwHReN7stwvxveCRd1TUQ/exec';

// State
let branchDict = {}; // branchCode -> { province, branchName, team }
let rawLeads = []; // All processed leads
let filteredLeads = [];

/* ── Fetch API with Cache ───────────────────────────────────── */
async function fetchWithCache(url, expiryMinutes = 5) {
    const cacheKey = 'dashboardData_v7';
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < expiryMinutes * 60 * 1000) {
                console.log("Using cached API data");
                return parsed.data;
            }
        } catch (e) {
            console.warn("Cache parse failed", e);
        }
    }
    
    console.log("Fetching fresh API data");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
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

/* ── Utilities ──────────────────────────────────────────────── */
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
            else { m = p0; d = p1; }
            
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

// Filters state
let currentFilters = {
    month: 'all',
    province: 'all',
    team: 'all',
    branch: 'all'
};

// Thai Months
const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

// Custom Province Order
const PROVINCE_ORDER = [
    "นครสวรรค์", "อุทัยธานี", "กำแพงเพชร", "ตาก", 
    "สุโขทัย", "พิษณุโลก", "พิจิตร", "เพชรบูรณ์"
];

// Thai Public Holidays (official government holidays)
const THAI_HOLIDAYS = new Set([
    '2025-01-01', '2025-01-02', '2025-02-12', '2025-04-06', '2025-04-07', '2025-04-13', '2025-04-14', '2025-04-15', '2025-04-16', '2025-05-01', '2025-05-04', '2025-05-05', '2025-05-09', '2025-05-11', '2025-05-12', '2025-06-02', '2025-06-03', '2025-07-10', '2025-07-11', '2025-07-28', '2025-08-11', '2025-08-12', '2025-10-13', '2025-10-23', '2025-12-05', '2025-12-10', '2025-12-31',
    '2026-01-01', '2026-01-02', '2026-03-03', '2026-04-06', '2026-04-13', '2026-04-14', '2026-04-15', '2026-05-01', '2026-05-04', '2026-05-13', '2026-05-31', '2026-06-01', '2026-06-03', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-12', '2026-10-13', '2026-10-23', '2026-12-05', '2026-12-07', '2026-12-10', '2026-12-31',
]);

function isNonWorkingDay(year, month, day) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (THAI_HOLIDAYS.has(dateKey)) return 'holiday';
    const dow = new Date(year, month - 1, day).getDay();
    if (dow === 0 || dow === 6) return 'weekend';
    return false;
}

function getProvinceOrderIndex(province) {
    const idx = PROVINCE_ORDER.indexOf(province);
    return idx === -1 ? 999 : idx;
}

function getBranchesSubtitle(filterKey, filterType) {
    const branches = new Set();
    Object.values(branchDict).forEach(b => {
        if (b[filterType] === filterKey && b.branchName && b.branchName !== '-') {
            branches.add(b.branchName);
        }
    });
    
    if (branches.size === 0) return '';
    
    if (filterType === 'province') {
        return `<br><small class="text-muted" style="font-size: 0.8rem;">(${branches.size} ที่ทำการ)</small>`;
    } else {
        return `<br><small class="text-muted" style="font-size: 0.8rem;">(${Array.from(branches).join(', ')})</small>`;
    }
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (API_URL === 'ใส่_URL_WEB_APP_ที่นี่') {
        document.getElementById('loader').innerHTML = `<p class="text-orange" style="text-align:center;">กรุณาใส่ API_URL ของ Google Apps Script ในไฟล์ app.js ก่อนใช้งาน</p>`;
        return;
    }

    try {
        const data = await fetchWithCache(API_URL);
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }

        parseBranches(data.branches);
        parseLeads(data.leads);

        populateMonthFilter();
        
        const months = getAvailableMonths();
        if (months.length > 0) {
            currentFilters.month = months[0].value;
            document.getElementById('filter-month').value = currentFilters.month;
        }

        updateFilterDropdowns('init');
        applyFilters();
        setupEventListeners();

        document.getElementById('loader').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
    } catch (error) {
        console.error("Error initializing dashboard:", error);
        document.getElementById('loader').innerHTML = `<p class="text-orange" style="text-align:center;">เกิดข้อผิดพลาดในการโหลดข้อมูล: <br>${error.message}</p>`;
    }
}

function parseBranches(branchesData) {
    branchesData.forEach(row => {
        const code = String(row['รหัสไปรษณีย์'] || '').trim();
        if (code && code !== '') {
            branchDict[code] = {
                province: String(row['จังหวัด'] || '-').trim(),
                branchName: String(row['ที่ทำการ'] || '-').trim(),
                team: String(row['ทีม'] || '-').trim()
            };
        }
    });
}

function parseLeads(leadsData) {
    rawLeads = [];
    const seenLeads = new Set(); // To track unique company names per day
    const TEAM_BRANCH_MAPPING = {
        "นครสวรรค์ทีม 1": "ปจ.นครสวรรค์",
        "นครสวรรค์ทีม 2": "ปณ.สวรรค์วิถี/จิรประวัติ/ปณ.หนองเบน/คปณ.บิ๊กซี นครสวรรค์",
        "นครสวรรค์โซน A": "ปณ.ชุมแสง/หนองบัว/ทับกฤช",
        "นครสวรรค์โซน B": "ปณ.พยุหะคีรี/โกรกพระ",
        "นครสวรรค์โซน C": "ปณ.ตาคลี/ตากฟ้า/ช่องแค/จันเสน",
        "นครสวรรค์โซน D": "ปณ.ลาดยาว/แม่วงก์",
        "นครสวรรค์โซน E": "ปณ.ท่าตะโก/ไพศาลี",
        "นครสวรรค์โซน F": "ปณ.บรรพตพิสัย/เก้าเลี้ยว",
        "อุทัยธานี": "ปจ.อุทัยธานี/ปณ.หนองขาหย่าง",
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

    leadsData.forEach(row => {
        const branchCode = String(row['รหัสที่ทำการไปรษณีย์'] || row['รหัสไปรษณีย์'] || '').trim();
        let branchInfo = branchDict[branchCode];
        
        let bName = String(row['สาขา'] || row['ชื่อที่ทำการ'] || row['ชื่อที่ทำการไปรษณีย์'] || '').trim();
        let foundTeam = '';
        if (!branchInfo && bName) {
            for (const [t, bStr] of Object.entries(TEAM_BRANCH_MAPPING)) {
                if (bStr.includes(bName)) {
                    foundTeam = t;
                    break;
                }
            }
        }
        
        if (!branchInfo) {
            branchInfo = {
                province: 'ไม่ระบุ',
                branchName: bName || 'ไม่ระบุ',
                team: foundTeam || 'ไม่ระบุ'
            };
        }

        let dateStr = row['วันที่สร้าง'] || row['วันที่'] || '';
        let jsDate = parseAnyDate(dateStr);
        let monthVal = '';
        let yearVal = '';
        let formattedDateStr = '';

        if (jsDate) {
            const y = jsDate.getFullYear();
            const m = jsDate.getMonth() + 1;
            const d = jsDate.getDate();
            monthVal = `${y}-${m.toString().padStart(2, '0')}`;
            yearVal = y;
            formattedDateStr = `${d}/${m}/${y + 543}`;
            const dateKey = `${yearVal}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
            
            // Deduplicate by Date + Company Name
            const companyName = String(row['บริษัท / บัญชี'] || row['บริษัท'] || '').trim();
            if (companyName && companyName !== '-' && companyName !== 'ไม่ระบุ') {
                const uniqueKey = `${dateKey}_${companyName}`;
                if (seenLeads.has(uniqueKey)) {
                    return; // Skip duplicate
                }
                seenLeads.add(uniqueKey);
            }
            
            rawLeads.push({
                branchCode: branchCode,
                province: branchInfo.province,
                team: branchInfo.team,
                branchName: branchInfo.branchName,
                month: monthVal,
                year: yearVal,
                dateKey: `${yearVal}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`,
                dateObj: jsDate,
                formattedDate: formattedDateStr,
                employee: row['พนักงาน'] || 'ไม่ระบุ',
                service: row['ประเภทบริการ ลูกค้าสนใจ'] || row['ประเภทบริการ'] || '-',
                result: row['ผลการเข้าพบ'] || '-'
            });
        }
    });
}

function getAvailableMonths() {
    const monthsSet = new Set();
    rawLeads.forEach(lead => {
        if (lead.month) monthsSet.add(lead.month);
    });
    
    return Array.from(monthsSet)
        .sort((a, b) => b.localeCompare(a))
        .map(m => {
            const [y, mo] = m.split('-');
            return { value: m, label: `${THAI_MONTHS[parseInt(mo)-1]} ${parseInt(y)+543}` };
        });
}

function populateMonthFilter() {
    const monthSelect = document.getElementById('filter-month');
    monthSelect.innerHTML = '<option value="all">ทุกเดือน</option>';
    const months = getAvailableMonths();
    months.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.value;
        opt.textContent = m.label;
        monthSelect.appendChild(opt);
    });
}

function updateFilterDropdowns(changedKey = null) {
    let validProvinces = new Set();
    let validTeams = new Set();
    let validBranches = new Set();

    Object.values(branchDict).forEach(b => {
        const p = b.province || '-';
        const t = b.team || '-';
        const name = b.branchName || '-';
        
        if (p !== '-') validProvinces.add(p);
        
        // Teams: Only show teams in the selected province
        if (currentFilters.province === 'all' || currentFilters.province === p) {
            if (t !== '-') validTeams.add(t);
        }
        
        // Branches: Only show branches in the selected team & province
        const matchProv = (currentFilters.province === 'all' || currentFilters.province === p);
        const matchTeam = (currentFilters.team === 'all' || currentFilters.team === t);
        if (matchProv && matchTeam) {
            if (name !== '-') validBranches.add(name);
        }
    });

    if (!changedKey || changedKey === 'init') {
        populateSelect('filter-province', Array.from(validProvinces).sort((a,b) => getProvinceOrderIndex(a) - getProvinceOrderIndex(b)));
    }
    
    if (changedKey === 'province' || changedKey === 'init') {
        populateSelect('filter-team', Array.from(validTeams).sort());
        document.getElementById('filter-team').value = currentFilters.team;
    }
    
    if (changedKey === 'province' || changedKey === 'team' || changedKey === 'init') {
        populateSelect('filter-branch', Array.from(validBranches).sort());
        document.getElementById('filter-branch').value = currentFilters.branch;
    }
}

function populateSelect(id, items) {
    const select = document.getElementById(id);
    select.innerHTML = '<option value="all">ทั้งหมด</option>';
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
    });
}

function setupEventListeners() {
    ['month', 'province', 'team', 'branch'].forEach(key => {
        const el = document.getElementById(`filter-${key}`);
        el.addEventListener('change', (e) => {
            currentFilters[key] = e.target.value;
            if (key === 'province') {
                currentFilters.team = 'all';
                currentFilters.branch = 'all';
                updateFilterDropdowns('province');
            } else if (key === 'team') {
                currentFilters.branch = 'all';
                updateFilterDropdowns('team');
            }
            applyFilters();
        });
    });

    // Reset Filters
    document.getElementById('reset-filters').addEventListener('click', () => {
        const months = getAvailableMonths();
        currentFilters.month = months.length > 0 ? months[0].value : 'all';
        currentFilters.province = 'all';
        currentFilters.team = 'all';
        currentFilters.branch = 'all';
        
        document.getElementById('filter-month').value = currentFilters.month;
        updateFilterDropdowns('init');
        
        applyFilters();
    });

    // Scroll to Top
    const scrollBtn = document.getElementById('scroll-top');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollBtn.classList.add('show');
        } else {
            scrollBtn.classList.remove('show');
        }
    });

    scrollBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function applyFilters() {
    filteredLeads = rawLeads.filter(lead => {
        if (currentFilters.month !== 'all' && lead.month !== currentFilters.month) return false;
        if (currentFilters.province !== 'all' && lead.province !== currentFilters.province) return false;
        if (currentFilters.team !== 'all' && lead.team !== currentFilters.team) return false;
        if (currentFilters.branch !== 'all' && lead.branchName !== currentFilters.branch) return false;
        return true;
    });

    updateDashboard();
}

function updateDashboard() {
    renderTop3();
    renderIronDiscipline();
    renderSummary();
    renderDailyTable();
}

function renderTop3() {
    const container = document.getElementById('top3-container');
    container.innerHTML = '';

    if (currentFilters.month === 'all') {
        container.innerHTML = '<div class="no-winner">กรุณาเลือกเดือนเพื่อดูรางวัลนี้</div>';
        return;
    }

    // Set month label on the shared frame header
    const monthLabel = document.getElementById('awards-month-label');
    if (monthLabel) monthLabel.textContent = formatMonthThai(currentFilters.month);

    // Group by Team and aggregate branches
    const teamStats = {};
    filteredLeads.forEach(lead => {
        if (!lead.team || lead.team === 'ไม่ระบุ' || lead.team === '-') return;
        
        if (!teamStats[lead.team]) {
            teamStats[lead.team] = { count: 0, branches: new Set() };
        }
        teamStats[lead.team].count++;
        if (lead.branchName && lead.branchName !== '-') {
            teamStats[lead.team].branches.add(lead.branchName);
        }
    });

    const sortedTeams = Object.entries(teamStats)
        .map(([team, data]) => ({ team, count: data.count, branches: Array.from(data.branches) }))
        .sort((a, b) => b.count - a.count);

    const top3 = sortedTeams.slice(0, 3);

    if (top3.length === 0) {
        container.innerHTML = '<div class="no-winner">ไม่มีข้อมูลในเดือนที่เลือก</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    top3.forEach((t, index) => {
        const item = document.createElement('div');
        item.className = 'winner-item';
        item.innerHTML = `
            <div class="winner-info">
                <div class="winner-rank rank-${index + 1}">${index + 1}</div>
                <div class="winner-details">
                    <h4>ทีม: ${t.team}</h4>
                    <span>ที่ทำการ: ${t.branches.join(', ') || '-'}</span>
                </div>
            </div>
            <div class="winner-score">${t.count} Lead</div>
        `;
        fragment.appendChild(item);
    });
    container.appendChild(fragment);
}

function getWorkingDaysInMonth(year, month) {
    const workingDays = [];
    const date = new Date(year, month - 1, 1);
    while (date.getMonth() === month - 1) {
        const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
        const dow = date.getDay();
        // Exclude weekends and public holidays
        if (dow !== 0 && dow !== 6 && !THAI_HOLIDAYS.has(dateKey)) {
            workingDays.push(dateKey);
        }
        date.setDate(date.getDate() + 1);
    }
    return workingDays;
}

// Helper: Format month name in Thai
function formatMonthThai(monthVal) {
    if (!monthVal || monthVal === 'all') return '';
    const [y, m] = monthVal.split('-');
    const MONTHS_TH = ['', 'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `ประจำเดือน ${MONTHS_TH[parseInt(m)]} ${parseInt(y) + 543}`;
}

function renderIronDiscipline() {
    const container = document.getElementById('iron-discipline-container');
    container.innerHTML = '';

    if (currentFilters.month === 'all') {
        container.innerHTML = '<div class="no-winner">กรุณาเลือกเดือนเพื่อดูรางวัลนี้</div>';
        return;
    }

    // Month label is shared — updated by renderTop3, no need to set here

    const [year, month] = currentFilters.month.split('-');
    const workingDays = getWorkingDaysInMonth(parseInt(year), parseInt(month));
    
    // Check leads per team per working day
    // Structure: team -> { dateStr: count }
    const teamDailyCounts = {};
    const teamBranches = {};

    filteredLeads.forEach(lead => {
        if (!lead.team || lead.team === 'ไม่ระบุ' || lead.team === '-') return;
        
        // Use local date to avoid UTC shift bug
        const d = lead.dateObj;
        const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        
        // Only count leads on actual working days
        if (!workingDays.includes(dateKey)) return;
        
        if (!teamDailyCounts[lead.team]) {
            teamDailyCounts[lead.team] = {};
            teamBranches[lead.team] = new Set();
        }
        
        if (!teamDailyCounts[lead.team][dateKey]) {
            teamDailyCounts[lead.team][dateKey] = 0;
        }
        teamDailyCounts[lead.team][dateKey]++;
        
        if (lead.branchName && lead.branchName !== '-') {
            teamBranches[lead.team].add(lead.branchName);
        }
    });

    const ironTeams = [];
    Object.keys(teamDailyCounts).forEach(team => {
        let isIron = true;
        for (const wd of workingDays) {
            if (!teamDailyCounts[team][wd] || teamDailyCounts[team][wd] < 1) {
                isIron = false;
                break;
            }
        }
        if (isIron) {
            ironTeams.push({ team, branches: Array.from(teamBranches[team]) });
        }
    });

    if (ironTeams.length === 0) {
        // Show near-miss teams as a subtle footnote
        const teamMissed = Object.entries(teamDailyCounts).map(([team, dailyMap]) => {
            const missingDays = workingDays.filter(wd => !dailyMap[wd] || dailyMap[wd] < 1);
            return { team, missed: missingDays.length };
        }).filter(t => t.missed > 0 && t.missed <= workingDays.length)
          .sort((a, b) => a.missed - b.missed)
          .slice(0, 3);

        let nearMissHtml = '';
        if (teamMissed.length > 0) {
            const rows = teamMissed.map((t, i) =>
                `<div class="near-miss-row"><span class="near-miss-num">${i+1}.</span> <span class="near-miss-team">${t.team}</span> <span class="near-miss-gap">ขาดอีก ${t.missed} วัน</span></div>`
            ).join('');
            nearMissHtml = `
                <div class="no-winner-banner">
                    <span class="no-winner-icon">⚠️</span>
                    <span>ยังไม่มีทีมที่ผ่านเกณฑ์ในเดือนนี้</span>
                </div>
                <div class="near-miss-block">
                    <div class="near-miss-label">📅 ทีมที่ใกล้ที่สุด:</div>
                    ${rows}
                </div>`;
        } else {
            nearMissHtml = `<div class="no-winner-banner"><span class="no-winner-icon">⚠️</span><span>ยังไม่มีทีมที่ผ่านเกณฑ์วินัยเหล็กในเดือนนี้</span></div>`;
        }
        container.innerHTML = nearMissHtml;
        return;
    }

    const fragment = document.createDocumentFragment();
    ironTeams.forEach(t => {
        const item = document.createElement('div');
        item.className = 'winner-item';
        item.innerHTML = `
            <div class="winner-info">
                <div class="winner-rank rank-iron"><i class="fa-solid fa-check"></i></div>
                <div class="winner-details">
                    <h4>ทีม: ${t.team}</h4>
                    <span>ที่ทำการ: ${t.branches.join(', ') || '-'}</span>
                </div>
            </div>
            <div class="winner-score" style="font-size: 0.9rem; color: var(--text-muted);">สำเร็จ 100%</div>
        `;
        fragment.appendChild(item);
    });
    container.appendChild(fragment);
}

function renderSummary() {
    const provStats = {};
    const teamStats = {};

    filteredLeads.forEach(lead => {
        const p = lead.province || 'ไม่ระบุ';
        const t = lead.team || 'ไม่ระบุ';
        
        provStats[p] = (provStats[p] || 0) + 1;
        teamStats[t] = (teamStats[t] || 0) + 1;
    });

    const renderTableBody = (id, dataObj, isProvince = false) => {
        const tbody = document.querySelector(`#${id} tbody`);
        tbody.innerHTML = '';
        
        let sorted;
        if (isProvince) {
            sorted = Object.entries(dataObj).sort((a, b) => getProvinceOrderIndex(a[0]) - getProvinceOrderIndex(b[0]));
        } else {
            sorted = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
        }

        if (sorted.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center text-muted">ไม่มีข้อมูล</td></tr>';
            return;
        }

        let totalVal = 0;
        const fragment = document.createDocumentFragment();
        sorted.forEach(([key, val]) => {
            totalVal += val;
            const tr = document.createElement('tr');
            const subtitle = getBranchesSubtitle(key, isProvince ? 'province' : 'team');
            const displayName = `<strong style="font-size: 1.05rem; color: var(--text-dark);">${key}</strong>`;
            tr.innerHTML = `<td>${displayName}${subtitle}</td><td class="text-center text-primary" style="vertical-align: middle;">${val}</td>`;
            fragment.appendChild(tr);
        });
        
        if (isProvince) {
            const trTotal = document.createElement('tr');
            trTotal.innerHTML = `<td><strong>รวมทั้งหมด</strong></td><td class="text-center text-primary" style="vertical-align: middle;"><strong>${totalVal}</strong></td>`;
            fragment.appendChild(trTotal);
        }
        
        tbody.appendChild(fragment);
    };

    renderTableBody('summary-province-table', provStats, true);
    renderTableBody('summary-team-table', teamStats, false);

    // Sync heights so Team table matches Province table
    setTimeout(() => {
        const provWrapper = document.getElementById('summary-province-table').closest('.table-responsive');
        const teamWrapper = document.getElementById('team-table-wrapper');
        
        if (provWrapper && teamWrapper) {
            teamWrapper.style.maxHeight = provWrapper.clientHeight + 'px';
            teamWrapper.style.overflowY = 'auto';
            
            // Refresh button listener
            const refreshBtn = document.querySelector('.btn-refresh');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    refreshBtn.style.opacity = '0.5';
                    localStorage.removeItem('dashboardData_v6');
                    location.reload();
                });
            }

            // Make team headers sticky so they stay visible when scrolling
            const teamHeaders = document.querySelectorAll('#summary-team-table th');
            teamHeaders.forEach(th => {
                th.style.position = 'sticky';
                th.style.top = '0';
                th.style.zIndex = '5';
                th.style.background = '#f9f6fd'; // Solid color matching the 5% purple over white
            });
        }
    }, 50);
}

function renderDailyTable() {
    const table = document.getElementById('daily-detail-table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    const tfoot = document.getElementById('daily-detail-tfoot');
    
    thead.innerHTML = '';
    tbody.innerHTML = '';
    if (tfoot) tfoot.innerHTML = '';

    if (currentFilters.month === 'all') {
        tbody.innerHTML = '<tr><td class="text-center text-muted" style="padding: 30px;">กรุณาเลือกเดือนในตัวกรองด้านบนเพื่อดูตารางสถิติรายวัน</td></tr>';
        return;
    }

    const [yearStr, monthStr] = currentFilters.month.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();


    let tr1 = `<tr>
        <th rowspan="2" class="col-province" style="width: 120px; min-width: 120px; max-width: 120px; text-align: left;">จังหวัด</th>
        <th rowspan="2" class="col-team" style="width: 220px; min-width: 220px; max-width: 220px; text-align: left;">ทีม</th>
        <th colspan="${daysInMonth}" class="text-center">วันที่</th>
        <th rowspan="2" class="text-center" style="min-width: 60px;">รวม</th>
    </tr>`;
    let tr2 = `<tr>`;
    for (let i = 1; i <= daysInMonth; i++) {
        const dayType = isNonWorkingDay(year, month, i);
        const cls = dayType === 'holiday' ? 'bg-holiday' : dayType === 'weekend' ? 'bg-weekend' : '';
        tr2 += `<th class="text-center ${cls}" style="min-width: 35px; padding: 8px 5px;">${i}</th>`;
    }
    tr2 += `</tr>`;
    thead.innerHTML = tr1 + tr2;

    const teamsMap = {};
    Object.values(branchDict).forEach(b => {
        const p = b.province || '-';
        const t = b.team || '-';
        const name = b.branchName || '-';

        if (currentFilters.province !== 'all' && currentFilters.province !== p) return;
        if (currentFilters.team !== 'all' && currentFilters.team !== t) return;
        if (currentFilters.branch !== 'all' && currentFilters.branch !== name) return;

        if (p === '-' || t === '-') return;

        const key = `${p}_${t}`;
        if (!teamsMap[key]) {
            teamsMap[key] = {
                province: p,
                team: t,
                branches: new Set(),
                dailyCounts: new Array(daysInMonth).fill(0),
                total: 0
            };
        }
        if (name !== '-') teamsMap[key].branches.add(name);
    });

    filteredLeads.forEach(lead => {
        const p = lead.province || '-';
        const t = lead.team || '-';
        const key = `${p}_${t}`;
        
        if (teamsMap[key] && lead.dateObj) {
            const lYear = lead.dateObj.getFullYear();
            const lMonth = lead.dateObj.getMonth() + 1;
            if (lYear === year && lMonth === month) {
                const day = lead.dateObj.getDate();
                if (day >= 1 && day <= daysInMonth) {
                    teamsMap[key].dailyCounts[day - 1]++;
                    teamsMap[key].total++;
                }
            }
        }
    });

    const sortedTeams = Object.values(teamsMap).sort((a, b) => {
        const pDiff = getProvinceOrderIndex(a.province) - getProvinceOrderIndex(b.province);
        if (pDiff !== 0) return pDiff;
        return a.team.localeCompare(b.team);
    });

    if (sortedTeams.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${daysInMonth + 3}" class="text-center text-muted">ไม่พบข้อมูล</td></tr>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    let colTotals = new Array(daysInMonth).fill(0);
    let grandTotal = 0;

    sortedTeams.forEach(tData => {
        const tr = document.createElement('tr');
        
        let html = `<td class="col-province">${tData.province}</td>`;
        html += `<td class="col-team">${tData.team}</td>`;

        for (let i = 0; i < daysInMonth; i++) {
            const count = tData.dailyCounts[i];
            colTotals[i] += count;
            
            const dayType = isNonWorkingDay(year, month, i + 1);
            const cls = dayType === 'holiday' ? 'bg-holiday' : dayType === 'weekend' ? 'bg-weekend' : '';
            const val = count > 0 ? count : '';
            html += `<td class="text-center ${cls}">${val}</td>`;
        }

        grandTotal += tData.total;
        html += `<td class="text-center text-primary" style="font-weight: 600;">${tData.total}</td>`;
        tr.innerHTML = html;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);

    // Build footer
    if (tfoot) {
        let ftHtml = `<tr>
            <td colspan="2" class="text-center" style="font-weight: 700; background-color: var(--primary); color: white; position: sticky; left: 0; z-index: 10;">รวมทั้งสิ้น</td>`;
        for (let i = 0; i < daysInMonth; i++) {
            const dayType = isNonWorkingDay(year, month, i + 1);
            const cls = dayType === 'holiday' ? 'bg-holiday' : dayType === 'weekend' ? 'bg-weekend' : '';
            const val = colTotals[i] > 0 ? colTotals[i] : '';
            ftHtml += `<td class="text-center ${cls}" style="font-weight: 700; background-color: var(--primary); color: white;">${val}</td>`;
        }
        ftHtml += `<td class="text-center" style="font-weight: 700; background-color: var(--primary); color: white;">${grandTotal}</td></tr>`;
        tfoot.innerHTML = ftHtml;
    }
}

// Capture award card as image
function captureAward(targetId) {
    // Support both class-based (old) and id-based targets
    const el = document.getElementById(targetId) || document.querySelector(`.${targetId}`);
    if (!el) return;

    // Temporarily hide capture button during screenshot
    const btn = el.querySelector('.capture-btn');
    if (btn) btn.style.visibility = 'hidden';

    html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false
    }).then(canvas => {
        if (btn) btn.style.visibility = '';
        const link = document.createElement('a');
        const monthLabel = document.getElementById('awards-month-label');
        const monthText = monthLabel ? monthLabel.textContent.replace('ประจำเดือน ', '').trim() : '';
        link.download = `Lead_Award_รางวัล_${monthText}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }).catch(() => {
        if (btn) btn.style.visibility = '';
        alert('ไม่สามารถบันทึกภาพได้ กรุณาลองใหม่อีกครั้ง');
    });
}
