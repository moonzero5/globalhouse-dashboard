/**
 * Global House - Repair Work Dashboard (ระบบปรับอากาศ)
 * Core JavaScript Logic
 */

// ======== Thai Month Utilities ========
const THAI_MONTHS = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const THAI_MONTHS_SHORT = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

// ======== Status Categorization (AESCON Col Q) ========
const COMPLETED_STATUSES = ["สาขาดำเนินการเรียบร้อย", "ดำเนินการเรียบร้อย"];
const PENDING_STATUSES = ["รอประเมินราคาหน้างาน", "สาขาดำเนินการเอง รอใบปิด", "เตรียมความพร้อม/เอกสาร", "ดำเนินการแล้วรอใบปิด", "กำลังดำเนินการ"];

// ======== Application State ========
let allData = [];
let filteredData = [];
let currentYearRange = 3; // 3 years, 5 years, or 0 (all)

// Chart Instances
let charts = {
    monthlyJobs: null,
    monthlyValue: null,
    mom: null,
    yoy: null,
    yearly: null,
    statusDonut: null
};

// ======== Helper: Date Parser ========
function parseDateInfo(dateVal, fallbackYearVal) {
    let year = null;
    let month = null;
    let formattedDate = "";

    if (!dateVal && fallbackYearVal) {
        let y = parseInt(fallbackYearVal, 10);
        if (y > 2400) y -= 543;
        return { year: y, month: 1, monthName: THAI_MONTHS[0], formattedDate: "" };
    }

    if (dateVal instanceof Date && !isNaN(dateVal)) {
        year = dateVal.getFullYear();
        month = dateVal.getMonth() + 1;
        formattedDate = `${dateVal.getDate()}/${month}/${year}`;
    } else if (typeof dateVal === "number") {
        // Excel serial date number
        const jsDate = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
        if (!isNaN(jsDate)) {
            year = jsDate.getFullYear();
            month = jsDate.getMonth() + 1;
            formattedDate = `${jsDate.getDate()}/${month}/${year}`;
        }
    } else if (typeof dateVal === "string") {
        const clean = dateVal.trim();
        formattedDate = clean;

        const partsSlash = clean.split("/");
        const partsDash = clean.split("-");

        if (partsSlash.length === 3) {
            let p1 = parseInt(partsSlash[0], 10);
            let p2 = parseInt(partsSlash[1], 10);
            let p3 = parseInt(partsSlash[2], 10);

            if (p3 > 1000) {
                year = p3;
                // Standard Thai date format: Day / Month / Year
                month = (p2 >= 1 && p2 <= 12) ? p2 : ((p1 >= 1 && p1 <= 12) ? p1 : 1);
            } else if (p1 > 1000) {
                year = p1;
                month = (p2 >= 1 && p2 <= 12) ? p2 : 1;
            }
        } else if (partsDash.length === 3) {
            let p1 = parseInt(partsDash[0], 10);
            let p2 = parseInt(partsDash[1], 10);
            let p3 = parseInt(partsDash[2], 10);

            if (p1 > 1000) {
                year = p1;
                month = (p2 >= 1 && p2 <= 12) ? p2 : 1;
            } else if (p3 > 1000) {
                year = p3;
                month = (p2 >= 1 && p2 <= 12) ? p2 : 1;
            }
        }
    }

    // Convert Buddhist Era to CE (e.g. 2567 -> 2024)
    if (year && year > 2400) {
        year -= 543;
    }

    // Fallback if year or month could not be determined
    if (!year && fallbackYearVal) {
        let fy = parseInt(fallbackYearVal, 10);
        if (fy > 2400) fy -= 543;
        year = fy;
    }
    if (!year) year = new Date().getFullYear();
    if (!month || month < 1 || month > 12) month = 1;

    return {
        year: year,
        month: month,
        monthName: THAI_MONTHS[month - 1],
        formattedDate: formattedDate || `${month}/${year}`
    };
}

// ======== Helper: Formatters ========
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString("th-TH");
}

function formatCurrency(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString("th-TH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatPercent(curr, prev) {
    if (prev === null || prev === undefined || prev === 0 || isNaN(prev) || isNaN(curr)) {
        return "-";
    }
    const pct = ((curr - prev) / prev) * 100;
    if (isNaN(pct) || !isFinite(pct)) return "-";
    const sign = pct > 0 ? "+" : "";
    return `${sign}${pct.toFixed(2)}%`;
}

function getIndicatorBadge(curr, prev) {
    if (prev === null || prev === undefined || prev === 0 || isNaN(prev) || isNaN(curr)) {
        return { text: "-", changeVal: "-", className: "trend-neutral" };
    }
    const diff = curr - prev;
    const pct = ((diff) / prev) * 100;
    if (isNaN(pct) || !isFinite(pct)) {
        return { text: "-", changeVal: "-", className: "trend-neutral" };
    }

    const sign = diff > 0 ? "+" : "";
    const changeFormatted = `${sign}${formatCurrency(diff)} บาท`;
    
    if (diff > 0) {
        return {
            text: `↑ ${sign}${pct.toFixed(2)}%`,
            changeVal: changeFormatted,
            className: "trend-up",
            badgeClass: "trend-badge-up"
        };
    } else if (diff < 0) {
        return {
            text: `↓ ${pct.toFixed(2)}%`,
            changeVal: changeFormatted,
            className: "trend-down",
            badgeClass: "trend-badge-down"
        };
    } else {
        return {
            text: `0.00%`,
            changeVal: `0 บาท`,
            className: "trend-neutral",
            badgeClass: ""
        };
    }
}

// ======== Live Sync & Real-time State ========
let autoSyncTimerId = null;
const DEFAULT_SHEET_URL = "https://docs.google.com/spreadsheets/d/1SYeVP-qJ_Pd8m-o8RLJ4e7iAFMPFowN4Z8YPXsoe_Vs/edit?gid=1361001811#gid=1361001811";
const DEFAULT_SHEET_TAB = "ปรับอากาศ";

// ======== Helper: Toast Notification ========
function showToast(message, type = "info", duration = 3500) {
    const toast = document.getElementById("toastNotification");
    if (!toast) return;
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = message;
    setTimeout(() => {
        toast.className = "toast-notification";
    }, duration);
}

// ======== Helper: Sanitize & Re-align All Dates ========
function sanitizeAllData() {
    if (!Array.isArray(allData)) return;
    allData = allData.map(item => {
        const dInfo = parseDateInfo(item.reportDate, item.year);
        return {
            ...item,
            year: dInfo.year,
            month: dInfo.month,
            monthName: dInfo.monthName
        };
    });
}

// ======== Init Dashboard ========
document.addEventListener("DOMContentLoaded", () => {
    // Purge any stale cache from earlier versions
    const cacheVersion = localStorage.getItem("gh_cache_version");
    if (cacheVersion !== "2.5") {
        localStorage.removeItem("gh_cached_data");
        localStorage.setItem("gh_cache_version", "2.5");
    }

    const cachedData = localStorage.getItem("gh_cached_data");
    const lastSyncTime = localStorage.getItem("gh_last_sync_time");

    if (cachedData) {
        try {
            allData = JSON.parse(cachedData);
            // Re-sanitize any cached dates to ensure correct DD/MM/YYYY interpretation
            sanitizeAllData();
            localStorage.setItem("gh_cached_data", JSON.stringify(allData));
            updateSyncStatusUI("live", `ข้อมูลสดในแคช (${formatNumber(allData.length)} รายการ)`, lastSyncTime ? `อัปเดตล่าสุด: ${lastSyncTime}` : "");
        } catch (e) {
            allData = (typeof AIRCON_DATA !== "undefined" && Array.isArray(AIRCON_DATA)) ? AIRCON_DATA : [];
            sanitizeAllData();
        }
    } else if (typeof AIRCON_DATA !== "undefined" && Array.isArray(AIRCON_DATA)) {
        allData = AIRCON_DATA;
        sanitizeAllData();
        updateSyncStatusUI("offline", "ข้อมูลเริ่มต้น (983 รายการ)", "ยังไม่ได้เชื่อมต่อ Google Sheet สด");
    } else {
        allData = [];
    }
    
    initFilterOptions();
    setupEventListeners();
    updateDashboard();

    // 2. Initialize Google Sheet Real-time sync if configured
    initGoogleSheetSync();
});

// ======== Helper: Populate Month Dropdown Dynamically Based on Year ========
function updateMonthDropdownOptions(selectedYear, selectEl, includeAllOption = true) {
    if (!selectEl) return;
    const currentVal = parseInt(selectEl.value, 10);
    
    // Determine max available month for the chosen year (Strictly 9 for 2026)
    let maxM = 12;
    const yr = parseInt(selectedYear || (allData.length > 0 ? Math.max(...allData.map(d => parseInt(d.year))) : 2026));
    if (yr === 2026) {
        maxM = 9;
    } else if (yr) {
        const monthsInYear = allData
            .filter(d => parseInt(d.year) === yr)
            .map(d => parseInt(d.month));
        if (monthsInYear.length > 0) {
            maxM = Math.max(...monthsInYear);
        }
    }

    selectEl.innerHTML = "";
    if (includeAllOption) {
        const allOpt = document.createElement("option");
        allOpt.value = "";
        allOpt.textContent = "ทุกเดือน (ทั้งปี)";
        selectEl.appendChild(allOpt);
    }

    for (let m = 1; m <= maxM; m++) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = THAI_MONTHS[m - 1];
        if (m === currentVal) opt.selected = true;
        selectEl.appendChild(opt);
    }

    // If previously selected month exceeds max available, select max available month
    if (currentVal && currentVal > maxM) {
        selectEl.value = maxM;
    } else if (!selectEl.value && !includeAllOption && maxM > 0) {
        selectEl.value = maxM;
    }
}

