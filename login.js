/* =========================================
   ANDINOMICS LOGIN
   Version : 0.4 Beta
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    /* =========================================
       CEK JIKA SUDAH LOGIN
    ========================================= */

    if (typeof isLoggedIn === "function" && isLoggedIn()) {

        window.location.href = "index.html";

        return;

    }


    /* =========================================
       ELEMENT
    ========================================= */

    const form =
        document.getElementById("loginForm");

    const loginBtn =
        document.getElementById("loginBtn");

    const message =
        document.getElementById("loginMessage");

    const togglePassword =
        document.getElementById("togglePassword");

    const passwordInput =
        document.getElementById("password");

    const emailInput =
        document.getElementById("email");

    const rememberMe =
        document.getElementById("rememberMe");


    /* =========================================
       CEK FORM
    ========================================= */

    if (!form) {
        console.error("loginForm tidak ditemukan.");
        return;
    }


    /* =========================================
       SHOW / HIDE PASSWORD
    ========================================= */

    if (togglePassword && passwordInput) {

        togglePassword.addEventListener(
            "click",
            function () {

                if (passwordInput.type === "password") {

                    passwordInput.type = "text";

                    togglePassword.textContent = "🙈";

                    togglePassword.title =
                        "Sembunyikan Password";

                } else {

                    passwordInput.type = "password";

                    togglePassword.textContent = "👁️";

                    togglePassword.title =
                        "Lihat Password";

                }

            }
        );

    }


    /* =========================================
       LOGIN FORM
    ========================================= */

    form.addEventListener(
        "submit",
        function (event) {

            event.preventDefault();


            /* Bersihkan pesan sebelumnya */

            if (message) {

                message.textContent = "";

                message.className =
                    "login-message";

            }


            /* Ambil data */

            const email =
                emailInput
                    ? emailInput.value.trim()
                    : "";

            const password =
                passwordInput
                    ? passwordInput.value
                    : "";

            const remember =
                rememberMe
                    ? rememberMe.checked
                    : false;


            /* Validasi */

            if (!email || !password) {

                showMessage(
                    "⚠️ Email dan Password wajib diisi.",
                    "error"
                );

                return;

            }


            /* Tombol loading */

            if (loginBtn) {

                loginBtn.disabled = true;

                loginBtn.textContent =
                    "Loading...";

            }


            /* Proses login */

            setTimeout(
                function () {

                    let success = false;


                    try {

                        success = login(
                            email,
                            password,
                            remember
                        );

                    } catch (error) {

                        console.error(
                            "Login error:",
                            error
                        );

                        success = false;

                    }


                    /* =================================
                       LOGIN BERHASIL
                    ================================= */

                    if (success) {

                        showMessage(
                            "✅ Login berhasil. Mengalihkan ke Dashboard...",
                            "success"
                        );


                        setTimeout(
                            function () {

                                window.location.href =
                                    "index.html";

                            },
                            1000
                        );


                        return;

                    }


                    /* =================================
                       LOGIN GAGAL
                    ================================= */

                    showMessage(
                        "❌ Email atau Password salah.",
                        "error"
                    );


                    if (loginBtn) {

                        loginBtn.disabled = false;

                        loginBtn.textContent =
                            "Login";

                    }

                },
                500
            );

        }
    );


    /* =========================================
       SHOW MESSAGE
    ========================================= */

    function showMessage(text, type) {

        if (!message) {
            return;
        }

        message.textContent = text;

        message.className =
            "login-message " + type;

    }

});
