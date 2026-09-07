// ============================================================
// GROUP CITY GOVERNMENT PORTAL
// BACKEND SERVER
// server.js
// ============================================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();


// ============================================================
// CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 3000);

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "CHANGE_ME_IN_PRODUCTION";

const GOVERNMENT_PASSCODE =
    process.env.GOVERNMENT_PASSCODE ||
    "";

const ADMIN_EMAIL =
    process.env.ADMIN_EMAIL ||
    "government@example.com";

const ADMIN_PASSWORD =
    process.env.ADMIN_PASSWORD ||
    "CHANGE_ME";

const ADMIN_NAME =
    process.env.ADMIN_NAME ||
    "Government Administrator";

const DISPATCH_TOKEN =
    process.env.DISPATCH_TOKEN ||
    "";


// ============================================================
// EXPRESS
// ============================================================

app.use(cors());

app.use(
    express.json({
        limit: "2mb"
    })
);


// ============================================================
// DATABASE DIRECTORY
// ============================================================

const dataDirectory =
    path.join(
        __dirname,
        "data"
    );

if (!fs.existsSync(dataDirectory)) {

    fs.mkdirSync(
        dataDirectory,
        {
            recursive: true
        }
    );

}


// ============================================================
// DATABASE
// ============================================================

const dbPath =
    path.join(
        dataDirectory,
        "government.db"
    );

const db =
    new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


// ============================================================
// DATABASE TABLES
// IMPORTANT:
// Inside db.exec(), SQL comments MUST use -- and NOT //
// ============================================================

db.exec(`

    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        citizen_id TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'citizen',
        police_points INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );


    CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        account_number TEXT NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (account_id)
            REFERENCES bank_accounts(id)
            ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        license_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'inactive',
        issued_by INTEGER,
        issued_at TEXT,
        revoked_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        UNIQUE(user_id, license_type),

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,

        FOREIGN KEY (issued_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    CREATE TABLE IF NOT EXISTS license_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        license_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        reviewed_by INTEGER,
        government_note TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TEXT,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,

        FOREIGN KEY (reviewed_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    CREATE TABLE IF NOT EXISTS police_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        officer_id INTEGER NOT NULL,
        reason TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,

        FOREIGN KEY (officer_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );


    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (actor_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- POLICE RTO / 911
    -- ========================================================

    CREATE TABLE IF NOT EXISTS emergency_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        caller_user_id INTEGER,
        caller_name TEXT NOT NULL,
        caller_email TEXT,
        channel_id TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT,

        FOREIGN KEY (caller_user_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- GROUP CITY PENAL CODES
    -- ========================================================

    CREATE TABLE IF NOT EXISTS penal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        penalty TEXT,
        category TEXT,
        fine REAL DEFAULT 0,
        points INTEGER DEFAULT 0,
        jail_time TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- BOLOS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS bolos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        vehicle TEXT,
        plate TEXT,
        description TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cleared_at TEXT,

        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- ARREST WARRANTS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS arrest_warrants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        subject_name TEXT NOT NULL,
        subject_identifier TEXT,
        reason TEXT NOT NULL,
        charges TEXT,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        issued_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        served_at TEXT,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,

        FOREIGN KEY (issued_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- AIRPORT CHARTS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS charts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        airport TEXT NOT NULL,
        chart_name TEXT NOT NULL,
        chart_type TEXT,
        url TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );


    -- ========================================================
    -- FLIGHT PLANS
    -- ========================================================

    CREATE TABLE IF NOT EXISTS flight_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        callsign TEXT NOT NULL,
        departure TEXT NOT NULL,
        arrival TEXT NOT NULL,
        aircraft TEXT,
        route TEXT NOT NULL,
        altitude TEXT,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );

`);


// ============================================================
// DATABASE MIGRATIONS
// ============================================================

function ensureColumn(table, column, definition) {

    const columns =
        db.prepare(
            `PRAGMA table_info(${table})`
        ).all();

    if (
        !columns.some(
            item => item.name === column
        )
    ) {

        db.exec(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );

    }

}


ensureColumn(
    "users",
    "police_callsign",
    "TEXT"
);

ensureColumn(
    "users",
    "pilot_callsign",
    "TEXT"
);

ensureColumn(
    "penal_codes",
    "category",
    "TEXT"
);

ensureColumn(
    "penal_codes",
    "fine",
    "REAL DEFAULT 0"
);

ensureColumn(
    "penal_codes",
    "points",
    "INTEGER DEFAULT 0"
);

ensureColumn(
    "penal_codes",
    "jail_time",
    "TEXT"
);

ensureColumn(
    "bolos",
    "reason",
    "TEXT"
);

ensureColumn(
    "arrest_warrants",
    "details",
    "TEXT"
);


// ============================================================
// SETTINGS
// ============================================================

const LICENSE_TYPES = [
    "Driver's License",
    "Pilot License",
    "Boating License",
    "Business License"
];

const USER_ROLES = [
    "citizen",
    "police",
    "pilot",
    "atc",
    "government"
];

const AIRPORTS = [
    "Airport 1",
    "Airport 2"
];


// ============================================================
// HELPERS
// ============================================================

function cleanText(
    value,
    maxLength = 255
) {

    return String(
        value ?? ""
    )
        .trim()
        .slice(
            0,
            maxLength
        );

}


function normalizeEmail(value) {

    return cleanText(
        value,
        255
    ).toLowerCase();

}


function generateCitizenId() {

    let id;

    do {

        id =
            "GOV-" +
            Math.floor(
                100000 +
                Math.random() * 900000
            );

    } while (

        db.prepare(`
            SELECT id
            FROM users
            WHERE citizen_id = ?
        `).get(id)

    );

    return id;

}


function generateAccountNumber() {

    let number;

    do {

        number =
            "GB-" +
            Math.floor(
                100000000 +
                Math.random() * 900000000
            );

    } while (

        db.prepare(`
            SELECT id
            FROM bank_accounts
            WHERE account_number = ?
        `).get(number)

    );

    return number;

}


function generateUniqueCallsign(
    prefix,
    digits
) {

    let callsign;

    do {

        let value = "";

        for (
            let i = 0;
            i < digits;
            i++
        ) {

            value +=
                Math.floor(
                    Math.random() * 10
                );

        }

        callsign =
            `${prefix}-${value}`;

    } while (

        db.prepare(`
            SELECT id
            FROM users
            WHERE
                police_callsign = ?
                OR pilot_callsign = ?
        `).get(
            callsign,
            callsign
        )

    );

    return callsign;

}


function validPilotCallsign(value) {

    return /^GC-\d{4}$/.test(
        String(
            value || ""
        ).trim()
    );

}


function validPoliceCallsign(value) {

    return /^1A-\d{3}$/.test(
        String(
            value || ""
        ).trim()
    );

}


function getUserById(id) {

    return db.prepare(`

        SELECT
            id,
            email,
            name,
            citizen_id,
            role,
            police_points,
            police_callsign,
            pilot_callsign,
            created_at

        FROM users

        WHERE id = ?

    `).get(id);

}


function findUser(identifier) {

    const input =
        cleanText(
            identifier,
            255
        );

    if (!input) {
        return null;
    }


    const numericId =
        Number(input);

    if (
        Number.isInteger(numericId) &&
        numericId > 0
    ) {

        const user =
            getUserById(
                numericId
            );

        if (user) {
            return user;
        }

    }


    const email =
        normalizeEmail(
            input
        );


    return db.prepare(`

        SELECT
            id,
            email,
            name,
            citizen_id,
            role,
            police_points,
            police_callsign,
            pilot_callsign,
            created_at

        FROM users

        WHERE
            citizen_id = ?
            OR email = ?
            OR LOWER(name) = LOWER(?)

        LIMIT 1

    `).get(
        input,
        email,
        input
    ) || null;

}