// ======== Dynamic Filter Initialization ========
function initFilterOptions() {
    const yearSelect = document.getElementById("filterYear");
    const monthSelect = document.getElementById("filterMonth");
    const branchSelect = document.getElementById("filterBranch");
    const statusSelect = document.getElementById("filterStatus");

    // Extract unique values
    const years = [...new Set(allData.map(d => parseInt(d.year)).filter(Boolean))].sort((a, b) => b - a);
    const branches = [...new Set(allData.map(d => d.branch).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
    const statuses = [...new Set(allData.map(d => d.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));

    // Populate Year Dropdown - default to latest year dynamically!
    yearSelect.innerHTML = '<option value="">ทุกปี</option>';
    years.forEach((y, idx) => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = `ปี ${y}`;
        if (idx === 0) opt.selected = true; // Auto-select latest year
        yearSelect.appendChild(opt);
    });

    const latestYear = years[0] || new Date().getFullYear();

    // Populate Month Dropdown dynamically based on latest year
    updateMonthDropdownOptions(latestYear, monthSelect, true);
    
    // Select latest available month by default
    const monthsInLatestYear = allData.filter(d => parseInt(d.year) === parseInt(latestYear)).map(d => parseInt(d.month));
    if (monthsInLatestYear.length > 0) {
        monthSelect.value = Math.max(...monthsInLatestYear);
    }

    // Populate Branches
    branchSelect.innerHTML = '<option value="">ทุกสาขา</option>';
    branches.forEach(b => {
        const opt = document.createElement("option");
        opt.value = b;
        opt.textContent = b;
        branchSelect.appendChild(opt);
    });

    // Populate Statuses
    statusSelect.innerHTML = '<option value="">ทุกสถานะ</option>';
    statuses.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        statusSelect.appendChild(opt);
    });

    // Populate MoM Section Selectors
    const momSelectYear = document.getElementById("momSelectYear");
    const momSelectMonth = document.getElementById("momSelectMonth");
    if (momSelectYear && momSelectMonth) {
        momSelectYear.innerHTML = "";
        years.forEach(y => {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = `ปี ${y}`;
            momSelectYear.appendChild(opt);
        });
        momSelectYear.value = latestYear;
        updateMonthDropdownOptions(latestYear, momSelectMonth, false);
    }

    // Populate YoY Section Selectors
    const yoySelectYear = document.getElementById("yoySelectYear");
    const yoySelectMonth = document.getElementById("yoySelectMonth");
    if (yoySelectYear && yoySelectMonth) {
        yoySelectYear.innerHTML = "";
        years.forEach(y => {
            const opt = document.createElement("option");
            opt.value = y;
            opt.textContent = `ปี ${y}`;
            yoySelectYear.appendChild(opt);
        });
        yoySelectYear.value = latestYear;
        updateMonthDropdownOptions(latestYear, yoySelectMonth, false);
    }
}

function onMomSelectorChange() {
    const momSelectYear = document.getElementById("momSelectYear");
    const momSelectMonth = document.getElementById("momSelectMonth");
    if (momSelectYear && momSelectMonth) {
        updateMonthDropdownOptions(momSelectYear.value, momSelectMonth, false);
    }
    renderMomComparison();
}

function onYoySelectorChange() {
    const yoySelectYear = document.getElementById("yoySelectYear");
    const yoySelectMonth = document.getElementById("yoySelectMonth");
    if (yoySelectYear && yoySelectMonth) {
        updateMonthDropdownOptions(yoySelectYear.value, yoySelectMonth, false);
    }
    renderYoyComparison();
}

function setupEventListeners() {
    const yearEl = document.getElementById("filterYear");
    const monthEl = document.getElementById("filterMonth");

    if (yearEl && monthEl) {
        yearEl.addEventListener("change", () => {
            updateMonthDropdownOptions(yearEl.value, monthEl, true);
            updateDashboard();
        });
    }

    const filterIds = ["filterMonth", "filterBranch", "filterStatus"];
    filterIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", () => {
                updateDashboard();
            });
        }
    });

    // Drag & drop for import modal
    const dropZone = document.getElementById("dropZone");
    const fileInput = document.getElementById("fileInput");

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
        }
    });
}

function resetFilters() {
    const years = [...new Set(allData.map(d => d.year).filter(Boolean))].sort((a, b) => b - a);
    document.getElementById("filterYear").value = years[0] || "";
    
    // Default to latest month of latest year
    const latestYear = years[0];
    const monthsInLatestYear = allData.filter(d => d.year === latestYear).map(d => d.month);
    const maxMonth = monthsInLatestYear.length > 0 ? Math.max(...monthsInLatestYear) : "";
    document.getElementById("filterMonth").value = maxMonth;

    document.getElementById("filterBranch").value = "";
    document.getElementById("filterStatus").value = "";
    updateDashboard();
}

// ======== Main Dashboard Update Logic ========
function updateDashboard() {
    const selectedYearStr = document.getElementById("filterYear").value;
    const selectedMonthStr = document.getElementById("filterMonth").value;
    const selectedBranch = document.getElementById("filterBranch").value;
    const selectedStatus = document.getElementById("filterStatus").value;

    const selectedYear = selectedYearStr ? parseInt(selectedYearStr, 10) : null;
    const selectedMonth = selectedMonthStr ? parseInt(selectedMonthStr, 10) : null;

    // Apply filters
    filteredData = allData.filter(item => {
        if (selectedYear && item.year !== selectedYear) return false;
        if (selectedMonth && item.month !== selectedMonth) return false;
        if (selectedBranch && item.branch !== selectedBranch) return false;
        if (selectedStatus && item.status !== selectedStatus) return false;
        return true;
    });

    // 1. Calculate & Render KPIs
    renderKPICards(selectedYear, selectedMonth, selectedBranch, selectedStatus);

    // 2. Render Status Breakdown (AESCON Col Q)
    renderStatusBreakdown(selectedYear, selectedMonth, selectedBranch, selectedStatus);

    // 3. Render Monthly Summary Table
    renderMonthlySummaryTable(selectedYear, selectedBranch, selectedStatus, selectedMonth);

    // 4. Render Monthly Charts
    renderMonthlyCharts(selectedYear, selectedBranch, selectedStatus);

    // 5. Render Comparisons (MoM & YoY)
    renderComparisons(selectedYear, selectedMonth, selectedBranch, selectedStatus);

    // 6. Render Yearly Comparison & Trend
    renderYearlyComparison(selectedBranch, selectedStatus);
}

