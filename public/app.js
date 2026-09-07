// ============================================================
// GROUP CITY GOVERNMENT PORTAL
// FRONTEND JAVASCRIPT
// public/app.js
// ============================================================

let currentUser = null;
let last911CallId = 0;
let rtoTimer = null;

const API_BASE = "https://group-city.onrender.com";

const PHONETIC_ALPHABET = [
    ["A", "Alpha"], ["B", "Bravo"], ["C", "Charlie"], ["D", "Delta"],
    ["E", "Echo"], ["F", "Foxtrot"], ["G", "Golf"], ["H", "Hotel"],
    ["I", "India"], ["J", "Juliett"], ["K", "Kilo"], ["L", "Lima"],
    ["M", "Mike"], ["N", "November"], ["O", "Oscar"], ["P", "Papa"],
    ["Q", "Quebec"], ["R", "Romeo"], ["S", "Sierra"], ["T", "Tango"],
    ["U", "Uniform"], ["V", "Victor"], ["W", "Whiskey"], ["X", "X-ray"],
    ["Y", "Yankee"], ["Z", "Zulu"]
];

const RADIO_FREQUENCIES = [
    ["UNICOM", "122.500"],
    ["Western Center", "128.600"],
    ["Eastern Center", "119.600"]
];


// ============================================================
// HELPERS
// ============================================================

function $(id) {
    return document.getElementById(id);
}

function show(element) {
    if (element) element.classList.remove("hidden");
}

function hide(element) {
    if (element) element.classList.add("hidden");
}

function setText(id, value) {
    const element = $(id);
    if (element) element.textContent = value;
}

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

function formatMoney(amount) {
    return Number(amount || 0).toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
    });
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function formatRole(role) {
    const roles = {
        citizen: "Citizen",
        police: "Police Officer",
        pilot: "Pilot",
        atc: "Air Traffic Control",
        government: "Government"
    };

    return roles[role] || "Citizen";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeJsString(value) {
    return String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/'/g, "\\'")
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function clearFields(ids) {
    ids.forEach(id => {
        if ($(id)) $(id).value = "";
    });
}


// ============================================================
// API
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

    let response;

    try {
        response = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers
        });
    } catch {
        throw new Error(
            "Unable to connect to the Group City server. The server may be starting up."
        );
    }

    let data = {};

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(
            data.message ||
            data.error ||
            "Something went wrong."
        );
    }

    return data;
}


// ============================================================
// AUTH DISPLAY
// ============================================================

function showAuth() {
    hide($("appPage"));
    show($("authPage"));
    hide($("nav"));
    stopRtoPolling();
}

function showApplication() {
    hide($("authPage"));
    show($("appPage"));
    show($("nav"));
}


// ============================================================
// CHECK SESSION
// ============================================================

async function checkSession() {
    const token = localStorage.getItem("government_token");

    if (!token) {
        showAuth();
        return;
    }

    try {
        const data = await api("/api/auth/me");

        currentUser = data.user;

        showApplication();

        await loadUserData();
    } catch {
        localStorage.removeItem("government_token");
        currentUser = null;
        showAuth();
    }
}


// ============================================================
// LOGIN / REGISTER TABS
// ============================================================

$("loginTab")?.addEventListener("click", () => {
    $("loginTab")?.classList.add("active");
    $("registerTab")?.classList.remove("active");

    show($("loginForm"));
    hide($("registerForm"));

    setText("authMessage", "");
});

$("registerTab")?.addEventListener("click", () => {
    $("registerTab")?.classList.add("active");
    $("loginTab")?.classList.remove("active");

    hide($("loginForm"));
    show($("registerForm"));

    setText("authMessage", "");
});


// ============================================================
// REGISTER
// ============================================================

$("registerForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const name = $("regName")?.value.trim();
    const email = $("regEmail")?.value.trim();
    const password = $("regPassword")?.value || "";
    const message = $("authMessage");

    if (!name || !email || !password) {
        if (message) {
            message.textContent = "Complete all registration fields.";
        }
        return;
    }

    if (password.length < 6) {
        if (message) {
            message.textContent =
                "Password must be at least 6 characters.";
        }
        return;
    }

    if (message) {
        message.textContent = "Creating your citizen account...";
    }

    try {
        const data = await api("/api/auth/register", {
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

        showApplication();
        await loadUserData();

        toast(
            "Your citizen account has been created.",
            "success"
        );
    } catch (error) {
        if (message) {
            message.textContent = error.message;
            message.style.color = "#c0392b";
        }
    }
});


// ============================================================
// LOGIN
// ============================================================

$("loginForm")?.addEventListener("submit", async event => {
    event.preventDefault();

    const email = $("loginEmail")?.value.trim();
    const password = $("loginPassword")?.value || "";
    const message = $("authMessage");

    if (message) {
        message.textContent = "Signing in...";
    }

    try {
        const data = await api("/api/auth/login", {
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

        showApplication();
        await loadUserData();

        toast("Welcome back.", "success");
    } catch (error) {
        if (message) {
            message.textContent = error.message;
            message.style.color = "#c0392b";
        }
    }
});


// ============================================================
// LOGOUT
// ============================================================

$("logoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("government_token");

    currentUser = null;

    stopRtoPolling();

    showAuth();

    toast(
        "You have been signed out.",
        "success"
    );
});


// ============================================================
// NAVIGATION
// ============================================================

document.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");

    if (!button) return;

    navigate(button.dataset.page);
});