function createAudit(
    actorId,
    action,
    description
) {

    db.prepare(`

        INSERT INTO audit_logs
        (
            actor_id,
            action,
            description
        )

        VALUES (?, ?, ?)

    `).run(
        actorId || null,
        action,
        description
    );

}


function createToken(user) {

    return jwt.sign(
        {
            id: user.id
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );

}


// ============================================================
// AUTH MIDDLEWARE
// ============================================================

function requireAuth(
    req,
    res,
    next
) {

    const header =
        req.headers.authorization;

    if (!header) {

        return res.status(401).json({
            message:
                "Authentication required."
        });

    }


    const parts =
        header.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer"
    ) {

        return res.status(401).json({
            message:
                "Invalid authentication token."
        });

    }


    try {

        const decoded =
            jwt.verify(
                parts[1],
                JWT_SECRET
            );

        const user =
            getUserById(
                decoded.id
            );

        if (!user) {

            return res.status(401).json({
                message:
                    "User no longer exists."
            });

        }

        req.user =
            user;

        next();

    } catch {

        return res.status(401).json({
            message:
                "Invalid or expired authentication token."
        });

    }

}


function requirePolice(
    req,
    res,
    next
) {

    if (
        ![
            "police",
            "government"
        ].includes(
            req.user.role
        )
    ) {

        return res.status(403).json({
            message:
                "Police access required."
        });

    }

    next();

}


function requirePilot(
    req,
    res,
    next
) {

    if (
        ![
            "pilot",
            "atc",
            "government"
        ].includes(
            req.user.role
        )
    ) {

        return res.status(403).json({
            message:
                "Pilot access required."
        });

    }

    next();

}


function requireATC(
    req,
    res,
    next
) {

    if (
        ![
            "atc",
            "government"
        ].includes(
            req.user.role
        )
    ) {

        return res.status(403).json({
            message:
                "ATC access required."
        });

    }

    next();

}


function requireGovernment(
    req,
    res,
    next
) {

    if (
        req.user.role !==
        "government"
    ) {

        return res.status(403).json({
            message:
                "Government access required."
        });

    }

    next();

}


// ============================================================
// CALLSIGNS
// ============================================================

function getOrCreatePoliceCallsign(
    userId
) {

    const user =
        getUserById(
            userId
        );

    if (!user) {
        return null;
    }

    if (
        validPoliceCallsign(
            user.police_callsign
        )
    ) {

        return user.police_callsign;

    }


    const callsign =
        generateUniqueCallsign(
            "1A",
            3
        );

    db.prepare(`
        UPDATE users
        SET police_callsign = ?
        WHERE id = ?
    `).run(
        callsign,
        userId
    );

    return callsign;

}


function getOrCreatePilotCallsign(
    userId
) {

    const user =
        getUserById(
            userId
        );

    if (!user) {
        return null;
    }

    if (
        validPilotCallsign(
            user.pilot_callsign
        )
    ) {

        return user.pilot_callsign;

    }


    const activePlan =
        db.prepare(`
            SELECT callsign
            FROM flight_plans
            WHERE user_id = ?
            AND status = 'active'
            ORDER BY id DESC
            LIMIT 1
        `).get(userId);


    if (
        activePlan &&
        validPilotCallsign(
            activePlan.callsign
        )
    ) {

        db.prepare(`
            UPDATE users
            SET pilot_callsign = ?
            WHERE id = ?
        `).run(
            activePlan.callsign,
            userId
        );

        return activePlan.callsign;

    }


    const callsign =
        generateUniqueCallsign(
            "GC",
            4
        );

    db.prepare(`
        UPDATE users
        SET pilot_callsign = ?
        WHERE id = ?
    `).run(
        callsign,
        userId
    );

    return callsign;

}


// ============================================================
// INITIAL GOVERNMENT ACCOUNT
// ============================================================

function createInitialGovernment() {

    if (
        !ADMIN_PASSWORD ||
        ADMIN_PASSWORD ===
            "CHANGE_ME"
    ) {

        console.warn(
            "WARNING: ADMIN_PASSWORD has not been configured."
        );

        return;

    }


    const email =
        normalizeEmail(
            ADMIN_EMAIL
        );


    const existing =
        db.prepare(`
            SELECT id
            FROM users
            WHERE email = ?
        `).get(email);


    if (existing) {

        db.prepare(`
            UPDATE users
            SET role = 'government'
            WHERE id = ?
        `).run(
            existing.id
        );

        return;

    }


    const passwordHash =
        bcrypt.hashSync(
            ADMIN_PASSWORD,
            12
        );

    const citizenId =
        generateCitizenId();


    db.transaction(() => {

        const result =
            db.prepare(`

                INSERT INTO users
                (
                    email,
                    password_hash,
                    name,
                    citizen_id,
                    role
                )

                VALUES
                (?, ?, ?, ?, 'government')

            `).run(
                email,
                passwordHash,
                ADMIN_NAME,
                citizenId
            );


        db.prepare(`

            INSERT INTO bank_accounts
            (
                user_id,
                account_number,
                balance
            )

            VALUES (?, ?, 0)

        `).run(
            result.lastInsertRowid,
            generateAccountNumber()
        );


        createAudit(
            result.lastInsertRowid,
            "INITIAL_GOVERNMENT",
            "Initial government administrator account created."
        );

    })();


    console.log(
        `Initial government account created: ${ADMIN_EMAIL}`
    );

}


createInitialGovernment();


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {

        res.json({
            online: true,
            service:
                "Group City Government Portal"
        });

    }
);


// ============================================================
// REGISTER
// ============================================================

app.post(
    "/api/auth/register",
    (req, res) => {

        const name =
            cleanText(
                req.body.name,
                80
            );

        const email =
            normalizeEmail(
                req.body.email
            );

        const password =
            String(
                req.body.password ||
                ""
            );


        if (
            !name ||
            !email ||
            !password
        ) {

            return res.status(400).json({
                message:
                    "Name, email and password are required."
            });

        }


        if (
            password.length < 8
        ) {

            return res.status(400).json({
                message:
                    "Password must be at least 8 characters."
            });

        }


        const existing =
            db.prepare(`
                SELECT id
                FROM users
                WHERE email = ?
            `).get(email);


        if (existing) {

            return res.status(409).json({
                message:
                    "An account with that email already exists."
            });

        }


        try {

            const passwordHash =
                bcrypt.hashSync(
                    password,
                    12
                );

            const citizenId =
                generateCitizenId();


            const userId =
                db.transaction(() => {

                    const result =
                        db.prepare(`

                            INSERT INTO users
                            (
                                email,
                                password_hash,
                                name,
                                citizen_id,
                                role
                            )

                            VALUES
                            (?, ?, ?, ?, 'citizen')

                        `).run(
                            email,
                            passwordHash,
                            name,
                            citizenId
                        );


                    db.prepare(`

                        INSERT INTO bank_accounts
                        (
                            user_id,
                            account_number,
                            balance
                        )

                        VALUES (?, ?, 0)

                    `).run(
                        result.lastInsertRowid,
                        generateAccountNumber()
                    );


                    return result.lastInsertRowid;

                })();


            const user =
                getUserById(
                    userId
                );


            res.status(201).json({
                token:
                    createToken(user),
                user
            });

        } catch (error) {

            console.error(
                "REGISTER ERROR:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to create account."
            });

        }

    }
);


// ============================================================
// LOGIN
// ============================================================

