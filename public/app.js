// ============================================================
// GOVERNMENT PORTAL - FRONTEND
// public/app.js
// ============================================================

// Change this when your backend is deployed.
// Example:
// const API_BASE = "https://your-backend.onrender.com/api";

const API_BASE = "/api";


// ============================================================
// STATE
// ============================================================

let currentUser = null;


// ============================================================
// ELEMENT HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}

function show(element) {
    if (element) {
        element.classList.remove("hidden");
    }
}

function hide(element) {
    if (element) {
        element.classList.add("hidden");
    }
}


// ============================================================
// TOAST / NOTIFICATIONS
// ============================================================

function toast(message, type = "success") {
    const element = $("toast");

    if (!element) return;

    element.textContent = message;
    element.className = "";
    element.classList.add("show", type);

    setTimeout(() => {
        element.className = "";
    }, 3500);
}


// ============================================================
// API REQUEST
// ============================================================

async function api(endpoint, options = {}) {
    const token = localStorage.getItem("government_token");

    const headers = {
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}


// ============================================================
// AUTH STATE
// ============================================================

async function checkSession() {
    const token = localStorage.getItem("government_token");

    if (!token) {
        showAuth();
        return;
    }

    try {
        const data = await api("/auth/me");

        currentUser = data.user;

        showApplication();

        await loadUserData();

    } catch (error) {
        localStorage.removeItem("government_token");
        currentUser = null;

        showAuth();
    }
}


// ============================================================
// SHOW LOGIN / REGISTER
// ============================================================

function showAuth() {
    hide($("appPage"));
    show($("authPage"));
    hide($("nav"));
}


// ============================================================
// SHOW APPLICATION
// ============================================================

function showApplication() {
    hide($("authPage"));
    show($("appPage"));
    show($("nav"));
}


// ============================================================
// LOGIN / REGISTER TABS
// ============================================================

$("loginTab")?.addEventListener("click", () => {

    $("loginTab").classList.add("active");
    $("registerTab").classList.remove("active");

    show($("loginForm"));
    hide($("registerForm"));

    $("authMessage").textContent = "";
});


$("registerTab")?.addEventListener("click", () => {

    $("registerTab").classList.add("active");
    $("loginTab").classList.remove("active");

    hide($("loginForm"));
    show($("registerForm"));

    $("authMessage").textContent = "";
});


// ============================================================
// REGISTER
// ============================================================

$("registerForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const name = $("regName").value.trim();
    const email = $("regEmail").value.trim();
    const password = $("regPassword").value;

    const message = $("authMessage");

    message.textContent = "Creating your citizen account...";
    message.style.color = "";

    try {

        const data = await api("/auth/register", {
            method: "POST",

            body: JSON.stringify({
                name,
                email,
                password
            })
        });

        localStorage.setItem(
            "government_token",
            data.token
        );

        currentUser = data.user;

        message.textContent = "";

        showApplication();

        await loadUserData();

        toast(
            "Your citizen account has been created.",
            "success"
        );

    } catch (error) {

        message.textContent = error.message;
        message.style.color = "#c0392b";
    }
});


// ============================================================
// LOGIN
// ============================================================

$("loginForm")?.addEventListener("submit", async (event) => {

    event.preventDefault();

    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    const message = $("authMessage");

    message.textContent = "Signing in...";
    message.style.color = "";

    try {

        const data = await api("/auth/login", {
            method: "POST",

            body: JSON.stringify({
                email,
                password
            })
        });

        localStorage.setItem(
            "government_token",
            data.token
        );

        currentUser = data.user;

        message.textContent = "";

        showApplication();

        await loadUserData();

        toast(
            "Welcome back.",
            "success"
        );

    } catch (error) {

        message.textContent = error.message;
        message.style.color = "#c0392b";
    }
});


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener("click", async () => {

    localStorage.removeItem("government_token");

    currentUser = null;

    showAuth();

    toast(
        "You have been signed out.",
        "success"
    );
});


// ============================================================
// NAVIGATION
// ============================================================

document.addEventListener("click", (event) => {

    const button = event.target.closest("[data-page]");

    if (!button) return;

    const page = button.dataset.page;

    navigate(page);
});