function navigate(pageName) {
    document.querySelectorAll(".page").forEach(page => {
        hide(page);
    });

    const selected = $(pageName);

    if (selected) {
        show(selected);
    }

    if (pageName !== "police") {
        stopRtoPolling();
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

    if (pageName === "penalCodes") {
        loadPenalCodes();
    }

    if (pageName === "police") {
        loadPolice();
    }

    if (pageName === "pilot") {
        loadPilot();
    }

    if (pageName === "government") {
        loadGovernment();
    }
}


// ============================================================
// USER
// ============================================================

async function loadUserData() {
    if (!localStorage.getItem("government_token")) {
        return;
    }

    try {
        const data = await api("/api/users/me");

        currentUser = data.user;

        updateUserInterface();

        await Promise.all([
            loadBank(),
            loadLicenses()
        ]);
    } catch (error) {
        console.error("User data:", error);
    }
}

function updateUserInterface() {
    if (!currentUser) return;

    setText(
        "welcomeName",
        currentUser.name || "Citizen"
    );

    setText(
        "citizenId",
        currentUser.citizen_id || "—"
    );

    setText(
        "homeRole",
        formatRole(currentUser.role)
    );

    setText(
        "homePoints",
        Number(currentUser.police_points || 0)
    );

    setText(
        "homePoliceCallsign",
        currentUser.police_callsign || "—"
    );

    setText(
        "homePilotCallsign",
        currentUser.pilot_callsign || "—"
    );

    const police = [
        "police",
        "government"
    ].includes(currentUser.role);

    const pilot = [
        "pilot",
        "atc",
        "government"
    ].includes(currentUser.role);

    const government =
        currentUser.role === "government";

    if (police) {
        show($("policeNav"));
        show($("policeCard"));
    } else {
        hide($("policeNav"));
        hide($("policeCard"));
    }

    if (pilot) {
        show($("pilotNav"));
        show($("pilotCard"));
    } else {
        hide($("pilotNav"));
        hide($("pilotCard"));
    }

    if (government) {
        show($("govNav"));
    } else {
        hide($("govNav"));
    }
}


// ============================================================
// BANK
// ============================================================

async function loadBank() {
    if (!currentUser) return;

    try {
        const data = await api("/api/bank");

        const account =
            data.account || {
                balance: data.balance,
                account_number: data.account_number
            };

        if (!account) return;

        setText(
            "balance",
            formatMoney(account.balance)
        );

        setText(
            "homeBalance",
            formatMoney(account.balance)
        );

        setText(
            "accountNumber",
            account.account_number || "—"
        );

        renderTransactions(
            data.transactions || []
        );
    } catch (error) {
        console.error("Bank:", error);
    }
}

$("transferBtn")?.addEventListener("click", async () => {
    const recipient =
        $("transferRecipient")?.value.trim();

    const amount =
        Number($("transferAmount")?.value);

    const description =
        $("transferDescription")?.value.trim();

    if (!recipient) {
        toast("Enter a recipient.", "error");
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        toast(
            "Enter a valid transfer amount.",
            "error"
        );
        return;
    }

    try {
        const data = await api(
            "/api/bank/transfer",
            {
                method: "POST",
                body: JSON.stringify({
                    recipient,
                    amount,
                    description:
                        description ||
                        "Bank transfer"
                })
            }
        );

        toast(
            `Successfully sent ${formatMoney(amount)} to ${
                data.recipient?.name || "the recipient"
            }.`,
            "success"
        );

        clearFields([
            "transferRecipient",
            "transferAmount",
            "transferDescription"
        ]);

        await loadBank();
    } catch (error) {
        toast(error.message, "error");
    }
});

function renderTransactions(transactions) {
    const container = $("transactions");

    if (!container) return;

    if (!transactions.length) {
        container.innerHTML =
            `<p class="muted">No transactions yet.</p>`;
        return;
    }

    container.innerHTML = transactions
        .map(transaction => {
            const amount =
                Number(transaction.amount || 0);

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

                    <div class="
                        transaction-amount
                        ${amount >= 0
                            ? "positive"
                            : "negative"}
                    ">
                        ${amount >= 0 ? "+" : ""}
                        ${formatMoney(amount)}
                    </div>
                </div>
            `;
        })
        .join("");
}


// ============================================================
// LICENSES
// ============================================================

async function loadLicenses() {
    if (!currentUser) return;

    try {
        const data = await api("/api/licenses");

        const licenses =
            data.licenses || [];

        renderLicenses(licenses);

        setText(
            "homeLicenses",
            licenses.filter(
                license =>
                    license.status === "active"
            ).length
        );
    } catch (error) {
        console.error("Licenses:", error);
    }
}

function renderLicenses(licenses) {
    const container = $("licenseGrid");

    if (!container) return;

    if (!licenses.length) {
        container.innerHTML =
            `<p class="muted">No licenses available.</p>`;
        return;
    }

    container.innerHTML = licenses
        .map(license => {
            const active =
                license.status === "active";

            const revoked =
                license.status === "revoked";

            const statusText =
                active
                    ? "Active"
                    : revoked
                        ? "Revoked"
                        : "Not Licensed";

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
                                        onclick="requestLicense('${escapeJsString(
                                            license.license_type
                                        )}')"
                                    >
                                        Request License
                                    </button>
                                `
                                : ""
                        }
                    </div>

                    <span class="
                        license-status
                        ${escapeHTML(
                            license.status || "inactive"
                        )}
                    ">
                        ${statusText}
                    </span>
                </div>
            `;
        })
        .join("");
}

async function requestLicense(licenseType) {
    try {
        await api(
            "/api/licenses/request",
            {
                method: "POST",
                body: JSON.stringify({
                    license_type: licenseType
                })
            }
        );

        toast(
            "License request submitted.",
            "success"
        );

        await loadLicenses();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// PUBLIC PENAL CODES
// ============================================================

$("penalCodeSearchBtn")?.addEventListener(
    "click",
    loadPenalCodes
);

$("penalCodeSearch")?.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadPenalCodes();
        }
    }
);

async function loadPenalCodes() {
    const container = $("penalCodeList");

    if (!container) return;

    try {
        const search =
            $("penalCodeSearch")?.value.trim() || "";

        const data = await api(
            `/api/penal-codes?search=${encodeURIComponent(search)}`
        );

        renderPenalCodes(
            data.penal_codes ||
            data.penalCodes ||
            data.codes ||
            []
        );
    } catch (error) {
        container.innerHTML = `
            <div class="card">
                <p class="muted">
                    ${escapeHTML(error.message)}
                </p>
            </div>
        `;
    }
}

function renderPenalCodes(codes) {
    const container = $("penalCodeList");

    if (!container) return;

    if (!codes.length) {
        container.innerHTML = `
            <div class="card">
                <p class="muted">
                    No Group City penal codes found.
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML = codes
        .map(code => `
            <div class="penal-code-card card">

                <div class="request-header">
                    <div>
                        <p class="eyebrow">
                            ${escapeHTML(
                                code.code || "PENAL CODE"
                            )}
                        </p>

                        <h3>
                            ${escapeHTML(
                                code.title ||
                                code.name ||
                                "Untitled Offense"
                            )}
                        </h3>
                    </div>

                    ${
                        code.fine !== null &&
                        code.fine !== undefined
                            ? `<strong>${formatMoney(code.fine)}</strong>`
                            : ""
                    }
                </div>

                ${
                    code.description
                        ? `<p>${escapeHTML(code.description)}</p>`
                        : ""
                }

                <div class="penal-meta grid three">

                    <div>
                        <span class="muted">Jail</span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                code.jail_time || "None"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span class="muted">Points</span>
                        <br>
                        <strong>
                            ${Number(code.points || 0)}
                        </strong>
                    </div>

                    <div>
                        <span class="muted">Category</span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                code.category || "General"
                            )}
                        </strong>
                    </div>

                </div>
            </div>
        `)
        .join("");
}


// ============================================================
// POLICE
// ============================================================

async function loadPolice() {
    if (
        !currentUser ||
        !["police", "government"]
            .includes(currentUser.role)
    ) {
        toast(
            "Police access required.",
            "error"
        );

        navigate("home");
        return;
    }

    await Promise.all([
        loadPoliceCallsign(),
        load911Calls(),
        loadBolos(),
        loadWarrants()
    ]);

    startRtoPolling();
}


// ============================================================
// POLICE CALLSIGN
// ============================================================

async function loadPoliceCallsign() {
    const element = $("policeCallsign");

    if (!element) return;

    try {
        const data =
            await api("/api/police/callsign");

        const callsign =
            data.callsign ||
            data.police_callsign ||
            "—";

        element.textContent = callsign;

        if (currentUser) {
            currentUser.police_callsign =
                callsign;
        }

        setText(
            "homePoliceCallsign",
            callsign
        );
    } catch {
        element.textContent = "Unavailable";
    }
}


// ============================================================
// POLICE CITIZEN SEARCH
// ============================================================

$("policeSearchBtn")?.addEventListener(
    "click",
    policeSearch
);

$("policeSearch")?.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            event.preventDefault();
            policeSearch();
        }
    }
);

async function policeSearch() {
    const value =
        $("policeSearch")?.value.trim();

    if (!value) {
        toast(
            "Enter a name, email, Government ID, Citizen ID, or database ID.",
            "error"
        );
        return;
    }

    try {
        const data = await api(
            `/api/police/citizen/${encodeURIComponent(value)}`
        );

        renderPoliceCitizen(data);
    } catch (error) {
        const container =
            $("policeResult");

        if (container) {
            container.innerHTML = `
                <div class="card">
                    <p class="muted">
                        ${escapeHTML(error.message)}
                    </p>
                </div>
            `;
        }

        toast(error.message, "error");
    }
}