app.post(
    "/api/auth/login",
    (req, res) => {

        const email =
            normalizeEmail(
                req.body.email
            );

        const password =
            String(
                req.body.password ||
                ""
            );


        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE email = ?
            `).get(email);


        if (
            !user ||
            !bcrypt.compareSync(
                password,
                user.password_hash
            )
        ) {

            return res.status(401).json({
                message:
                    "Invalid email or password."
            });

        }


        const safeUser =
            getUserById(
                user.id
            );


        res.json({
            token:
                createToken(
                    safeUser
                ),
            user:
                safeUser
        });

    }
);


// ============================================================
// CURRENT USER
// ============================================================

app.get(
    "/api/auth/me",
    requireAuth,
    (req, res) => {

        res.json({
            user:
                getUserById(
                    req.user.id
                )
        });

    }
);


app.get(
    "/api/users/me",
    requireAuth,
    (req, res) => {

        const user =
            getUserById(
                req.user.id
            );


        const account =
            db.prepare(`

                SELECT
                    id,
                    account_number,
                    balance

                FROM bank_accounts

                WHERE user_id = ?

            `).get(
                req.user.id
            );


        res.json({
            user: {
                ...user,
                account
            }
        });

    }
);


// ============================================================
// BANK
// ============================================================

app.get(
    "/api/bank",
    requireAuth,
    (req, res) => {

        const account =
            db.prepare(`

                SELECT
                    id,
                    account_number,
                    balance

                FROM bank_accounts

                WHERE user_id = ?

            `).get(
                req.user.id
            );


        if (!account) {

            return res.status(404).json({
                message:
                    "Bank account not found."
            });

        }


        const transactions =
            db.prepare(`

                SELECT
                    id,
                    amount,
                    type,
                    description,
                    created_at

                FROM transactions

                WHERE account_id = ?

                ORDER BY id DESC

                LIMIT 100

            `).all(
                account.id
            );


        res.json({
            account,
            transactions
        });

    }
);


// ============================================================
// BANK TRANSFER
// ============================================================

app.post(
    "/api/bank/transfer",
    requireAuth,
    (req, res) => {

        const recipient =
            cleanText(
                req.body.recipient,
                255
            );

        const amount =
            Number(
                req.body.amount
            );

        const description =
            cleanText(
                req.body.description ||
                "Bank transfer",
                255
            );


        if (!recipient) {

            return res.status(400).json({
                message:
                    "Recipient is required."
            });

        }


        if (
            !Number.isFinite(amount) ||
            amount <= 0
        ) {

            return res.status(400).json({
                message:
                    "Amount must be greater than 0."
            });

        }


        const transferAmount =
            Math.round(
                amount * 100
            ) / 100;


        const senderAccount =
            db.prepare(`

                SELECT
                    id,
                    user_id,
                    account_number,
                    balance

                FROM bank_accounts

                WHERE user_id = ?

            `).get(
                req.user.id
            );


        if (!senderAccount) {

            return res.status(404).json({
                message:
                    "Your bank account was not found."
            });

        }


        const recipientInput =
            cleanText(
                recipient,
                255
            );

        const recipientEmail =
            normalizeEmail(
                recipientInput
            );


        const target =
            db.prepare(`

                SELECT
                    users.id,
                    users.name,
                    users.email,
                    users.citizen_id,

                    bank_accounts.id
                        AS account_id,

                    bank_accounts.account_number,
                    bank_accounts.balance

                FROM users

                INNER JOIN bank_accounts
                    ON bank_accounts.user_id =
                        users.id

                WHERE
                    users.email = ?
                    OR users.citizen_id = ?
                    OR LOWER(users.name) =
                        LOWER(?)
                    OR bank_accounts.account_number = ?

                LIMIT 1

            `).get(
                recipientEmail,
                recipientInput,
                recipientInput,
                recipientInput
            );


        if (!target) {

            return res.status(404).json({
                message:
                    "Recipient was not found."
            });

        }


        if (
            target.id ===
            req.user.id
        ) {

            return res.status(400).json({
                message:
                    "You cannot send money to yourself."
            });

        }


        if (
            senderAccount.balance <
            transferAmount
        ) {

            return res.status(400).json({
                message:
                    "Insufficient funds."
            });

        }


        try {

            db.transaction(() => {

                db.prepare(`
                    UPDATE bank_accounts
                    SET balance =
                        balance - ?
                    WHERE id = ?
                `).run(
                    transferAmount,
                    senderAccount.id
                );


                db.prepare(`
                    UPDATE bank_accounts
                    SET balance =
                        balance + ?
                    WHERE id = ?
                `).run(
                    transferAmount,
                    target.account_id
                );


                db.prepare(`

                    INSERT INTO transactions
                    (
                        account_id,
                        amount,
                        type,
                        description
                    )

                    VALUES
                    (?, ?, 'transfer', ?)

                `).run(
                    senderAccount.id,
                    -transferAmount,
                    `Sent $${transferAmount.toFixed(2)} to ${target.name}. ${description}`
                );


                db.prepare(`

                    INSERT INTO transactions
                    (
                        account_id,
                        amount,
                        type,
                        description
                    )

                    VALUES
                    (?, ?, 'transfer', ?)

                `).run(
                    target.account_id,
                    transferAmount,
                    `Received $${transferAmount.toFixed(2)} from ${req.user.name}. ${description}`
                );


                createAudit(
                    req.user.id,
                    "BANK_TRANSFER",
                    `${req.user.name} sent $${transferAmount.toFixed(2)} to ${target.name}.`
                );

            })();


            res.json({
                message:
                    "Money sent successfully."
            });

        } catch (error) {

            console.error(
                "BANK TRANSFER ERROR:",
                error
            );

            res.status(500).json({
                message:
                    "Unable to complete bank transfer."
            });

        }

    }
);


// ============================================================
// LICENSES
// ============================================================

app.get(
    "/api/licenses",
    requireAuth,
    (req, res) => {

        const licenses =
            LICENSE_TYPES.map(
                type => {

                    const license =
                        db.prepare(`

                            SELECT
                                id,
                                license_type,
                                status,
                                issued_at,
                                revoked_at

                            FROM licenses

                            WHERE user_id = ?
                            AND license_type = ?

                        `).get(
                            req.user.id,
                            type
                        );


                    return license || {
                        id: null,
                        license_type:
                            type,
                        status:
                            "inactive",
                        issued_at:
                            null,
                        revoked_at:
                            null
                    };

                }
            );


        res.json({
            licenses
        });

    }
);


// ============================================================
// REQUEST LICENSE
// ============================================================

app.post(
    "/api/licenses/request",
    requireAuth,
    (req, res) => {

        const licenseType =
            cleanText(
                req.body.license_type,
                100
            );

        const passcode =
            String(
                req.body.government_passcode ||
                ""
            );


        if (
            !LICENSE_TYPES.includes(
                licenseType
            )
        ) {

            return res.status(400).json({
                message:
                    "Invalid license type."
            });

        }


        if (
            !GOVERNMENT_PASSCODE ||
            passcode !==
                GOVERNMENT_PASSCODE
        ) {

            return res.status(403).json({
                message:
                    "Incorrect government passcode."
            });

        }


        const existingLicense =
            db.prepare(`

                SELECT id
                FROM licenses

                WHERE user_id = ?
                AND license_type = ?
                AND status = 'active'

            `).get(
                req.user.id,
                licenseType
            );


        if (existingLicense) {

            return res.status(400).json({
                message:
                    "You already have this license."
            });

        }


        const pending =
            db.prepare(`

                SELECT id
                FROM license_requests

                WHERE user_id = ?
                AND license_type = ?
                AND status = 'pending'

            `).get(
                req.user.id,
                licenseType
            );


        if (pending) {

            return res.status(400).json({
                message:
                    "You already have a pending request."
            });

        }


        db.prepare(`

            INSERT INTO license_requests
            (
                user_id,
                license_type
            )

            VALUES (?, ?)

        `).run(
            req.user.id,
            licenseType
        );


        createAudit(
            req.user.id,
            "LICENSE_REQUEST",
            `${req.user.name} requested ${licenseType}.`
        );


        res.json({
            message:
                "License request submitted."
        });

    }
);


// ============================================================
// POLICE CITIZEN SEARCH
// ============================================================

app.get(
    "/api/police/citizen/:identifier",
    requireAuth,
    requirePolice,
    (req, res) => {

        const citizen =
            findUser(
                req.params.identifier
            );


        if (!citizen) {

            return res.status(404).json({
                message:
                    "Citizen not found."
            });

        }


        const records =
            db.prepare(`

                SELECT
                    police_records.id,
                    police_records.reason,
                    police_records.points,
                    police_records.created_at,

                    officer.name
                        AS officer_name

                FROM police_records

                LEFT JOIN users officer
                    ON officer.id =
                        police_records.officer_id

                WHERE
                    police_records.user_id = ?

                ORDER BY
                    police_records.id DESC

            `).all(
                citizen.id
            );


        res.json({
            citizen,
            records
        });

    }
);


// ============================================================
// ADD POLICE POINTS
// ============================================================

app.post(
    "/api/police/points",
    requireAuth,
    requirePolice,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.citizen_id ||
                req.body.user_id,
                255
            );

        const points =
            Number(
                req.body.points
            );

        const reason =
            cleanText(
                req.body.reason,
                500
            );


        if (!identifier) {

            return res.status(400).json({
                message:
                    "Name, email, Government ID or database ID is required."
            });

        }


        if (
            !Number.isFinite(points) ||
            points <= 0 ||
            points > 1000
        ) {

            return res.status(400).json({
                message:
                    "Points must be between 1 and 1000."
            });

        }


        if (!reason) {

            return res.status(400).json({
                message:
                    "A reason is required."
            });

        }


        const citizen =
            findUser(
                identifier
            );


        if (!citizen) {

            return res.status(404).json({
                message:
                    "Citizen not found."
            });

        }


        db.transaction(() => {

            db.prepare(`

                INSERT INTO police_records
                (
                    user_id,
                    officer_id,
                    reason,
                    points
                )

                VALUES (?, ?, ?, ?)

            `).run(
                citizen.id,
                req.user.id,
                reason,
                points
            );


            db.prepare(`
                UPDATE users
                SET police_points =
                    police_points + ?
                WHERE id = ?
            `).run(
                points,
                citizen.id
            );


            createAudit(
                req.user.id,
                "POLICE_POINTS",
                `${req.user.name} added ${points} police points to ${citizen.name}. Reason: ${reason}`
            );

        })();


        res.json({
            message:
                "Police points added."
        });

    }
);


// ============================================================
// ADD POLICE RECORD
// ============================================================

app.post(
    "/api/police/records",
    requireAuth,
    requirePolice,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.citizen_id ||
                req.body.user_id,
                255
            );

        const reason =
            cleanText(
                req.body.reason,
                500
            );

        const points =
            Number(
                req.body.points || 0
            );


        if (!identifier) {

            return res.status(400).json({
                message:
                    "Name, email, Government ID or database ID is required."
            });

        }


        if (!reason) {

            return res.status(400).json({
                message:
                    "A reason is required."
            });

        }


        if (
            !Number.isFinite(points) ||
            points < 0 ||
            points > 1000
        ) {

            return res.status(400).json({
                message:
                    "Points must be between 0 and 1000."
            });

        }


        const citizen =
            findUser(
                identifier
            );


        if (!citizen) {

            return res.status(404).json({
                message:
                    "Citizen not found."
            });

        }


        db.transaction(() => {

            db.prepare(`

                INSERT INTO police_records
                (
                    user_id,
                    officer_id,
                    reason,
                    points
                )

                VALUES (?, ?, ?, ?)

            `).run(
                citizen.id,
                req.user.id,
                reason,
                points
            );


            if (
                points > 0
            ) {

                db.prepare(`
                    UPDATE users
                    SET police_points =
                        police_points + ?
                    WHERE id = ?
                `).run(
                    points,
                    citizen.id
                );

            }


            createAudit(
                req.user.id,
                "POLICE_RECORD",
                `${req.user.name} created a police record for ${citizen.name}: ${reason}`
            );

        })();


        res.json({
            message:
                "Police record created."
        });

    }
);


// ============================================================
// POLICE CALLSIGN
// ============================================================

app.get(
    "/api/police/callsign",
    requireAuth,
    requirePolice,
    (req, res) => {

        const callsign =
            getOrCreatePoliceCallsign(
                req.user.id
            );

        res.json({
            callsign
        });

    }
);


// ============================================================
// POLICE RTO / ACTIVE 911 CALLS
// ============================================================

app.get(
    "/api/police/911",
    requireAuth,
    requirePolice,
    (req, res) => {

        const calls =
            db.prepare(`

                SELECT
                    emergency_calls.*,

                    users.citizen_id
                        AS caller_citizen_id

                FROM emergency_calls

                LEFT JOIN users
                    ON users.id =
                        emergency_calls.caller_user_id

                ORDER BY
                    emergency_calls.id DESC

                LIMIT 100

            `).all();


        res.json({
            calls
        });

    }
);


// ============================================================
// DISCORD BOT -> 911 CALL
// ============================================================

app.post(
    "/api/dispatch/911",
    (req, res) => {

        if (
            !DISPATCH_TOKEN ||
            req.headers[
                "x-dispatch-token"
            ] !==
                DISPATCH_TOKEN
        ) {

            return res.status(401).json({
                message:
                    "Dispatch authentication failed."
            });

        }


        const userIdentifier =
            cleanText(
                req.body.user_identifier,
                255
            );

        const callerName =
            cleanText(
                req.body.caller_name,
                120
            );

        const callerEmail =
            normalizeEmail(
                req.body.caller_email
            );

        const channelId =
            cleanText(
                req.body.channel_id,
                100
            );


        const caller =
            userIdentifier
                ? findUser(
                    userIdentifier
                )
                : null;


        if (
            !callerName &&
            !caller
        ) {

            return res.status(400).json({
                message:
                    "caller_name or user_identifier is required."
            });

        }


        const finalName =
            caller?.name ||
            callerName;

        const finalEmail =
            caller?.email ||
            callerEmail ||
            null;


        const result =
            db.prepare(`

                INSERT INTO emergency_calls
                (
                    caller_user_id,
                    caller_name,
                    caller_email,
                    channel_id
                )

                VALUES (?, ?, ?, ?)

            `).run(
                caller?.id ||
                    null,
                finalName,
                finalEmail,
                channelId ||
                    null
            );


        res.status(201).json({
            message:
                "911 call created.",
            call_id:
                result.lastInsertRowid
        });

    }
);


// ============================================================
// CLOSE 911 CALL
// ============================================================

app.post(
    "/api/police/911/:id/close",
    requireAuth,
    requirePolice,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (
            !Number.isInteger(id)
        ) {

            return res.status(400).json({
                message:
                    "Invalid call ID."
            });

        }


        db.prepare(`

            UPDATE emergency_calls

            SET
                status = 'closed',
                closed_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

        `).run(id);


        createAudit(
            req.user.id,
            "911_CALL_CLOSED",
            `${req.user.name} closed 911 call #${id}.`
        );


        res.json({
            message:
                "911 call closed."
        });

    }
);


