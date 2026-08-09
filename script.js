/* ==========================================================
   11. EXPORT ENGINE
   Export PDF / Excel / CSV
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
                    reject(
                        new Error(
                            `Library ${globalName} tidak tersedia setelah dimuat.`
                        )
                    );
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

        return TransactionEngine
            .sortTransaction(State.transactions)
            .map((item, index) => ({

                No: index + 1,

                Tanggal:
                    Utils.formatDateShort(item.date),

                Keterangan:
                    item.description,

                Kategori:
                    item.category,

                Jenis:
                    item.type,

                Nominal:
                    item.amount

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

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    },


    _dateStamp() {

        return new Date()
            .toISOString()
            .slice(0, 10);
    },


    /* ==========================================================
       EXPORT CSV
       ========================================================== */

    toCSV() {

        if (!State.transactions.length) {

            showToast(
                "Belum ada transaksi untuk diekspor.",
                "warning"
            );

            return;
        }

        const rows = this._getRows();

        const headers = [
            "No",
            "Tanggal",
            "Keterangan",
            "Kategori",
            "Jenis",
            "Nominal"
        ];

        const csvRows = [

            headers,

            ...rows.map(row => [
                row.No,
                row.Tanggal,
                row.Keterangan,
                row.Kategori,
                row.Jenis,
                row.Nominal
            ])

        ];

        const csv = csvRows
            .map(row =>

                row
                    .map(value => {

                        const text =
                            String(value ?? "");

                        return `"${text.replace(/"/g, '""')}"`;
                    })
                    .join(",")

            )
            .join("\r\n");


        const blob = new Blob(

            [
                "\uFEFF" + csv
            ],

            {
                type:
                    "text/csv;charset=utf-8;"
            }

        );


        this._downloadBlob(

            blob,

            `andinomics-transaksi-${this._dateStamp()}.csv`

        );


        showToast(
            "File CSV berhasil dibuat.",
            "success"
        );
    },


    /* ==========================================================
       EXPORT EXCEL
       ========================================================== */

    async toExcel() {

        if (!State.transactions.length) {

            showToast(
                "Belum ada transaksi untuk diekspor.",
                "warning"
            );

            return;
        }


        try {

            showToast(
                "Menyiapkan file Excel...",
                "info"
            );


            await this._loadScript(

                "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",

                "XLSX"

            );


            const rows =
                this._getRows();


            const summary =
                this._getSummary();


            /* =========================
               SHEET RINGKASAN
               ========================= */

            const summaryRows = [

                [
                    "ANDINOMICS — SMART FINANCIAL DASHBOARD"
                ],

                [],

                [
                    "Saldo Saat Ini",
                    summary.saldo
                ],

                [
                    "Total Pemasukan",
                    summary.pemasukan
                ],

                [
                    "Total Pengeluaran",
                    summary.pengeluaran
                ],

                [
                    "Total Transaksi",
                    summary.jumlahTransaksi
                ],

                []

            ];


            /* =========================
               SHEET TRANSAKSI
               ========================= */

            const transactionRows = [

                [
                    "No",
                    "Tanggal",
                    "Keterangan",
                    "Kategori",
                    "Jenis",
                    "Nominal"
                ],

                ...rows.map(row => [

                    row.No,
                    row.Tanggal,
                    row.Keterangan,
                    row.Kategori,
                    row.Jenis,
                    row.Nominal

                ])

            ];


            /* =========================
               BUAT WORKBOOK
               ========================= */

            const workbook =
                XLSX.utils.book_new();


            const summarySheet =
                XLSX.utils.aoa_to_sheet(
                    summaryRows
                );


            const transactionSheet =
                XLSX.utils.aoa_to_sheet(
                    transactionRows
                );


            /* =========================
               LEBAR KOLOM
               ========================= */

            summarySheet["!cols"] = [

                {
                    wch: 25
                },

                {
                    wch: 20
                }

            ];


            transactionSheet["!cols"] = [

                {
                    wch: 8
                },

                {
                    wch: 16
                },

                {
                    wch: 30
                },

                {
                    wch: 20
                },

                {
                    wch: 18
                },

                {
                    wch: 18
                }

            ];


            /* =========================
               TAMBAHKAN SHEET
               ========================= */

            XLSX.utils.book_append_sheet(

                workbook,

                summarySheet,

                "Ringkasan"

            );


            XLSX.utils.book_append_sheet(

                workbook,

                transactionSheet,

                "Transaksi"

            );


            /* =========================
               DOWNLOAD
               ========================= */

            XLSX.writeFile(

                workbook,

                `andinomics-transaksi-${this._dateStamp()}.xlsx`

            );


            showToast(

                "File Excel berhasil diunduh.",

                "success"

            );


        } catch (error) {

            console.error(
                "[ExportEngine.toExcel]",
                error
            );


            showToast(

                "Export Excel gagal. Pastikan koneksi internet tersedia.",

                "error"

            );
        }
    },


    /* ==========================================================
       EXPORT PDF
       ========================================================== */

    async toPDF() {

        if (!State.transactions.length) {

            showToast(
                "Belum ada transaksi untuk diekspor.",
                "warning"
            );

            return;
        }


        try {

            showToast(
                "Menyiapkan PDF...",
                "info"
            );


            /* =========================
               LOAD jsPDF
               ========================= */

            await this._loadScript(

                "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",

                "jspdf"

            );


            /* =========================
               LOAD AUTOTABLE
               ========================= */

            await this._loadScript(

                "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js"

            );


            const jsPDF =
                window.jspdf &&
                window.jspdf.jsPDF;


            if (!jsPDF) {

                throw new Error(
                    "jsPDF tidak tersedia."
                );
            }


            /* =========================
               BUAT DOKUMEN
               ========================= */

            const doc = new jsPDF({

                orientation: "landscape",

                unit: "mm",

                format: "a4"

            });


            const summary =
                this._getSummary();


            const rows =
                this._getRows();


            const orange = [
                255,
                122,
                0
            ];


            const darkGreen = [
                15,
                36,
                24
            ];


            /* =========================
               BACKGROUND
               ========================= */

            doc.setFillColor(
                ...darkGreen
            );


            doc.rect(

                0,
                0,
                297,
                210,

                "F"

            );


            /* =========================
               HEADER
               ========================= */

            doc.setTextColor(
                255,
                255,
                255
            );


            doc.setFont(
                "helvetica",
                "bold"
            );


            doc.setFontSize(
                20
            );


            doc.text(
                "ANDINOMICS",
                15,
                18
            );


            doc.setFont(
                "helvetica",
                "normal"
            );


            doc.setFontSize(
                10
            );


            doc.text(
                "Smart Financial Dashboard",
                15,
                25
            );


            doc.setTextColor(
                ...orange
            );


            doc.setFont(
                "helvetica",
                "bold"
            );


            doc.setFontSize(
                13
            );


            doc.text(
                "LAPORAN TRANSAKSI",
                15,
                37
            );


            doc.setTextColor(
                220,
                230,
                225
            );


            doc.setFont(
                "helvetica",
                "normal"
            );


            doc.setFontSize(
                9
            );


            doc.text(

                `Tanggal export: ${Utils.formatDateLong(new Date())}`,

                15,

                44

            );


            /* =========================
               RINGKASAN
               ========================= */

            const summaryData = [

                [
                    "Saldo Saat Ini",
                    Utils.formatRupiah(
                        summary.saldo
                    )
                ],

                [
                    "Total Pemasukan",
                    Utils.formatRupiah(
                        summary.pemasukan
                    )
                ],

                [
                    "Total Pengeluaran",
                    Utils.formatRupiah(
                        summary.pengeluaran
                    )
                ],

                [
                    "Total Transaksi",
                    String(
                        summary.jumlahTransaksi
                    )
                ]

            ];


            doc.autoTable({

                startY: 52,

                head: [
                    [
                        "Ringkasan",
                        "Nilai"
                    ]
                ],

                body:
                    summaryData,

                theme: "grid",

                styles: {

                    fontSize: 9,

                    cellPadding: 3

                },

                headStyles: {

                    fillColor:
                        orange,

                    textColor: [
                        255,
                        255,
                        255
                    ],

                    fontStyle:
                        "bold"

                },

                bodyStyles: {

                    fillColor: [
                        25,
                        55,
                        40
                    ],

                    textColor: [
                        245,
                        248,
                        246
                    ]

                },

                alternateRowStyles: {

                    fillColor: [
                        31,
                        66,
                        48
                    ]

                }

            });


            /* =========================
               TABEL TRANSAKSI
               ========================= */

            const finalY =
                doc.lastAutoTable
                    ? doc.lastAutoTable.finalY + 10
                    : 100;


            doc.autoTable({

                startY: finalY,

                head: [[

                    "No",

                    "Tanggal",

                    "Keterangan",

                    "Kategori",

                    "Jenis",

                    "Nominal"

                ]],

                body:

                    rows.map(row => [

                        row.No,

                        row.Tanggal,

                        row.Keterangan,

                        row.Kategori,

                        row.Jenis,

                        Utils.formatRupiah(
                            row.Nominal
                        )

                    ]),


                theme: "grid",


                styles: {

                    fontSize: 8,

                    cellPadding: 2.5

                },


                headStyles: {

                    fillColor:
                        orange,

                    textColor: [
                        255,
                        255,
                        255
                    ],

                    fontStyle:
                        "bold"

                },


                bodyStyles: {

                    fillColor: [
                        25,
                        55,
                        40
                    ],

                    textColor: [
                        245,
                        248,
                        246
                    ]

                },


                alternateRowStyles: {

                    fillColor: [
                        31,
                        66,
                        48
                    ]

                },


                columnStyles: {

                    0: {
                        cellWidth: 12
                    },

                    1: {
                        cellWidth: 27
                    },

                    2: {
                        cellWidth: 65
                    },

                    3: {
                        cellWidth: 35
                    },

                    4: {
                        cellWidth: 30
                    },

                    5: {
                        cellWidth: 35
                    }

                }

            });


            /* =========================
               FOOTER
               ========================= */

            const pageCount =
                typeof doc.getNumberOfPages === "function"
                    ? doc.getNumberOfPages()
                    : 1;


            for (
                let page = 1;
                page <= pageCount;
                page++
            ) {

                doc.setPage(page);


                const pageHeight =
                    doc.internal.pageSize.getHeight();


                doc.setTextColor(
                    170,
                    190,
                    180
                );


                doc.setFontSize(
                    8
                );


                doc.text(

                    `Andinomics • Halaman ${page} dari ${pageCount}`,

                    15,

                    pageHeight - 8

                );

            }


            /* =========================
               SIMPAN PDF
               ========================= */

            doc.save(

                `andinomics-transaksi-${this._dateStamp()}.pdf`

            );


            showToast(

                "File PDF berhasil diunduh.",

                "success"

            );


        } catch (error) {

            console.error(
                "[ExportEngine.toPDF]",
                error
            );


            showToast(

                "Export PDF gagal. Pastikan koneksi internet tersedia.",

                "error"

            );

        }
    }

};
