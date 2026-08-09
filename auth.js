/* =========================================
   ANDINOMICS AUTHENTICATION
   Version : 0.4 Beta
========================================= */

/* =========================================
   DEMO USERS
========================================= */

const DEMO_USERS = [
    {
        email: "admin@andinomics.id",
        password: "Admin123",
        name: "Administrator",
        role: "admin"
    },
    {
        email: "user@andinomics.id",
        password: "User123",
        name: "User",
        role: "user"
    }
];


/* =========================================
   LOGIN
========================================= */

function login(email, password, remember = false) {

    const cleanEmail = email.trim().toLowerCase();

    const user = DEMO_USERS.find(function (u) {

        return (
            u.email.toLowerCase() === cleanEmail &&
            u.password === password
        );

    });

    if (!user) {
        return false;
    }


    const session = {

        name: user.name,

        email: user.email,

        role: user.role,

        loginTime: new Date().toISOString()

    };


    /* Hapus session lama */

    sessionStorage.removeItem("andinomicsUser");

    localStorage.removeItem("andinomicsUser");


    /* Simpan session */

    if (remember) {

        localStorage.setItem(
            "andinomicsUser",
            JSON.stringify(session)
        );

    } else {

        sessionStorage.setItem(
            "andinomicsUser",
            JSON.stringify(session)
        );

    }


    return true;

}


/* =========================================
   LOGOUT
========================================= */

function logout() {

    sessionStorage.removeItem("andinomicsUser");

    localStorage.removeItem("andinomicsUser");

    window.location.href = "login.html";

}


/* =========================================
   GET CURRENT USER
========================================= */

function getCurrentUser() {

    const sessionUser =
        sessionStorage.getItem("andinomicsUser");

    const localUser =
        localStorage.getItem("andinomicsUser");


    if (sessionUser) {

        try {

            return JSON.parse(sessionUser);

        } catch (error) {

            sessionStorage.removeItem("andinomicsUser");

        }

    }


    if (localUser) {

        try {

            return JSON.parse(localUser);

        } catch (error) {

            localStorage.removeItem("andinomicsUser");

        }

    }


    return null;

}


/* =========================================
   LOGIN STATUS
========================================= */

function isLoggedIn() {

    return getCurrentUser() !== null;

}


/* =========================================
   PROTECT PAGE
========================================= */

function protectPage() {

    if (!isLoggedIn()) {

        window.location.href = "login.html";

        return false;

    }

    return true;

}


/* =========================================
   LOAD USER PROFILE
========================================= */

function loadUserProfile() {

    const user = getCurrentUser();

    if (!user) {
        return;
    }


    const userName =
        document.getElementById("userName");


    const userEmail =
        document.getElementById("userEmail");


    const userRole =
        document.getElementById("userRole");


    if (userName) {

        userName.textContent = user.name;

    }


    if (userEmail) {

        userEmail.textContent = user.email;

    }


    if (userRole) {

        userRole.textContent = user.role;

    }

}


/* =========================================
   INITIALIZE DASHBOARD
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        loadUserProfile();


        const logoutBtn =
            document.getElementById("logoutBtn");


        if (logoutBtn) {

            logoutBtn.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();

                    logout();

                }
            );

        }

    }
);
