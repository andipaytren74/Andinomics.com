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
    13. Event Engine
    14. Init
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

    const State = {
        /** @type {Transaction[]} */
        transactions: [],
        /** id transaksi yang sedang diedit, null jika sedang menambah baru */
        editingId: null,
        /** instance Chart.js aktif, dibuat sekali lalu di-update() */
        chartInstance: null,
    };

    /* ==========================================================
       2. CONFIG
       ========================================================== */
    const CONFIG = Object.freeze({
        STORAGE_KEY: "andinomics-transactions",
        TOAST_DURATION_MS: 3200,
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
        // Elemen opsional: dirender hanya jika sudah tersedia di HTML,
        // tanpa memaksa perubahan markup saat ini.
        kategoriTerbesar: document.getElementById("kategoriTerbesar"),
        transaksiTerakhir: document.getElementById("transaksiTerakhir"),

        todayDate: document.getElementById("today-date"),
        footerYear: document.getElementById("footer-year"),
        toast: document.getElementById("toast"),
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

        todayIso() {
            const now = new Date();
            const offset = now.getTimezoneOffset();
            const local = new Date(now.getTime() - offset * 60 * 1000);
            return local.toISOString().slice(0, 10);
        },
    };

    /* ==========================================================
       5. STORAGE (Local Storage layer)
       ========================================================== */
    const Storage = {
        /** Validasi bentuk record sebelum dipercaya sebagai Transaction. */
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

        /** Baca seluruh transaksi dari Local Storage. Selalu mengembalikan array. */
        load() {
            try {
                const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (!raw) return [];

                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) {
                    throw new Error("Data tersimpan rusak: bukan berupa array.");
                }

                const valid = parsed.filter(Storage._isValidRecord);
                if (valid.length !== parsed.length) {
                    console.warn(
                        `[Storage.load] ${parsed.length - valid.length} data tidak valid diabaikan.`
                    );
                }
                return valid;
            } catch (error) {
                console.error("[Storage.load] Gagal memuat data dari Local Storage:", error);
                return [];
            }
        },

        /** Simpan seluruh transaksi ke Local Storage. Mengembalikan status berhasil/gagal. */
        save(transactions) {
            try {
                localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(transactions));
                return true;
            } catch (error) {
                console.error("[Storage.save] Gagal menyimpan data ke Local Storage:", error);
                return false;
            }
        },

        /** Hapus seluruh data transaksi dari Local Storage. */
        clear() {
            try {
                localStorage.removeItem(CONFIG.STORAGE_KEY);
                return true;
            } catch (error) {
                console.error("[Storage.clear] Gagal menghapus Local Storage:", error);
                return false;
            }
        },

        /** Cek apakah data transaksi sudah pernah tersimpan. */
        exists() {
            try {
                return localStorage.getItem(CONFIG.STORAGE_KEY) !== null;
            } catch (error) {
                console.error("[Storage.exists] Gagal memeriksa Local Storage:", error);
                return false;
            }
        },

        /** Ekspor seluruh transaksi saat ini sebagai string JSON (dasar untuk fitur export). */
        export() {
            try {
                return JSON.stringify(State.transactions, null, 2);
            } catch (error) {
                console.error("[Storage.export] Gagal mengekspor data:", error);
                return null;
            }
        },

        /** Impor transaksi dari string JSON, menimpa data saat ini jika valid. */
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
            [dom.description, dom.amount, dom.date].forEach((el) =>
                el?.removeAttribute("aria-invalid")
            );
        },

        setError(field, message) {
            this.errors.set(field, message);
            const el = document.getElementById(`${field}-error`);
            const input = dom[field];
            if (el) el.textContent = message;
            if (input) input.setAttribute("aria-invalid", "true");
        },

        validateDescription(description) {
            const trimmed = (description ?? "").trim();
            if (trimmed.length === 0) {
                this.setError("description", "Keterangan wajib diisi.");
            } else if (trimmed.length > CONFIG.DESCRIPTION_MAX_LENGTH) {
                this.setError(
                    "description",
                    `Keterangan maksimal ${CONFIG.DESCRIPTION_MAX_LENGTH} karakter.`
                );
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
        /** Bangun object transaksi baru lengkap dengan id unik. */
        createTransaction(payload) {
            return { id: Utils.generateId(), ...payload };
        },

        /** Tambahkan transaksi baru ke state. */
        addTransaction(payload) {
            const transaction = this.createTransaction(payload);
            State.transactions.push(transaction);
            return transaction;
        },

        /** Perbarui transaksi berdasarkan id. Mengembalikan hasil update atau null. */
        updateTransaction(id, payload) {
            const index = State.transactions.findIndex((t) => t.id === id);
            if (index === -1) return null;
            State.transactions[index] = { ...State.transactions[index], ...payload };
            return State.transactions[index];
        },

        /** Hapus transaksi berdasarkan id. Mengembalikan true jika berhasil dihapus. */
        deleteTransaction(id) {
            const before = State.transactions.length;
            State.transactions = State.transactions.filter((t) => t.id !== id);
            return State.transactions.length !== before;
        },

        /** Cari satu transaksi berdasarkan id. */
        findTransaction(id) {
            return State.transactions.find((t) => t.id === id) ?? null;
        },

        /** Urutkan transaksi dari tanggal terbaru ke terlama (non-mutating). */
        sortTransaction(list) {
            return [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
        },

        /** Saring transaksi berdasarkan kata kunci pada deskripsi, kategori, atau tipe. */
        filterTransaction(list, keyword) {
            const trimmed = (keyword ?? "").trim().toLowerCase();
            if (!trimmed) return list;
            return list.filter((item) =>
                [item.description, item.category, item.type]
                    .join(" ")
                    .toLowerCase()
                    .includes(trimmed)
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

                // Elemen tambahan ini opsional; hanya diisi jika sudah ada di HTML.
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
                        </tr>`;
                    return;
                }

                const sorted = TransactionEngine.sortTransaction(filtered);
                dom.table.innerHTML = sorted.map(RenderEngine._buildRow).join("");
            } catch (error) {
                console.error("[RenderEngine.renderTable] Gagal merender tabel:", error);
            }
        },

        /** Bangun satu baris HTML tabel untuk satu transaksi (semua nilai di-escape). */
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
                    <td><span class="badge ${badgeClass}">${Utils.escapeHtml(item.type)}</span></td>
                    <td class="${amountClass}">${sign} ${Utils.escapeHtml(Utils.formatRupiah(item.amount))}</td>
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
                </tr>`;
        },

        renderChart() {
            ChartEngine.update();
        },

        /** Titik masuk tunggal untuk menyinkronkan dashboard, tabel, dan chart sekaligus. */
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
        /** Kelompokkan total pemasukan & pengeluaran per tanggal, terurut naik. */
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

        /** Chart tidak pernah dibuat ulang; setelah instance pertama, selalu pakai update(). */
        update() {
            if (typeof Chart === "undefined" || !dom.chartCanvas) return;

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
                        x: { ticks: { color: colors.text }, grid: { color: colors.grid } },
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
                        options,
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
        /** Hitung seluruh ringkasan dashboard dari state transaksi saat ini. */
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

                categoryTotals.set(
                    item.category,
                    (categoryTotals.get(item.category) || 0) + item.amount
                );

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
                kategoriTerbesar,
                transaksiTerakhir: latestTransaction,
            };
        },
    };

    /* ==========================================================
       11. EXPORT ENGINE
       Kontrak untuk fitur ekspor mendatang (PDF/Excel/CSV).
       Diimplementasikan bertahap tanpa perlu refactor struktur ini.
       ========================================================== */
    const ExportEngine = {
        toCSV() {
            throw new Error("ExportEngine.toCSV belum diimplementasikan.");
        },
        toPDF() {
            throw new Error("ExportEngine.toPDF belum diimplementasikan.");
        },
        toExcel() {
            throw new Error("ExportEngine.toExcel belum diimplementasikan.");
        },
    };

    /* ==========================================================
       12. DIALOG ENGINE (SweetAlert2)
       Sprint 11 — Part 11.1: Professional Transaction Experience.
       Seluruh interaksi SweetAlert2 dibungkus di satu tempat agar
       dialog lain (Sprint berikutnya) tinggal menambah method baru
       di sini, tanpa menyentuh Event Engine atau modul lainnya.
       ========================================================== */
    const DialogEngine = {
        /** Kelas kustom agar tampilan SweetAlert2 mengikuti identitas ANDINOMICS. */
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

        /** Baris detail transaksi (Keterangan/Kategori/Nominal/Tanggal) untuk dialog konfirmasi. */
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
                        </div>`
                )
                .join("");
        },

        /**
         * Dialog konfirmasi hapus transaksi lengkap dengan ringkasan data.
         * @returns {Promise<boolean>} true jika pengguna menekan "Ya, Hapus".
         */
        async confirmDelete(item) {
            if (!this._isAvailable()) {
                // Fallback aman bila CDN SweetAlert2 gagal dimuat, agar fitur delete tidak mati total.
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

        /** Notifikasi sukses (mis. setelah transaksi berhasil dihapus). */
        async success(title, message) {
            if (!this._isAvailable()) return;
            try {
                await Swal.fire({
                    title,
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

        /** Notifikasi error (mis. saat operasi hapus gagal). */
        async error(title, message) {
            if (!this._isAvailable()) return;
            try {
                await Swal.fire({
                    title,
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
       13. EVENT ENGINE
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
        }, CONFIG.TOAST_DURATION_MS);
    }

    /** Simpan state saat ini ke Local Storage, lalu sinkronkan seluruh tampilan. */
    function persistAndRender(filterText) {
        const saved = Storage.save(State.transactions);
        if (!saved) {
            showToast("Gagal menyimpan data ke penyimpanan lokal.", "error");
        }
        RenderEngine.renderAll(filterText ?? dom.searchInput.value);
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
        if (!item) return;

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
        if (!button) return;

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
                if (!item) return;

                const confirmed = await DialogEngine.confirmDelete(item);
                if (!confirmed) return;

                const deleted = TransactionEngine.deleteTransaction(id);
                if (!deleted) {
                    console.error("[handleTableClick] Gagal menghapus transaksi:", id);
                    await DialogEngine.error("Gagal", "Transaksi gagal dihapus.");
                    return;
                }

                if (State.editingId === id) resetFormToCreateMode();

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
        if (!button) return;

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
            showToast("Fitur ini akan segera hadir di versi berikutnya.");
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
       14. INIT
       ========================================================== */
    function init() {
        try {
            dom.todayDate.textContent = Utils.formatDateLong(new Date());
            dom.footerYear.textContent = String(new Date().getFullYear());
            dom.date.value = Utils.todayIso();

            // Auto Load: baca seluruh data tersimpan sebelum render pertama.
            State.transactions = Storage.load();

            bindEvents();
            RenderEngine.renderAll();
        } catch (error) {
            console.error("[init] Gagal menginisialisasi Andinomics:", error);
            showToast("Terjadi kesalahan saat memuat aplikasi.", "error");
        }
    }

    document.addEventListener("DOMContentLoaded", init);
})();
