// ============================================================
// GOVERNMENT PORTAL
// FRONTEND JAVASCRIPT
// public/app.js
// ============================================================


// ============================================================
// STATE
// ============================================================

let currentUser = null;


// ============================================================
// API CONFIGURATION
// ============================================================

// Render backend
const API_BASE = "https://group-city.onrender.com";


// ============================================================
// HELPERS
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
// TOAST
// ============================================================

function toast(
    message,
    type = "success"
) {

    const element =
        $("toast");

    if (!element) return;


    element.textContent =
        message;

    element.className =
        "";

    element.classList.add(
        "show",
        type
    );


    setTimeout(() => {

        element.className =
            "";

    }, 3500);

}


// ============================================================
// API
// ============================================================

async function api(
    endpoint,
    options = {}
) {

    const token =
        localStorage.getItem(
            "government_token"
        );


    const headers = {

        "Content-Type":
            "application/json",

        ...(options.headers || {})

    };


    if (token) {

        headers.Authorization =
            `Bearer ${token}`;

    }


    const response =
        await fetch(
            `${API_BASE}${endpoint}`,
            {
                ...options,
                headers
            }
        );


    let data = {};


    try {

        data =
            await response.json();

    } catch {

        data = {};

    }


    if (!response.ok) {

        throw new Error(
            data.message ||
            "Something went wrong."
        );

    }


    return data;

}


// ============================================================
// SESSION
// ============================================================

async function checkSession() {

    const token =
        localStorage.getItem(
            "government_token"
        );


    if (!token) {

        showAuth();

        return;
    }


    try {

        const data =
            await api(
                "/api/auth/me"
            );


        currentUser =
            data.user;


        showApplication();

        await loadUserData();

    } catch {

        localStorage.removeItem(
            "government_token"
        );


        currentUser =
            null;


        showAuth();

    }

}


// ============================================================
// AUTH UI
// ============================================================

function showAuth() {

    hide(
        $("appPage")
    );

    show(
        $("authPage")
    );

    hide(
        $("nav")
    );

}


function showApplication() {

    hide(
        $("authPage")
    );

    show(
        $("appPage")
    );

    show(
        $("nav")
    );

}


// ============================================================
// LOGIN TAB
// ============================================================

$("loginTab")?.addEventListener(
    "click",
    () => {

        $("loginTab")
            .classList
            .add("active");


        $("registerTab")
            .classList
            .remove("active");


        show(
            $("loginForm")
        );


        hide(
            $("registerForm")
        );


        $("authMessage")
            .textContent = "";

    }
);


// ============================================================
// REGISTER TAB
// ============================================================

$("registerTab")?.addEventListener(
    "click",
    () => {

        $("registerTab")
            .classList
            .add("active");


        $("loginTab")
            .classList
            .remove("active");


        hide(
            $("loginForm")
        );


        show(
            $("registerForm")
        );


        $("authMessage")
            .textContent = "";

    }
);


// ============================================================
// REGISTER
// ============================================================

$("registerForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const name =
            $("regName")
                .value
                .trim();


        const email =
            $("regEmail")
                .value
                .trim();


        const password =
            $("regPassword")
                .value;


        const message =
            $("authMessage");


        message.textContent =
            "Creating your citizen account...";


        try {

            const data =
                await api(
                    "/api/auth/register",
                    {
                        method:
                            "POST",

                        body:
                            JSON.stringify({
                                name,
                                email,
                                password
                            })
                    }
                );


            localStorage.setItem(
                "government_token",
                data.token
            );


            currentUser =
                data.user;


            showApplication();

            await loadUserData();


            toast(
                "Your citizen account has been created.",
                "success"
            );

        } catch (error) {

            message.textContent =
                error.message;

            message.style.color =
                "#c0392b";

        }

    }
);


// ============================================================
// LOGIN
// ============================================================

$("loginForm")?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();


        const email =
            $("loginEmail")
                .value
                .trim();


        const password =
            $("loginPassword")
                .value;


        const message =
            $("authMessage");


        message.textContent =
            "Signing in...";


        try {

            const data =
                await api(
                    "/api/auth/login",
                    {
                        method:
                            "POST",

                        body:
                            JSON.stringify({
                                email,
                                password
                            })
                    }
                );


            localStorage.setItem(
                "government_token",
                data.token
            );


            currentUser =
                data.user;


            showApplication();

            await loadUserData();


            toast(
                "Welcome back.",
                "success"
            );

        } catch (error) {

            message.textContent =
                error.message;

            message.style.color =
                "#c0392b";

        }

    }
);


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener(
    "click",
    () => {

        localStorage.removeItem(
            "government_token"
        );


        currentUser =
            null;


        showAuth();


        toast(
            "You have been signed out.",
            "success"
        );

    }
);