function renderPoliceCitizen(data) {
    const container =
        $("policeResult");

    if (!container) return;

    const citizen =
        data.citizen ||
        data.user ||
        data;

    const records =
        data.records ||
        citizen.records ||
        [];

    container.innerHTML = `
        <div class="card">

            <div class="request-header">
                <div>
                    <p class="eyebrow">
                        CITIZEN RECORD
                    </p>

                    <h2>
                        ${escapeHTML(
                            citizen.name ||
                            "Unknown Citizen"
                        )}
                    </h2>
                </div>

                <strong>
                    ${Number(
                        citizen.police_points || 0
                    )} Points
                </strong>
            </div>

            <div class="grid two">

                <div>
                    <span class="muted">
                        Government ID
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            citizen.citizen_id || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Email
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            citizen.email || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Role
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            formatRole(citizen.role)
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Police Points
                    </span>
                    <br>
                    <strong>
                        ${Number(
                            citizen.police_points || 0
                        )}
                    </strong>
                </div>

            </div>

            <div class="inline">
                <button
                    class="primary"
                    onclick="addPolicePoints('${escapeJsString(
                        citizen.id
                    )}')"
                >
                    Add Points
                </button>

                <button
                    class="secondary"
                    onclick="addPoliceRecord('${escapeJsString(
                        citizen.id
                    )}')"
                >
                    Add Record
                </button>
            </div>
        </div>

        <div class="card">
            <h2>Police Record History</h2>

            ${
                records.length
                    ? records.map(record => `
                        <div class="record-item">
                            <div>
                                <strong>
                                    ${escapeHTML(
                                        record.reason ||
                                        "Police Record"
                                    )}
                                </strong>

                                <p class="muted">
                                    ${formatDate(
                                        record.created_at
                                    )}
                                </p>
                            </div>

                            <strong>
                                +${Number(
                                    record.points || 0
                                )} points
                            </strong>
                        </div>
                    `).join("")
                    : `
                        <p class="muted">
                            No police records.
                        </p>
                    `
            }
        </div>
    `;
}

async function addPolicePoints(citizenIdentifier) {
    const pointsInput =
        prompt("How many points do you want to add?");

    if (pointsInput === null) return;

    const points = Number(pointsInput);

    if (
        !Number.isInteger(points) ||
        points <= 0
    ) {
        toast(
            "Enter a valid number of points.",
            "error"
        );
        return;
    }

    const reason =
        prompt("Reason for these points:");

    if (
        reason === null ||
        !reason.trim()
    ) return;

    try {
        await api("/api/police/points", {
            method: "POST",
            body: JSON.stringify({
                user_id: citizenIdentifier,
                points,
                reason: reason.trim()
            })
        });

        toast(
            "Police points added.",
            "success"
        );

        await searchCitizenAgain(
            citizenIdentifier
        );
    } catch (error) {
        toast(error.message, "error");
    }
}

async function addPoliceRecord(citizenIdentifier) {
    const reason =
        prompt("Enter the police record:");

    if (
        reason === null ||
        !reason.trim()
    ) return;

    const pointsInput =
        prompt(
            "Points for this record (enter 0 for none):",
            "0"
        );

    if (pointsInput === null) return;

    const points = Number(pointsInput);

    if (
        !Number.isInteger(points) ||
        points < 0
    ) {
        toast(
            "Enter a valid point amount.",
            "error"
        );
        return;
    }

    try {
        await api("/api/police/records", {
            method: "POST",
            body: JSON.stringify({
                user_id: citizenIdentifier,
                reason: reason.trim(),
                points
            })
        });

        toast(
            "Police record created.",
            "success"
        );

        await searchCitizenAgain(
            citizenIdentifier
        );
    } catch (error) {
        toast(error.message, "error");
    }
}

async function searchCitizenAgain(identifier) {
    try {
        const data = await api(
            `/api/police/citizen/${encodeURIComponent(identifier)}`
        );

        renderPoliceCitizen(data);
    } catch (error) {
        console.error(
            "Citizen refresh:",
            error
        );
    }
}


// ============================================================
// 911 RTO
// ============================================================

function startRtoPolling() {
    stopRtoPolling();

    load911Calls();

    rtoTimer = setInterval(
        load911Calls,
        5000
    );
}

function stopRtoPolling() {
    if (rtoTimer) {
        clearInterval(rtoTimer);
        rtoTimer = null;
    }
}

async function load911Calls() {
    const container =
        $("rtoCalls");

    if (!container) return;

    try {
        const data =
            await api("/api/police/911");

        const calls =
            data.calls ||
            data.emergency_calls ||
            [];

        const activeCalls =
            calls.filter(call =>
                !["closed", "resolved"]
                    .includes(
                        String(
                            call.status || ""
                        ).toLowerCase()
                    )
            );

        const newestId =
            activeCalls.reduce(
                (highest, call) =>
                    Math.max(
                        highest,
                        Number(call.id || 0)
                    ),
                0
            );

        if (
            last911CallId > 0 &&
            newestId > last911CallId
        ) {
            play911Alert();

            toast(
                "NEW 911 CALL RECEIVED",
                "error"
            );
        }

        if (newestId > last911CallId) {
            last911CallId = newestId;
        }

        render911Calls(activeCalls);
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                Unable to load 911 calls:
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function render911Calls(calls) {
    const container =
        $("rtoCalls");

    if (!container) return;

    setText(
        "active911Count",
        calls.length
    );

    if (!calls.length) {
        container.innerHTML = `
            <div class="emergency-panel">
                <p class="muted">
                    No active 911 calls.
                </p>
            </div>
        `;
        return;
    }

    container.innerHTML =
        calls.map(call => `
            <div class="emergency-call">

                <div class="request-header">
                    <div>
                        <span class="emergency-label">
                            ACTIVE 911 CALL
                        </span>

                        <h3>
                            ${escapeHTML(
                                call.caller_name ||
                                call.display_name ||
                                call.discord_username ||
                                "Unknown Caller"
                            )}
                        </h3>
                    </div>

                    <strong>
                        #${Number(call.id)}
                    </strong>
                </div>

                ${
                    call.discord_user_id
                        ? `
                            <p>
                                <strong>
                                    Discord ID:
                                </strong>
                                ${escapeHTML(
                                    call.discord_user_id
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    call.voice_channel
                        ? `
                            <p>
                                <strong>
                                    Voice Channel:
                                </strong>
                                ${escapeHTML(
                                    call.voice_channel
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    call.details || call.notes
                        ? `
                            <p>
                                <strong>
                                    Details:
                                </strong>
                                ${escapeHTML(
                                    call.details ||
                                    call.notes
                                )}
                            </p>
                        `
                        : ""
                }

                <p class="muted">
                    Received:
                    ${formatDate(
                        call.created_at
                    )}
                </p>

                <button
                    class="danger-btn"
                    onclick="close911Call(${Number(
                        call.id
                    )})"
                >
                    Close Call
                </button>
            </div>
        `).join("");
}

async function close911Call(callId) {
    if (
        !confirm(
            `Close 911 call #${callId}?`
        )
    ) return;

    try {
        await api(
            `/api/police/911/${callId}/close`,
            {
                method: "POST"
            }
        );

        toast(
            "911 call closed.",
            "success"
        );

        await load911Calls();
    } catch (error) {
        toast(error.message, "error");
    }
}

function play911Alert() {
    try {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) return;

        const context =
            new AudioContext();

        const playTone =
            (frequency, start, duration) => {
                const oscillator =
                    context.createOscillator();

                const gain =
                    context.createGain();

                oscillator.type = "square";
                oscillator.frequency.value =
                    frequency;

                gain.gain.setValueAtTime(
                    0.18,
                    context.currentTime + start
                );

                gain.gain.exponentialRampToValueAtTime(
                    0.01,
                    context.currentTime +
                    start +
                    duration
                );

                oscillator.connect(gain);
                gain.connect(
                    context.destination
                );

                oscillator.start(
                    context.currentTime + start
                );

                oscillator.stop(
                    context.currentTime +
                    start +
                    duration
                );
            };

        playTone(880, 0, 0.22);
        playTone(660, 0.28, 0.22);
        playTone(880, 0.56, 0.22);

        setTimeout(() => {
            context.close().catch(() => {});
        }, 1200);
    } catch (error) {
        console.warn(
            "911 alert audio unavailable:",
            error
        );
    }
}


// ============================================================
// BOLOS
// ============================================================

$("boloSearchBtn")?.addEventListener(
    "click",
    loadBolos
);

$("boloSearch")?.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadBolos();
        }
    }
);

