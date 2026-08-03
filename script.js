/* ==========================================================
   ANDINOMICS — Smart Financial Dashboard
   Developer: Andi Muhammad Hakim

   Struktur modul:
   1. State
   2. DOM cache
   3. Utils (format, sanitasi, id)
   4. Validation
   5. Render (dashboard, table, chart)
   6. Toast / feedback
   7. Event handlers
   8. Init
   ========================================================== */

(function () {
    "use strict";

    /* ==========================================================
       1. STATE
       ========================================================== */
    /**
     * @typedef {Object} Transaction
     * @property {string} id
     * @property {string} description
     * @property {"Pemasukan"|"Pengeluaran"} type
     * @property {string} category
     * @property {number} amount
     * @property {string} date - format YYYY-MM-DD
     */

    /** @type {Transaction[]} */
    let transactions = [];

    /** id transaksi yang sedang diedit, null jika sedang menambah baru */
    let editingId = null;

    let cashflowChart = null;

    /* ==========================================================
       2. DOM CACHE
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

        todayDate: document.getElementById("today-date"),
        footerYear: document.getElementById("footer-year"),
        toast: document.getElementById("toast"),
        chartCanvas: document.getElementById("cashflowChart"),
    };

    /* ==========================================================
       3. UTILS
       ========================================================== */
    const Utils = {
        formatRupiah(number) {
            return new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
            }).format(number);
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
            if (Number.isNaN(parsed.getTime())) return isoDate;
            return new Intl.DateTimeFormat("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            }).format(parsed);
        },

        /** Cegah XSS: escape karakter HTML sebelum disisipkan lewat innerHTML */
        escapeHtml(value) {
            const div = document.createElement("div");
            div.textContent = String(value);
            return div.innerHTML;
        },

        generateId() {
            return (crypto.randomUUID && crypto.randomUUID()) ||
                `txn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        },
    };

    /* ==========================================================
       4. VALIDATION
       ========================================================== */
    const Validation = {
        errors: new Map(),

        clear() {
            this.errors.clear();
            document.querySelectorAll(".form-error").forEach((el) => (el.textContent = ""));
            [dom.description, dom.amount, dom.date].forEach((el) =>
                el.removeAttribute("aria-invalid")
            );
        },

        setError(field, message) {
            this.errors.set(field, message);
            const el = document.getElementById(`${field}-error`);
            const input = dom[field];
            if (el) el.textContent = message;
            if (input) input.setAttribute("aria-invalid", "true");
        },

        validate({ description, amount, date }) {
            this.clear();

            if (!description || description.trim().length === 0) {
                this.setError("description", "Keterangan wajib diisi.");
            } else if (description.trim().length > 80) {
                this.setError("description", "Keterangan maksimal 80 karakter.");
            }

            if (!Number.isFinite(amount) || amount <= 0) {
                this.setError("amount", "Nominal harus lebih dari 0.");
            }

            if (!date) {
                this.setError("date", "Tanggal wajib diisi.");
            }

            return this.errors.size === 0;
        },
    };

    /* ==========================================================
       5. RENDER
       ========================================================== */
    const Render = {
        dashboard() {
            let totalMasuk = 0;
            let totalKeluar = 0;

            transactions.forEach((item) => {
                if (item.type === "Pemasukan") {
                    totalMasuk += item.amount;
                } else {
                    totalKeluar += item.amount;
                }
            });

            const totalSaldo = totalMasuk - totalKeluar;

            dom.saldo.textContent = Utils.formatRupiah(totalSaldo);
            dom.masuk.textContent = Utils.formatRupiah(totalMasuk);
            dom.keluar.textContent = Utils.formatRupiah(totalKeluar);
            dom.totalTransaksi.textContent = transactions.length;
        },

        table(filterText = "") {
            const keyword = filterText.trim().toLowerCase();
            const list = keyword
                ? transactions.filter((item) =>
                      [item.description, item.category, item.type]
                          .join(" ")
                          .toLowerCase()
                          .includes(keyword)
                  )
                : transactions;

            if (list.length === 0) {
                dom.table.innerHTML = `
                    <tr>
                        <td colspan="6" class="empty-data">
                            <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
                            ${keyword ? "Tidak ada transaksi yang cocok." : "Belum ada transaksi."}
                        </td>
                    </tr>`;
                return;
            }

            // Urutkan dari tanggal terbaru
            const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));

            dom.table.innerHTML = sorted
                .map((item) => {
                    const badgeClass = item.type === "Pemasukan" ? "badge-income" : "badge-expense";
                    const amountClass = item.type === "Pemasukan" ? "amount-income" : "amount-expense";
                    const sign = item.type === "Pemasukan" ? "+" : "−";

                    return `
                    <tr data-id="${Utils.escapeHtml(item.id)}">
                        <td>${Utils.escapeHtml(Utils.formatDateShort(item.date))}</td>
                        <td>${Utils.escapeHtml(item.description)}</td>
                        <td>${Utils.escapeHtml(item.category)}</td>
                        <td><span class="badge ${badgeClass}">${Utils.escapeHtml(item.type)}</span></td>
                        <td class="${amountClass}">${sign} ${Utils.escapeHtml(Utils.formatRupiah(item.amount))}</td>
                        <td>
                            <div class="action-group">
                                <button type="button" class="edit-btn" data-action="edit" data-id="${Utils.escapeHtml(item.id)}" aria-label="Edit transaksi ${Utils.escapeHtml(item.description)}">
                                    <i class="fa-solid fa-pen" aria-hidden="true"></i>
                                </button>
                                <button type="button" class="delete-btn" data-action="delete" data-id="${Utils.escapeHtml(item.id)}" aria-label="Hapus transaksi ${Utils.escapeHtml(item.description)}">
                                    <i class="fa-solid fa-trash" aria-hidden="true"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
                })
                .join("");
        },

        chart() {
            if (typeof Chart === "undefined" || !dom.chartCanvas) return;

            // Kelompokkan total pemasukan & pengeluaran per tanggal
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
            const labels = sortedDates.map((d) => Utils.formatDateShort(d));
            const incomeData = sortedDates.map((d) => totalsByDate.get(d).income);
            const expenseData = sortedDates.map((d) => totalsByDate.get(d).expense);

            const styles = getComputedStyle(document.documentElement);
            const successColor = styles.getPropertyValue("--success").trim() || "#2ecc71";
            const dangerColor = styles.getPropertyValue("--danger").trim() || "#ff5d5d";
            const textColor = styles.getPropertyValue("--text-muted").trim() || "#9eb3a6";
            const gridColor = "rgba(255, 255, 255, 0.06)";

            const chartData = {
                labels: labels.length ? labels : ["Belum ada data"],
                datasets: [
                    {
                        label: "Pemasukan",
                        data: labels.length ? incomeData : [0],
                        borderColor: successColor,
                        backgroundColor: `${successColor}33`,
                        tension: 0.35,
                        fill: true,
                        pointRadius: 3,
                    },
                    {
                        label: "Pengeluaran",
                        data: labels.length ? expenseData : [0],
                        borderColor: dangerColor,
                        backgroundColor: `${dangerColor}33`,
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
                    legend: { labels: { color: textColor } },
                    tooltip: {
                        callbacks: {
                            label(context) {
                                return `${context.dataset.label}: ${Utils.formatRupiah(context.parsed.y)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: { ticks: { color: textColor }, grid: { color: gridColor } },
                    y: {
                        ticks: {
                            color: textColor,
                            callback: (value) => Utils.formatRupiah(value),
                        },
                        grid: { color: gridColor },
                    },
                },
            };

            if (cashflowChart) {
                cashflowChart.data = chartData;
                cashflowChart.options = options;
                cashflowChart.update();
            } else {
                cashflowChart = new Chart(dom.chartCanvas, {
                    type: "line",
                    data: chartData,
                    options,
                });
            }
        },

        all(filterText) {
            this.dashboard();
            this.table(filterText);
            this.chart();
        },
    };

    /* ==========================================================
       6. TOAST / FEEDBACK
       ========================================================== */
    let toastTimeout = null;

    function showToast(message, variant = "success") {
        if (!dom.toast) return;
        dom.toast.textContent = message;
        dom.toast.classList.remove("is-success", "is-error");
        dom.toast.classList.add("is-visible", variant === "error" ? "is-error" : "is-success");

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            dom.toast.classList.remove("is-visible");
        }, 3200);
    }

    /* ==========================================================
       7. EVENT HANDLERS
       ========================================================== */
    function resetFormToCreateMode() {
        editingId = null;
        dom.form.reset();
        dom.transactionId.value = "";
        dom.date.value = todayIso();
        dom.submitBtnLabel.textContent = "Simpan Transaksi";
        dom.cancelEditBtn.hidden = true;
        Validation.clear();
    }

    function enterEditMode(id) {
        const item = transactions.find((t) => t.id === id);
        if (!item) return;

        editingId = id;
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

        if (editingId) {
            const index = transactions.findIndex((t) => t.id === editingId);
            if (index !== -1) {
                transactions[index] = { ...transactions[index], ...cleanPayload };
            }
            showToast("Transaksi berhasil diperbarui.");
        } else {
            transactions.push({ id: Utils.generateId(), ...cleanPayload });
            showToast("Transaksi berhasil disimpan.");
        }

        resetFormToCreateMode();
        Render.all(dom.searchInput.value);
    }

    function handleTableClick(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const { action, id } = button.dataset;

        if (action === "edit") {
            enterEditMode(id);
        }

        if (action === "delete") {
            const item = transactions.find((t) => t.id === id);
            if (!item) return;

            const confirmed = window.confirm(
                `Hapus transaksi "${item.description}" senilai ${Utils.formatRupiah(item.amount)}?`
            );
            if (!confirmed) return;

            transactions = transactions.filter((t) => t.id !== id);
            if (editingId === id) resetFormToCreateMode();

            showToast("Transaksi dihapus.");
            Render.all(dom.searchInput.value);
        }
    }

    function handleSearchInput(event) {
        Render.table(event.target.value);
    }

    function handleQuickMenuClick(event) {
        const button = event.target.closest("button[data-action]");
        if (!button) return;

        const action = button.dataset.action;

        if (action === "focus-form") {
            document.getElementById("form-title").scrollIntoView({ behavior: "smooth", block: "start" });
            dom.description.focus();
        } else if (action === "export-pdf" || action === "export-excel" || action === "analytics") {
            showToast("Fitur ini akan segera hadir di versi berikutnya.");
        }
    }

    function todayIso() {
        const now = new Date();
        const offset = now.getTimezoneOffset();
        const local = new Date(now.getTime() - offset * 60 * 1000);
        return local.toISOString().slice(0, 10);
    }

    /* ==========================================================
       8. INIT
       ========================================================== */
    function init() {
        dom.todayDate.textContent = Utils.formatDateLong(new Date());
        dom.footerYear.textContent = new Date().getFullYear();
        dom.date.value = todayIso();

        dom.form.addEventListener("submit", handleFormSubmit);
        dom.cancelEditBtn.addEventListener("click", resetFormToCreateMode);
        dom.table.addEventListener("click", handleTableClick);
        dom.searchInput.addEventListener("input", handleSearchInput);
        document.querySelector(".quick-menu").addEventListener("click", handleQuickMenuClick);

        Render.all();
    }

    document.addEventListener("DOMContentLoaded", init);
})();