// ============================================================
// NAVIGATION
// ============================================================

document.addEventListener(
    "click",
    event => {

        const button =
            event.target.closest(
                "[data-page]"
            );


        if (!button) return;


        navigate(
            button.dataset.page
        );

    }
);


function navigate(
    pageName
) {

    document
        .querySelectorAll(".page")
        .forEach(
            page => hide(page)
        );


    const selected =
        $(pageName);


    if (selected) {

        show(selected);

    }


    if (
        pageName === "home"
    ) {

        loadUserData();

    }


    if (
        pageName === "bank"
    ) {

        loadBank();

    }


    if (
        pageName === "licenses"
    ) {

        loadLicenses();

    }


    if (
        pageName === "police"
    ) {

        loadPolice();

    }


    if (
        pageName === "government"
    ) {

        loadGovernment();

    }

}


// ============================================================
// LOAD USER
// ============================================================

async function loadUserData() {

    try {

        const data =
            await api(
                "/api/users/me"
            );


        currentUser =
            data.user;


        updateUserInterface();


        await loadBank();

        await loadLicenses();

    } catch (error) {

        console.error(error);

    }

}


// ============================================================
// UPDATE USER UI
// ============================================================

function updateUserInterface() {

    if (!currentUser) return;


    if ($("welcomeName")) {

        $("welcomeName")
            .textContent =
            currentUser.name ||
            "Citizen";

    }


    if ($("citizenId")) {

        $("citizenId")
            .textContent =
            currentUser.citizen_id ||
            "—";

    }


    if ($("homeRole")) {

        $("homeRole")
            .textContent =
            formatRole(
                currentUser.role
            );

    }


    if ($("homePoints")) {

        $("homePoints")
            .textContent =
            Number(
                currentUser.police_points ||
                0
            );

    }


    const police =
        currentUser.role === "police" ||
        currentUser.role === "government";


    const government =
        currentUser.role === "government";


    if (police) {

        show(
            $("policeNav")
        );

        show(
            $("policeCard")
        );

    } else {

        hide(
            $("policeNav")
        );

        hide(
            $("policeCard")
        );

    }


    if (government) {

        show(
            $("govNav")
        );

    } else {

        hide(
            $("govNav")
        );

    }

}


// ============================================================
// ROLE
// ============================================================

function formatRole(
    role
) {

    const roles = {

        citizen:
            "Citizen",

        police:
            "Police Officer",

        government:
            "Government"

    };


    return (
        roles[role] ||
        "Citizen"
    );

}


// ============================================================
// BANK
// ============================================================

async function loadBank() {

    if (!currentUser) return;


    try {

        const data =
            await api(
                "/api/bank"
            );


        const account =
            data.account;


        if (!account) return;


        if ($("balance")) {

            $("balance")
                .textContent =
                formatMoney(
                    account.balance
                );

        }


        if ($("homeBalance")) {

            $("homeBalance")
                .textContent =
                formatMoney(
                    account.balance
                );

        }


        if ($("accountNumber")) {

            $("accountNumber")
                .textContent =
                account.account_number ||
                "—";

        }


        renderTransactions(
            data.transactions ||
            []
        );

    } catch (error) {

        console.error(
            "Bank:",
            error
        );

    }

}


// ============================================================
// CITIZEN MONEY TRANSFER
// ============================================================

$("transferBtn")?.addEventListener(
    "click",
    async () => {

        if (!currentUser) {

            toast(
                "You must be logged in.",
                "error"
            );

            return;

        }


        const recipient =
            $("transferRecipient")
                ?.value
                .trim();


        const amount =
            Number(
                $("transferAmount")
                    ?.value
            );


        const description =
            $("transferDescription")
                ?.value
                .trim();


        if (!recipient) {

            toast(
                "Enter a recipient.",
                "error"
            );

            return;

        }


        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            toast(
                "Enter a valid transfer amount.",
                "error"
            );

            return;

        }


        try {

            const data =
                await api(
                    "/api/bank/transfer",
                    {
                        method:
                            "POST",

                        body:
                            JSON.stringify({

                                recipient,

                                amount,

                                description:
                                    description ||
                                    "Bank transfer"

                            })

                    }
                );


            toast(

                `Successfully sent ${formatMoney(
                    amount
                )} to ${data.recipient.name}.`,

                "success"

            );


            if ($("transferRecipient")) {

                $("transferRecipient")
                    .value = "";

            }


            if ($("transferAmount")) {

                $("transferAmount")
                    .value = "";

            }


            if ($("transferDescription")) {

                $("transferDescription")
                    .value = "";

            }


            await loadBank();

        } catch (error) {

            toast(
                error.message,
                "error"
            );

        }

    }
);