async function loadBolos() {
    const container = $("boloList");

    if (!container) return;

    const search =
        $("boloSearch")?.value.trim() || "";

    try {
        const data = await api(
            `/api/police/bolos?search=${encodeURIComponent(search)}`
        );

        renderBolos(
            data.bolos || []
        );
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderBolos(bolos) {
    const container = $("boloList");

    if (!container) return;

    if (!bolos.length) {
        container.innerHTML = `
            <p class="muted">
                No active BOLOs found.
            </p>
        `;
        return;
    }

    container.innerHTML =
        bolos.map(bolo => `
            <div class="card highlight-card">

                <div class="request-header">
                    <div>
                        <p class="eyebrow">
                            ACTIVE BOLO
                        </p>

                        <h3>
                            ${escapeHTML(
                                bolo.subject ||
                                "Unknown Subject"
                            )}
                        </h3>
                    </div>

                    <strong>
                        #${Number(bolo.id)}
                    </strong>
                </div>

                ${
                    bolo.vehicle
                        ? `<p><strong>Vehicle:</strong> ${escapeHTML(bolo.vehicle)}</p>`
                        : ""
                }

                ${
                    bolo.plate
                        ? `<p><strong>Plate:</strong> ${escapeHTML(bolo.plate)}</p>`
                        : ""
                }

                ${
                    bolo.description
                        ? `<p><strong>Description:</strong> ${escapeHTML(bolo.description)}</p>`
                        : ""
                }

                ${
                    bolo.reason
                        ? `<p><strong>Reason:</strong> ${escapeHTML(bolo.reason)}</p>`
                        : ""
                }

                ${
                    bolo.issued_by_name
                        ? `
                            <p class="muted">
                                Issued by
                                ${escapeHTML(
                                    bolo.issued_by_name
                                )}
                            </p>
                        `
                        : ""
                }

                <p class="muted">
                    ${formatDate(
                        bolo.created_at ||
                        bolo.issued_at
                    )}
                </p>

                <button
                    class="secondary small-btn"
                    onclick="clearBolo(${Number(
                        bolo.id
                    )})"
                >
                    Mark Cleared
                </button>
            </div>
        `).join("");
}

async function clearBolo(boloId) {
    if (
        !confirm(
            "Mark this BOLO as cleared?"
        )
    ) return;

    try {
        await api(
            `/api/police/bolos/${boloId}/clear`,
            {
                method: "POST"
            }
        );

        toast(
            "BOLO cleared.",
            "success"
        );

        await loadBolos();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// WARRANTS
// ============================================================

$("warrantSearchBtn")?.addEventListener(
    "click",
    loadWarrants
);

$("warrantSearch")?.addEventListener(
    "keydown",
    event => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadWarrants();
        }
    }
);

async function loadWarrants() {
    const container =
        $("warrantList");

    if (!container) return;

    const search =
        $("warrantSearch")?.value.trim() || "";

    try {
        const data = await api(
            `/api/police/warrants?search=${encodeURIComponent(search)}`
        );

        renderWarrants(
            data.warrants || []
        );
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderWarrants(warrants) {
    const container =
        $("warrantList");

    if (!container) return;

    if (!warrants.length) {
        container.innerHTML = `
            <p class="muted">
                No active arrest warrants found.
            </p>
        `;
        return;
    }

    container.innerHTML =
        warrants.map(warrant => `
            <div class="card highlight-card">

                <div class="request-header">
                    <div>
                        <p class="eyebrow">
                            ARREST WARRANT
                        </p>

                        <h3>
                            ${escapeHTML(
                                warrant.subject_name ||
                                warrant.name ||
                                "Unknown Subject"
                            )}
                        </h3>
                    </div>

                    <strong>
                        #${Number(warrant.id)}
                    </strong>
                </div>

                ${
                    warrant.citizen_id
                        ? `
                            <p>
                                <strong>
                                    Government ID:
                                </strong>
                                ${escapeHTML(
                                    warrant.citizen_id
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    warrant.reason
                        ? `
                            <p>
                                <strong>Reason:</strong>
                                ${escapeHTML(
                                    warrant.reason
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    warrant.details
                        ? `
                            <p>
                                <strong>Details:</strong>
                                ${escapeHTML(
                                    warrant.details
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    warrant.issued_by_name
                        ? `
                            <p>
                                <strong>
                                    Issued by:
                                </strong>
                                ${escapeHTML(
                                    warrant.issued_by_name
                                )}
                            </p>
                        `
                        : ""
                }

                <p class="muted">
                    Issued:
                    ${formatDate(
                        warrant.created_at ||
                        warrant.issued_at
                    )}
                </p>

                <button
                    class="primary small-btn"
                    onclick="serveWarrant(${Number(
                        warrant.id
                    )})"
                >
                    Mark Served
                </button>
            </div>
        `).join("");
}

async function serveWarrant(warrantId) {
    if (
        !confirm(
            "Mark this arrest warrant as served?"
        )
    ) return;

    try {
        await api(
            `/api/police/warrants/${warrantId}/serve`,
            {
                method: "POST"
            }
        );

        toast(
            "Arrest warrant marked as served.",
            "success"
        );

        await loadWarrants();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// PILOT
// ============================================================

async function loadPilot() {
    if (
        !currentUser ||
        ![
            "pilot",
            "atc",
            "government"
        ].includes(currentUser.role)
    ) {
        toast(
            "Pilot or ATC access required.",
            "error"
        );

        navigate("home");
        return;
    }

    await Promise.all([
        loadPilotCallsign(),
        loadCharts(),
        loadActiveFlightPlan()
    ]);

    renderRadioFrequencies();
    renderPhoneticAlphabet();

    if (
        ["atc", "government"]
            .includes(currentUser.role)
    ) {
        await loadATCFlightPlans();
    } else {
        hide($("atcFlightPlansSection"));
    }
}


// ============================================================
// PILOT CALLSIGN
// ============================================================

async function loadPilotCallsign() {
    const element =
        $("pilotCallsign");

    if (!element) return;

    try {
        const data =
            await api("/api/pilot/callsign");

        const callsign =
            data.callsign ||
            data.pilot_callsign ||
            "—";

        element.textContent = callsign;

        if (currentUser) {
            currentUser.pilot_callsign =
                callsign;
        }

        setText(
            "homePilotCallsign",
            callsign
        );
    } catch {
        element.textContent =
            "Unavailable";
    }
}


// ============================================================
// RADIO FREQUENCIES
// ============================================================

function renderRadioFrequencies() {
    const container =
        $("radioFrequencies");

    if (!container) return;

    container.innerHTML =
        RADIO_FREQUENCIES
            .map(frequency => `
                <div class="frequency-card card">
                    <span class="muted">
                        ${escapeHTML(
                            frequency[0]
                        )}
                    </span>

                    <br>

                    <strong>
                        ${escapeHTML(
                            frequency[1]
                        )}
                    </strong>
                </div>
            `)
            .join("");
}


// ============================================================
// PHONETIC ALPHABET
// ============================================================

function renderPhoneticAlphabet() {
    const container =
        $("phoneticAlphabet");

    if (!container) return;

    container.innerHTML =
        PHONETIC_ALPHABET
            .map(entry => `
                <div class="phonetic-item">
                    <strong>
                        ${escapeHTML(entry[0])}
                    </strong>

                    <span>
                        ${escapeHTML(entry[1])}
                    </span>
                </div>
            `)
            .join("");
}


// ============================================================
// CHARTS
// ============================================================

$("chartAirport")?.addEventListener(
    "change",
    loadCharts
);

$("refreshCharts")?.addEventListener(
    "click",
    loadCharts
);

async function loadCharts() {
    const container =
        $("chartList");

    if (!container) return;

    const airport =
        $("chartAirport")?.value || "";

    try {
        let endpoint =
            "/api/pilot/charts";

        if (airport) {
            endpoint +=
                `?airport=${encodeURIComponent(
                    airport
                )}`;
        }

        const data =
            await api(endpoint);

        renderCharts(
            data.charts || []
        );
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderCharts(charts) {
    const container =
        $("chartList");

    if (!container) return;

    if (!charts.length) {
        container.innerHTML = `
            <p class="muted">
                No charts are currently available for this airport.
            </p>
        `;
        return;
    }

    container.innerHTML =
        charts.map(chart => `
            <div class="chart-card">

                <div>
                    <p class="eyebrow">
                        ${escapeHTML(
                            chart.airport ||
                            "AIRPORT"
                        )}
                    </p>

                    <h3>
                        ${escapeHTML(
                            chart.title ||
                            chart.name ||
                            "Airport Chart"
                        )}
                    </h3>

                    ${
                        chart.chart_type
                            ? `
                                <p class="muted">
                                    ${escapeHTML(
                                        chart.chart_type
                                    )}
                                </p>
                            `
                            : ""
                    }
                </div>

                ${
                    chart.url
                        ? `
                            <a
                                href="${escapeHTML(chart.url)}"
                                class="link-btn"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Open Chart
                            </a>
                        `
                        : ""
                }
            </div>
        `).join("");
}


// ============================================================
// ACTIVE FLIGHT PLAN
// ============================================================

async function loadActiveFlightPlan() {
    const container =
        $("activeFlightPlan");

    if (!container) return;

    try {
        const data =
            await api(
                "/api/pilot/flight-plan"
            );

        const plan =
            data.flight_plan ||
            data.flightPlan ||
            null;

        renderActiveFlightPlan(plan);
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderActiveFlightPlan(plan) {
    const container =
        $("activeFlightPlan");

    if (!container) return;

    if (!plan) {
        container.innerHTML = `
            <p class="muted">
                You do not currently have an active flight plan.
            </p>
        `;
        return;
    }

    container.innerHTML = `
        <div class="flight-plan">

            <div class="request-header">
                <div>
                    <p class="eyebrow">
                        ACTIVE FLIGHT PLAN
                    </p>

                    <h3>
                        ${escapeHTML(
                            plan.callsign ||
                            currentUser?.pilot_callsign ||
                            "GC-0000"
                        )}
                    </h3>
                </div>

                <span class="role-badge">
                    ${escapeHTML(
                        plan.status || "active"
                    )}
                </span>
            </div>

            <div class="flight-plan-grid grid two">

                <div>
                    <span class="muted">
                        Departure
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            plan.departure || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Arrival
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            plan.arrival || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Aircraft
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            plan.aircraft || "—"
                        )}
                    </strong>
                </div>

                <div>
                    <span class="muted">
                        Altitude
                    </span>
                    <br>
                    <strong>
                        ${escapeHTML(
                            plan.altitude || "—"
                        )}
                    </strong>
                </div>

            </div>

            ${
                plan.route
                    ? `
                        <p class="flight-route">
                            <strong>Route:</strong>
                            ${escapeHTML(plan.route)}
                        </p>
                    `
                    : ""
            }

            ${
                plan.remarks
                    ? `
                        <p>
                            <strong>Remarks:</strong>
                            ${escapeHTML(plan.remarks)}
                        </p>
                    `
                    : ""
            }

            <p class="muted">
                Filed:
                ${formatDate(plan.created_at)}
            </p>

            <button
                class="danger-btn"
                onclick="cancelFlightPlan()"
            >
                Cancel Flight Plan
            </button>
        </div>
    `;
}


// ============================================================
// FILE FLIGHT PLAN
// ============================================================

$("fileFlightPlanBtn")?.addEventListener(
    "click",
    fileFlightPlan
);

async function fileFlightPlan() {
    const departure =
        $("flightDeparture")?.value.trim();

    const arrival =
        $("flightArrival")?.value.trim();

    const aircraft =
        $("flightAircraft")?.value.trim();

    const route =
        $("flightRoute")?.value.trim();

    const altitude =
        $("flightAltitude")?.value.trim();

    const requestedCallsign =
        $("flightCallsign")?.value.trim();

    const remarks =
        $("flightRemarks")?.value.trim();

    if (!departure) {
        toast(
            "Enter a departure airport.",
            "error"
        );
        return;
    }

    if (!arrival) {
        toast(
            "Enter an arrival airport.",
            "error"
        );
        return;
    }

    if (!aircraft) {
        toast(
            "Enter an aircraft type.",
            "error"
        );
        return;
    }

    if (
        requestedCallsign &&
        !/^GC-\d{4}$/.test(
            requestedCallsign.toUpperCase()
        )
    ) {
        toast(
            "Pilot callsigns must use GC- followed by exactly 4 numbers, for example GC-1234.",
            "error"
        );
        return;
    }

    try {
        const data = await api(
            "/api/pilot/flight-plan",
            {
                method: "POST",
                body: JSON.stringify({
                    departure,
                    arrival,
                    aircraft,
                    route,
                    altitude,
                    callsign:
                        requestedCallsign
                            ? requestedCallsign.toUpperCase()
                            : "",
                    remarks
                })
            }
        );

        toast(
            "Flight plan filed.",
            "success"
        );

        if (
            data.callsign &&
            currentUser
        ) {
            currentUser.pilot_callsign =
                data.callsign;

            setText(
                "pilotCallsign",
                data.callsign
            );

            setText(
                "homePilotCallsign",
                data.callsign
            );
        }

        clearFields([
            "flightDeparture",
            "flightArrival",
            "flightAircraft",
            "flightRoute",
            "flightAltitude",
            "flightCallsign",
            "flightRemarks"
        ]);

        await loadActiveFlightPlan();

        if (
            ["atc", "government"]
                .includes(currentUser?.role)
        ) {
            await loadATCFlightPlans();
        }
    } catch (error) {
        toast(error.message, "error");
    }
}

async function cancelFlightPlan() {
    if (
        !confirm(
            "Cancel your active flight plan?"
        )
    ) return;

    try {
        await api(
            "/api/pilot/flight-plan/cancel",
            {
                method: "POST"
            }
        );

        toast(
            "Flight plan cancelled.",
            "success"
        );

        await loadActiveFlightPlan();

        if (
            ["atc", "government"]
                .includes(currentUser?.role)
        ) {
            await loadATCFlightPlans();
        }
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// ATC FLIGHT PLANS
// ============================================================

$("refreshATCPlans")?.addEventListener(
    "click",
    loadATCFlightPlans
);

async function loadATCFlightPlans() {
    const container =
        $("atcFlightPlans");

    if (!container) return;

    if (
        !currentUser ||
        !["atc", "government"]
            .includes(currentUser.role)
    ) {
        hide($("atcFlightPlansSection"));
        return;
    }

    show($("atcFlightPlansSection"));

    try {
        const data =
            await api(
                "/api/atc/flight-plans"
            );

        renderATCFlightPlans(
            data.flight_plans ||
            data.flightPlans ||
            []
        );
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderATCFlightPlans(plans) {
    const container =
        $("atcFlightPlans");

    if (!container) return;

    if (!plans.length) {
        container.innerHTML = `
            <p class="muted">
                There are no active flight plans.
            </p>
        `;
        return;
    }

    container.innerHTML =
        plans.map(plan => `
            <div class="flight-plan">

                <div class="request-header">
                    <div>
                        <p class="eyebrow">
                            ACTIVE AIRCRAFT
                        </p>

                        <h3>
                            ${escapeHTML(
                                plan.callsign ||
                                "GC-0000"
                            )}
                        </h3>
                    </div>

                    <span class="role-badge">
                        ${escapeHTML(
                            plan.status ||
                            "active"
                        )}
                    </span>
                </div>

                <p>
                    <strong>Pilot:</strong>
                    ${escapeHTML(
                        plan.pilot_name ||
                        plan.user_name ||
                        "Unknown Pilot"
                    )}
                </p>

                ${
                    plan.citizen_id
                        ? `
                            <p>
                                <strong>
                                    Government ID:
                                </strong>
                                ${escapeHTML(
                                    plan.citizen_id
                                )}
                            </p>
                        `
                        : ""
                }

                <div class="grid two">

                    <div>
                        <span class="muted">
                            Departure
                        </span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                plan.departure || "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span class="muted">
                            Arrival
                        </span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                plan.arrival || "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span class="muted">
                            Aircraft
                        </span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                plan.aircraft || "—"
                            )}
                        </strong>
                    </div>

                    <div>
                        <span class="muted">
                            Altitude
                        </span>
                        <br>
                        <strong>
                            ${escapeHTML(
                                plan.altitude || "—"
                            )}
                        </strong>
                    </div>

                </div>

                ${
                    plan.route
                        ? `
                            <p>
                                <strong>Route:</strong>
                                ${escapeHTML(
                                    plan.route
                                )}
                            </p>
                        `
                        : ""
                }

                ${
                    plan.remarks
                        ? `
                            <p>
                                <strong>Remarks:</strong>
                                ${escapeHTML(
                                    plan.remarks
                                )}
                            </p>
                        `
                        : ""
                }

                <p class="muted">
                    Filed:
                    ${formatDate(
                        plan.created_at
                    )}
                </p>
            </div>
        `).join("");
}


// ============================================================
// GOVERNMENT
// ============================================================

async function loadGovernment() {
    if (
        !currentUser ||
        currentUser.role !== "government"
    ) {
        toast(
            "Government access required.",
            "error"
        );

        navigate("home");
        return;
    }

    await Promise.all([
        loadMoneyLeaderboard(),
        loadLicenseRequests(),
        loadAuditLog(),
        loadGovernmentPenalCodes(),
        loadGovernmentBolos(),
        loadGovernmentWarrants(),
        loadGovernmentCharts()
    ]);
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
            event.preventDefault();
            searchGovernmentUsers();
        }
    }
);

async function searchGovernmentUsers() {
    const search =
        $("govSearch")?.value.trim();

    const container =
        $("govUsers");

    if (!container) return;

    if (!search) {
        container.innerHTML = `
            <p class="muted">
                Enter a citizen name, email, or Government ID.
            </p>
        `;
        return;
    }

    try {
        const data = await api(
            `/api/government/users?search=${encodeURIComponent(search)}`
        );

        renderGovernmentUsers(
            data.users || []
        );
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

function renderGovernmentUsers(users) {
    const container =
        $("govUsers");

    if (!container) return;

    if (!users.length) {
        container.innerHTML = `
            <p class="muted">
                No matching citizens found.
            </p>
        `;
        return;
    }

    container.innerHTML =
        users.map(user => `
            <div class="user-row card">

                <div class="user-main">
                    <h3>
                        ${escapeHTML(user.name)}
                    </h3>

                    <p class="muted">
                        ${escapeHTML(user.email)}
                    </p>

                    <p>
                        <strong>
                            Government ID:
                        </strong>
                        ${escapeHTML(
                            user.citizen_id || "—"
                        )}
                    </p>

                    <p>
                        <strong>
                            Database ID:
                        </strong>
                        ${Number(user.id)}
                    </p>
                </div>

                <div>
                    <span class="role-badge">
                        ${escapeHTML(
                            formatRole(user.role)
                        )}
                    </span>

                    <p>
                        ${Number(
                            user.police_points || 0
                        )} police points
                    </p>

                    ${
                        user.police_callsign
                            ? `
                                <p>
                                    Police:
                                    <strong>
                                        ${escapeHTML(
                                            user.police_callsign
                                        )}
                                    </strong>
                                </p>
                            `
                            : ""
                    }

                    ${
                        user.pilot_callsign
                            ? `
                                <p>
                                    Pilot:
                                    <strong>
                                        ${escapeHTML(
                                            user.pilot_callsign
                                        )}
                                    </strong>
                                </p>
                            `
                            : ""
                    }
                </div>
            </div>
        `).join("");
}


// ============================================================
// MONEY LEADERBOARD
// ============================================================

$("refreshLeaderboard")?.addEventListener(
    "click",
    loadMoneyLeaderboard
);

async function loadMoneyLeaderboard() {
    const container =
        $("moneyLeaderboard");

    if (!container) return;

    try {
        const data = await api(
            "/api/government/money-leaderboard"
        );

        const users =
            data.users ||
            data.leaderboard ||
            [];

        if (!users.length) {
            container.innerHTML = `
                <p class="muted">
                    No leaderboard data.
                </p>
            `;
            return;
        }

        container.innerHTML =
            users.map((user, index) => `
                <div class="transaction">

                    <div class="transaction-info">
                        <strong>
                            #${index + 1}
                            ${escapeHTML(user.name)}
                        </strong>

                        <span>
                            ${escapeHTML(
                                user.citizen_id || "—"
                            )}
                        </span>
                    </div>

                    <strong>
                        ${formatMoney(
                            user.balance
                        )}
                    </strong>
                </div>
            `).join("");
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}


// ============================================================
// GOVERNMENT BANK
// ============================================================

$("bankActionBtn")?.addEventListener(
    "click",
    async () => {
        const userIdentifier =
            $("bankUserId")?.value.trim();

        const amount =
            Number($("bankAmount")?.value);

        const description =
            $("bankDescription")?.value.trim();

        if (!userIdentifier) {
            toast(
                "Enter a name, email, Government ID, Citizen ID, or database ID.",
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
                "/api/government/bank",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id:
                            userIdentifier,
                        amount,
                        description:
                            description ||
                            "Government bank adjustment"
                    })
                }
            );

            toast(
                "Bank balance updated.",
                "success"
            );

            clearFields([
                "bankAmount",
                "bankDescription"
            ]);

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

$("licenseActionBtn")?.addEventListener(
    "click",
    async () => {
        const userIdentifier =
            $("licenseUserId")?.value.trim();

        const licenseType =
            $("govLicenseType")?.value.trim();

        const action =
            $("govLicenseAction")?.value;

        if (!userIdentifier) {
            toast(
                "Enter a citizen identifier.",
                "error"
            );
            return;
        }

        if (!licenseType) {
            toast(
                "Enter a license type.",
                "error"
            );
            return;
        }

        if (!action) {
            toast(
                "Choose a license action.",
                "error"
            );
            return;
        }

        try {
            await api(
                "/api/government/license",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id:
                            userIdentifier,
                        license_type:
                            licenseType,
                        action
                    })
                }
            );

            toast(
                "License updated.",
                "success"
            );

            await loadLicenseRequests();
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

$("roleActionBtn")?.addEventListener(
    "click",
    async () => {
        const userIdentifier =
            $("roleUserId")?.value.trim();

        const role =
            $("newRole")?.value;

        if (!userIdentifier) {
            toast(
                "Enter a citizen identifier.",
                "error"
            );
            return;
        }

        if (
            ![
                "citizen",
                "police",
                "pilot",
                "atc",
                "government"
            ].includes(role)
        ) {
            toast(
                "Choose a valid role.",
                "error"
            );
            return;
        }

        try {
            const data = await api(
                "/api/government/role",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id:
                            userIdentifier,
                        role
                    })
                }
            );

            toast(
                data.message ||
                "Role updated.",
                "success"
            );

            await searchGovernmentUsers();
        } catch (error) {
            toast(
                error.message,
                "error"
            );
        }
    }
);


// ============================================================
// GOVERNMENT PENAL CODES
// ============================================================

async function loadGovernmentPenalCodes() {
    const container =
        $("govPenalCodes");

    if (!container) return;

    try {
        const data =
            await api("/api/penal-codes");

        const codes =
            data.penal_codes ||
            data.penalCodes ||
            [];

        if (!codes.length) {
            container.innerHTML = `
                <p class="muted">
                    No penal codes created.
                </p>
            `;
            return;
        }

        container.innerHTML =
            codes.map(code => `
                <div class="card">

                    <div class="request-header">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    code.code
                                )}
                            </strong>

                            <p>
                                ${escapeHTML(
                                    code.title ||
                                    code.name ||
                                    ""
                                )}
                            </p>
                        </div>

                        <button
                            class="danger-btn small-btn"
                            onclick="deletePenalCode(${Number(
                                code.id
                            )})"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            `).join("");
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