// ============================================================
// PUBLIC PENAL CODES
// ============================================================

app.get(
    "/api/penal-codes",
    (req, res) => {

        const search =
            cleanText(
                req.query.search,
                100
            );


        let codes;

        if (search) {

            const like =
                `%${search}%`;

            codes =
                db.prepare(`

                    SELECT *

                    FROM penal_codes

                    WHERE
                        code LIKE ?
                            COLLATE NOCASE

                        OR title LIKE ?
                            COLLATE NOCASE

                        OR description LIKE ?
                            COLLATE NOCASE

                        OR category LIKE ?
                            COLLATE NOCASE

                    ORDER BY
                        code COLLATE NOCASE

                    LIMIT 200

                `).all(
                    like,
                    like,
                    like,
                    like
                );

        } else {

            codes =
                db.prepare(`

                    SELECT *

                    FROM penal_codes

                    ORDER BY
                        code COLLATE NOCASE

                    LIMIT 200

                `).all();

        }


        res.json({
            codes,
            penal_codes:
                codes
        });

    }
);


// ============================================================
// POLICE BOLOS
// ============================================================

app.get(
    "/api/police/bolos",
    requireAuth,
    requirePolice,
    (req, res) => {

        const search =
            cleanText(
                req.query.search,
                150
            );


        let bolos;

        if (search) {

            const like =
                `%${search}%`;

            bolos =
                db.prepare(`

                    SELECT *

                    FROM bolos

                    WHERE
                        subject LIKE ?
                            COLLATE NOCASE

                        OR vehicle LIKE ?
                            COLLATE NOCASE

                        OR plate LIKE ?
                            COLLATE NOCASE

                        OR description LIKE ?
                            COLLATE NOCASE

                        OR reason LIKE ?
                            COLLATE NOCASE

                    ORDER BY id DESC

                    LIMIT 200

                `).all(
                    like,
                    like,
                    like,
                    like,
                    like
                );

        } else {

            bolos =
                db.prepare(`

                    SELECT *

                    FROM bolos

                    ORDER BY id DESC

                    LIMIT 200

                `).all();

        }


        res.json({
            bolos
        });

    }
);