function navigate(pageName) {

    const pages = document.querySelectorAll(".page");

    pages.forEach(page => {
        hide(page);
    });

    const selected = $(pageName);

    if (selected) {
        show(selected);
    }

    if (pageName === "home") {
        loadUserData();
    }

    if (pageName === "bank") {
        loadBank();
    }

    if (pageName === "licenses") {
        loadLicenses();
    }

    if (pageName === "police") {

        if (
            currentUser &&
            currentUser.role === "police"
        ) {
            loadPolice();
        }
    }

    if (pageName === "government") {

        if (
            currentUser &&
            currentUser.role === "government"
        ) {
            loadGovernment();
        }
    }
}


// ============================================================
// LOAD USER DATA
// ============================================================

async function loadUserData() {

    try {

        const data = await api("/users/me");

        currentUser = data.user;

        updateUserInterface();

        loadBank();
        loadLicenses();

    } catch (error) {

        console.error(error);

        if (
            error.message.toLowerCase().includes("unauthorized")
        ) {
            localStorage.removeItem("government_token");

            showAuth();
        }
    }
}


// ============================================================
// UPDATE USER INTERFACE
// ============================================================

function updateUserInterface() {

    if (!currentUser) return;


    // -------------------------------
    // NAME
    // -------------------------------

    if ($("welcomeName")) {
        $("welcomeName").textContent =
            currentUser.name || "Citizen";
    }


    // -------------------------------
    // CITIZEN ID
    // -------------------------------

    if ($("citizenId")) {
        $("citizenId").textContent =
            currentUser.citizen_id || "—";
    }


    // -------------------------------
    // ROLE
    // -------------------------------

    const role =
        currentUser.role || "citizen";

    if ($("homeRole")) {

        $("homeRole").textContent =
            formatRole(role);
    }


    // -------------------------------
    // POLICE ACCESS
    // -------------------------------

    const isPolice =
        role === "police" ||
        role === "government";


    const isGovernment =
        role === "government";


    if (isPolice) {

        show($("policeNav"));
        show($("policeCard"));

    } else {

        hide($("policeNav"));
        hide($("policeCard"));
    }


    if (isGovernment) {

        show($("govNav"));

    } else {

        hide($("govNav"));
    }
}


// ============================================================
// FORMAT ROLE
// ============================================================

function formatRole(role) {

    const roles = {

        citizen: "Citizen",

        police: "Police Officer",

        government: "Government"
    };

    return roles[role] || "Citizen";
}


// ============================================================
// BANK
// ============================================================

async function loadBank() {

    if (!currentUser) return;

    try {

        const data = await api("/bank");

        const account = data.account;

        if (!account) return;


        // -------------------------------
        // BALANCE
        // -------------------------------

        const balance =
            Number(account.balance || 0);


        if ($("balance")) {

            $("balance").textContent =
                formatMoney(balance);
        }


        if ($("homeBalance")) {

            $("homeBalance").textContent =
                formatMoney(balance);
        }


        // -------------------------------
        // ACCOUNT NUMBER
        // -------------------------------

        if ($("accountNumber")) {

            $("accountNumber").textContent =
                account.account_number || "—";
        }


        // -------------------------------
        // TRANSACTIONS
        // -------------------------------

        renderTransactions(
            data.transactions || []
        );

    } catch (error) {

        console.error(
            "Bank error:",
            error
        );

        if ($("transactions")) {

            $("transactions").innerHTML =
                `<p class="muted">
                    Unable to load transactions.
                </p>`;
        }
    }
}


// ============================================================
// MONEY FORMAT
// ============================================================

function formatMoney(amount) {

    const number = Number(amount || 0);

    return number.toLocaleString(
        "en-US",
        {
            style: "currency",
            currency: "USD"
        }
    );
}


// ============================================================
// TRANSACTIONS
// ============================================================

function renderTransactions(transactions) {

    const container =
        $("transactions");

    if (!container) return;


    if (!transactions.length) {

        container.innerHTML =
            `<p class="muted">
                No transactions yet.
            </p>`;

        return;
    }


    container.innerHTML =
        transactions.map(transaction => {

            const amount =
                Number(transaction.amount || 0);

            const positive =
                amount >= 0;


            return `
                <div class="transaction">

                    <div class="transaction-info">

                        <strong>
                            ${escapeHTML(
                                transaction.description ||
                                transaction.type ||
                                "Transaction"
                            )}
                        </strong>

                        <span>
                            ${formatDate(
                                transaction.created_at
                            )}
                        </span>

                    </div>

                    <div class="transaction-amount ${
                        positive
                            ? "positive"
                            : "negative"
                    }">

                        ${
                            positive
                                ? "+"
                                : ""
                        }${formatMoney(amount)}

                    </div>

                </div>
            `;

        }).join("");
}