$("addPenalCodeBtn")?.addEventListener(
    "click",
    async () => {
        const code =
            $("penalCodeCode")?.value.trim();

        const title =
            $("penalCodeTitle")?.value.trim();

        const description =
            $("penalCodeDescription")?.value.trim();

        const category =
            $("penalCodeCategory")?.value.trim();

        const fine =
            Number(
                $("penalCodeFine")?.value || 0
            );

        const points =
            Number(
                $("penalCodePoints")?.value || 0
            );

        const jailTime =
            $("penalCodeJail")?.value.trim();

        if (!code || !title) {
            toast(
                "Penal code and title are required.",
                "error"
            );
            return;
        }

        try {
            await api(
                "/api/government/penal-codes",
                {
                    method: "POST",
                    body: JSON.stringify({
                        code,
                        title,
                        description,
                        category,
                        fine,
                        points,
                        jail_time:
                            jailTime
                    })
                }
            );

            toast(
                "Penal code added.",
                "success"
            );

            clearFields([
                "penalCodeCode",
                "penalCodeTitle",
                "penalCodeDescription",
                "penalCodeCategory",
                "penalCodeFine",
                "penalCodePoints",
                "penalCodeJail"
            ]);

            await loadGovernmentPenalCodes();
            await loadPenalCodes();
        } catch (error) {
            toast(
                error.message,
                "error"
            );
        }
    }
);