app.post(
    "/api/police/bolos/:id/clear",
    requireAuth,
    requirePolice,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid BOLO ID."
            });

        }


        db.prepare(`

            UPDATE bolos

            SET
                status = 'cleared',
                cleared_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

        `).run(id);


        createAudit(
            req.user.id,
            "BOLO_CLEAR",
            `${req.user.name} cleared BOLO #${id}.`
        );


        res.json({
            message:
                "BOLO cleared."
        });

    }
);


// ============================================================
// POLICE WARRANTS
// ============================================================

app.get(
    "/api/police/warrants",
    requireAuth,
    requirePolice,
    (req, res) => {

        const search =
            cleanText(
                req.query.search,
                150
            );


        let warrants;

        if (search) {

            const like =
                `%${search}%`;

            warrants =
                db.prepare(`

                    SELECT *

                    FROM arrest_warrants

                    WHERE
                        subject_name LIKE ?
                            COLLATE NOCASE

                        OR subject_identifier LIKE ?
                            COLLATE NOCASE

                        OR reason LIKE ?
                            COLLATE NOCASE

                        OR charges LIKE ?
                            COLLATE NOCASE

                        OR details LIKE ?
                            COLLATE NOCASE

                    ORDER BY id DESC

                    LIMIT 200

                `).all(
                    like,
                    like,
                    like,
                    like,
                    like
                );

        } else {

            warrants =
                db.prepare(`

                    SELECT *

                    FROM arrest_warrants

                    ORDER BY id DESC

                    LIMIT 200

                `).all();

        }


        res.json({
            warrants
        });

    }
);


app.post(
    "/api/police/warrants/:id/serve",
    requireAuth,
    requirePolice,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid warrant ID."
            });

        }


        db.prepare(`

            UPDATE arrest_warrants

            SET
                status = 'served',
                served_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

        `).run(id);


        createAudit(
            req.user.id,
            "WARRANT_SERVED",
            `${req.user.name} marked warrant #${id} as served.`
        );


        res.json({
            message:
                "Warrant marked as served."
        });

    }
);


// ============================================================
// PILOT CHARTS
// ============================================================

app.get(
    "/api/pilot/charts",
    requireAuth,
    requirePilot,
    (req, res) => {

        const airport =
            cleanText(
                req.query.airport,
                100
            );


        let charts;

        if (airport) {

            charts =
                db.prepare(`

                    SELECT *

                    FROM charts

                    WHERE airport = ?

                    ORDER BY id DESC

                `).all(
                    airport
                );

        } else {

            charts =
                db.prepare(`

                    SELECT *

                    FROM charts

                    ORDER BY
                        airport COLLATE NOCASE,
                        id DESC

                `).all();

        }


        res.json({
            charts,
            airports:
                AIRPORTS
        });

    }
);


// ============================================================
// PILOT CALLSIGN
// ============================================================

app.get(
    "/api/pilot/callsign",
    requireAuth,
    requirePilot,
    (req, res) => {

        const callsign =
            getOrCreatePilotCallsign(
                req.user.id
            );

        res.json({
            callsign
        });

    }
);


// ============================================================
// ACTIVE FLIGHT PLAN
// ============================================================

app.get(
    "/api/pilot/flight-plan",
    requireAuth,
    requirePilot,
    (req, res) => {

        const plan =
            db.prepare(`

                SELECT *

                FROM flight_plans

                WHERE
                    user_id = ?
                    AND status = 'active'

                ORDER BY id DESC

                LIMIT 1

            `).get(
                req.user.id
            );


        res.json({
            flight_plan:
                plan || null
        });

    }
);


// ============================================================
// FILE FLIGHT PLAN
// ============================================================

app.post(
    "/api/pilot/flight-plan",
    requireAuth,
    requirePilot,
    (req, res) => {

        const departure =
            cleanText(
                req.body.departure,
                100
            );

        const arrival =
            cleanText(
                req.body.arrival,
                100
            );

        const aircraft =
            cleanText(
                req.body.aircraft,
                100
            );

        const route =
            cleanText(
                req.body.route,
                1000
            );

        const altitude =
            cleanText(
                req.body.altitude,
                100
            );

        const remarks =
            cleanText(
                req.body.remarks,
                1000
            );

        let requestedCallsign =
            cleanText(
                req.body.callsign,
                20
            );


        if (
            !departure ||
            !arrival ||
            !route
        ) {

            return res.status(400).json({
                message:
                    "Departure, arrival and route are required."
            });

        }


        const existing =
            db.prepare(`

                SELECT *

                FROM flight_plans

                WHERE
                    user_id = ?
                    AND status = 'active'

                ORDER BY id DESC

                LIMIT 1

            `).get(
                req.user.id
            );


        if (existing) {

            return res.status(400).json({
                message:
                    `You already have an active flight plan using ${existing.callsign}.`,
                flight_plan:
                    existing
            });

        }


        let callsign;

        if (requestedCallsign) {

            requestedCallsign =
                requestedCallsign.toUpperCase();

            if (
                !validPilotCallsign(
                    requestedCallsign
                )
            ) {

                return res.status(400).json({
                    message:
                        "Pilot callsign must use the format GC-1234."
                });

            }


            const taken =
                db.prepare(`

                    SELECT id

                    FROM users

                    WHERE
                        pilot_callsign = ?
                        AND id != ?

                    LIMIT 1

                `).get(
                    requestedCallsign,
                    req.user.id
                );


            if (taken) {

                return res.status(409).json({
                    message:
                        "That pilot callsign is already in use."
                });

            }


            callsign =
                requestedCallsign;


            db.prepare(`

                UPDATE users

                SET pilot_callsign = ?

                WHERE id = ?

            `).run(
                callsign,
                req.user.id
            );

        } else {

            callsign =
                getOrCreatePilotCallsign(
                    req.user.id
                );

        }


        const result =
            db.prepare(`

                INSERT INTO flight_plans
                (
                    user_id,
                    callsign,
                    departure,
                    arrival,
                    aircraft,
                    route,
                    altitude,
                    remarks
                )

                VALUES
                (?, ?, ?, ?, ?, ?, ?, ?)

            `).run(
                req.user.id,
                callsign,
                departure,
                arrival,
                aircraft || null,
                route,
                altitude || null,
                remarks || null
            );


        createAudit(
            req.user.id,
            "FLIGHT_PLAN_FILED",
            `${req.user.name} filed flight plan ${callsign} from ${departure} to ${arrival}.`
        );


        const plan =
            db.prepare(`
                SELECT *
                FROM flight_plans
                WHERE id = ?
            `).get(
                result.lastInsertRowid
            );


        res.status(201).json({
            message:
                "Flight plan filed.",
            flight_plan:
                plan
        });

    }
);


