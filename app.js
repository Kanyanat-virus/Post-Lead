// ใส่ URL ของ Google Apps Script Web App ที่ได้จากการ Deploy ที่นี่
const API_URL = 'https://script.google.com/macros/s/AKfycbxoqojOsl7g0qdNEaKTXxXNsjpdDpl43jv5W2zJ1LMdMQ5p1F3aJbaLU69vvm8pPYj12A/exec';

// State
let branchDict = {}; // branchCode -> { province, branchName, team }
let rawLeads = []; // All processed leads
let filteredLeads = [];

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
// Format: 'YYYY-MM-DD'
const THAI_HOLIDAYS = new Set([
    // 2025 (BE 2568)
    '2025-01-01', '2025-01-02', // ปีใหม่ + วันหยุดพิเศษ
    '2025-02-12', // มาฆบูชา
    '2025-04-06', '2025-04-07', // วันจักรี
    '2025-04-13', '2025-04-14', '2025-04-15', '2025-04-16', // สงกรานต์
    '2025-05-01', // วันแรงงาน
    '2025-05-04', '2025-05-05', // ฉัตรมงคล + ชดเชย
    '2025-05-09', // วันพืชมงคล
    '2025-05-11', '2025-05-12', // วิสาขบูชา + ชดเชย
    '2025-06-02', '2025-06-03', // วันหยุดพิเศษ + วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ
    '2025-07-10', '2025-07-11', // อาสาฬบูชา + เข้าพรรษา
    '2025-07-28', // วันเฉลิมพระชนมพรรษา ร.10
    '2025-08-11', '2025-08-12', // วันหยุดพิเศษ + วันแม่
    '2025-10-13', // วันนวมินทรมหาราช
    '2025-10-23', // วันปิยมหาราช
    '2025-12-05', // วันชาติ / วันพ่อ
    '2025-12-10', // วันรัฐธรรมนูญ
    '2025-12-31', // วันสิ้นปี
    // 2026 (BE 2569)
    '2026-01-01', '2026-01-02', // ปีใหม่ + วันหยุดพิเศษ
    '2026-03-03', // มาฆบูชา
    '2026-04-06', // วันจักรี
    '2026-04-13', '2026-04-14', '2026-04-15', // สงกรานต์
    '2026-05-01', // วันแรงงาน
    '2026-05-04', // ฉัตรมงคล
    '2026-05-13', // วันพืชมงคล
    '2026-05-31', '2026-06-01', // วิสาขบูชา + ชดเชย
    '2026-06-03', // วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ
    '2026-07-28', // วันเฉลิมพระชนมพรรษา ร.10
    '2026-07-29', '2026-07-30', // อาสาฬบูชา + เข้าพรรษา
    '2026-08-12', // วันแม่
    '2026-10-13', // วันนวมินทรมหาราช
    '2026-10-23', // วันปิยมหาราช
    '2026-12-05', '2026-12-07', // วันชาติ + ชดเชย
    '2026-12-10', // วันรัฐธรรมนูญ
    '2026-12-31', // วันสิ้นปี
]);

// Helper: Check if a day is a non-working day (weekend or public holiday)
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

// Helper: Get formatted subtitle for branches
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
        const response = await fetch(API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status === 'error') {
            throw new Error(data.message);
        }

        parseBranches(data.branches);
        parseLeads(data.leads);

        populateMonthFilter();
        
        // Auto-select the latest month if available
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
        const code = row['รหัสไปรษณีย์'];
        if (code && code !== '') {
            branchDict[code] = {
                province: row['จังหวัด'] || '-',
                branchName: row['ที่ทำการ'] || '-',
                team: row['ทีม'] || '-'
            };
        }
    });
}

function parseLeads(leadsData) {
    rawLeads = leadsData.map(row => {
        const dateStr = row['วันที่สร้าง']; // e.g. 29/4/2569
        const branchCode = row['รหัสที่ทำการไปรษณีย์'];
        
        // Lookup branch info
        const branchInfo = branchDict[branchCode] || { province: 'ไม่ระบุ', branchName: row['ชื่อที่ทำการไปรษณีย์'] || 'ไม่ระบุ', team: 'ไม่ระบุ' };
        
        // Parse Date
        let jsDate = null;
        let monthVal = '';
        let yearVal = '';
        let formattedDateStr = dateStr;
        
        if (dateStr) {
            if (dateStr.includes('T')) {
                // ISO String format from getValues() optimization
                jsDate = new Date(dateStr);
                const y = jsDate.getFullYear();
                const m = jsDate.getMonth() + 1;
                const d = jsDate.getDate();
                monthVal = `${y}-${m.toString().padStart(2, '0')}`;
                yearVal = y;
                formattedDateStr = `${d}/${m}/${y + 543}`; // Display as BE
            } else if (dateStr.includes('/')) {
                // Old string format (getDisplayValues)
                const parts = dateStr.split('/');
                if (parts.length >= 3) {
                    const d = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10);
                    let yStr = parts[2].split(' ')[0];
                    let y = parseInt(yStr, 10);
                    
                    if (y > 2500) y -= 543;
                    jsDate = new Date(y, m - 1, d);
                    monthVal = `${y}-${m.toString().padStart(2, '0')}`;
                    yearVal = y;
                    formattedDateStr = dateStr.split(' ')[0];
                }
            }
        }

        return {
            dateStr: formattedDateStr,
            dateObj: jsDate,
            monthVal: monthVal,
            year: yearVal,
            branchCode: branchCode,
            branchName: branchInfo.branchName,
            province: branchInfo.province,
            team: branchInfo.team,
            originalRow: row
        };
    }).filter(lead => lead.dateObj !== null); // Only keep leads with valid dates
}

function getAvailableMonths() {
    const monthsSet = new Set();
    rawLeads.forEach(lead => {
        if (lead.monthVal) monthsSet.add(lead.monthVal);
    });
    const sorted = Array.from(monthsSet).sort().reverse();
    return sorted.map(m => {
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
        if (currentFilters.month !== 'all' && lead.monthVal !== currentFilters.month) return false;
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
    
    thead.innerHTML = '';
    tbody.innerHTML = '';

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
    sortedTeams.forEach(tData => {
        const tr = document.createElement('tr');
        
        let html = `<td class="col-province">${tData.province}</td>`;
        html += `<td class="col-team">${tData.team}</td>`;

        for (let i = 0; i < daysInMonth; i++) {
            const count = tData.dailyCounts[i];
            const dayType = isNonWorkingDay(year, month, i + 1);
            const cls = dayType === 'holiday' ? 'bg-holiday' : dayType === 'weekend' ? 'bg-weekend' : '';
            const val = count > 0 ? count : '';
            html += `<td class="text-center ${cls}">${val}</td>`;
        }

        html += `<td class="text-center text-primary" style="font-weight: 600;">${tData.total}</td>`;
        tr.innerHTML = html;
        fragment.appendChild(tr);
    });

    tbody.appendChild(fragment);
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
