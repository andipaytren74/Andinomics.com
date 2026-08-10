/* ==========================================================
   ANDINOMICS — Smart Financial Dashboard
   Core Engine (script.js)
   Developer: Andi Muhammad Hakim

   Struktur modul:
    1.  State
    2.  Config
    3.  DOM cache
    4.  Utils
    5.  Storage (Local Storage layer)
    6.  Validation
    7.  Transaction Engine
    8.  Render Engine
    9.  Chart Engine
    10. Dashboard Engine
    11. Export Engine (kontrak untuk PDF/Excel/CSV di masa depan)
    12. Dialog Engine (SweetAlert2 — Sprint 11)
    13. Toast Engine (Sprint 3.2)
    14. Event Engine
    15. Init
   ========================================================== */

(function () {
    "use strict";

    /* ==========================================================
       1. STATE
       ========================================================== */

    const State = {
        transactions: [],
        editingId: null,
        chartInstance: null,
    };


    /* ==========================================================
       2. CONFIG
       ========================================================== */

    const CONFIG = Object.freeze({
        STORAGE_KEY: "andinomics-transactions",
        TOAST_DURATION_MS: 3000,
        DESCRIPTION_MAX_LENGTH: 80,
        DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
        CHART_FALLBACK_COLORS: Object.freeze({
            success: "#2ecc71",
            danger: "#ff5d5d",
            textMuted: "#9eb3a6",
            grid: "rgba(255, 255, 255, 0.06)",
        }),
    });


    /* ==========================================================
       3. DOM CACHE
       ========================================================== */

    const dom = {
        form: document.getElementById("transactionForm"),
        transactionId: document.getElementById("transactionId"),
        description: document.getElementById("description"),
        type: document.getElementById("type"),
        category: document.getElementById("category"),
        amount: document.getElementById("amount"),
        date: document.getElementById("date"),
        submitBtn: document.getElementById("submitBtn"),
        submitBtnLabel: document.getElementById("submitBtnLabel"),
        cancelEditBtn: document.getElementById("cancelEditBtn"),
        table: document.getElementById("transactionTable"),
        searchInput: document.getElementById("searchTransaction"),
        saldo: document.getElementById("saldo"),
        masuk: document.getElementById("masuk"),
        keluar: document.getElementById("keluar"),
        totalTransaksi: document.getElementById("transaksi"),
        kategoriTerbesar: document.getElementById("kategoriTerbesar"),
        transaksiTerakhir: document.getElementById("transaksiTerakhir"),
        todayDate: document.getElementById("today-date"),
        footerYear: document.getElementById("footer-year"),
        toastContainer: document.getElementById("toastContainer"),
        chartCanvas: document.getElementById("cashflowChart"),
    };


    /* ==========================================================
       4. UTILS
       ========================================================== */

    const Utils = {
        formatRupiah(number) {
            return new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
            }).format(Number.isFinite(number) ? number : 0);
        },

        formatDateLong(date) {
            return new Intl.DateTimeFormat("id-ID", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
            }).format(date);
        },

        formatDateShort(isoDate) {
            const parsed = new Date(`${isoDate}T00:00:00`);
            if (Number.isNaN(parsed.getTime())) {
                return isoDate;
            }
            return new Intl.DateTimeFormat("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }).format(parsed);
        },

        escapeHtml(value) {
            const div = document.createElement("div");
            div.textContent = String(value);
            return div.innerHTML;
        },

        generateId() {
            return (crypto.randomUUID && crypto.randomUUID()) ||
                `txn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        },

        todayIso() {
            const now = new Date();
            const offset = now.getTimezoneOffset();
            const local = new Date(now.getTime() - offset * 60 * 1000);
            return local.toISOString().slice(0, 10);
        },
    };


    /* ==========================================================
       5. STORAGE
       ========================================================== */

    const Storage = {
        _isValidRecord(record) {
            return Boolean(
                record &&
                typeof record.id === "string" &&
                typeof record.description === "string" &&
                (record.type === "Pemasukan" || record.type === "Pengeluaran") &&
                typeof record.category === "string" &&
                Number.isFinite(record.amount) &&
                typeof record.date === "string"
            );
        },

        load() {
            try {
                const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (!raw) {
                    return [];
                }
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) {
                    throw new Error("Data tersimpan rusak: bukan berupa array.");
                }
                const valid = parsed.filter(Storage._isValidRecord);
                if (valid.length !== parsed.length) {
                    console.warn(`[Storage.load] ${parsed.length - valid.length} data tidak valid diabaikan.`);
                }
                return valid;
            } catch (error) {
                console.error("[Storage.load] Gagal memuat data dari Local Storage:", error);
                return [];
            }
        },

        save(transactions) {
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(transactions));
                return true;
            } catch (error) {
                console.error("[Storage.save] Gagal menyimpan data ke Local Storage:", error);
                return false;
            }
        },

        clear() {
            try {
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                return true;
            } catch (error) {
                console.error("[Storage.clear] Gagal menghapus Local Storage:", error);
                return false;
            }
        },

        exists() {
            try {
                return localStorage.getItem(CONFIG.STORAGE_KEY) !== null;
            } catch (error) {
                console.error("[Storage.exists] Gagal memeriksa Local Storage:", error);
                return false;
            }
        },

        export() {
            try {
                return JSON.stringify(State.transactions, null, 2);
            } catch (error) {
                console.error("[Storage.export] Gagal mengekspor data:", error);
                return null;
            }
        },

        import(jsonString) {
            try {
                const parsed = JSON.parse(jsonString);
                if (!Array.isArray(parsed)) {
                    throw new Error("Format data impor tidak valid.");
                }
                const valid = parsed.filter(Storage._isValidRecord);
                State.transactions = valid;
                Storage.save(valid);
                return true;
            } catch (error) {
                console.error("[Storage.import] Gagal mengimpor data:", error);
                return false;
            }
        },
    };


    /* ==========================================================
       6. VALIDATION
       ========================================================== */

    const Validation = {
        errors: new Map(),

        clear() {
            this.errors.clear();
            document.querySelectorAll(".form-error").forEach((el) => (el.textContent = ""));
            [dom.description, dom.amount, dom.date].forEach((el) => el?.removeAttribute("aria-invalid"));
        },

        setError(field, message) {
            this.errors.set(field, message);
            const el = document.getElementById(`${field}-error`);
            const input = dom[field];
            if (el) {
                el.textContent = message;
            }
            if (input) {
                input.setAttribute("aria-invalid", "true");
            }
        },

        validateDescription(description) {
            const trimmed = (description ?? "").trim();
            if (trimmed.length === 0) {
                this.setError("description", "Keterangan wajib diisi.");
            } else if (trimmed.length > CONFIG.DESCRIPTION_MAX_LENGTH) {
                this.setError("description", `Keterangan maksimal ${CONFIG.DESCRIPTION_MAX_LENGTH} karakter.`);
            }
        },

        validateAmount(amount) {
            if (amount === "" || amount === null || amount === undefined || !Number.isFinite(amount)) {
                this.setError("amount", "Nominal wajib diisi dengan angka yang valid.");
            } else if (amount < 0) {
                this.setError("amount", "Nominal tidak boleh negatif.");
            } else if (amount === 0) {
                this.setError("amount", "Nominal tidak boleh nol.");
            }
        },

        validateDate(date) {
            if (!date) {
                this.setError("date", "Tanggal wajib diisi.");
            } else if (!CONFIG.DATE_PATTERN.test(date) || Number.isNaN(new Date(date).getTime())) {
                this.setError("date", "Format tanggal tidak valid.");
            }
        },

        validate({ description, amount, date }) {
            this.clear();
            this.validateDescription(description);
            this.validateAmount(amount);
            this.validateDate(date);
            return this.errors.size === 0;
        },
    };


    /* ==========================================================
       7. TRANSACTION ENGINE
       ========================================================== */

    const TransactionEngine = {
        createTransaction(payload) {
            return { id: Utils.generateId(), ...payload };
        },

        addTransaction(payload) {
            const transaction = this.createTransaction(payload);
            State.transactions.push(transaction);
            return transaction;
        },

        updateTransaction(id, payload) {
            const index = State.transactions.findIndex((t) => t.id === id);
            if (index === -1) {
                return null;
            }
            State.transactions[index] = { ...State.transactions[index], ...payload };
            return State.transactions[index];
        },

        deleteTransaction(id) {
            const before = State.transactions.length;
            State.transactions = State.transactions.filter((t) => t.id !== id);
            return State.transactions.length !== before;
        },

        findTransaction(id) {
            return State.transactions.find((t) => t.id === id) ?? null;
        },

        sortTransaction(list) {
            return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
        },

        filterTransaction(list, keyword) {
            const trimmed = (keyword ?? "").trim().toLowerCase();
            if (!trimmed) {
                return list;
            }
            return list.filter((item) =>
                [item.description, item.category, item.type].join(" ").toLowerCase().includes(trimmed)
            );
        },
    };


    /* ==========================================================
       8. RENDER ENGINE
       ========================================================== */

    const RenderEngine = {
        renderDashboard() {
            try {
                const summary = DashboardEngine.getSummary();

                dom.saldo.textContent = Utils.formatRupiah(summary.saldo);
                dom.masuk.textContent = Utils.formatRupiah(summary.pemasukan);
                dom.keluar.textContent = Utils.formatRupiah(summary.pengeluaran);
                dom.totalTransaksi.textContent = String(summary.jumlahTransaksi);

                if (dom.kategoriTerbesar) {
                    dom.kategoriTerbesar.textContent = summary.kategoriTerbesar;
                }

                if (dom.transaksiTerakhir) {
                    dom.transaksiTerakhir.textContent = summary.transaksiTerakhir
                        ? `${summary.transaksiTerakhir.description} — ${Utils.formatRupiah(summary.transaksiTerakhir.amount)}`
                        : "-";
                }
            } catch (error) {
                console.error("[RenderEngine.renderDashboard] Gagal merender dashboard:", error);
            }
        },

        renderTable(filterText = "") {
            try {
                const keyword = filterText.trim();
                const filtered = TransactionEngine.filterTransaction(State.transactions, keyword);

                if (filtered.length === 0) {
                    dom.table.innerHTML = `
                        <tr>
                            <td colspan="6" class="empty-data">
                                <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                                ${keyword ? "Tidak ada transaksi yang cocok." : "Belum ada transaksi."}
                            </td>
                        </tr>
                    `;
                    return;
                }

                const sorted = TransactionEngine.sortTransaction(filtered);
                dom.table.innerHTML = sorted.map(RenderEngine._buildRow).join("");
            } catch (error) {
                console.error("[RenderEngine.renderTable] Gagal merender tabel:", error);
            }
        },

        _buildRow(item) {
            const badgeClass = item.type === "Pemasukan" ? "badge-income" : "badge-expense";
            const amountClass = item.type === "Pemasukan" ? "amount-income" : "amount-expense";
            const sign = item.type === "Pemasukan" ? "+" : "−";
            const safeId = Utils.escapeHtml(item.id);
            const safeDescription = Utils.escapeHtml(item.description);

            return `
                <tr data-id="${safeId}">
                    <td>${Utils.escapeHtml(Utils.formatDateShort(item.date))}</td>
                    <td>${safeDescription}</td>
                    <td>${Utils.escapeHtml(item.category)}</td>
                    <td>
                        <span class="badge ${badgeClass}">${Utils.escapeHtml(item.type)}</span>
                    </td>
                    <td class="${amountClass}">
                        ${sign}${Utils.escapeHtml(Utils.formatRupiah(item.amount))}
                    </td>
                    <td>
                        <div class="action-group">
                            <button type="button" class="edit-btn" data-action="edit" data-id="${safeId}" aria-label="Edit transaksi ${safeDescription}">
                                <i class="fa-solid fa-pen" aria-hidden="true"></i>
                            </button>
                            <button type="button" class="delete-btn" data-action="delete" data-id="${safeId}" aria-label="Hapus transaksi ${safeDescription}">
                                <i class="fa-solid fa-trash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        },

        renderChart() {
            ChartEngine.update();
        },

        renderAll(filterText = "") {
            this.renderDashboard();
            this.renderTable(filterText);
            this.renderChart();
        },
    };


    /* ==========================================================
       9. CHART ENGINE
       ========================================================== */

    const ChartEngine = {
        _buildDatasets(transactions) {
            const totalsByDate = new Map();

            transactions.forEach((item) => {
                if (!totalsByDate.has(item.date)) {
                    totalsByDate.set(item.date, { income: 0, expense: 0 });
                }
                const entry = totalsByDate.get(item.date);
                if (item.type === "Pemasukan") {
                    entry.income += item.amount;
                } else {
                    entry.expense += item.amount;
                }
            });

            const sortedDates = [...totalsByDate.keys()].sort();

            return {
                labels: sortedDates.map((d) => Utils.formatDateShort(d)),
                incomeData: sortedDates.map((d) => totalsByDate.get(d).income),
                expenseData: sortedDates.map((d) => totalsByDate.get(d).expense),
            };
        },

        _getThemeColors() {
            const styles = getComputedStyle(document.documentElement);
            const fallback = CONFIG.CHART_FALLBACK_COLORS;

            return {
                success: styles.getPropertyValue("--success").trim() || fallback.success,
                danger: styles.getPropertyValue("--danger").trim() || fallback.danger,
                text: styles.getPropertyValue("--text-muted").trim() || fallback.textMuted,
                grid: fallback.grid,
            };
        },

        update() {
            if (typeof Chart === "undefined" || !dom.chartCanvas) {
                return;
            }

            try {
                const { labels, incomeData, expenseData } = this._buildDatasets(State.transactions);
                const colors = this._getThemeColors();

                const chartData = {
                    labels: labels.length ? labels : ["Belum ada data"],
                    datasets: [
                        {
                            label: "Pemasukan",
                            data: labels.length ? incomeData : [0],
                            borderColor: colors.success,
                            backgroundColor: `${colors.success}33`,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 3,
                        },
                        {
                            label: "Pengeluaran",
                            data: labels.length ? expenseData : [0],
                            borderColor: colors.danger,
                            backgroundColor: `${colors.danger}33`,
                            tension: 0.35,
                            fill: true,
                            pointRadius: 3,
                        },
                    ],
                };

                const options = {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { labels: { color: colors.text } },
                        tooltip: {
                            callbacks: {
                                label(context) {
                                    return `${context.dataset.label}: ${Utils.formatRupiah(context.parsed.y)}`;
                                },
                            },
                        },
                    },
                    scales: {
                        x: {
                            ticks: { color: colors.text },
                            grid: { color: colors.grid },
                        },
                        y: {
                            ticks: {
                                color: colors.text,
                                callback: (value) => Utils.formatRupiah(value),
                            },
                            grid: { color: colors.grid },
                        },
                    },
                };

                if (State.chartInstance) {
                    State.chartInstance.data = chartData;
                    State.chartInstance.options = options;
                    State.chartInstance.update();
                } else {
                    State.chartInstance = new Chart(dom.chartCanvas, {
                        type: "line",
                        data: chartData,
                        options: options,
                    });
                }
            } catch (error) {
                console.error("[ChartEngine.update] Gagal memperbarui chart:", error);
            }
        },
    };


    /* ==========================================================
       10. DASHBOARD ENGINE
       ========================================================== */

    const DashboardEngine = {
        getSummary() {
            let totalMasuk = 0;
            let totalKeluar = 0;
            const categoryTotals = new Map();
            let latestTransaction = null;

            State.transactions.forEach((item) => {
                if (item.type === "Pemasukan") {
                    totalMasuk += item.amount;
                } else {
                    totalKeluar += item.amount;
                }

                categoryTotals.set(item.category, (categoryTotals.get(item.category) || 0) + item.amount);

                if (!latestTransaction || item.date > latestTransaction.date) {
                    latestTransaction = item;
                }
            });

            let kategoriTerbesar = "-";
            let kategoriTerbesarTotal = 0;

            categoryTotals.forEach((total, category) => {
                if (total > kategoriTerbesarTotal) {
                    kategoriTerbesar = category;
                    kategoriTerbesarTotal = total;
                }
            });

            return {
                saldo: totalMasuk - totalKeluar,
                pemasukan: totalMasuk,
                pengeluaran: totalKeluar,
                jumlahTransaksi: State.transactions.length,
                kategoriTerbesar: kategoriTerbesar,
                transaksiTerakhir: latestTransaction,
            };
        },
    };


    /* ==========================================================
       10.5 ANALYTICS ENGINE
       ========================================================== */

    const AnalyticsEngine = {

        render() {

            try {

                const transactions = State.transactions || [];

                const incomeEl = document.getElementById("analyticsIncome");
                const expenseEl = document.getElementById("analyticsExpense");
                const balanceEl = document.getElementById("analyticsBalance");
                const countEl = document.getElementById("analyticsTransactionCount");
                const topCategoryEl = document.getElementById("analyticsTopCategory");
                const lastTransactionEl = document.getElementById("analyticsLastTransaction");
                const categoryListEl = document.getElementById("analyticsCategoryList");

                let totalIncome = 0;
                let totalExpense = 0;

                const expenseByCategory = new Map();

                transactions.forEach((transaction) => {
                    const amount = Number(transaction.amount) || 0;

                    if (transaction.type === "Pemasukan") {
                        totalIncome += amount;
                    }

                    if (transaction.type === "Pengeluaran") {
                        totalExpense += amount;

                        const category = transaction.category || "Lainnya";

                        expenseByCategory.set(
                            category,
                            (expenseByCategory.get(category) || 0) + amount
                        );
                    }
                });

                const balance = totalIncome - totalExpense;

                if (incomeEl) {
                    incomeEl.textContent = Utils.formatRupiah(totalIncome);
                }

                if (expenseEl) {
                    expenseEl.textContent = Utils.formatRupiah(totalExpense);
                }

                if (balanceEl) {
                    balanceEl.textContent = Utils.formatRupiah(balance);
                    balanceEl.classList.toggle("analytics-positive", balance >= 0);
                    balanceEl.classList.toggle("analytics-negative", balance < 0);
                }

                if (countEl) {
                    countEl.textContent = String(transactions.length);
                }

                let topCategory = null;
                let topCategoryAmount = 0;

                expenseByCategory.forEach((amount, category) => {
                    if (amount > topCategoryAmount) {
                        topCategoryAmount = amount;
                        topCategory = category;
                    }
                });

                if (topCategoryEl) {
                    if (topCategory) {
                        topCategoryEl.innerHTML = `
                            <strong>${Utils.escapeHtml(topCategory)}</strong>
                            <br>
                            <span>${Utils.formatRupiah(topCategoryAmount)}</span>
                        `;
                    } else {
                        topCategoryEl.textContent = "-";
                    }
                }

                const sortedTransactions = [...transactions].sort((a, b) => {
                    return new Date(b.date) - new Date(a.date);
                });

                const latest = sortedTransactions[0];

                if (lastTransactionEl) {
                    if (latest) {
                        lastTransactionEl.innerHTML = `
                            <strong>${Utils.escapeHtml(latest.description)}</strong>
                            <br>
                            <span>${Utils.formatRupiah(latest.amount)}</span>
                        `;
                    } else {
                        lastTransactionEl.textContent = "-";
                    }
                }

                if (categoryListEl) {
                    if (expenseByCategory.size === 0) {
                        categoryListEl.innerHTML = `
                            <p class="analytics-empty">Belum ada data pengeluaran.</p>
                        `;
                    } else {
                        const sortedCategories = [...expenseByCategory.entries()].sort((a, b) => b[1] - a[1]);

                        categoryListEl.innerHTML = sortedCategories
                            .map(([category, amount]) => {
                                const percentage = totalExpense > 0 ? (amount / totalExpense) * 100 : 0;

                                return `
                                    <div class="analytics-category-item">
                                        <div class="analytics-category-info">
                                            <span>${Utils.escapeHtml(category)}</span>
                                            <strong>${Utils.formatRupiah(amount)}</strong>
                                        </div>
                                        <div class="analytics-progress">
                                            <div class="analytics-progress-bar" style="width:${percentage.toFixed(1)}%"></div>
                                        </div>
                                        <small>${percentage.toFixed(1)}%</small>
                                    </div>
                                `;
                            })
                            .join("");
                    }
                }

            } catch (error) {

                console.error("[AnalyticsEngine.render]", error);

            }

        }

    };


    /* ==========================================================
       10.6 INSIGHT ENGINE
       Financial Insight Engine — menganalisis State.transactions
       dan menghasilkan kesimpulan keuangan otomatis (lokal,
       tanpa API eksternal). Tidak membuat UI/CSS pada tahap ini.
       ========================================================== */

    const InsightEngine = {

        _emptyResult() {
            return {
                hasData: false,
                message: "Belum ada cukup data transaksi untuk memberikan insight keuangan.",
            };
        },

        analyze() {
            try {
                const transactions = State.transactions || [];

                if (transactions.length < 1) {
                    return this._emptyResult();
                }

                let totalIncome = 0;
                let totalExpense = 0;
                let incomeCount = 0;
                let expenseCount = 0;

                const expenseByCategory = new Map();

                transactions.forEach((transaction) => {
                    const amount = Number(transaction?.amount) || 0;
                    const type = transaction?.type;

                    if (type === "Pemasukan") {
                        totalIncome += amount;
                        incomeCount += 1;
                    }

                    if (type === "Pengeluaran") {
                        totalExpense += amount;
                        expenseCount += 1;

                        const category = transaction?.category || "Lainnya";

                        expenseByCategory.set(
                            category,
                            (expenseByCategory.get(category) || 0) + amount
                        );
                    }
                });

                const balance = totalIncome - totalExpense;

                let topCategoryName = null;
                let topCategoryAmount = 0;

                expenseByCategory.forEach((amount, category) => {
                    if (amount > topCategoryAmount) {
                        topCategoryAmount = amount;
                        topCategoryName = category;
                    }
                });

                const topCategoryPercentage =
                    totalExpense > 0 && topCategoryAmount > 0
                        ? (topCategoryAmount / totalExpense) * 100
                        : 0;

                const expenseRatio =
                    totalIncome > 0
                        ? (totalExpense / totalIncome) * 100
                        : 0;

                const savingRatio =
                    balance > 0 && totalIncome > 0
                        ? (balance / totalIncome) * 100
                        : 0;

                const insights = [];

                /* ---------- 1. Insight saldo ---------- */
                if (balance > 0) {
                    insights.push({
                        type: "success",
                        icon: "fa-circle-check",
                        title: "Kondisi Keuangan Positif",
                        message: `Saldo Anda saat ini positif sebesar ${Utils.formatRupiah(balance)}.`,
                    });
                } else if (balance === 0) {
                    insights.push({
                        type: "info",
                        icon: "fa-scale-balanced",
                        title: "Kondisi Keuangan Seimbang",
                        message: "Total pemasukan dan pengeluaran Anda seimbang saat ini.",
                    });
                } else {
                    insights.push({
                        type: "danger",
                        icon: "fa-triangle-exclamation",
                        title: "Kondisi Keuangan Negatif",
                        message: `Saldo Anda saat ini negatif sebesar ${Utils.formatRupiah(Math.abs(balance))}.`,
                    });
                }

                /* ---------- 2 & 3. Kategori pengeluaran terbesar + persentase ---------- */
                if (topCategoryName) {
                    insights.push({
                        type: "info",
                        icon: "fa-chart-pie",
                        title: "Kategori Pengeluaran Terbesar",
                        message: `Pengeluaran terbesar Anda berasal dari kategori ${Utils.escapeHtml(topCategoryName)} sebesar ${Utils.formatRupiah(topCategoryAmount)}.`,
                    });

                    if (topCategoryPercentage >= 50) {
                        insights.push({
                            type: "warning",
                            icon: "fa-triangle-exclamation",
                            title: "Konsentrasi Pengeluaran Tinggi",
                            message: `Kategori ${Utils.escapeHtml(topCategoryName)} menyumbang sekitar ${topCategoryPercentage.toFixed(0)}% dari total pengeluaran.`,
                        });
                    }
                }

                /* ---------- 4. Transaksi ---------- */
                insights.push({
                    type: "info",
                    icon: "fa-receipt",
                    title: "Ringkasan Transaksi",
                    message: `Anda memiliki ${transactions.length} transaksi (${incomeCount} pemasukan, ${expenseCount} pengeluaran).`,
                });

                /* ---------- 5. Rasio pengeluaran terhadap pemasukan ---------- */
                if (totalIncome > 0) {
                    let ratioType = "success";
                    let ratioTitle = "Rasio Pengeluaran Sangat Baik";
                    let ratioMessage = `Rasio pengeluaran Anda terhadap pemasukan sekitar ${expenseRatio.toFixed(0)}%, tergolong sangat baik.`;

                    if (expenseRatio > 100) {
                        ratioType = "danger";
                        ratioTitle = "Pengeluaran Melebihi Pemasukan";
                        ratioMessage = `Pengeluaran Anda sekitar ${expenseRatio.toFixed(0)}% dari pemasukan, melebihi total pemasukan Anda.`;
                    } else if (expenseRatio > 75) {
                        ratioType = "warning";
                        ratioTitle = "Rasio Pengeluaran Perlu Perhatian";
                        ratioMessage = `Rasio pengeluaran Anda terhadap pemasukan sekitar ${expenseRatio.toFixed(0)}%, perlu perhatian lebih.`;
                    } else if (expenseRatio > 50) {
                        ratioType = "info";
                        ratioTitle = "Rasio Pengeluaran Cukup Terkendali";
                        ratioMessage = `Rasio pengeluaran Anda terhadap pemasukan sekitar ${expenseRatio.toFixed(0)}%, cukup terkendali.`;
                    }

                    insights.push({
                        type: ratioType,
                        icon: "fa-percent",
                        title: ratioTitle,
                        message: ratioMessage,
                    });
                }

                /* ---------- 6. Insight tabungan / surplus ---------- */
                if (balance > 0 && totalIncome > 0) {
                    insights.push({
                        type: "success",
                        icon: "fa-piggy-bank",
                        title: "Surplus Keuangan",
                        message: `Surplus Anda sekitar ${savingRatio.toFixed(0)}% dari total pemasukan.`,
                    });
                }

                return {
                    hasData: true,

                    summary: {
                        totalIncome,
                        totalExpense,
                        balance,
                        transactionCount: transactions.length,
                    },

                    topCategory: {
                        name: topCategoryName,
                        amount: topCategoryAmount,
                        percentage: topCategoryPercentage,
                    },

                    expenseRatio,

                    savingRatio,

                    insights,
                };
            } catch (error) {
                console.error("[InsightEngine.analyze]", error);
                return this._emptyResult();
            }
        },

    };
    /* ==========================================================
       10.7 FINANCIAL INSIGHTS RENDERER
       Menampilkan hasil InsightEngine ke #insightList
       ========================================================== */

    function renderFinancialInsights() {
        try {
            const insightList =
                document.getElementById("insightList");

            if (!insightList) {
                return;
            }

            const result =
                InsightEngine.analyze();

            insightList.replaceChildren();

            if (!result.hasData) {
                const emptyState =
                    document.createElement("p");

                emptyState.className =
                    "insight-empty";

                emptyState.textContent =
                    result.message ||
                    "Belum ada cukup data transaksi untuk memberikan insight keuangan.";

                insightList.appendChild(
                    emptyState
                );

                return;
            }

            result.insights.forEach(
                (insight) => {

                    const item =
                        document.createElement("article");

                    item.className =
                        `insight-item insight--${insight.type}`;

                    const icon =
                        document.createElement("div");

                    icon.className =
                        "insight-icon";

                    const iconElement =
                        document.createElement("i");

                    iconElement.className =
                        `fa-solid ${insight.icon}`;

                    iconElement.setAttribute(
                        "aria-hidden",
                        "true"
                    );

                    icon.appendChild(
                        iconElement
                    );

                    const content =
                        document.createElement("div");

                    content.className =
                        "insight-content";

                    const title =
                        document.createElement("h3");

                    title.textContent =
                        insight.title;

                    const message =
                        document.createElement("p");

                    message.textContent =
                        insight.message;

                    content.appendChild(
                        title
                    );

                    content.appendChild(
                        message
                    );

                    item.appendChild(
                        icon
                    );

                    item.appendChild(
                        content
                    );

                    insightList.appendChild(
                        item
                    );
                }
            );

        } catch (error) {

            console.error(
                "[renderFinancialInsights]",
                error
            );
        }
    }

    /* ==========================================================
       11. EXPORT ENGINE
       PDF / Excel / CSV
       ========================================================== */

    const ExportEngine = {
        _loadScript(src, globalName) {
            return new Promise((resolve, reject) => {
                if (globalName && window[globalName]) {
                    resolve(window[globalName]);
                    return;
                }

                const existing = document.querySelector(`script[src="${src}"]`);

                if (existing) {
                    existing.addEventListener(
                        "load",
                        () => resolve(globalName ? window[globalName] : true),
                        { once: true }
                    );
                    existing.addEventListener(
                        "error",
                        () => reject(new Error(`Gagal memuat library: ${src}`)),
                        { once: true }
                    );
                    return;
                }

                const script = document.createElement("script");
                script.src = src;
                script.async = true;

                script.onload = () => {
                    if (globalName && !window[globalName]) {
                        reject(new Error(`Library ${globalName} tidak tersedia.`));
                        return;
                    }
                    resolve(globalName ? window[globalName] : true);
                };

                script.onerror = () => {
                    reject(new Error(`Gagal memuat library: ${src}`));
                };

                document.head.appendChild(script);
            });
        },

        _getRows() {
            return TransactionEngine.sortTransaction(State.transactions).map((item, index) => ({
                No: index + 1,
                Tanggal: Utils.formatDateShort(item.date),
                Keterangan: item.description,
                Kategori: item.category,
                Jenis: item.type,
                Nominal: item.amount,
            }));
        },

        _getSummary() {
            return DashboardEngine.getSummary();
        },

        _downloadBlob(blob, filename) {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        },

        _dateStamp() {
            return new Date().toISOString().slice(0, 10);
        },

        toCSV() {
            if (!State.transactions.length) {
                showToast("Belum ada transaksi untuk diekspor.", "warning");
                return;
            }

            const rows = this._getRows();
            const headers = ["No", "Tanggal", "Keterangan", "Kategori", "Jenis", "Nominal"];

            const csvRows = [
                headers,
                ...rows.map((row) => [row.No, row.Tanggal, row.Keterangan, row.Kategori, row.Jenis, row.Nominal]),
            ];

            const csv = csvRows
                .map((row) =>
                    row
                        .map((value) => {
                            const text = String(value ?? "");
                            return '"' + text.replace(/"/g, '""') + '"';
                        })
                        .join(",")
                )
                .join("\r\n");

            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });

            this._downloadBlob(blob, `andinomics-transaksi-${this._dateStamp()}.csv`);

            showToast("File CSV berhasil dibuat.", "success");
        },

        async toExcel() {
            if (!State.transactions.length) {
                showToast("Belum ada transaksi untuk diekspor.", "warning");
                return;
            }

            try {
                showToast("Menyiapkan file Excel...", "info");

                await this._loadScript(
                    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
                    "XLSX"
                );

                const rows = this._getRows();
                const summary = this._getSummary();

                const summaryRows = [
                    ["ANDINOMICS — SMART FINANCIAL DASHBOARD"],
                    [],
                    ["Saldo Saat Ini", summary.saldo],
                    ["Total Pemasukan", summary.pemasukan],
                    ["Total Pengeluaran", summary.pengeluaran],
                    ["Total Transaksi", summary.jumlahTransaksi],
                    [],
                ];

                const transactionRows = [
                    ["No", "Tanggal", "Keterangan", "Kategori", "Jenis", "Nominal"],
                    ...rows.map((row) => [row.No, row.Tanggal, row.Keterangan, row.Kategori, row.Jenis, row.Nominal]),
                ];

                const workbook = XLSX.utils.book_new();
                const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
                const transactionSheet = XLSX.utils.aoa_to_sheet(transactionRows);

                summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }];
                transactionSheet["!cols"] = [
                    { wch: 8 },
                    { wch: 16 },
                    { wch: 30 },
                    { wch: 20 },
                    { wch: 18 },
                    { wch: 20 },
                ];

                XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan");
                XLSX.utils.book_append_sheet(workbook, transactionSheet, "Transaksi");

                XLSX.writeFile(workbook, `andinomics-transaksi-${this._dateStamp()}.xlsx`);

                showToast("File Excel berhasil diunduh.", "success");
            } catch (error) {
                console.error("[ExportEngine.toExcel]", error);
                showToast("Export Excel gagal. Pastikan koneksi internet tersedia.", "error");
            }
        },

        async toPDF() {
            if (!State.transactions.length) {
                showToast("Belum ada transaksi untuk diekspor.", "warning");
                return;
            }

            try {
                showToast("Menyiapkan PDF...", "info");

                await this._loadScript(
                    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
                    "jspdf"
                );

                await this._loadScript(
                    "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js"
                );

                const jsPDF = window.jspdf && window.jspdf.jsPDF;

                if (!jsPDF) {
                    throw new Error("jsPDF tidak tersedia.");
                }

                const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

                const summary = this._getSummary();
                const rows = this._getRows();

                const orange = [255, 122, 0];
                const darkGreen = [15, 36, 24];

                doc.setTextColor(255, 255, 255);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(20);
                doc.text("ANDINOMICS", 15, 18);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.text("Smart Financial Dashboard", 15, 25);

                doc.setTextColor(...orange);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(13);
                doc.text("LAPORAN TRANSAKSI", 15, 37);

                doc.setTextColor(220, 230, 225);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(9);
                doc.text(`Tanggal export: ${Utils.formatDateLong(new Date())}`, 15, 44);

                const summaryData = [
                    ["Saldo Saat Ini", Utils.formatRupiah(summary.saldo)],
                    ["Total Pemasukan", Utils.formatRupiah(summary.pemasukan)],
                    ["Total Pengeluaran", Utils.formatRupiah(summary.pengeluaran)],
                    ["Total Transaksi", String(summary.jumlahTransaksi)],
                ];

                doc.autoTable({
                    startY: 52,
                    head: [["Ringkasan", "Nilai"]],
                    body: summaryData,
                    theme: "grid",
                    styles: { fontSize: 9, cellPadding: 3 },
                    headStyles: { fillColor: orange, textColor: [255, 255, 255], fontStyle: "bold" },
                });

                const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 100;

                doc.autoTable({
                    startY: finalY,
                    head: [["No", "Tanggal", "Keterangan", "Kategori", "Jenis", "Nominal"]],
                    body: rows.map((row) => [
                        row.No,
                        row.Tanggal,
                        row.Keterangan,
                        row.Kategori,
                        row.Jenis,
                        Utils.formatRupiah(row.Nominal),
                    ]),
                    theme: "grid",
                    styles: { fontSize: 8, cellPadding: 2.5 },
                    headStyles: { fillColor: orange, textColor: [255, 255, 255], fontStyle: "bold" },
                });

                const pageCount = typeof doc.getNumberOfPages === "function" ? doc.getNumberOfPages() : 1;

                for (let page = 1; page <= pageCount; page++) {
                    doc.setPage(page);
                    const pageHeight = doc.internal.pageSize.getHeight();
                    doc.setTextColor(170, 190, 180);
                    doc.setFontSize(8);
                    doc.text(`Andinomics • Halaman ${page} dari ${pageCount}`, 15, pageHeight - 8);
                }

                doc.save(`andinomics-transaksi-${this._dateStamp()}.pdf`);

                showToast("File PDF berhasil diunduh.", "success");
            } catch (error) {
                console.error("[ExportEngine.toPDF]", error);
                showToast("Export PDF gagal. Pastikan koneksi internet tersedia.", "error");
            }
        },
    };


    /* ==========================================================
       12. DIALOG ENGINE
       ========================================================== */

    const DialogEngine = {
        _theme: Object.freeze({
            popup: "andi-swal-popup",
            title: "andi-swal-title",
            htmlContainer: "andi-swal-content",
            confirmButton: "andi-swal-btn andi-swal-btn--confirm",
            cancelButton: "andi-swal-btn andi-swal-btn--cancel",
        }),

        _isAvailable() {
            if (typeof Swal === "undefined") {
                console.error("[DialogEngine] SweetAlert2 belum termuat.");
                return false;
            }
            return true;
        },

        _buildDetailRows(item) {
            return [
                ["Keterangan", item.description],
                ["Kategori", item.category],
                ["Nominal", Utils.formatRupiah(item.amount)],
                ["Tanggal", Utils.formatDateShort(item.date)],
            ]
                .map(
                    ([label, value]) => `
                        <div class="andi-swal-row">
                            <span class="andi-swal-row-label">${Utils.escapeHtml(label)}</span>
                            <span class="andi-swal-row-value">${Utils.escapeHtml(value)}</span>
                        </div>
                    `
                )
                .join("");
        },

        async confirmDelete(item) {
            if (!this._isAvailable()) {
                return window.confirm(`Hapus transaksi "${item.description}"?`);
            }

            try {
                const result = await Swal.fire({
                    title: "Hapus Transaksi",
                    html: `
                        <p class="andi-swal-question">Apakah Anda yakin ingin menghapus transaksi ini?</p>
                        <div class="andi-swal-details">${this._buildDetailRows(item)}</div>
                    `,
                    icon: "warning",
                    showCancelButton: true,
                    confirmButtonText: "Ya, Hapus",
                    cancelButtonText: "Batal",
                    reverseButtons: true,
                    focusCancel: true,
                    buttonsStyling: false,
                    customClass: this._theme,
                });

                return Boolean(result.isConfirmed);
            } catch (error) {
                console.error("[DialogEngine.confirmDelete] Gagal menampilkan dialog:", error);
                return false;
            }
        },

        async success(title, message) {
            if (!this._isAvailable()) {
                return;
            }

            try {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: "success",
                    confirmButtonText: "OK",
                    buttonsStyling: false,
                    customClass: this._theme,
                });
            } catch (error) {
                console.error("[DialogEngine.success] Gagal menampilkan dialog:", error);
            }
        },

        async error(title, message) {
            if (!this._isAvailable()) {
                return;
            }

            try {
                await Swal.fire({
                    title: title,
                    text: message,
                    icon: "error",
                    confirmButtonText: "OK",
                    buttonsStyling: false,
                    customClass: this._theme,
                });
            } catch (error) {
                console.error("[DialogEngine.error] Gagal menampilkan dialog:", error);
            }
        },
    };


    /* ==========================================================
       13. TOAST ENGINE
       ========================================================== */

    const ToastEngine = {
        _variants: Object.freeze({
            success: { icon: "fa-solid fa-circle-check", className: "toast--success" },
            error: { icon: "fa-solid fa-circle-xmark", className: "toast--error" },
            info: { icon: "fa-solid fa-circle-info", className: "toast--info" },
            warning: { icon: "fa-solid fa-triangle-exclamation", className: "toast--warning" },
        }),

        _dismiss(toastEl) {
            if (!toastEl || toastEl.dataset.dismissing === "true") {
                return;
            }

            toastEl.dataset.dismissing = "true";
            toastEl.classList.remove("toast--visible");
            toastEl.classList.add("toast--leaving");

            toastEl.addEventListener("transitionend", () => toastEl.remove(), { once: true });
        },

        show(message, variant = "success") {
            if (!dom.toastContainer) {
                return;
            }

            const meta = this._variants[variant] || this._variants.success;
            const toastEl = document.createElement("div");

            toastEl.className = `toast ${meta.className}`;
            toastEl.setAttribute("role", variant === "error" ? "alert" : "status");

            toastEl.innerHTML = `
                <i class="${meta.icon} toast-icon" aria-hidden="true"></i>
                <span class="toast-message"></span>
                <button type="button" class="toast-close" aria-label="Tutup notifikasi">
                    <i class="fa-solid fa-xmark" aria-hidden="true"></i>
                </button>
                <span class="toast-progress" style="animation-duration: ${CONFIG.TOAST_DURATION_MS}ms;"></span>
            `;

            toastEl.querySelector(".toast-message").textContent = message;

            toastEl.querySelector(".toast-close").addEventListener("click", () => this._dismiss(toastEl));

            dom.toastContainer.appendChild(toastEl);

            requestAnimationFrame(() => toastEl.classList.add("toast--visible"));

            setTimeout(() => this._dismiss(toastEl), CONFIG.TOAST_DURATION_MS);
        },
    };


    /* ==========================================================
       14. EVENT ENGINE
       ========================================================== */

    function showToast(message, variant = "success") {
        ToastEngine.show(message, variant);
    }

    function persistAndRender(filterText) {
        const saved = Storage.save(State.transactions);

        if (!saved) {
            showToast("Gagal menyimpan data ke penyimpanan lokal.", "error");
        }

        RenderEngine.renderAll(filterText ?? dom.searchInput.value);

        AnalyticsEngine.render();

        renderFinancialInsights();
    }

    function resetFormToCreateMode() {
        State.editingId = null;
        dom.form.reset();
        dom.transactionId.value = "";
        dom.date.value = Utils.todayIso();
        dom.submitBtnLabel.textContent = "Simpan Transaksi";
        dom.cancelEditBtn.hidden = true;
        Validation.clear();
    }

    function enterEditMode(id) {
        const item = TransactionEngine.findTransaction(id);

        if (!item) {
            return;
        }

        State.editingId = id;
        dom.transactionId.value = item.id;
        dom.description.value = item.description;
        dom.type.value = item.type;
        dom.category.value = item.category;
        dom.amount.value = item.amount;
        dom.date.value = item.date;
        dom.submitBtnLabel.textContent = "Perbarui Transaksi";
        dom.cancelEditBtn.hidden = false;
        dom.description.focus();
    }

    function handleFormSubmit(event) {
        event.preventDefault();

        try {
            const payload = {
                description: dom.description.value,
                type: dom.type.value,
                category: dom.category.value,
                amount: Number(dom.amount.value),
                date: dom.date.value,
            };

            if (!Validation.validate(payload)) {
                showToast("Periksa kembali data yang dimasukkan.", "error");
                return;
            }

            const cleanPayload = {
                description: payload.description.trim(),
                type: payload.type,
                category: payload.category,
                amount: payload.amount,
                date: payload.date,
            };

            if (State.editingId) {
                const updated = TransactionEngine.updateTransaction(State.editingId, cleanPayload);

                if (!updated) {
                    console.error("[handleFormSubmit] Transaksi yang diedit tidak ditemukan:", State.editingId);
                    showToast("Transaksi tidak ditemukan.", "error");
                    return;
                }

                showToast("Transaksi berhasil diperbarui.");
            } else {
                TransactionEngine.addTransaction(cleanPayload);
                showToast("Transaksi berhasil disimpan.");
            }

            resetFormToCreateMode();
            persistAndRender();
        } catch (error) {
            console.error("[handleFormSubmit] Terjadi kesalahan saat menyimpan transaksi:", error);
            showToast("Terjadi kesalahan saat menyimpan transaksi.", "error");
        }
    }

    async function handleTableClick(event) {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const { action, id } = button.dataset;

        if (action === "edit") {
            try {
                enterEditMode(id);
            } catch (error) {
                console.error("[handleTableClick] Terjadi kesalahan pada aksi tabel:", error);
                showToast("Terjadi kesalahan saat memproses aksi ini.", "error");
            }

            return;
        }

        if (action === "delete") {
            try {
                const item = TransactionEngine.findTransaction(id);

                if (!item) {
                    return;
                }

                const confirmed = await DialogEngine.confirmDelete(item);

                if (!confirmed) {
                    return;
                }

                const deleted = TransactionEngine.deleteTransaction(id);

                if (!deleted) {
                    console.error("[handleTableClick] Gagal menghapus transaksi:", id);
                    await DialogEngine.error("Gagal", "Transaksi gagal dihapus.");
                    return;
                }

                if (State.editingId === id) {
                    resetFormToCreateMode();
                }

                persistAndRender();

                await DialogEngine.success("Berhasil", "Transaksi berhasil dihapus.");
            } catch (error) {
                console.error("[handleTableClick] Terjadi kesalahan pada aksi tabel:", error);
                await DialogEngine.error("Terjadi Kesalahan", "Terjadi kesalahan saat menghapus transaksi.");
            }
        }
    }

    function handleSearchInput(event) {
        RenderEngine.renderTable(event.target.value);
    }

    const QUICK_EXPORT_ACTIONS = {
        "export-pdf": () => ExportEngine.toPDF(),
        "export-excel": () => ExportEngine.toExcel(),
    };

    function handleQuickMenuClick(event) {
        const button = event.target.closest("button[data-action]");

        if (!button) {
            return;
        }

        const { action } = button.dataset;

        if (action === "focus-form") {
            document.getElementById("form-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
            dom.description.focus();
            return;
        }

        if (action in QUICK_EXPORT_ACTIONS) {
            try {
                QUICK_EXPORT_ACTIONS[action]();
            } catch (error) {
                console.error(`[handleQuickMenuClick] Fitur "${action}" belum tersedia:`, error);
                showToast("Fitur ini akan segera hadir di versi berikutnya.");
            }

            return;
        }

        if (action === "analytics") {
            AnalyticsEngine.render();

            document.getElementById("analyticsSection")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });

            return;
        }
    }

    function bindEvents() {
        dom.form.addEventListener("submit", handleFormSubmit);
        dom.cancelEditBtn.addEventListener("click", resetFormToCreateMode);
        dom.table.addEventListener("click", handleTableClick);
        dom.searchInput.addEventListener("input", handleSearchInput);
        document.querySelector(".quick-menu")?.addEventListener("click", handleQuickMenuClick);
    }


    /* ==========================================================
       15. INIT
       ========================================================== */

    function init() {
        try {
            dom.todayDate.textContent = Utils.formatDateLong(new Date());
            dom.footerYear.textContent = String(new Date().getFullYear());
            dom.date.value = Utils.todayIso();

            State.transactions = Storage.load();

            bindEvents();

    RenderEngine.renderAll();

AnalyticsEngine.render();

renderFinancialInsights();
        } catch (error) {
            console.error("[init] Gagal menginisialisasi Andinomics:", error);
            showToast("Terjadi kesalahan saat memuat aplikasi.", "error");
        }
    }

    document.addEventListener("DOMContentLoaded", init);

})();