// ============================================================
// CANCEL FLIGHT PLAN
// ============================================================

app.post(
    "/api/pilot/flight-plan/cancel",
    requireAuth,
    requirePilot,
    (req, res) => {

        const plan =
            db.prepare(`

                SELECT *

                FROM flight_plans

                WHERE
                    user_id = ?
                    AND status = 'active'

                ORDER BY id DESC

                LIMIT 1

            `).get(
                req.user.id
            );


        if (!plan) {

            return res.status(404).json({
                message:
                    "You do not have an active flight plan."
            });

        }


        db.prepare(`

            UPDATE flight_plans

            SET
                status = 'cancelled',
                updated_at =
                    CURRENT_TIMESTAMP

            WHERE id = ?

        `).run(
            plan.id
        );


        createAudit(
            req.user.id,
            "FLIGHT_PLAN_CANCELLED",
            `${req.user.name} cancelled flight plan ${plan.callsign}.`
        );


        res.json({
            message:
                "Flight plan cancelled."
        });

    }
);


// ============================================================
// ATC FLIGHT PLANS
// ============================================================

app.get(
    "/api/atc/flight-plans",
    requireAuth,
    requireATC,
    (req, res) => {

        const plans =
            db.prepare(`

                SELECT
                    flight_plans.*,

                    users.name
                        AS pilot_name,

                    users.citizen_id
                        AS pilot_citizen_id,

                    users.email
                        AS pilot_email

                FROM flight_plans

                INNER JOIN users
                    ON users.id =
                        flight_plans.user_id

                WHERE
                    flight_plans.status =
                        'active'

                ORDER BY
                    flight_plans.id DESC

            `).all();


        res.json({
            flight_plans:
                plans,
            plans
        });

    }
);


// ============================================================
// GOVERNMENT USER SEARCH
// ============================================================

app.get(
    "/api/government/users",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const search =
            cleanText(
                req.query.search,
                255
            );


        let users;


        if (search) {

            const like =
                `%${search}%`;

            users =
                db.prepare(`

                    SELECT
                        id,
                        name,
                        email,
                        citizen_id,
                        role,
                        police_points,
                        police_callsign,
                        pilot_callsign,
                        created_at

                    FROM users

                    WHERE
                        name LIKE ?
                            COLLATE NOCASE

                        OR email LIKE ?
                            COLLATE NOCASE

                        OR citizen_id LIKE ?
                            COLLATE NOCASE

                        OR police_callsign LIKE ?
                            COLLATE NOCASE

                        OR pilot_callsign LIKE ?
                            COLLATE NOCASE

                    ORDER BY
                        name COLLATE NOCASE ASC

                    LIMIT 50

                `).all(
                    like,
                    like,
                    like,
                    like,
                    like
                );

        } else {

            users =
                db.prepare(`

                    SELECT
                        id,
                        name,
                        email,
                        citizen_id,
                        role,
                        police_points,
                        police_callsign,
                        pilot_callsign,
                        created_at

                    FROM users

                    ORDER BY
                        id DESC

                    LIMIT 50

                `).all();

        }


        res.json({
            users
        });

    }
);


// ============================================================
// GOVERNMENT MONEY LEADERBOARD
// ============================================================

app.get(
    "/api/government/money",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const users =
            db.prepare(`

                SELECT
                    users.id,
                    users.name,
                    users.email,
                    users.citizen_id,
                    bank_accounts.account_number,
                    bank_accounts.balance

                FROM users

                INNER JOIN bank_accounts
                    ON bank_accounts.user_id =
                        users.id

                ORDER BY
                    bank_accounts.balance DESC

                LIMIT 100

            `).all();


        res.json({
            users,
            leaderboard:
                users
        });

    }
);


// ============================================================
// GOVERNMENT BANK ACTION
// ============================================================

app.post(
    "/api/government/bank",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.user_id,
                255
            );

        const amount =
            Number(
                req.body.amount
            );

        const description =
            cleanText(
                req.body.description ||
                "Government bank adjustment",
                500
            );


        if (!identifier) {

            return res.status(400).json({
                message:
                    "Name, email, Government ID or database ID is required."
            });

        }


        if (
            !Number.isFinite(amount) ||
            amount === 0
        ) {

            return res.status(400).json({
                message:
                    "Enter a non-zero amount."
            });

        }


        const targetUser =
            findUser(
                identifier
            );


        if (!targetUser) {

            return res.status(404).json({
                message:
                    "User not found."
            });

        }


        const account =
            db.prepare(`

                SELECT *

                FROM bank_accounts

                WHERE user_id = ?

            `).get(
                targetUser.id
            );


        if (!account) {

            return res.status(404).json({
                message:
                    "Bank account not found."
            });

        }


        const newBalance =
            Math.round(
                (
                    account.balance +
                    amount
                ) * 100
            ) / 100;


        if (
            newBalance < 0
        ) {

            return res.status(400).json({
                message:
                    "This adjustment would make the account balance negative."
            });

        }


        db.transaction(() => {

            db.prepare(`

                UPDATE bank_accounts

                SET balance = ?

                WHERE id = ?

            `).run(
                newBalance,
                account.id
            );


            db.prepare(`

                INSERT INTO transactions
                (
                    account_id,
                    amount,
                    type,
                    description
                )

                VALUES
                (?, ?, 'government', ?)

            `).run(
                account.id,
                amount,
                description
            );


            createAudit(
                req.user.id,
                "GOVERNMENT_BANK",
                `${req.user.name} adjusted ${targetUser.name}'s balance by $${amount.toFixed(2)}.`
            );

        })();


        res.json({
            message:
                "Bank account updated.",
            balance:
                newBalance
        });

    }
);


// ============================================================
// GOVERNMENT LICENSE ACTION
// ============================================================

app.post(
    "/api/government/license",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.user_id,
                255
            );

        const licenseType =
            cleanText(
                req.body.license_type,
                100
            );

        const action =
            cleanText(
                req.body.action ||
                req.body.status,
                30
            ).toLowerCase();


        if (!identifier) {

            return res.status(400).json({
                message:
                    "Name, email, Government ID or database ID is required."
            });

        }


        if (
            !LICENSE_TYPES.includes(
                licenseType
            )
        ) {

            return res.status(400).json({
                message:
                    "Invalid license type."
            });

        }


        if (
            ![
                "grant",
                "revoke",
                "active",
                "revoked"
            ].includes(
                action
            )
        ) {

            return res.status(400).json({
                message:
                    "Invalid license action."
            });

        }


        const targetUser =
            findUser(
                identifier
            );


        if (!targetUser) {

            return res.status(404).json({
                message:
                    "User not found."
            });

        }


        const granting =
            action === "grant" ||
            action === "active";


        const existing =
            db.prepare(`

                SELECT *

                FROM licenses

                WHERE
                    user_id = ?
                    AND license_type = ?

            `).get(
                targetUser.id,
                licenseType
            );


        if (existing) {

            db.prepare(`

                UPDATE licenses

                SET
                    status = ?,
                    issued_by = ?,
                    issued_at =
                        CASE
                            WHEN ? = 'active'
                            THEN CURRENT_TIMESTAMP
                            ELSE issued_at
                        END,
                    revoked_at =
                        CASE
                            WHEN ? = 'revoked'
                            THEN CURRENT_TIMESTAMP
                            ELSE NULL
                        END

                WHERE id = ?

            `).run(
                granting
                    ? "active"
                    : "revoked",
                req.user.id,
                granting
                    ? "active"
                    : "revoked",
                granting
                    ? "active"
                    : "revoked",
                existing.id
            );

        } else {

            db.prepare(`

                INSERT INTO licenses
                (
                    user_id,
                    license_type,
                    status,
                    issued_by,
                    issued_at,
                    revoked_at
                )

                VALUES
                (?, ?, ?, ?, ?, ?)

            `).run(
                targetUser.id,
                licenseType,
                granting
                    ? "active"
                    : "revoked",
                req.user.id,
                granting
                    ? new Date().toISOString()
                    : null,
                granting
                    ? null
                    : new Date().toISOString()
            );

        }


        createAudit(
            req.user.id,
            "GOVERNMENT_LICENSE",
            `${req.user.name} ${granting ? "granted" : "revoked"} ${licenseType} for ${targetUser.name}.`
        );


        res.json({
            message:
                granting
                    ? "License granted."
                    : "License revoked."
        });

    }
);