// ============================================================
// MONEY
// ============================================================

function formatMoney(
    amount
) {

    return Number(
        amount || 0
    ).toLocaleString(
        "en-US",
        {
            style:
                "currency",

            currency:
                "USD"
        }
    );

}


// ============================================================
// TRANSACTIONS
// ============================================================

function renderTransactions(
    transactions
) {

    const container =
        $("transactions");


    if (!container) return;


    if (!transactions.length) {

        container.innerHTML = `
            <p class="muted">
                No transactions yet.
            </p>
        `;

        return;
    }


    container.innerHTML =
        transactions
            .map(
                transaction => {

                    const amount =
                        Number(
                            transaction.amount ||
                            0
                        );


                    return `

                        <div class="transaction">

                            <div class="transaction-info">

                                <strong>
                                    ${escapeHTML(
                                        transaction.description
                                    )}
                                </strong>

                                <span>
                                    ${formatDate(
                                        transaction.created_at
                                    )}
                                </span>

                            </div>


                            <div class="transaction-amount ${
                                amount >= 0
                                    ? "positive"
                                    : "negative"
                            }">

                                ${
                                    amount >= 0
                                        ? "+"
                                        : ""
                                }${formatMoney(
                                    amount
                                )}

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


// ============================================================
// LICENSES
// ============================================================

async function loadLicenses() {

    if (!currentUser) return;


    try {

        const data =
            await api(
                "/api/licenses"
            );


        renderLicenses(
            data.licenses ||
            []
        );


        const active =
            (data.licenses || [])
                .filter(
                    license =>
                        license.status ===
                        "active"
                )
                .length;


        if ($("homeLicenses")) {

            $("homeLicenses")
                .textContent =
                active;

        }

    } catch (error) {

        console.error(
            "Licenses:",
            error
        );

    }

}


// ============================================================
// RENDER LICENSES
// ============================================================

function renderLicenses(
    licenses
) {

    const container =
        $("licenseGrid");


    if (!container) return;


    container.innerHTML =
        licenses
            .map(
                license => {

                    const active =
                        license.status ===
                        "active";


                    const revoked =
                        license.status ===
                        "revoked";


                    let statusText =
                        "Not Licensed";


                    if (active) {

                        statusText =
                            "Active";

                    } else if (revoked) {

                        statusText =
                            "Revoked";

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
                                        active
                                            ? `Issued ${formatDate(
                                                license.issued_at
                                            )}`
                                            : "You do not currently have this license."
                                    }

                                </p>


                                ${
                                    !active
                                        ? `
                                            <button
                                                class="primary"
                                                onclick="requestLicense('${escapeAttribute(
                                                    license.license_type
                                                )}')"
                                            >
                                                Request License
                                            </button>
                                        `
                                        : ""
                                }

                            </div>


                            <span
                                class="license-status ${license.status}"
                            >

                                ${statusText}

                            </span>

                        </div>

                    `;

                }
            )
            .join("");

}


// ============================================================
// REQUEST LICENSE
// ============================================================

async function requestLicense(
    licenseType
) {

    const passcode =
        prompt(
            "Enter the government passcode:"
        );


    if (
        passcode === null
    ) {

        return;

    }


    try {

        await api(
            "/api/licenses/request",
            {
                method:
                    "POST",

                body:
                    JSON.stringify({

                        license_type:
                            licenseType,

                        government_passcode:
                            passcode

                    })

            }
        );


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


        navigate(
            "home"
        );


        return;

    }

}


// ============================================================
// POLICE SEARCH
// ============================================================

$("searchPolice")?.addEventListener(
    "click",
    searchPolice
);