// ============================================================
// LICENSES
// ============================================================

async function loadLicenses() {

    if (!currentUser) return;

    try {

        const data =
            await api("/licenses");

        const licenses =
            data.licenses || [];

        renderLicenses(licenses);

        if ($("homeLicenses")) {

            const activeCount =
                licenses.filter(
                    license =>
                        license.status === "active"
                ).length;

            $("homeLicenses").textContent =
                activeCount;
        }

    } catch (error) {

        console.error(
            "License error:",
            error
        );

        if ($("licenseGrid")) {

            $("licenseGrid").innerHTML =
                `<p class="muted">
                    Unable to load licenses.
                </p>`;
        }
    }
}


// ============================================================
// RENDER LICENSES
// ============================================================

function renderLicenses(licenses) {

    const container =
        $("licenseGrid");

    if (!container) return;


    container.innerHTML =
        licenses.map(license => {

            const status =
                license.status || "unlicensed";


            let statusText =
                "Not Licensed";


            if (status === "active") {
                statusText = "Active";
            }

            if (status === "revoked") {
                statusText = "Revoked";
            }


            return `
                <div class="license-card">

                    <div class="license-info">

                        <h3>
                            ${escapeHTML(
                                license.license_type
                            )}
                        </h3>

                        <p>
                            ${
                                status === "active"
                                    ? `Issued ${formatDate(
                                        license.issued_at
                                    )}`
                                    : "This license has not been issued."
                            }
                        </p>

                        ${
                            status !== "active"
                                ? `
                                    <button
                                        class="primary"
                                        onclick="requestLicense('${escapeAttribute(
                                            license.license_type
                                        )}')"
                                    >
                                        Earn / Apply
                                    </button>
                                `
                                : ""
                        }

                    </div>

                    <span class="license-status ${status}">

                        ${statusText}

                    </span>

                </div>
            `;

        }).join("");
}


// ============================================================
// LICENSE REQUEST
// ============================================================