// ============================================================
// GOVERNMENT ROLE ACTION
// ============================================================

app.post(
    "/api/government/role",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.user_id,
                255
            );

        const role =
            cleanText(
                req.body.role,
                50
            ).toLowerCase();


        if (!identifier) {

            return res.status(400).json({
                message:
                    "Name, email, Government ID or database ID is required."
            });

        }


        if (
            !USER_ROLES.includes(
                role
            )
        ) {

            return res.status(400).json({
                message:
                    "Invalid role."
            });

        }


        const targetUser =
            findUser(
                identifier
            );


        if (!targetUser) {

            return res.status(404).json({
                message:
                    "User not found."
            });

        }


        db.prepare(`
            UPDATE users
            SET role = ?
            WHERE id = ?
        `).run(
            role,
            targetUser.id
        );


        let callsign =
            null;


        if (
            role ===
            "police"
        ) {

            callsign =
                getOrCreatePoliceCallsign(
                    targetUser.id
                );

        }


        if (
            role ===
            "pilot"
        ) {

            callsign =
                getOrCreatePilotCallsign(
                    targetUser.id
                );

        }


        createAudit(
            req.user.id,
            "ROLE_CHANGE",
            `${req.user.name} changed ${targetUser.name}'s role from ${targetUser.role} to ${role}.`
        );


        res.json({
            message:
                "User role updated.",
            citizen:
                getUserById(
                    targetUser.id
                ),
            callsign
        });

    }
);


// ============================================================
// GOVERNMENT PENAL CODES
// ============================================================

app.post(
    "/api/government/penal-codes",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const code =
            cleanText(
                req.body.code,
                40
            );

        const title =
            cleanText(
                req.body.title,
                150
            );

        const description =
            cleanText(
                req.body.description,
                1000
            );

        const category =
            cleanText(
                req.body.category,
                100
            );

        const fine =
            Number(
                req.body.fine || 0
            );

        const points =
            Number(
                req.body.points || 0
            );

        const jailTime =
            cleanText(
                req.body.jail_time,
                100
            );

        let penalty =
            cleanText(
                req.body.penalty,
                300
            );


        if (
            !code ||
            !title ||
            !description
        ) {

            return res.status(400).json({
                message:
                    "Code, title and description are required."
            });

        }


        if (!penalty) {

            const pieces = [];

            if (fine > 0) {
                pieces.push(
                    `Fine: $${fine}`
                );
            }

            if (points > 0) {
                pieces.push(
                    `Points: ${points}`
                );
            }

            if (jailTime) {
                pieces.push(
                    `Jail: ${jailTime}`
                );
            }

            penalty =
                pieces.join(" • ");

        }


        try {

            const result =
                db.prepare(`

                    INSERT INTO penal_codes
                    (
                        code,
                        title,
                        description,
                        penalty,
                        category,
                        fine,
                        points,
                        jail_time,
                        created_by
                    )

                    VALUES
                    (?, ?, ?, ?, ?, ?, ?, ?, ?)

                `).run(
                    code,
                    title,
                    description,
                    penalty || null,
                    category || null,
                    Number.isFinite(fine)
                        ? fine
                        : 0,
                    Number.isFinite(points)
                        ? points
                        : 0,
                    jailTime || null,
                    req.user.id
                );


            createAudit(
                req.user.id,
                "PENAL_CODE_CREATE",
                `${req.user.name} created penal code ${code}.`
            );


            res.status(201).json({
                message:
                    "Penal code created.",
                id:
                    result.lastInsertRowid
            });

        } catch (error) {

            console.error(
                "PENAL CODE ERROR:",
                error
            );

            res.status(409).json({
                message:
                    "That penal code already exists."
            });

        }

    }
);


app.delete(
    "/api/government/penal-codes/:id",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid penal code ID."
            });

        }


        db.prepare(`
            DELETE FROM penal_codes
            WHERE id = ?
        `).run(id);


        createAudit(
            req.user.id,
            "PENAL_CODE_DELETE",
            `${req.user.name} removed penal code #${id}.`
        );


        res.json({
            message:
                "Penal code removed."
        });

    }
);


// ============================================================
// GOVERNMENT BOLOS
// ============================================================

app.post(
    "/api/government/bolos",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const subject =
            cleanText(
                req.body.subject,
                150
            );

        const vehicle =
            cleanText(
                req.body.vehicle,
                150
            );

        const plate =
            cleanText(
                req.body.plate,
                50
            );

        const description =
            cleanText(
                req.body.description,
                1000
            );

        const reason =
            cleanText(
                req.body.reason,
                1000
            );


        if (
            !subject ||
            !description
        ) {

            return res.status(400).json({
                message:
                    "Subject and description are required."
            });

        }


        const result =
            db.prepare(`

                INSERT INTO bolos
                (
                    subject,
                    vehicle,
                    plate,
                    description,
                    reason,
                    created_by
                )

                VALUES (?, ?, ?, ?, ?, ?)

            `).run(
                subject,
                vehicle || null,
                plate || null,
                description,
                reason || null,
                req.user.id
            );


        createAudit(
            req.user.id,
            "BOLO_CREATE",
            `${req.user.name} created a BOLO for ${subject}.`
        );


        res.status(201).json({
            message:
                "BOLO created.",
            id:
                result.lastInsertRowid
        });

    }
);


app.delete(
    "/api/government/bolos/:id",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid BOLO ID."
            });

        }


        db.prepare(`
            DELETE FROM bolos
            WHERE id = ?
        `).run(id);


        createAudit(
            req.user.id,
            "BOLO_DELETE",
            `${req.user.name} deleted BOLO #${id}.`
        );


        res.json({
            message:
                "BOLO deleted."
        });

    }
);


// ============================================================
// GOVERNMENT WARRANTS
// ============================================================