async function searchPolice() {

    const value =
        $("policeCitizen")
            .value
            .trim();


    if (!value) {

        toast(
            "Enter a citizen ID.",
            "error"
        );

        return;
    }


    try {

        const data =
            await api(
                `/api/police/citizen/${encodeURIComponent(
                    value
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


// ============================================================
// POLICE RESULT
// ============================================================

function renderPoliceResult(
    data
) {

    const container =
        $("policeResult");


    if (!container) return;


    const citizen =
        data.citizen;


    const records =
        data.records ||
        [];


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
                    Role:
                </strong>

                ${formatRole(
                    citizen.role
                )}

            </p>


            <p>

                <strong>
                    Police Points:
                </strong>

                ${Number(
                    citizen.police_points ||
                    0
                )}

            </p>

        </div>


        <div class="card">

            <h2>
                Police Records
            </h2>


            ${
                records.length
                    ? records
                        .map(
                            renderPoliceRecord
                        )
                        .join("")
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
                onclick="addPolicePoints(${citizen.id})"
            >
                Add Points
            </button>


            <button
                class="primary"
                onclick="addPoliceRecord(${citizen.id})"
            >
                Add Record
            </button>

        </div>

    `;

}


// ============================================================
// POLICE RECORD
// ============================================================

function renderPoliceRecord(
    record
) {

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
                        record.points ||
                        0
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
                    "Unknown"
                )}

            </p>

        </div>

    `;

}


// ============================================================
// ADD POINTS
// ============================================================

async function addPolicePoints(
    citizenId
) {

    const points =
        Number(
            prompt(
                "How many points should be added?"
            )
        );


    if (
        !Number.isFinite(points) ||
        points <= 0
    ) {

        toast(
            "Enter a valid number of points.",
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
            "/api/police/points",
            {
                method:
                    "POST",

                body:
                    JSON.stringify({

                        citizen_id:
                            citizenId,

                        points,

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
// ADD RECORD
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
        Number(
            prompt(
                "Points to add (0 if none):",
                "0"
            )
        );


    if (
        !Number.isFinite(points) ||
        points < 0
    ) {

        toast(
            "Enter a valid points amount.",
            "error"
        );

        return;

    }


    try {

        await api(
            "/api/police/records",
            {
                method:
                    "POST",

                body:
                    JSON.stringify({

                        citizen_id:
                            citizenId,

                        reason,

                        points

                    })

            }
        );


        toast(
            "Police record created.",
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
// SEARCH AGAIN
// ============================================================

async function searchCitizenAgain(
    citizenId
) {

    try {

        const data =
            await api(
                `/api/police/citizen/${encodeURIComponent(
                    citizenId
                )}`
            );


        renderPoliceResult(
            data
        );

    } catch (error) {

        console.error(
            error
        );

    }

}


// ============================================================
// GOVERNMENT
// ============================================================

async function loadGovernment() {

    if (!currentUser) return;


    if (
        currentUser.role !==
        "government"
    ) {

        toast(
            "Government access required.",
            "error"
        );


        navigate(
            "home"
        );


        return;

    }


    await loadAudit();

    await loadLicenseRequests();

    await loadMoneyLeaderboard();

}


// ============================================================
// GOVERNMENT SEARCH
// ============================================================

$("govSearchBtn")?.addEventListener(
    "click",
    searchGovernmentUsers
);


$("govSearch")?.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Enter"
        ) {

            searchGovernmentUsers();

        }

    }
);


async function searchGovernmentUsers() {

    const search =
        $("govSearch")
            .value
            .trim();


    if (!search) {

        toast(
            "Enter a search.",
            "error"
        );

        return;
    }


    try {

        const data =
            await api(
                `/api/government/users?search=${encodeURIComponent(
                    search
                )}`
            );


        renderGovernmentUsers(
            data.users ||
            []
        );

    } catch (error) {

        toast(
            error.message,
            "error"
        );

    }

}


// ============================================================
// GOVERNMENT USERS
// ============================================================

function renderGovernmentUsers(
    users
) {

    const container =
        $("govUsers");


    if (!container) return;


    if (!users.length) {

        container.innerHTML = `
            <p class="muted">
                No citizens found.
            </p>
        `;

        return;
    }


    container.innerHTML =
        users
            .map(
                user => `

                    <div class="user-row">

                        <div class="user-main">

                            <strong>
                                ${escapeHTML(
                                    user.name
                                )}
                            </strong>

                            <span>

                                Database ID:
                                ${user.id}

                                ·

                                ${escapeHTML(
                                    user.citizen_id
                                )}

                                ·

                                ${escapeHTML(
                                    user.email
                                )}

                            </span>

                        </div>


                        <span class="role-badge">

                            ${formatRole(
                                user.role
                            )}

                        </span>

                    </div>

                `
            )
            .join("");

}


// ============================================================
// GOVERNMENT BANK
// ============================================================

$("bankAction")?.addEventListener(
    "click",
    async () => {

        const userId =
            Number(
                $("bankUserId")
                    .value
            );


        const amount =
            Number(
                $("bankAmount")
                    .value
            );


        const description =
            $("bankDescription")
                .value
                .trim();


        if (
            !Number.isInteger(
                userId
            )
        ) {

            toast(
                "Enter a valid user ID.",
                "error"
            );

            return;
        }


        if (
            !Number.isFinite(
                amount
            ) ||
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
                "/api/government/bank",
                {
                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            user_id:
                                userId,

                            amount,

                            description

                        })

                }
            );


            toast(
                "Bank transaction applied.",
                "success"
            );


            $("bankAmount")
                .value = "";


            await loadAudit();

            await loadMoneyLeaderboard();

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
            Number(
                $("licenseUserId")
                    .value
            );


        const licenseType =
            $("licenseType")
                .value;


        const status =
            $("licenseStatus")
                .value;


        if (
            !Number.isInteger(
                userId
            )
        ) {

            toast(
                "Enter a valid user ID.",
                "error"
            );

            return;
        }


        try {

            await api(
                "/api/government/license",
                {
                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            user_id:
                                userId,

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


            await loadLicenseRequests();

            await loadAudit();

        } catch (error) {

            toast(
                error.message,
                "error"
            );

        }

    }
);


// ============================================================
// GOVERNMENT ROLE
// ============================================================

$("roleAction")?.addEventListener(
    "click",
    async () => {

        const userId =
            Number(
                $("roleUserId")
                    .value
            );


        const role =
            $("roleSelect")
                .value;


        if (
            !Number.isInteger(
                userId
            )
        ) {

            toast(
                "Enter a valid user ID.",
                "error"
            );

            return;
        }


        try {

            await api(
                "/api/government/role",
                {
                    method:
                        "POST",

                    body:
                        JSON.stringify({

                            user_id:
                                userId,

                            role

                        })

                }
            );


            toast(
                "User role updated.",
                "success"
            );


            await loadAudit();

        } catch (error) {

            toast(
                error.message,
                "error"
            );

        }

    }
);


// ============================================================
// LICENSE REQUESTS
// ============================================================

async function loadLicenseRequests() {

    if (
        !currentUser ||
        currentUser.role !==
        "government"
    ) {

        return;

    }


    try {

        const data =
            await api(
                "/api/government/license-requests"
            );


        renderLicenseRequests(
            data.requests ||
            []
        );

    } catch (error) {

        console.error(
            error
        );

    }

}


// ============================================================
// RENDER LICENSE REQUESTS
// ============================================================

function renderLicenseRequests(
    requests
) {

    const container =
        $("licenseRequests");


    if (!container) return;


    if (!requests.length) {

        container.innerHTML = `
            <p class="muted">
                No license requests.
            </p>
        `;

        return;
    }


    container.innerHTML =
        requests
            .map(
                request => `

                    <div class="request">

                        <div class="request-header">

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        request.license_type
                                    )}
                                </strong>

                                <p class="muted">

                                    ${escapeHTML(
                                        request.user_name
                                    )}

                                    ·

                                    ${escapeHTML(
                                        request.citizen_id
                                    )}

                                </p>

                            </div>


                            <span class="role-badge">

                                ${escapeHTML(
                                    request.status
                                )}

                            </span>

                        </div>


                        ${
                            request.status ===
                            "pending"

                                ? `

                                    <div class="request-actions">

                                        <button
                                            class="primary"
                                            onclick="reviewLicense(
                                                ${request.id},
                                                'approved'
                                            )"
                                        >
                                            Approve
                                        </button>


                                        <button
                                            class="primary"
                                            onclick="reviewLicense(
                                                ${request.id},
                                                'denied'
                                            )"
                                        >
                                            Deny
                                        </button>

                                    </div>

                                `

                                : ""

                        }

                    </div>

                `
            )
            .join("");

}


// ============================================================
// REVIEW LICENSE
// ============================================================

async function reviewLicense(
    requestId,
    status
) {

    const note =
        prompt(
            "Optional government note:"
        );


    if (
        note === null
    ) {

        return;

    }


    try {

        await api(
            `/api/government/license-requests/${requestId}`,
            {
                method:
                    "POST",

                body:
                    JSON.stringify({

                        status,

                        note

                    })

            }
        );


        toast(
            `License request ${status}.`,
            "success"
        );


        await loadLicenseRequests();

        await loadAudit();

    } catch (error) {

        toast(
            error.message,
            "error"
        );

    }

}


// ============================================================
// GOVERNMENT MONEY LEADERBOARD
// ============================================================

async function loadMoneyLeaderboard() {

    if (
        !currentUser ||
        currentUser.role !==
        "government"
    ) {

        return;

    }


    try {

        const data =
            await api(
                "/api/government/money-leaderboard"
            );


        renderMoneyLeaderboard(
            data.leaderboard ||
            []
        );

    } catch (error) {

        console.error(
            "Money leaderboard:",
            error
        );

    }

}


// ============================================================
// RENDER MONEY LEADERBOARD
// ============================================================

function renderMoneyLeaderboard(
    leaderboard
) {

    const container =
        $("moneyLeaderboard");


    if (!container) return;


    if (!leaderboard.length) {

        container.innerHTML = `
            <p class="muted">
                No citizen bank accounts found.
            </p>
        `;

        return;

    }


    container.innerHTML = `

        <div class="leaderboard-table">

            <div class="leaderboard-row leaderboard-header">

                <span>
                    #
                </span>

                <span>
                    Citizen
                </span>

                <span>
                    Citizen ID
                </span>

                <span>
                    Account
                </span>

                <span>
                    Balance
                </span>

            </div>


            ${leaderboard
                .map(
                    (user, index) => `

                        <div class="leaderboard-row">

                            <span class="leaderboard-rank">

                                ${index + 1}

                            </span>


                            <span>

                                <strong>

                                    ${escapeHTML(
                                        user.name
                                    )}

                                </strong>


                                <small>

                                    ${escapeHTML(
                                        user.email
                                    )}

                                </small>

                            </span>


                            <span>

                                ${escapeHTML(
                                    user.citizen_id
                                )}

                            </span>


                            <span>

                                ${escapeHTML(
                                    user.account_number
                                )}

                            </span>


                            <strong>

                                ${formatMoney(
                                    user.balance
                                )}

                            </strong>

                        </div>

                    `
                )
                .join("")}

        </div>

    `;

}


// ============================================================
// REFRESH MONEY LEADERBOARD
// ============================================================

$("refreshLeaderboard")?.addEventListener(
    "click",
    async () => {

        const button =
            $("refreshLeaderboard");


        if (button) {

            button.disabled =
                true;

            button.textContent =
                "Refreshing...";

        }


        await loadMoneyLeaderboard();


        if (button) {

            button.disabled =
                false;

            button.textContent =
                "Refresh";

        }

    }
);


// ============================================================
// AUDIT
// ============================================================

async function loadAudit() {

    if (
        !currentUser ||
        currentUser.role !==
        "government"
    ) {

        return;

    }


    try {

        const data =
            await api(
                "/api/government/audit"
            );


        renderAudit(
            data.audit ||
            []
        );

    } catch (error) {

        console.error(
            error
        );

    }

}


// ============================================================
// RENDER AUDIT
// ============================================================

function renderAudit(
    entries
) {

    const container =
        $("audit");


    if (!container) return;


    if (!entries.length) {

        container.innerHTML = `
            <p class="muted">
                No administrative actions yet.
            </p>
        `;

        return;

    }


    container.innerHTML =
        entries
            .map(
                entry => `

                    <div class="audit-entry">

                        <strong>
                            ${escapeHTML(
                                entry.action
                            )}
                        </strong>


                        <p>
                            ${escapeHTML(
                                entry.description
                            )}
                        </p>


                        <time>

                            ${
                                entry.actor_name
                                    ? escapeHTML(
                                        entry.actor_name
                                    ) + " · "
                                    : ""
                            }

                            ${formatDate(
                                entry.created_at
                            )}

                        </time>

                    </div>

                `
            )
            .join("");

}


// ============================================================
// DATE
// ============================================================

function formatDate(
    date
) {

    if (!date) {

        return "Unknown date";

    }


    const parsed =
        new Date(
            date
        );


    if (
        Number.isNaN(
            parsed.getTime()
        )
    ) {

        return String(
            date
        );

    }


    return parsed.toLocaleString(
        "en-US",
        {
            dateStyle:
                "medium",

            timeStyle:
                "short"
        }
    );

}


// ============================================================
// HTML ESCAPING
// ============================================================

function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


function escapeAttribute(
    value
) {

    return String(
        value ?? ""
    )
        .replaceAll(
            "\\",
            "\\\\"
        )
        .replaceAll(
            "'",
            "\\'"
        );

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