// ======== 1. KPI Cards Calculation ========
function renderKPICards(selectedYear, selectedMonth, selectedBranch, selectedStatus) {
    const getSubset = (yr, mo) => {
        return allData.filter(d => {
            if (yr && d.year !== yr) return false;
            if (mo && d.month !== mo) return false;
            if (selectedBranch && d.branch !== selectedBranch) return false;
            if (selectedStatus && d.status !== selectedStatus) return false;
            return true;
        });
    };

    const effectiveYear = selectedYear || (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());
    const effectiveMonth = selectedMonth;

    const currentSubset = effectiveMonth ? getSubset(effectiveYear, effectiveMonth) : getSubset(effectiveYear, null);
    
    // Card 1: Job count
    const jobCount = currentSubset.length;
    document.getElementById("kpiJobCount").textContent = formatNumber(jobCount);
    document.getElementById("kpiLabel1").textContent = effectiveMonth 
        ? `งานแจ้งซ่อม (${THAI_MONTHS[effectiveMonth - 1]} ${effectiveYear})` 
        : `งานแจ้งซ่อม (ทั้งปี ${effectiveYear})`;

    // Status Calculations (Completed vs Pending)
    let completedCount = 0;
    let pendingCount = 0;
    currentSubset.forEach(d => {
        if (COMPLETED_STATUSES.includes(d.status)) {
            completedCount++;
        } else if (PENDING_STATUSES.includes(d.status)) {
            pendingCount++;
        } else if (!d.status.includes("ยกเลิก")) {
            pendingCount++;
        }
    });

    const completedRate = jobCount > 0 ? (completedCount / jobCount) * 100 : 0;
    const pendingRate = jobCount > 0 ? (pendingCount / jobCount) * 100 : 0;

    // Card 2: Completed Jobs
    document.getElementById("kpiCompletedCount").textContent = formatNumber(completedCount);
    document.getElementById("kpiCompletedRate").textContent = `${completedRate.toFixed(1)}% เสร็จสิ้น`;
    document.getElementById("kpiLabelCompleted").textContent = effectiveMonth
        ? `ปิดงานแล้ว (${THAI_MONTHS[effectiveMonth - 1]} ${effectiveYear})`
        : `ปิดงานแล้ว (ทั้งปี ${effectiveYear})`;

    // Card 3: Pending Jobs
    document.getElementById("kpiPendingCount").textContent = formatNumber(pendingCount);
    document.getElementById("kpiPendingRate").textContent = `${pendingRate.toFixed(1)}% คงค้าง`;
    document.getElementById("kpiLabelPending").textContent = effectiveMonth
        ? `สาขาคงค้าง (${THAI_MONTHS[effectiveMonth - 1]} ${effectiveYear})`
        : `สาขาคงค้าง (ทั้งปี ${effectiveYear})`;

    // Card 4: Month Total Value
    const monthValue = currentSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    document.getElementById("kpiMonthValue").textContent = formatCurrency(monthValue);
    document.getElementById("kpiLabel2").textContent = effectiveMonth 
        ? `มูลค่างาน (${THAI_MONTHS[effectiveMonth - 1]} ${effectiveYear})` 
        : `มูลค่างานรวม (ทั้งปี ${effectiveYear})`;

    // Card 5: MoM comparison vs previous month
    let prevMonthVal = 0;
    if (effectiveMonth) {
        let prevYear = effectiveYear;
        let prevMonth = effectiveMonth - 1;
        if (prevMonth < 1) {
            prevMonth = 12;
            prevYear -= 1;
        }
        const prevSubset = getSubset(prevYear, prevMonth);
        prevMonthVal = prevSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    } else {
        const prevSubset = getSubset(effectiveYear - 1, null);
        prevMonthVal = prevSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    }
    const momIndicator = getIndicatorBadge(monthValue, prevMonthVal);
    const momCard = document.getElementById("kpiMomCard");
    const momChangeEl = document.getElementById("kpiMomChange");
    const momPercentEl = document.getElementById("kpiMomPercent");

    momChangeEl.textContent = momIndicator.changeVal;
    momPercentEl.textContent = momIndicator.text;
    momCard.className = `kpi-card ${momIndicator.className}`;

    // Card 6: Full Year Total
    const yearTotalSubset = getSubset(effectiveYear, null);
    const yearTotal = yearTotalSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
    document.getElementById("kpiYearTotal").textContent = formatCurrency(yearTotal);
    document.getElementById("kpiLabel5").textContent = `มูลค่างานปี ${effectiveYear}`;
}