async function deletePenalCode(id) {
    if (
        !confirm(
            "Delete this penal code?"
        )
    ) return;

    try {
        await api(
            `/api/government/penal-codes/${id}`,
            {
                method: "DELETE"
            }
        );

        toast(
            "Penal code deleted.",
            "success"
        );

        await loadGovernmentPenalCodes();
        await loadPenalCodes();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// GOVERNMENT BOLOS
// ============================================================

async function loadGovernmentBolos() {
    const container =
        $("govBolos");

    if (!container) return;

    try {
        const data =
            await api("/api/police/bolos");

        const bolos =
            data.bolos || [];

        if (!bolos.length) {
            container.innerHTML = `
                <p class="muted">
                    No active BOLOs.
                </p>
            `;
            return;
        }

        container.innerHTML =
            bolos.map(bolo => `
                <div class="card">
                    <div class="request-header">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    bolo.subject ||
                                    "Unknown"
                                )}
                            </strong>

                            <p class="muted">
                                ${escapeHTML(
                                    bolo.reason || ""
                                )}
                            </p>
                        </div>

                        <button
                            class="danger-btn small-btn"
                            onclick="deleteBolo(${Number(
                                bolo.id
                            )})"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            `).join("");
    } catch (error) {
        console.error(
            "Government BOLOs:",
            error
        );
    }
}

$("addBoloBtn")?.addEventListener(
    "click",
    async () => {
        const subject =
            $("boloSubject")?.value.trim();

        const vehicle =
            $("boloVehicle")?.value.trim();

        const plate =
            $("boloPlate")?.value.trim();

        const description =
            $("boloDescription")?.value.trim();

        const reason =
            $("boloReason")?.value.trim();

        if (!subject) {
            toast(
                "BOLO subject is required.",
                "error"
            );
            return;
        }

        try {
            await api(
                "/api/government/bolos",
                {
                    method: "POST",
                    body: JSON.stringify({
                        subject,
                        vehicle,
                        plate,
                        description,
                        reason
                    })
                }
            );

            toast(
                "BOLO created.",
                "success"
            );

            clearFields([
                "boloSubject",
                "boloVehicle",
                "boloPlate",
                "boloDescription",
                "boloReason"
            ]);

            await loadGovernmentBolos();
        } catch (error) {
            toast(
                error.message,
                "error"
            );
        }
    }
);

async function deleteBolo(id) {
    if (!confirm("Delete this BOLO?")) {
        return;
    }

    try {
        await api(
            `/api/government/bolos/${id}`,
            {
                method: "DELETE"
            }
        );

        toast(
            "BOLO deleted.",
            "success"
        );

        await loadGovernmentBolos();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// GOVERNMENT WARRANTS
// ============================================================

async function loadGovernmentWarrants() {
    const container =
        $("govWarrants");

    if (!container) return;

    try {
        const data =
            await api("/api/police/warrants");

        const warrants =
            data.warrants || [];

        if (!warrants.length) {
            container.innerHTML = `
                <p class="muted">
                    No active warrants.
                </p>
            `;
            return;
        }

        container.innerHTML =
            warrants.map(warrant => `
                <div class="card">
                    <div class="request-header">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    warrant.subject_name ||
                                    warrant.name ||
                                    "Unknown"
                                )}
                            </strong>

                            <p class="muted">
                                ${escapeHTML(
                                    warrant.reason || ""
                                )}
                            </p>
                        </div>

                        <button
                            class="danger-btn small-btn"
                            onclick="deleteWarrant(${Number(
                                warrant.id
                            )})"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            `).join("");
    } catch (error) {
        console.error(
            "Government warrants:",
            error
        );
    }
}

$("addWarrantBtn")?.addEventListener(
    "click",
    async () => {
        const citizen =
            $("warrantCitizen")?.value.trim();

        const reason =
            $("warrantReason")?.value.trim();

        const details =
            $("warrantDetails")?.value.trim();

        if (!citizen || !reason) {
            toast(
                "Citizen and warrant reason are required.",
                "error"
            );
            return;
        }

        try {
            await api(
                "/api/government/warrants",
                {
                    method: "POST",
                    body: JSON.stringify({
                        user_id: citizen,
                        reason,
                        details
                    })
                }
            );

            toast(
                "Arrest warrant issued.",
                "success"
            );

            clearFields([
                "warrantCitizen",
                "warrantReason",
                "warrantDetails"
            ]);

            await loadGovernmentWarrants();
        } catch (error) {
            toast(
                error.message,
                "error"
            );
        }
    }
);

async function deleteWarrant(id) {
    if (
        !confirm(
            "Delete this arrest warrant?"
        )
    ) return;

    try {
        await api(
            `/api/government/warrants/${id}`,
            {
                method: "DELETE"
            }
        );

        toast(
            "Warrant deleted.",
            "success"
        );

        await loadGovernmentWarrants();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// GOVERNMENT CHARTS
// ============================================================

async function loadGovernmentCharts() {
    const container =
        $("govCharts");

    if (!container) return;

    try {
        const data =
            await api("/api/pilot/charts");

        const charts =
            data.charts || [];

        if (!charts.length) {
            container.innerHTML = `
                <p class="muted">
                    No airport charts uploaded.
                </p>
            `;
            return;
        }

        container.innerHTML =
            charts.map(chart => `
                <div class="chart-card">
                    <div>
                        <strong>
                            ${escapeHTML(
                                chart.title ||
                                chart.name ||
                                "Airport Chart"
                            )}
                        </strong>

                        <p class="muted">
                            ${escapeHTML(
                                chart.airport
                            )}

                            ${
                                chart.chart_type
                                    ? ` • ${escapeHTML(
                                        chart.chart_type
                                    )}`
                                    : ""
                            }
                        </p>
                    </div>

                    <button
                        class="danger-btn small-btn"
                        onclick="deleteChart(${Number(
                            chart.id
                        )})"
                    >
                        Delete
                    </button>
                </div>
            `).join("");
    } catch (error) {
        console.error(
            "Government charts:",
            error
        );
    }
}

$("addChartBtn")?.addEventListener(
    "click",
    async () => {
        const airport =
            $("govChartAirport")?.value;

        const title =
            $("govChartTitle")?.value.trim();

        const chartType =
            $("govChartType")?.value.trim();

        const url =
            $("govChartUrl")?.value.trim();

        if (
            !airport ||
            !title ||
            !url
        ) {
            toast(
                "Airport, chart title, and chart URL are required.",
                "error"
            );
            return;
        }

        try {
            await api(
                "/api/government/charts",
                {
                    method: "POST",
                    body: JSON.stringify({
                        airport,
                        title,
                        chart_type:
                            chartType,
                        url
                    })
                }
            );

            toast(
                "Airport chart added.",
                "success"
            );

            clearFields([
                "govChartTitle",
                "govChartType",
                "govChartUrl"
            ]);

            await loadGovernmentCharts();
            await loadCharts();
        } catch (error) {
            toast(
                error.message,
                "error"
            );
        }
    }
);

async function deleteChart(id) {
    if (!confirm("Delete this chart?")) {
        return;
    }

    try {
        await api(
            `/api/government/charts/${id}`,
            {
                method: "DELETE"
            }
        );

        toast(
            "Chart deleted.",
            "success"
        );

        await loadGovernmentCharts();
        await loadCharts();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// LICENSE REQUESTS
// ============================================================

async function loadLicenseRequests() {
    const container =
        $("licenseRequests");

    if (!container) return;

    try {
        const data = await api(
            "/api/government/license-requests"
        );

        const requests =
            data.requests || [];

        if (!requests.length) {
            container.innerHTML = `
                <p class="muted">
                    No pending license requests.
                </p>
            `;
            return;
        }

        container.innerHTML =
            requests.map(request => `
                <div class="request card">

                    <div class="request-header">
                        <div>
                            <strong>
                                ${escapeHTML(
                                    request.user_name ||
                                    request.name ||
                                    "Unknown Citizen"
                                )}
                            </strong>

                            <p class="muted">
                                ${escapeHTML(
                                    request.license_type
                                )}
                            </p>
                        </div>

                        <div class="request-actions inline">

                            <button
                                class="primary small-btn"
                                onclick="reviewLicenseRequest(${Number(
                                    request.id
                                )}, 'approve')"
                            >
                                Approve
                            </button>

                            <button
                                class="danger-btn small-btn"
                                onclick="reviewLicenseRequest(${Number(
                                    request.id
                                )}, 'deny')"
                            >
                                Deny
                            </button>

                        </div>
                    </div>

                    <p class="muted">
                        Requested:
                        ${formatDate(
                            request.created_at
                        )}
                    </p>
                </div>
            `).join("");
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}

async function reviewLicenseRequest(
    requestId,
    action
) {
    try {
        await api(
            `/api/government/license-requests/${requestId}`,
            {
                method: "POST",
                body: JSON.stringify({
                    action
                })
            }
        );

        toast(
            action === "approve"
                ? "License request approved."
                : "License request denied.",
            "success"
        );

        await loadLicenseRequests();
    } catch (error) {
        toast(error.message, "error");
    }
}


// ============================================================
// AUDIT LOG
// ============================================================

$("refreshAudit")?.addEventListener(
    "click",
    loadAuditLog
);

async function loadAuditLog() {
    const container =
        $("auditLog");

    if (!container) return;

    try {
        const data =
            await api(
                "/api/government/audit"
            );

        const logs =
            data.logs ||
            data.audit ||
            [];

        if (!logs.length) {
            container.innerHTML = `
                <p class="muted">
                    No government audit entries.
                </p>
            `;
            return;
        }

        container.innerHTML =
            logs.map(log => `
                <div class="transaction">

                    <div class="transaction-info">
                        <strong>
                            ${escapeHTML(
                                log.action ||
                                "Government Action"
                            )}
                        </strong>

                        <span>
                            ${escapeHTML(
                                log.details || ""
                            )}
                        </span>

                        ${
                            log.actor_name
                                ? `
                                    <span>
                                        By:
                                        ${escapeHTML(
                                            log.actor_name
                                        )}
                                    </span>
                                `
                                : ""
                        }
                    </div>

                    <span class="muted">
                        ${formatDate(
                            log.created_at
                        )}
                    </span>
                </div>
            `).join("");
    } catch (error) {
        container.innerHTML = `
            <p class="muted">
                ${escapeHTML(error.message)}
            </p>
        `;
    }
}


// ============================================================
// AUDIO UNLOCK
// ============================================================

let rtoAudioUnlocked = false;

function unlockRtoAudio() {
    if (rtoAudioUnlocked) return;

    try {
        const AudioContext =
            window.AudioContext ||
            window.webkitAudioContext;

        if (!AudioContext) return;

        const context =
            new AudioContext();

        if (
            context.state ===
            "suspended"
        ) {
            context.resume()
                .catch(() => {});
        }

        const oscillator =
            context.createOscillator();

        const gain =
            context.createGain();

        gain.gain.value = 0;

        oscillator.connect(gain);
        gain.connect(
            context.destination
        );

        oscillator.start();

        oscillator.stop(
            context.currentTime + 0.01
        );

        setTimeout(() => {
            context.close()
                .catch(() => {});
        }, 100);

        rtoAudioUnlocked = true;
    } catch {
        // Browser has not allowed audio yet.
    }
}

document.addEventListener(
    "click",
    unlockRtoAudio,
    {
        once: true
    }
);

document.addEventListener(
    "keydown",
    unlockRtoAudio,
    {
        once: true
    }
);


// ============================================================
// PUBLIC DATA
// ============================================================

async function loadPublicData() {
    try {
        await loadPenalCodes();
    } catch {
        // Public data failure should not stop login.
    }
}


// ============================================================
// MAKE INLINE FUNCTIONS AVAILABLE
// ============================================================

window.requestLicense =
    requestLicense;

window.addPolicePoints =
    addPolicePoints;

window.addPoliceRecord =
    addPoliceRecord;

window.close911Call =
    close911Call;

window.clearBolo =
    clearBolo;

window.serveWarrant =
    serveWarrant;

window.cancelFlightPlan =
    cancelFlightPlan;

window.deletePenalCode =
    deletePenalCode;

window.deleteBolo =
    deleteBolo;

window.deleteWarrant =
    deleteWarrant;

window.deleteChart =
    deleteChart;

window.reviewLicenseRequest =
    reviewLicenseRequest;


// ============================================================
// STARTUP
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        await loadPublicData();
        await checkSession();
    }
);