app.post(
    "/api/government/warrants",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const identifier =
            cleanText(
                req.body.user_id ||
                req.body.subject_identifier,
                255
            );

        const suppliedName =
            cleanText(
                req.body.subject_name,
                150
            );

        const reason =
            cleanText(
                req.body.reason,
                1000
            );

        const details =
            cleanText(
                req.body.details ||
                req.body.charges,
                2000
            );


        if (
            !identifier &&
            !suppliedName
        ) {

            return res.status(400).json({
                message:
                    "Citizen identifier or subject name is required."
            });

        }


        if (!reason) {

            return res.status(400).json({
                message:
                    "Warrant reason is required."
            });

        }


        const citizen =
            identifier
                ? findUser(identifier)
                : null;


        const subjectName =
            citizen?.name ||
            suppliedName ||
            identifier;


        const subjectIdentifier =
            citizen?.citizen_id ||
            identifier ||
            null;


        const result =
            db.prepare(`

                INSERT INTO arrest_warrants
                (
                    user_id,
                    subject_name,
                    subject_identifier,
                    reason,
                    charges,
                    details,
                    issued_by
                )

                VALUES (?, ?, ?, ?, ?, ?, ?)

            `).run(
                citizen?.id || null,
                subjectName,
                subjectIdentifier,
                reason,
                details || null,
                details || null,
                req.user.id
            );


        createAudit(
            req.user.id,
            "WARRANT_CREATE",
            `${req.user.name} issued an arrest warrant for ${subjectName}.`
        );


        res.status(201).json({
            message:
                "Arrest warrant issued.",
            id:
                result.lastInsertRowid
        });

    }
);


app.delete(
    "/api/government/warrants/:id",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid warrant ID."
            });

        }


        db.prepare(`
            DELETE FROM arrest_warrants
            WHERE id = ?
        `).run(id);


        createAudit(
            req.user.id,
            "WARRANT_DELETE",
            `${req.user.name} deleted warrant #${id}.`
        );


        res.json({
            message:
                "Warrant deleted."
        });

    }
);


// ============================================================
// GOVERNMENT CHARTS
// ============================================================

app.get(
    "/api/government/charts",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const charts =
            db.prepare(`

                SELECT *

                FROM charts

                ORDER BY
                    airport COLLATE NOCASE,
                    id DESC

            `).all();


        res.json({
            charts,
            airports:
                AIRPORTS
        });

    }
);


app.post(
    "/api/government/charts",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const airport =
            cleanText(
                req.body.airport,
                100
            );

        const chartName =
            cleanText(
                req.body.chart_name ||
                req.body.title,
                200
            );

        const chartType =
            cleanText(
                req.body.chart_type,
                100
            );

        const url =
            cleanText(
                req.body.url,
                2000
            );


        if (
            !airport ||
            !chartName ||
            !url
        ) {

            return res.status(400).json({
                message:
                    "Airport, chart title and URL are required."
            });

        }


        const result =
            db.prepare(`

                INSERT INTO charts
                (
                    airport,
                    chart_name,
                    chart_type,
                    url,
                    created_by
                )

                VALUES (?, ?, ?, ?, ?)

            `).run(
                airport,
                chartName,
                chartType || null,
                url,
                req.user.id
            );


        createAudit(
            req.user.id,
            "CHART_CREATE",
            `${req.user.name} added chart ${chartName} for ${airport}.`
        );


        res.status(201).json({
            message:
                "Chart added.",
            id:
                result.lastInsertRowid
        });

    }
);


app.delete(
    "/api/government/charts/:id",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid chart ID."
            });

        }


        db.prepare(`
            DELETE FROM charts
            WHERE id = ?
        `).run(id);


        createAudit(
            req.user.id,
            "CHART_DELETE",
            `${req.user.name} removed chart #${id}.`
        );


        res.json({
            message:
                "Chart removed."
        });

    }
);


// ============================================================
// GOVERNMENT LICENSE REQUESTS
// ============================================================

app.get(
    "/api/government/license-requests",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const requests =
            db.prepare(`

                SELECT
                    license_requests.*,

                    users.name
                        AS user_name,

                    users.email
                        AS user_email,

                    users.citizen_id,

                    reviewer.name
                        AS reviewer_name

                FROM license_requests

                INNER JOIN users
                    ON users.id =
                        license_requests.user_id

                LEFT JOIN users reviewer
                    ON reviewer.id =
                        license_requests.reviewed_by

                ORDER BY
                    license_requests.id DESC

                LIMIT 200

            `).all();


        res.json({
            requests
        });

    }
);


app.post(
    "/api/government/license-requests/:id",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const id =
            Number(
                req.params.id
            );

        let status =
            cleanText(
                req.body.status ||
                req.body.action,
                20
            ).toLowerCase();

        const note =
            cleanText(
                req.body.note,
                1000
            );


        if (
            status === "approve"
        ) {
            status =
                "approved";
        }

        if (
            status === "deny"
        ) {
            status =
                "denied";
        }


        if (!Number.isInteger(id)) {

            return res.status(400).json({
                message:
                    "Invalid request ID."
            });

        }


        if (
            ![
                "approved",
                "denied"
            ].includes(
                status
            )
        ) {

            return res.status(400).json({
                message:
                    "Invalid request status."
            });

        }


        const request =
            db.prepare(`
                SELECT *
                FROM license_requests
                WHERE id = ?
            `).get(id);


        if (!request) {

            return res.status(404).json({
                message:
                    "License request not found."
            });

        }


        if (
            request.status !==
            "pending"
        ) {

            return res.status(400).json({
                message:
                    "This request has already been reviewed."
            });

        }


        db.transaction(() => {

            db.prepare(`

                UPDATE license_requests

                SET
                    status = ?,
                    reviewed_by = ?,
                    government_note = ?,
                    reviewed_at =
                        CURRENT_TIMESTAMP

                WHERE id = ?

            `).run(
                status,
                req.user.id,
                note || null,
                id
            );


            if (
                status ===
                "approved"
            ) {

                const existing =
                    db.prepare(`

                        SELECT id

                        FROM licenses

                        WHERE
                            user_id = ?
                            AND license_type = ?

                    `).get(
                        request.user_id,
                        request.license_type
                    );


                if (existing) {

                    db.prepare(`

                        UPDATE licenses

                        SET
                            status = 'active',
                            issued_by = ?,
                            issued_at =
                                CURRENT_TIMESTAMP,
                            revoked_at =
                                NULL

                        WHERE id = ?

                    `).run(
                        req.user.id,
                        existing.id
                    );

                } else {

                    db.prepare(`

                        INSERT INTO licenses
                        (
                            user_id,
                            license_type,
                            status,
                            issued_by,
                            issued_at
                        )

                        VALUES
                        (?, ?, 'active', ?, CURRENT_TIMESTAMP)

                    `).run(
                        request.user_id,
                        request.license_type,
                        req.user.id
                    );

                }

            }


            const targetUser =
                getUserById(
                    request.user_id
                );


            createAudit(
                req.user.id,
                "LICENSE_REQUEST_REVIEW",
                `${req.user.name} ${status} the ${request.license_type} request for ${targetUser?.name || "unknown user"}.`
            );

        })();


        res.json({
            message:
                `License request ${status}.`
        });

    }
);


// ============================================================
// GOVERNMENT AUDIT
// ============================================================

app.get(
    "/api/government/audit",
    requireAuth,
    requireGovernment,
    (req, res) => {

        const audit =
            db.prepare(`

                SELECT
                    audit_logs.id,
                    audit_logs.action,
                    audit_logs.description,
                    audit_logs.created_at,

                    actor.name
                        AS actor_name

                FROM audit_logs

                LEFT JOIN users actor
                    ON actor.id =
                        audit_logs.actor_id

                ORDER BY
                    audit_logs.id DESC

                LIMIT 200

            `).all();


        res.json({
            audit
        });

    }
);


// ============================================================
// API 404
// ============================================================

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({
            message:
                "API endpoint not found."
        });

    }
);


// ============================================================
// STATIC WEBSITE
// ============================================================

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


// ============================================================
// SPA FALLBACK
// ============================================================

app.get(
    "*splat",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "SERVER ERROR:",
            error
        );


        res.status(500).json({
            message:
                "Internal server error."
        });

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    () => {

        console.log(
            "======================================"
        );

        console.log(
            "Group City Government Portal is running."
        );

        console.log(
            `Port: ${PORT}`
        );

        console.log(
            `Database: ${dbPath}`
        );

        console.log(
            "======================================"
        );

    }
);