// ======== 2. Status Breakdown Section (AESCON Col Q) ========
function renderStatusBreakdown(selectedYear, selectedMonth, selectedBranch, selectedStatus) {
    const effectiveYear = selectedYear || (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());
    const labelEl = document.getElementById("statusYearLabel");
    if (labelEl) {
        labelEl.textContent = selectedMonth ? `(${THAI_MONTHS[selectedMonth - 1]} ${effectiveYear})` : `(ปี ${effectiveYear})`;
    }

    const subset = allData.filter(d => {
        if (selectedYear && d.year !== selectedYear) return false;
        if (selectedMonth && d.month !== selectedMonth) return false;
        if (selectedBranch && d.branch !== selectedBranch) return false;
        if (selectedStatus && d.status !== selectedStatus) return false;
        return true;
    });

    // Count detailed statuses
    const statusCounts = {};
    subset.forEach(d => {
        const s = d.status || "ไม่ระบุ";
        statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    let completedTotal = 0;
    let pendingTotal = 0;
    let cancelledTotal = 0;

    const completedItems = [];
    const pendingItems = [];

    Object.keys(statusCounts).forEach(s => {
        const count = statusCounts[s];
        if (COMPLETED_STATUSES.includes(s)) {
            completedTotal += count;
            completedItems.push({ name: s, count: count });
        } else if (PENDING_STATUSES.includes(s)) {
            pendingTotal += count;
            pendingItems.push({ name: s, count: count });
        } else if (s.includes("ยกเลิก")) {
            cancelledTotal += count;
        } else {
            pendingTotal += count;
            pendingItems.push({ name: s, count: count });
        }
    });

    // Sort by count desc
    completedItems.sort((a, b) => b.count - a.count);
    pendingItems.sort((a, b) => b.count - a.count);

    // Render Completed List
    document.getElementById("statusCompletedTotal").textContent = `${formatNumber(completedTotal)} งาน`;
    const compListEl = document.getElementById("statusCompletedList");
    compListEl.innerHTML = "";
    if (completedItems.length === 0) {
        compListEl.innerHTML = `<div class="status-item-row"><span class="status-item-name" style="color:var(--text-muted)">ไม่มีงานในหมวดนี้</span></div>`;
    } else {
        completedItems.forEach(item => {
            const row = document.createElement("div");
            row.className = "status-item-row";
            row.innerHTML = `
                <span class="status-item-name">🔹 ${item.name}</span>
                <span class="status-item-count text-success">${formatNumber(item.count)} ใบ</span>
            `;
            compListEl.appendChild(row);
        });
    }

    // Render Pending List
    document.getElementById("statusPendingTotal").textContent = `${formatNumber(pendingTotal)} งาน`;
    const pendListEl = document.getElementById("statusPendingList");
    pendListEl.innerHTML = "";
    if (pendingItems.length === 0 && cancelledTotal === 0) {
        pendListEl.innerHTML = `<div class="status-item-row"><span class="status-item-name" style="color:var(--text-muted)">ไม่มีงานคงค้าง</span></div>`;
    } else {
        pendingItems.forEach(item => {
            const row = document.createElement("div");
            row.className = "status-item-row";
            row.innerHTML = `
                <span class="status-item-name">🔸 ${item.name}</span>
                <span class="status-item-count text-warning">${formatNumber(item.count)} ใบ</span>
            `;
            pendListEl.appendChild(row);
        });
        if (cancelledTotal > 0) {
            const row = document.createElement("div");
            row.className = "status-item-row";
            row.innerHTML = `
                <span class="status-item-name">⚪ ยกเลิกซ่อม</span>
                <span class="status-item-count" style="color:var(--text-muted)">${formatNumber(cancelledTotal)} ใบ</span>
            `;
            pendListEl.appendChild(row);
        }
    }

    // Render Status Donut Chart
    const totalAll = completedTotal + pendingTotal + cancelledTotal;
    const compRate = totalAll > 0 ? (completedTotal / totalAll * 100).toFixed(1) : 0;
    const pendRate = totalAll > 0 ? (pendingTotal / totalAll * 100).toFixed(1) : 0;

    const summaryEl = document.getElementById("statusProgressSummary");
    if (summaryEl) {
        summaryEl.innerHTML = `
            <strong>เสร็จสิ้น:</strong> <span class="text-success">${compRate}%</span> (${completedTotal} ใบ) | 
            <strong>คงค้าง:</strong> <span class="text-warning">${pendRate}%</span> (${pendingTotal} ใบ)
        `;
    }

    const ctxDonut = document.getElementById("statusDonutChart").getContext("2d");
    if (charts.statusDonut) charts.statusDonut.destroy();
    charts.statusDonut = new Chart(ctxDonut, {
        type: "doughnut",
        data: {
            labels: ["ปิดงานแล้ว (เสร็จสิ้น)", "สาขาคงค้าง (รอดำเนินการ)", "ยกเลิกซ่อม"],
            datasets: [{
                data: [completedTotal, pendingTotal, cancelledTotal],
                backgroundColor: ["#2e7d32", "#f57f17", "#cfd8dc"],
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.label}: ${formatNumber(ctx.raw)} ใบ`
                    }
                }
            },
            cutout: "68%"
        }
    });
}

// ======== 3. Monthly Summary Table ========
function renderMonthlySummaryTable(selectedYear, selectedBranch, selectedStatus, activeMonth) {
    const year = selectedYear || (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());
    document.getElementById("summaryYearLabel").textContent = `ประจำปี ${year}`;

    const tbody = document.getElementById("monthlySummaryBody");
    const tfoot = document.getElementById("monthlySummaryFoot");
    tbody.innerHTML = "";

    const getSubset = (yr, mo) => {
        return allData.filter(d => {
            if (parseInt(d.year) !== parseInt(yr) || parseInt(d.month) !== parseInt(mo)) return false;
            if (selectedBranch && d.branch !== selectedBranch) return false;
            if (selectedStatus && d.status !== selectedStatus) return false;
            return true;
        });
    };

    let totalJobs = 0;
    let totalCompleted = 0;
    let totalPending = 0;
    let totalVal = 0;

    // Show only up to the last month that has actual data for this year (Max 9 for 2026)
    let maxMonth = 12;
    if (parseInt(year) === 2026) {
        maxMonth = 9;
    } else {
        const monthsWithData = allData
            .filter(d => parseInt(d.year) === parseInt(year))
            .map(d => parseInt(d.month));
        if (monthsWithData.length > 0) maxMonth = Math.max(...monthsWithData);
    }

    for (let m = 1; m <= maxMonth; m++) {
        const curSubset = getSubset(year, m);
        const curJobs = curSubset.length;
        const curVal = curSubset.reduce((s, d) => s + (Number(d.value) || 0), 0);

        let mCompleted = 0;
        let mPending = 0;
        curSubset.forEach(d => {
            if (COMPLETED_STATUSES.includes(d.status)) {
                mCompleted++;
            } else if (PENDING_STATUSES.includes(d.status) || !d.status.includes("ยกเลิก")) {
                mPending++;
            }
        });

        totalJobs += curJobs;
        totalCompleted += mCompleted;
        totalPending += mPending;
        totalVal += curVal;

        const mCompRate = curJobs > 0 ? (mCompleted / curJobs * 100).toFixed(1) + "%" : "-";

        // Previous month
        let pYear = year;
        let pMonth = m - 1;
        if (pMonth < 1) {
            pMonth = 12;
            pYear -= 1;
        }
        const pSubset = getSubset(pYear, pMonth);
        const pVal = pSubset.reduce((s, d) => s + (Number(d.value) || 0), 0);
        const momPct = formatPercent(curVal, pVal);

        // Same month previous year
        const yoySubset = getSubset(year - 1, m);
        const yoyVal = yoySubset.reduce((s, d) => s + (Number(d.value) || 0), 0);
        const yoyPct = formatPercent(curVal, yoyVal);

        const tr = document.createElement("tr");
        if (activeMonth === m) {
            tr.classList.add("current-month-row");
        }

        tr.innerHTML = `
            <td><strong>${THAI_MONTHS[m - 1]}</strong></td>
            <td>${formatNumber(curJobs)}</td>
            <td class="text-success" style="font-weight:600;">${formatNumber(mCompleted)}</td>
            <td class="${mPending > 0 ? 'text-warning' : ''}" style="font-weight:600;">${formatNumber(mPending)}</td>
            <td style="font-weight:500;">${mCompRate}</td>
            <td><strong>${formatCurrency(curVal)}</strong></td>
            <td>${pVal > 0 ? formatCurrency(pVal) : "-"}</td>
            <td class="${momPct.startsWith('+') ? 'trend-up' : (momPct.startsWith('-') ? 'trend-down' : '')}">${momPct}</td>
            <td>${yoyVal > 0 ? formatCurrency(yoyVal) : "-"}</td>
            <td class="${yoyPct.startsWith('+') ? 'trend-up' : (yoyPct.startsWith('-') ? 'trend-down' : '')}">${yoyPct}</td>
        `;
        tbody.appendChild(tr);
    }

    const overallCompRate = totalJobs > 0 ? (totalCompleted / totalJobs * 100).toFixed(1) + "%" : "-";

    tfoot.innerHTML = `
        <tr>
            <td>รวมทั้งปี</td>
            <td>${formatNumber(totalJobs)}</td>
            <td class="text-success">${formatNumber(totalCompleted)}</td>
            <td class="${totalPending > 0 ? 'text-warning' : ''}">${formatNumber(totalPending)}</td>
            <td>${overallCompRate}</td>
            <td>${formatCurrency(totalVal)}</td>
            <td colspan="4" style="text-align: left; color: var(--text-secondary); font-weight: normal;">
                (เฉลี่ยเดือนละ ${formatCurrency(totalVal / (maxMonth || 1))} บาท / ${formatNumber(Math.round(totalJobs / (maxMonth || 1)))} งาน ในช่วง ${maxMonth} เดือน)
            </td>
        </tr>
    `;
}

// ======== 3. Monthly Charts ========
function renderMonthlyCharts(selectedYear, selectedBranch, selectedStatus) {
    const year = selectedYear || (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());

    // Show only up to the last month that has actual data for this year (Max 9 for 2026)
    let maxMonth = 12;
    if (parseInt(year) === 2026) {
        maxMonth = 9;
    } else {
        const monthsWithData = allData
            .filter(d => parseInt(d.year) === parseInt(year))
            .map(d => parseInt(d.month));
        if (monthsWithData.length > 0) maxMonth = Math.max(...monthsWithData);
    }

    const getMonthlyData = () => {
        const jobs = [];
        const completedJobs = [];
        const pendingJobs = [];
        const values = [];
        for (let m = 1; m <= maxMonth; m++) {
            const subset = allData.filter(d => {
                if (parseInt(d.year) !== parseInt(year) || parseInt(d.month) !== parseInt(m)) return false;
                if (selectedBranch && d.branch !== selectedBranch) return false;
                if (selectedStatus && d.status !== selectedStatus) return false;
                return true;
            });
            let comp = 0, pend = 0;
            subset.forEach(d => {
                if (COMPLETED_STATUSES.includes(d.status)) {
                    comp++;
                } else if (PENDING_STATUSES.includes(d.status) || !d.status.includes("ยกเลิก")) {
                    pend++;
                }
            });
            jobs.push(subset.length);
            completedJobs.push(comp);
            pendingJobs.push(pend);
            values.push(subset.reduce((sum, d) => sum + (Number(d.value) || 0), 0));
        }
        return { jobs, completedJobs, pendingJobs, values };
    };

    const data = getMonthlyData();

    // 1. Monthly Jobs Chart (Stacked: Completed & Pending)
    const ctxJobs = document.getElementById("monthlyJobsChart").getContext("2d");
    if (charts.monthlyJobs) charts.monthlyJobs.destroy();
    charts.monthlyJobs = new Chart(ctxJobs, {
        type: "bar",
        data: {
            labels: THAI_MONTHS_SHORT.slice(0, maxMonth),
            datasets: [
                {
                    label: `ปิดงานแล้ว (เสร็จสิ้น)`,
                    data: data.completedJobs,
                    backgroundColor: "rgba(46, 125, 50, 0.8)",
                    borderColor: "#2e7d32",
                    borderWidth: 1,
                    borderRadius: 4,
                    stack: "jobs"
                },
                {
                    label: `สาขาคงค้าง (รอดำเนินการ)`,
                    data: data.pendingJobs,
                    backgroundColor: "rgba(237, 108, 2, 0.8)",
                    borderColor: "#ed6c02",
                    borderWidth: 1,
                    borderRadius: 4,
                    stack: "jobs"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "top" },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)} งาน`,
                        afterBody: (tooltipItems) => {
                            const dataIndex = tooltipItems[0].dataIndex;
                            const total = data.jobs[dataIndex];
                            return `รวมทั้งหมด: ${formatNumber(total)} งาน`;
                        }
                    }
                }
            },
            scales: {
                x: { stacked: true },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    ticks: { callback: (val) => formatNumber(val) }
                }
            }
        }
    });

    // 2. Monthly Value Chart
    const ctxVal = document.getElementById("monthlyValueChart").getContext("2d");
    if (charts.monthlyValue) charts.monthlyValue.destroy();
    charts.monthlyValue = new Chart(ctxVal, {
        type: "bar",
        data: {
            labels: THAI_MONTHS_SHORT.slice(0, maxMonth),
            datasets: [{
                label: `มูลค่างาน (บาท) ปี ${year}`,
                data: data.values,
                backgroundColor: "rgba(2, 136, 209, 0.75)",
                borderColor: "#0288d1",
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "top" },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `มูลค่า: ${formatCurrency(ctx.parsed.y)} บาท`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });
}

// ======== 4. Comparison Sections (MoM & YoY) ========
function renderComparisons(selectedYear, selectedMonth, selectedBranch, selectedStatus) {
    // If called from main filter, optionally sync selector values if selected
    if (selectedYear) {
        const momY = document.getElementById("momSelectYear");
        const yoyY = document.getElementById("yoySelectYear");
        if (momY) momY.value = selectedYear;
        if (yoyY) yoyY.value = selectedYear;
    }
    if (selectedMonth) {
        const momM = document.getElementById("momSelectMonth");
        const yoyM = document.getElementById("yoySelectMonth");
        if (momM) momM.value = selectedMonth;
        if (yoyM) yoyM.value = selectedMonth;
    }

    renderMomComparison();
    renderYoyComparison();
}

function renderMomComparison() {
    const momYEl = document.getElementById("momSelectYear");
    const momMEl = document.getElementById("momSelectMonth");
    const selectedBranch = document.getElementById("filterBranch").value;
    const selectedStatus = document.getElementById("filterStatus").value;

    let year = momYEl ? parseInt(momYEl.value, 10) : (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());
    let month = momMEl ? parseInt(momMEl.value, 10) : 1;

    const getSubset = (yr, mo) => {
        return allData.filter(d => {
            if (parseInt(d.year) !== parseInt(yr) || parseInt(d.month) !== parseInt(mo)) return false;
            if (selectedBranch && d.branch !== selectedBranch) return false;
            if (selectedStatus && d.status !== selectedStatus) return false;
            return true;
        });
    };

    const currSubset = getSubset(year, month);
    const currVal = currSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    // MoM Previous Month
    let prevMYear = year;
    let prevMMonth = month - 1;
    if (prevMMonth < 1) {
        prevMMonth = 12;
        prevMYear -= 1;
    }
    const prevMSubset = getSubset(prevMYear, prevMMonth);
    const prevMVal = prevMSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    document.getElementById("momPrevLabel").textContent = `${THAI_MONTHS[prevMMonth - 1]} ${prevMYear}`;
    document.getElementById("momPrevValue").textContent = formatCurrency(prevMVal);
    document.getElementById("momCurrLabel").textContent = `${THAI_MONTHS[month - 1]} ${year}`;
    document.getElementById("momCurrValue").textContent = formatCurrency(currVal);

    const momDiff = currVal - prevMVal;
    const momDiffPercent = formatPercent(currVal, prevMVal);
    const momDiffSign = momDiff > 0 ? "+" : "";

    document.getElementById("momDiffValue").textContent = `${momDiffSign}${formatCurrency(momDiff)} บาท`;
    document.getElementById("momDiffPercent").textContent = momDiffPercent;
    
    const momBox = document.getElementById("momResultBox");
    momBox.className = `compare-box result ${momDiff > 0 ? 'trend-up' : (momDiff < 0 ? 'trend-down' : '')}`;

    // MoM Chart
    const ctxMom = document.getElementById("momChart").getContext("2d");
    if (charts.mom) charts.mom.destroy();
    charts.mom = new Chart(ctxMom, {
        type: "bar",
        data: {
            labels: [`${THAI_MONTHS_SHORT[prevMMonth - 1]} ${prevMYear}`, `${THAI_MONTHS_SHORT[month - 1]} ${year}`],
            datasets: [{
                data: [prevMVal, currVal],
                backgroundColor: ["#90a4ae", "#1976d2"],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `มูลค่า: ${formatCurrency(ctx.parsed.y)} บาท`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });
}

function renderYoyComparison() {
    const yoyYEl = document.getElementById("yoySelectYear");
    const yoyMEl = document.getElementById("yoySelectMonth");
    const selectedBranch = document.getElementById("filterBranch").value;
    const selectedStatus = document.getElementById("filterStatus").value;

    let year = yoyYEl ? parseInt(yoyYEl.value, 10) : (allData.length > 0 ? Math.max(...allData.map(d => d.year)) : new Date().getFullYear());
    let month = yoyMEl ? parseInt(yoyMEl.value, 10) : 1;

    const getSubset = (yr, mo) => {
        return allData.filter(d => {
            if (parseInt(d.year) !== parseInt(yr) || parseInt(d.month) !== parseInt(mo)) return false;
            if (selectedBranch && d.branch !== selectedBranch) return false;
            if (selectedStatus && d.status !== selectedStatus) return false;
            return true;
        });
    };

    const currSubset = getSubset(year, month);
    const currVal = currSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    // YoY Previous Year Same Month
    const prevYSubset = getSubset(year - 1, month);
    const prevYVal = prevYSubset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

    document.getElementById("yoyPrevLabel").textContent = `${THAI_MONTHS[month - 1]} ${year - 1}`;
    document.getElementById("yoyPrevValue").textContent = formatCurrency(prevYVal);
    document.getElementById("yoyCurrLabel").textContent = `${THAI_MONTHS[month - 1]} ${year}`;
    document.getElementById("yoyCurrValue").textContent = formatCurrency(currVal);

    const yoyDiff = currVal - prevYVal;
    const yoyDiffPercent = formatPercent(currVal, prevYVal);
    const yoyDiffSign = yoyDiff > 0 ? "+" : "";

    document.getElementById("yoyDiffValue").textContent = `${yoyDiffSign}${formatCurrency(yoyDiff)} บาท`;
    document.getElementById("yoyDiffPercent").textContent = yoyDiffPercent;

    const yoyBox = document.getElementById("yoyResultBox");
    yoyBox.className = `compare-box result ${yoyDiff > 0 ? 'trend-up' : (yoyDiff < 0 ? 'trend-down' : '')}`;

    // YoY Chart
    const ctxYoy = document.getElementById("yoyChart").getContext("2d");
    if (charts.yoy) charts.yoy.destroy();
    charts.yoy = new Chart(ctxYoy, {
        type: "bar",
        data: {
            labels: [`${THAI_MONTHS_SHORT[month - 1]} ${year - 1}`, `${THAI_MONTHS_SHORT[month - 1]} ${year}`],
            datasets: [{
                data: [prevYVal, currVal],
                backgroundColor: ["#78909c", "#0d47a1"],
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `มูลค่า: ${formatCurrency(ctx.parsed.y)} บาท`
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (val) => formatCurrency(val) }
                }
            }
        }
    });
}

// ======== 5. Yearly Comparison & Trend ========
function setYearRange(range, btn) {
    currentYearRange = range;
    document.querySelectorAll(".yearly-controls .btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const selectedBranch = document.getElementById("filterBranch").value;
    const selectedStatus = document.getElementById("filterStatus").value;
    renderYearlyComparison(selectedBranch, selectedStatus);
}

function renderYearlyComparison(selectedBranch, selectedStatus) {
    let years = [...new Set(allData.map(d => parseInt(d.year)).filter(Boolean))].sort((a, b) => a - b);
    if (currentYearRange > 0 && years.length > currentYearRange) {
        years = years.slice(years.length - currentYearRange);
    }

    const yearlyData = years.map(yr => {
        const subset = allData.filter(d => {
            if (parseInt(d.year) !== parseInt(yr)) return false;
            if (selectedBranch && d.branch !== selectedBranch) return false;
            if (selectedStatus && d.status !== selectedStatus) return false;
            return true;
        });
        let comp = 0, pend = 0;
        subset.forEach(d => {
            if (COMPLETED_STATUSES.includes(d.status)) {
                comp++;
            } else if (PENDING_STATUSES.includes(d.status) || !d.status.includes("ยกเลิก")) {
                pend++;
            }
        });
        const totalVal = subset.reduce((sum, d) => sum + (Number(d.value) || 0), 0);
        const compRate = subset.length > 0 ? (comp / subset.length * 100).toFixed(1) + "%" : "-";
        return {
            year: yr,
            jobCount: subset.length,
            completedCount: comp,
            pendingCount: pend,
            compRate: compRate,
            value: totalVal
        };
    });

    // Build Table
    const container = document.getElementById("yearlyTableContainer");
    let tableHtml = `
        <table class="data-table summary-table" style="margin-bottom: 14px;">
            <thead>
                <tr>
                    <th>ปี</th>
                    <th>จำนวนงานทั้งหมด</th>
                    <th>ปิดงานแล้ว (เสร็จสิ้น)</th>
                    <th>สาขาคงค้าง (รอดำเนินการ)</th>
                    <th>% สำเร็จ</th>
                    <th>มูลค่างานรวม (บาท)</th>
                    <th>เปรียบเทียบปีก่อนหน้า</th>
                    <th>% การเปลี่ยนแปลง</th>
                </tr>
            </thead>
            <tbody>
    `;

    yearlyData.forEach((item, idx) => {
        let prevVal = idx > 0 ? yearlyData[idx - 1].value : 0;
        let diff = idx > 0 ? item.value - prevVal : 0;
        let pct = idx > 0 ? formatPercent(item.value, prevVal) : "-";
        let diffText = idx > 0 ? `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} บาท` : "-";

        tableHtml += `
            <tr>
                <td><strong>ปี ${item.year}</strong></td>
                <td>${formatNumber(item.jobCount)} งาน</td>
                <td class="text-success" style="font-weight:600;">${formatNumber(item.completedCount)}</td>
                <td class="${item.pendingCount > 0 ? 'text-warning' : ''}" style="font-weight:600;">${formatNumber(item.pendingCount)}</td>
                <td style="font-weight:500;">${item.compRate}</td>
                <td><strong>${formatCurrency(item.value)}</strong></td>
                <td class="${diff > 0 ? 'trend-up' : (diff < 0 ? 'trend-down' : '')}">${diffText}</td>
                <td class="${pct.startsWith('+') ? 'trend-up' : (pct.startsWith('-') ? 'trend-down' : '')}">${pct}</td>
            </tr>
        `;
    });

    tableHtml += `</tbody></table>`;
    container.innerHTML = tableHtml;

    // Dynamic Summary Text - Never hard-code!
    const trendSummaryEl = document.getElementById("yearlyTrendSummary");
    if (yearlyData.length >= 2) {
        const latest = yearlyData[yearlyData.length - 1];
        const prev = yearlyData[yearlyData.length - 2];
        const diff = latest.value - prev.value;
        const pct = formatPercent(latest.value, prev.value);

        let statusText = ` (ปิดงานแล้ว ${formatNumber(latest.completedCount)} / คงค้าง ${formatNumber(latest.pendingCount)} งาน - สำเร็จ ${latest.compRate})`;

        if (diff > 0) {
            trendSummaryEl.innerHTML = `💡 <strong>สรุปแนวโน้ม:</strong> มูลค่างานปี ${latest.year} <strong>เพิ่มขึ้น</strong> จากปี ${prev.year} จำนวน <strong>+${formatCurrency(diff)} บาท</strong> (${pct})${statusText}`;
        } else if (diff < 0) {
            trendSummaryEl.innerHTML = `💡 <strong>สรุปแนวโน้ม:</strong> มูลค่างานปี ${latest.year} <strong>ลดลง</strong> จากปี ${prev.year} จำนวน <strong>${formatCurrency(diff)} บาท</strong> (${pct})${statusText}`;
        } else {
            trendSummaryEl.innerHTML = `💡 <strong>สรุปแนวโน้ม:</strong> มูลค่างานปี ${latest.year} <strong>ใกล้เคียงเดิม</strong> กับปี ${prev.year}${statusText}`;
        }
    } else if (yearlyData.length === 1) {
        trendSummaryEl.innerHTML = `💡 <strong>สรุปแนวโน้ม:</strong> มูลค่างานปี ${yearlyData[0].year} รวมทั้งหมด <strong>${formatCurrency(yearlyData[0].value)} บาท</strong> (สำเร็จ ${yearlyData[0].compRate})`;
    } else {
        trendSummaryEl.innerHTML = "";
    }

    // Yearly Chart (Dual axis: Value Bar + Completion Rate Line)
    const ctxYearly = document.getElementById("yearlyChart").getContext("2d");
    if (charts.yearly) charts.yearly.destroy();
    charts.yearly = new Chart(ctxYearly, {
        type: "bar",
        data: {
            labels: yearlyData.map(d => `ปี ${d.year}`),
            datasets: [
                {
                    type: "bar",
                    label: "มูลค่างานรวม (บาท)",
                    data: yearlyData.map(d => d.value),
                    backgroundColor: "rgba(13, 71, 161, 0.8)",
                    borderColor: "#0d47a1",
                    borderWidth: 1,
                    borderRadius: 6,
                    yAxisID: "y"
                },
                {
                    type: "line",
                    label: "% สำเร็จ",
                    data: yearlyData.map(d => d.jobCount > 0 ? parseFloat((d.completedCount / d.jobCount * 100).toFixed(1)) : 0),
                    borderColor: "#2e7d32",
                    backgroundColor: "#2e7d32",
                    borderWidth: 2.5,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: "top" },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            if (ctx.dataset.yAxisID === "y1") {
                                return `% สำเร็จ: ${ctx.parsed.y}%`;
                            }
                            return `มูลค่างานรวม: ${formatCurrency(ctx.parsed.y)} บาท`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: "linear",
                    display: true,
                    position: "left",
                    beginAtZero: true,
                    ticks: { callback: (val) => formatCurrency(val) }
                },
                y1: {
                    type: "linear",
                    display: true,
                    position: "right",
                    beginAtZero: true,
                    max: 100,
                    grid: { drawOnChartArea: false },
                    ticks: { callback: (val) => val + "%" }
                }
            }
        }
    });
}

// ======== Import & Export Functions ========
function openImportModal() {
    document.getElementById("importModal").classList.add("active");
    document.getElementById("importStatus").style.display = "none";
}

function closeImportModal() {
    document.getElementById("importModal").classList.remove("active");
}

function handleFileUpload(file) {
    const statusEl = document.getElementById("importStatus");
    statusEl.className = "";
    statusEl.style.display = "block";
    statusEl.textContent = `กำลังอ่านไฟล์ ${file.name}...`;

    const reader = new FileReader();

    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: "array" });
            
            // Look for sheet named "ปรับอากาศ" or use first sheet
            let targetSheetName = workbook.SheetNames.find(s => s.includes("ปรับอากาศ")) || workbook.SheetNames[0];
            const worksheet = workbook.Sheets[targetSheetName];
            
            const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (rows.length < 2) {
                throw new Error("ไฟล์ไม่มีข้อมูล");
            }

            const headerRow = rows[0].map(h => (h || "").toString().trim());
            
            // Col mapping specifically for 'ปรับอากาศ'
            // Col 0 (A): เลขที่แจ้งซ่อม
            // Col 3 (D): ประเภทงาน
            // Col 4 (E): สาขา
            // Col 5 (F): วันที่แจ้งซ่อม
            // Col 6 (G): ปีแจ้งซ่อม
            // Col 16 (Q): สถานะ AESCON
            // Col 19 (T): มูลค่า ไม่รวม VAT 7%
            let colIdx = {
                docNumber: findColumnIndex(headerRow, ["เลขที่แจ้งซ่อม", "เลขที่เอกสาร", "เลขที่", "docnumber", "doc_no"], 0),
                branch: findColumnIndex(headerRow, ["สาขา", "ชื่อสาขา", "branch"], 4),
                reportDate: findColumnIndex(headerRow, ["วันที่แจ้งซ่อม", "วันที่แจ้ง", "วันที่", "reportdate"], 5),
                year: findColumnIndex(headerRow, ["ปีแจ้งซ่อม", "ปีที่แจ้ง", "ปี", "year"], 6),
                status: findColumnIndex(headerRow, ["สถานะ aescon", "สถานะaescon", "aescon", "สถานะงาน", "สถานะ", "status"], 16),
                value: findColumnIndex(headerRow, ["มูลค่า ไม่รวม vat 7%", "ไม่รวม vat", "ไม่รวมvat", "มูลค่างาน", "มูลค่า", "ราคา", "value"], 19)
            };

            const parsedItems = [];
            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!row || row.length === 0) continue;

                const branchStr = String(row[colIdx.branch] || "").trim();
                const rawDate = row[colIdx.reportDate];
                const rawYear = row[colIdx.year];
                const rawDesc = String(row[1] || "").trim();

                // Skip truly empty trailing rows
                if (!branchStr && !rawDate && !rawYear && !rawDesc) continue;

                let docNo = String(row[colIdx.docNumber] !== undefined && row[colIdx.docNumber] !== null ? row[colIdx.docNumber] : (row[0] || "")).trim();
                if (docNo === "เลขที่แจ้งซ่อม" || docNo === "เลขที่เอกสาร" || docNo === "เลขที่") continue;
                if (!docNo) docNo = "-";

                const dateInfo = parseDateInfo(rawDate, rawYear);

                let rawVal = row[colIdx.value];
                let numVal = 0;
                if (typeof rawVal === "number") {
                    numVal = rawVal;
                } else if (typeof rawVal === "string") {
                    numVal = parseFloat(rawVal.replace(/[^0-9.]/g, "").trim()) || 0;
                }

                // Auto-correct typo for Doc #3790 if 3,730,000 -> 379,000
                if (docNo === "3790" && numVal === 3730000) {
                    numVal = 379000;
                }

                let rawStatus = String(row[colIdx.status] || "").trim();
                if (!rawStatus) rawStatus = "รอประเมินราคาหน้างาน";

                parsedItems.push({
                    docNumber: docNo,
                    reportDate: dateInfo.formattedDate,
                    year: dateInfo.year,
                    month: dateInfo.month,
                    monthName: dateInfo.monthName,
                    branch: branchStr || "ไม่ระบุสาขา",
                    workType: "ปรับอากาศ",
                    status: rawStatus,
                    value: Math.round(numVal * 100) / 100
                });
            }

            if (parsedItems.length === 0) {
                throw new Error("ไม่พบรายการข้อมูลที่ถูกต้องในไฟล์");
            }

            const importMode = document.querySelector('input[name="importMode"]:checked').value;
            if (importMode === "replace") {
                allData = parsedItems;
            } else {
                allData = allData.concat(parsedItems);
            }

            statusEl.className = "success";
            statusEl.textContent = `✅ Import ข้อมูลชีต "${targetSheetName}" สำเร็จเรียบร้อย (${formatNumber(parsedItems.length)} รายการ)`;
            
            initFilterOptions();
            updateDashboard();

            setTimeout(() => {
                closeImportModal();
            }, 1200);

        } catch (err) {
            console.error(err);
            statusEl.className = "error";
            statusEl.textContent = `❌ เกิดข้อผิดพลาด: ${err.message}`;
        }
    };

    reader.readAsArrayBuffer(file);
}