async function requestLicense(type) {

    const governmentPasscode =
        prompt(
            "Enter the government passcode:"
        );


    if (!governmentPasscode) {
        return;
    }


    try {

        await api("/licenses/request", {

            method: "POST",

            body: JSON.stringify({

                license_type: type,

                government_passcode:
                    governmentPasscode
            })
        });


        toast(
            "License request submitted.",
            "success"
        );


        await loadLicenses();

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}


// ============================================================
// POLICE
// ============================================================

async function loadPolice() {

    if (!currentUser) return;


    if (
        currentUser.role !== "police" &&
        currentUser.role !== "government"
    ) {

        toast(
            "You do not have police access.",
            "error"
        );

        return;
    }
}


// ============================================================
// POLICE SEARCH
// ============================================================

$("searchPolice")?.addEventListener(
    "click",
    async () => {

        const citizenId =
            $("policeCitizen").value.trim();


        if (!citizenId) {

            toast(
                "Enter a citizen database ID.",
                "error"
            );

            return;
        }


        try {

            const data =
                await api(
                    `/police/citizen/${encodeURIComponent(
                        citizenId
                    )}`
                );


            renderPoliceResult(
                data
            );

        } catch (error) {

            toast(
                error.message,
                "error"
            );
        }
    }
);


// ============================================================
// RENDER POLICE RESULT
// ============================================================

function renderPoliceResult(data) {

    const container =
        $("policeResult");

    if (!container) return;


    const citizen =
        data.citizen;


    const records =
        data.records || [];


    container.innerHTML = `

        <div class="card">

            <h2>
                Citizen Information
            </h2>

            <p>
                <strong>
                    Name:
                </strong>

                ${escapeHTML(
                    citizen.name
                )}
            </p>

            <p>
                <strong>
                    Citizen ID:
                </strong>

                ${escapeHTML(
                    citizen.citizen_id
                )}
            </p>

            <p>
                <strong>
                    Police Points:
                </strong>

                ${Number(
                    citizen.police_points || 0
                )}
            </p>

        </div>


        <div class="card">

            <h2>
                Police Records
            </h2>

            ${
                records.length
                    ? records.map(
                        renderPoliceRecord
                    ).join("")
                    : `
                        <p class="muted">
                            No police records found.
                        </p>
                    `
            }

        </div>


        <div class="grid two">

            <button
                class="primary"
                onclick="addPolicePoints(
                    ${citizen.id}
                )"
            >
                Add Points
            </button>

            <button
                class="primary"
                onclick="addPoliceRecord(
                    ${citizen.id}
                )"
            >
                Add Record
            </button>

        </div>
    `;
}


// ============================================================
// POLICE RECORD
// ============================================================

function renderPoliceRecord(record) {

    return `

        <div class="record">

            <div class="record-header">

                <h3>
                    ${escapeHTML(
                        record.reason
                    )}
                </h3>

                <span class="points">

                    +${Number(
                        record.points || 0
                    )} points

                </span>

            </div>

            <p>

                ${formatDate(
                    record.created_at
                )}

                · Officer:

                ${escapeHTML(
                    record.officer_name ||
                    record.officer_id ||
                    "Unknown"
                )}

            </p>

        </div>
    `;
}


// ============================================================
// ADD POLICE POINTS
// ============================================================

async function addPolicePoints(
    citizenId
) {

    const points =
        prompt(
            "How many points should be added?"
        );


    if (!points) return;


    const numericPoints =
        Number(points);


    if (
        !Number.isFinite(numericPoints) ||
        numericPoints <= 0
    ) {

        toast(
            "Enter a valid positive number.",
            "error"
        );

        return;
    }


    const reason =
        prompt(
            "Reason for the points:"
        );


    if (!reason) return;


    try {

        await api(
            "/police/points",
            {

                method: "POST",

                body: JSON.stringify({

                    citizen_id:
                        citizenId,

                    points:
                        numericPoints,

                    reason
                })
            }
        );


        toast(
            "Police points added.",
            "success"
        );


        await searchCitizenAgain(
            citizenId
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}


// ============================================================
// ADD POLICE RECORD
// ============================================================

async function addPoliceRecord(
    citizenId
) {

    const reason =
        prompt(
            "Record reason:"
        );


    if (!reason) return;


    const points =
        prompt(
            "Points to add (0 if none):",
            "0"
        );


    if (points === null) return;


    const numericPoints =
        Number(points);


    if (
        !Number.isFinite(numericPoints) ||
        numericPoints < 0
    ) {

        toast(
            "Enter a valid number.",
            "error"
        );

        return;
    }


    try {

        await api(
            "/police/records",
            {

                method: "POST",

                body: JSON.stringify({

                    citizen_id:
                        citizenId,

                    reason,

                    points:
                        numericPoints
                })
            }
        );


        toast(
            "Police record added.",
            "success"
        );


        await searchCitizenAgain(
            citizenId
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}


// ============================================================
// SEARCH CITIZEN AGAIN
// ============================================================

async function searchCitizenAgain(
    citizenId
) {

    try {

        const data =
            await api(
                `/police/citizen/${encodeURIComponent(
                    citizenId
                )}`
            );


        renderPoliceResult(
            data
        );

    } catch (error) {

        console.error(error);
    }
}


// ============================================================
// GOVERNMENT
// ============================================================

async function loadGovernment() {

    if (!currentUser) return;


    if (
        currentUser.role !== "government"
    ) {

        toast(
            "Government access required.",
            "error"
        );

        return;
    }


    try {

        const data =
            await api("/government/audit");

        renderAudit(
            data.audit || []
        );

    } catch (error) {

        console.error(
            "Government error:",
            error
        );
    }
}


// ============================================================
// GOVERNMENT USER SEARCH
// ============================================================

$("govSearchBtn")?.addEventListener(
    "click",
    searchGovernmentUsers
);


$("govSearch")?.addEventListener(
    "keydown",
    event => {

        if (event.key === "Enter") {
            searchGovernmentUsers();
        }
    }
);


async function searchGovernmentUsers() {

    const query =
        $("govSearch").value.trim();


    if (!query) {

        toast(
            "Enter a name, email or citizen ID.",
            "error"
        );

        return;
    }


    try {

        const data =
            await api(
                `/government/users?search=${encodeURIComponent(
                    query
                )}`
            );


        renderGovernmentUsers(
            data.users || []
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );
    }
}


// ============================================================
// RENDER GOVERNMENT USERS
// ============================================================

function renderGovernmentUsers(
    users
) {

    const container =
        $("govUsers");

    if (!container) return;


    if (!users.length) {

        container.innerHTML =
            `<p class="muted">
                No citizens found.
            </p>`;

        return;
    }


    container.innerHTML =
        users.map(user => `

            <div class="user-row">

                <div class="user-main">

                    <strong>
                        ${escapeHTML(
                            user.name
                        )}
                    </strong>

                    <span>
                        ID:
                        ${escapeHTML(
                            String(
                                user.id
                            )
                        )}

                        ·

                        ${escapeHTML(
                            user.citizen_id
                        )}
                    </span>

                </div>

                <span class="role-badge">

                    ${escapeHTML(
                        formatRole(
                            user.role
                        )
                    )}

                </span>

            </div>

        `).join("");
}


// ============================================================
// GOVERNMENT BANK ACTION
// ============================================================

$("bankAction")?.addEventListener(
    "click",
    async () => {

        const userId =
            $("bankUserId").value;


        const amount =
            Number(
                $("bankAmount").value
            );


        const description =
            $("bankDescription").value.trim();


        if (!userId) {

            toast(
                "Enter a user database ID.",
                "error"
            );

            return;
        }


        if (
            !Number.isFinite(amount) ||
            amount === 0
        ) {

            toast(
                "Enter a valid amount.",
                "error"
            );

            return;
        }


        try {

            await api(
                "/government/bank",
                {

                    method: "POST",

                    body: JSON.stringify({

                        user_id:
                            Number(userId),

                        amount,

                        description:
                            description ||
                            "Government transaction"
                    })
                }
            );


            toast(
                "Bank transaction applied.",
                "success"
            );


            $("bankAmount").value = "";

            $("bankDescription").value =
                "Government transaction";


            await loadGovernment();

        } catch (error) {

            toast(
                error.message,
                "error"
            );
        }
    }
);


// ============================================================
// GOVERNMENT LICENSE
// ============================================================

$("licenseAction")?.addEventListener(
    "click",
    async () => {

        const userId =
            $("licenseUserId").value;


        const licenseType =
            $("licenseType").value;


        const status =
            $("licenseStatus").value;


        if (!userId) {

            toast(
                "Enter a user database ID.",
                "error"
            );

            return;
        }


        try {

            await api(
                "/government/license",
                {

                    method: "POST",

                    body: JSON.stringify({

                        user_id:
                            Number(userId),

                        license_type:
                            licenseType,

                        status
                    })
                }
            );


            toast(
                "License updated.",
                "success"
            );


            await loadGovernment();

        } catch (error) {

            toast(
                error.message,
                "error"
            );
        }
    }
);


// ============================================================
// GOVERNMENT ROLE MANAGEMENT
// ============================================================

$("roleAction")?.addEventListener(
    "click",
    async () => {

        const userId =
            $("roleUserId").value;


        const role =
            $("roleSelect").value;


        if (!userId) {

            toast(
                "Enter a user database ID.",
                "error"
            );

            return;
        }


        try {

            await api(
                "/government/role",
                {

                    method: "POST",

                    body: JSON.stringify({

                        user_id:
                            Number(userId),

                        role
                    })
                }
            );


            toast(
                "User role updated.",
                "success"
            );


            await loadGovernment();

        } catch (error) {

            toast(
                error.message,
                "error"
            );
        }
    }
);


// ============================================================
// AUDIT LOG
// ============================================================

function renderAudit(entries) {

    const container =
        $("audit");

    if (!container) return;


    if (!entries.length) {

        container.innerHTML =
            `<p class="muted">
                No administrative actions yet.
            </p>`;

        return;
    }


    container.innerHTML =
        entries.map(entry => `

            <div class="audit-entry">

                <strong>
                    ${escapeHTML(
                        entry.action ||
                        "Administrative action"
                    )}
                </strong>

                <p>
                    ${escapeHTML(
                        entry.description ||
                        ""
                    )}
                </p>

                <time>
                    ${formatDate(
                        entry.created_at
                    )}
                </time>

            </div>

        `).join("");
}


// ============================================================
// DATE FORMAT
// ============================================================

function formatDate(date) {

    if (!date) {
        return "Unknown date";
    }


    const parsed =
        new Date(date);


    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {

        return String(date);
    }


    return parsed.toLocaleString(
        "en-US",
        {
            dateStyle: "medium",
            timeStyle: "short"
        }
    );
}


// ============================================================
// SECURITY HELPERS
// ============================================================

function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function escapeAttribute(value) {

    return String(value ?? "")
        .replaceAll("\\", "\\\\")
        .replaceAll("'", "\\'");
}


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        checkSession();

    }
);