function findColumnIndex(headers, possibleNames, defaultIdx) {
    if (!headers || !Array.isArray(headers)) return defaultIdx;
    for (let name of possibleNames) {
        const target = name.toLowerCase().trim();
        for (let i = 0; i < headers.length; i++) {
            const h = String(headers[i] || "").toLowerCase().trim();
            if (h === target || (target.length > 2 && h.includes(target))) {
                return i;
            }
        }
    }
    return defaultIdx;
}

// Export Filtered Summary
function exportData() {
    if (filteredData.length === 0) {
        alert("ไม่มีข้อมูลสำหรับ Export");
        return;
    }

    const exportRows = filteredData.map(d => ({
        "เลขที่เอกสาร": d.docNumber,
        "วันที่แจ้ง": d.reportDate,
        "ปี": d.year,
        "เดือน": d.monthName,
        "สาขา": d.branch,
        "ประเภทงาน": d.workType,
        "สถานะ": d.status,
        "มูลค่างาน (บาท)": d.value
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "AirCon_RepairData");

    const selectedYear = document.getElementById("filterYear").value || "All";
    XLSX.writeFile(workbook, `GlobalHouse_AirCon_Dashboard_${selectedYear}.xlsx`);
}

// ======== Real-time Google Sheet Synchronization ========

function openSheetConfigModal() {
    const modal = document.getElementById("sheetConfigModal");
    if (!modal) return;
    
    // Load saved settings into fields
    const savedUrl = localStorage.getItem("gh_sheet_url") || DEFAULT_SHEET_URL;
    const savedTab = localStorage.getItem("gh_sheet_tab") || DEFAULT_SHEET_TAB;
    const savedAuto = localStorage.getItem("gh_auto_sync") || "300000";

    const urlInput = document.getElementById("cfgSheetUrl");
    const tabInput = document.getElementById("cfgSheetTab");
    const autoInput = document.getElementById("cfgAutoSync");
    const statusDiv = document.getElementById("cfgSyncStatus");

    if (urlInput) urlInput.value = savedUrl;
    if (tabInput) tabInput.value = savedTab;
    if (autoInput) autoInput.value = savedAuto;
    if (statusDiv) statusDiv.style.display = "none";

    modal.classList.add("active");
}

function closeSheetConfigModal() {
    const modal = document.getElementById("sheetConfigModal");
    if (modal) modal.classList.remove("active");
}

function parseGoogleSheetUrl(inputStr) {
    if (!inputStr) return null;
    const trimmed = inputStr.trim();

    // 1. Check if it's already an ID
    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
        return { sheetId: trimmed, gid: null };
    }

    // 2. Extract from full URL
    // e.g. https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=1361001811
    const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!idMatch) return null;

    const sheetId = idMatch[1];
    
    // Extract gid if present
    const gidMatch = trimmed.match(/[#&?]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : null;

    return { sheetId, gid };
}

function updateSyncStatusUI(state, text, subtext) {
    const dot = document.getElementById("syncDot");
    const statusText = document.getElementById("syncStatusText");
    const timeText = document.getElementById("syncTimeText");
    const btnHeaderSync = document.getElementById("btnHeaderSync");
    const btnSyncAction = document.getElementById("btnSyncAction");

    if (dot) {
        dot.className = "sync-dot " + state;
    }
    if (statusText && text) {
        statusText.textContent = text;
    }
    if (timeText && subtext) {
        timeText.textContent = subtext;
    }

    if (state === "syncing") {
        if (btnHeaderSync) btnHeaderSync.disabled = true;
        if (btnSyncAction) {
            btnSyncAction.disabled = true;
            btnSyncAction.textContent = "⏳ กำลังดึงข้อมูลสด...";
        }
    } else {
        if (btnHeaderSync) btnHeaderSync.disabled = false;
        if (btnSyncAction) {
            btnSyncAction.disabled = false;
            btnSyncAction.textContent = "🔄 ดึงข้อมูลสด Google Sheet";
        }
    }
}

async function saveSheetConfigAndSync() {
    const urlInput = document.getElementById("cfgSheetUrl");
    const tabInput = document.getElementById("cfgSheetTab");
    const autoInput = document.getElementById("cfgAutoSync");
    const statusDiv = document.getElementById("cfgSyncStatus");

    const sheetUrl = urlInput ? urlInput.value.trim() : "";
    const sheetTab = tabInput ? tabInput.value.trim() : DEFAULT_SHEET_TAB;
    const autoSyncVal = autoInput ? autoInput.value : "300000";

    if (!sheetUrl) {
        if (statusDiv) {
            statusDiv.style.display = "block";
            statusDiv.style.background = "var(--danger-bg)";
            statusDiv.style.color = "var(--danger-color)";
            statusDiv.textContent = "❌ กรุณาใส่ลิงก์ Google Sheet หรือ Sheet ID";
        }
        return;
    }

    const parsed = parseGoogleSheetUrl(sheetUrl);
    if (!parsed) {
        if (statusDiv) {
            statusDiv.style.display = "block";
            statusDiv.style.background = "var(--danger-bg)";
            statusDiv.style.color = "var(--danger-color)";
            statusDiv.textContent = "❌ รูปแบบลิงก์ไม่ถูกต้อง กรุณาวางลิงก์ Google Sheet ที่คัดลอกจากแถบที่อยู่เว็บ";
        }
        return;
    }

    if (statusDiv) {
        statusDiv.style.display = "block";
        statusDiv.style.background = "#e3f2fd";
        statusDiv.style.color = "#0d47a1";
        statusDiv.textContent = "⏳ กำลังทดสอบเชื่อมต่อ Google Sheet...";
    }

    // Save configuration
    localStorage.setItem("gh_sheet_url", sheetUrl);
    localStorage.setItem("gh_sheet_tab", sheetTab);
    localStorage.setItem("gh_auto_sync", autoSyncVal);

    try {
        const success = await fetchAndApplyGoogleSheet(parsed.sheetId, sheetTab, parsed.gid);
        if (success) {
            if (statusDiv) {
                statusDiv.style.background = "var(--success-bg)";
                statusDiv.style.color = "var(--success-color)";
                statusDiv.textContent = `✅ เชื่อมต่อและดึงข้อมูลสำเร็จ (${formatNumber(allData.length)} รายการ)`;
            }
            setupAutoSyncTimer();
            setTimeout(() => {
                closeSheetConfigModal();
            }, 1200);
        } else {
            throw new Error("ไม่สามารถอ่านข้อมูลจากชีตได้");
        }
    } catch (err) {
        if (statusDiv) {
            statusDiv.style.background = "var(--danger-bg)";
            statusDiv.style.color = "var(--danger-color)";
            statusDiv.innerHTML = `❌ ไม่สามารถดึงข้อมูลได้: ${err.message}<br><small>กรุณาตรวจสอบว่าได้ตั้งค่าการแชร์เป็น "ทุกคนที่มีลิงก์มีสิทธิ์ดู" แล้วหรือยัง</small>`;
        }
    }
}

function initGoogleSheetSync() {
    const savedUrl = localStorage.getItem("gh_sheet_url");
    if (savedUrl) {
        setupAutoSyncTimer();
        // Background sync on load if online
        if (navigator.onLine) {
            syncGoogleSheet(false); // silent sync
        }
    }
}

function setupAutoSyncTimer() {
    if (autoSyncTimerId) {
        clearInterval(autoSyncTimerId);
        autoSyncTimerId = null;
    }
    const autoSyncVal = parseInt(localStorage.getItem("gh_auto_sync") || "0", 10);
    if (autoSyncVal > 0) {
        autoSyncTimerId = setInterval(() => {
            if (navigator.onLine) {
                syncGoogleSheet(false);
            }
        }, autoSyncVal);
    }
}

async function syncGoogleSheet(showFeedback = true) {
    const savedUrl = localStorage.getItem("gh_sheet_url");
    const savedTab = localStorage.getItem("gh_sheet_tab") || DEFAULT_SHEET_TAB;

    if (!savedUrl) {
        if (showFeedback) {
            openSheetConfigModal();
        }
        return;
    }

    const parsed = parseGoogleSheetUrl(savedUrl);
    if (!parsed) {
        if (showFeedback) {
            showToast("❌ ลิงก์ Google Sheet ไม่ถูกต้อง กรุณาตั้งค่าใหม่", "error");
            openSheetConfigModal();
        }
        return;
    }

    if (showFeedback) {
        showToast("⏳ กำลังดึงข้อมูลสดจาก Google Sheet...", "info", 2000);
    }
    updateSyncStatusUI("syncing", "กำลังดึงข้อมูลสด...", "กำลังเชื่อมต่อ Google Sheets API");

    try {
        const success = await fetchAndApplyGoogleSheet(parsed.sheetId, savedTab, parsed.gid);
        if (success) {
            const timeStr = new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            const dateStr = new Date().toLocaleDateString("th-TH");
            const fullTime = `${dateStr} ${timeStr}`;
            localStorage.setItem("gh_last_sync_time", fullTime);
            updateSyncStatusUI("live", `เชื่อมต่อสด (${formatNumber(allData.length)} รายการ)`, `อัปเดตล่าสุด: ${timeStr} น.`);
            if (showFeedback) {
                showToast(`✅ ซิงค์ข้อมูลสดสำเร็จ (${formatNumber(allData.length)} รายการ)`, "success");
            }
        }
    } catch (err) {
        console.error("Sync error:", err);
        updateSyncStatusUI("error", "เชื่อมต่อไม่สำเร็จ", err.message);
        if (showFeedback) {
            showToast(`❌ ดึงข้อมูลสดไม่สำเร็จ: ${err.message}`, "error", 4500);
        }
    }
}

async function fetchAndApplyGoogleSheet(sheetId, tabName, gid) {
    // Construct Google Visualization CSV query URL with timestamp to prevent caching
    let gvizUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&_nocache=${Date.now()}`;
    if (gid) {
        gvizUrl += `&gid=${gid}`;
    } else if (tabName) {
        gvizUrl += `&sheet=${encodeURIComponent(tabName)}`;
    }

    const response = await fetch(gvizUrl);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const csvText = await response.text();
    if (!csvText || csvText.trim().length === 0) {
        throw new Error("Google Sheet ไม่มีข้อมูลหรือว่างเปล่า");
    }

    // Parse CSV using SheetJS
    const workbook = XLSX.read(csvText, { type: "string" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (!rows || rows.length < 2) {
        throw new Error("ไม่พบแถวข้อมูลในชีต");
    }

    const headerRow = rows[0].map(h => (h || "").toString().trim());

    // Column mapping:
    // Col 0 (A): เลขที่แจ้งซ่อม
    // Col 3 (D): ประเภทงาน
    // Col 4 (E): สาขา
    // Col 5 (F): วันที่แจ้งซ่อม
    // Col 6 (G): ปีแจ้งซ่อม
    // Col 16 (Q): สถานะ AESCON
    // Col 19 (T): มูลค่า ไม่รวม VAT 7%
    let colIdx = {
        docNumber: findColumnIndex(headerRow, ["เลขที่แจ้งซ่อม", "เลขที่เอกสาร", "เลขที่", "docnumber", "doc_no"], 0),
        branch: findColumnIndex(headerRow, ["สาขา", "ชื่อสาขา", "branch"], 4),
        reportDate: findColumnIndex(headerRow, ["วันที่แจ้งซ่อม", "วันที่แจ้ง", "วันที่", "reportdate"], 5),
        year: findColumnIndex(headerRow, ["ปีแจ้งซ่อม", "ปีที่แจ้ง", "ปี", "year"], 6),
        status: findColumnIndex(headerRow, ["สถานะ aescon", "สถานะaescon", "aescon", "สถานะงาน", "สถานะ", "status"], 16),
        value: findColumnIndex(headerRow, ["มูลค่า ไม่รวม vat 7%", "ไม่รวม vat", "ไม่รวมvat", "มูลค่างาน", "มูลค่า", "ราคา", "value"], 19)
    };

    const parsedItems = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const branchStr = String(row[colIdx.branch] || "").trim();
        const rawDate = row[colIdx.reportDate];
        const rawYear = row[colIdx.year];
        const rawDesc = String(row[1] || "").trim();

        // Skip truly empty trailing rows
        if (!branchStr && !rawDate && !rawYear && !rawDesc) continue;

        let docNo = String(row[colIdx.docNumber] !== undefined && row[colIdx.docNumber] !== null ? row[colIdx.docNumber] : (row[0] || "")).trim();
        if (docNo === "เลขที่แจ้งซ่อม" || docNo === "เลขที่เอกสาร" || docNo === "เลขที่") continue;
        if (!docNo) docNo = "-";

        const dateInfo = parseDateInfo(rawDate, rawYear);

        let rawVal = row[colIdx.value];
        let numVal = 0;
        if (typeof rawVal === "number") {
            numVal = rawVal;
        } else if (typeof rawVal === "string") {
            numVal = parseFloat(rawVal.replace(/[^0-9.]/g, "").trim()) || 0;
        }

        // Auto-correct typo for Doc #3790 if 3,730,000 -> 379,000
        if (docNo === "3790" && numVal === 3730000) {
            numVal = 379000;
        }

        let rawStatus = String(row[colIdx.status] || "").trim();
        if (!rawStatus) rawStatus = "รอประเมินราคาหน้างาน";

        parsedItems.push({
            docNumber: docNo,
            reportDate: dateInfo.formattedDate,
            year: dateInfo.year,
            month: dateInfo.month,
            monthName: dateInfo.monthName,
            branch: branchStr || "ไม่ระบุสาขา",
            workType: "ปรับอากาศ",
            status: rawStatus,
            value: Math.round(numVal * 100) / 100
        });
    }

    if (parsedItems.length === 0) {
        throw new Error("ไม่พบรายการงานระบบปรับอากาศที่ถูกต้อง");
    }

    allData = parsedItems;
    try {
        localStorage.setItem("gh_cached_data", JSON.stringify(parsedItems));
    } catch (e) {
        console.warn("Storage quota full, cached in memory only");
    }

    // Preserve selected filter values
    const prevY = document.getElementById("filterYear") ? document.getElementById("filterYear").value : "";
    const prevM = document.getElementById("filterMonth") ? document.getElementById("filterMonth").value : "";
    const prevB = document.getElementById("filterBranch") ? document.getElementById("filterBranch").value : "";
    const prevS = document.getElementById("filterStatus") ? document.getElementById("filterStatus").value : "";

    initFilterOptions();

    if (prevY && document.querySelector(`#filterYear option[value="${prevY}"]`)) {
        document.getElementById("filterYear").value = prevY;
    }
    if (prevM && document.querySelector(`#filterMonth option[value="${prevM}"]`)) {
        document.getElementById("filterMonth").value = prevM;
    }
    if (prevB && document.querySelector(`#filterBranch option[value="${prevB}"]`)) {
        document.getElementById("filterBranch").value = prevB;
    }
    if (prevS && document.querySelector(`#filterStatus option[value="${prevS}"]`)) {
        document.getElementById("filterStatus").value = prevS;
    }

    updateDashboard();
    return true;
}

// ======== Reset to Default Verified Data ========
function resetToDefaultData() {
    if (confirm("คุณต้องการล้างการเชื่อมต่อ Google Sheet และกลับไปใช้ข้อมูลมาตรฐานที่ถูกต้อง (983 รายการ) ใช่หรือไม่?")) {
        // Clear all cached google sheet settings and data
        localStorage.removeItem("gh_sheet_url");
        localStorage.removeItem("gh_sheet_tab");
        localStorage.removeItem("gh_auto_sync");
        localStorage.removeItem("gh_cached_data");
        localStorage.removeItem("gh_last_sync_time");

        if (autoSyncTimerId) {
            clearInterval(autoSyncTimerId);
            autoSyncTimerId = null;
        }

        if (typeof AIRCON_DATA !== "undefined" && Array.isArray(AIRCON_DATA)) {
            allData = [...AIRCON_DATA];
        } else {
            allData = [];
        }

        updateSyncStatusUI("offline", "ข้อมูลเริ่มต้น (983 รายการ)", "ยกเลิกการเชื่อมต่อแล้ว");
        initFilterOptions();
        updateDashboard();
        closeSheetConfigModal();
        showToast("✅ คืนค่าข้อมูลเริ่มต้นที่ถูกต้องเรียบร้อยแล้ว", "success");
    }
}


