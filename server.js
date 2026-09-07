require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");

const {
    setupVoiceServer
} = require("./voice-server");

const app = express();


// ============================================================
// CONFIG
// ============================================================

const PORT =
    Number(process.env.PORT) ||
    3000;

const JWT_SECRET =
    process.env.JWT_SECRET ||
    "CHANGE-THIS-DEVELOPMENT-SECRET";

const GOVERNMENT_PASSCODE =
    process.env.GOVERNMENT_PASSCODE ||
    "";

const DISPATCH_TOKEN =
    process.env.DISPATCH_TOKEN ||
    "";

const ADMIN_EMAIL =
    String(
        process.env.ADMIN_EMAIL ||
        ""
    )
        .trim()
        .toLowerCase();

const ADMIN_PASSWORD =
    String(
        process.env.ADMIN_PASSWORD ||
        ""
    );

const ADMIN_NAME =
    String(
        process.env.ADMIN_NAME ||
        "Group City Government"
    ).trim();


// ============================================================
// DATA DIRECTORY
// ============================================================

const DATA_DIRECTORY =
    path.join(
        __dirname,
        "data"
    );

if (
    !fs.existsSync(
        DATA_DIRECTORY
    )
) {
    fs.mkdirSync(
        DATA_DIRECTORY,
        {
            recursive: true
        }
    );
}

const DATABASE_PATH =
    process.env.DB_PATH ||
    path.join(
        DATA_DIRECTORY,
        "government.db"
    );


// ============================================================
// DATABASE
// ============================================================

const db =
    new Database(
        DATABASE_PATH
    );

db.pragma(
    "journal_mode = WAL"
);

db.pragma(
    "foreign_keys = ON"
);


// ============================================================
// EXPRESS
// ============================================================

app.use(
    cors()
);

app.use(
    express.json({
        limit: "2mb"
    })
);

app.use(
    express.urlencoded({
        extended: true
    })
);


// ============================================================
// DATABASE TABLES
// ============================================================

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        citizen_id TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'citizen',
        police_points INTEGER NOT NULL DEFAULT 0,
        police_callsign TEXT UNIQUE,
        pilot_callsign TEXT UNIQUE,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        account_number TEXT NOT NULL UNIQUE,
        balance REAL NOT NULL DEFAULT 5000,
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
        description TEXT,
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
        reviewed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
        officer_id INTEGER,
        reason TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE,
        FOREIGN KEY (officer_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_id INTEGER,
        action TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (actor_id)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS emergency_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        discord_user_id TEXT,
        discord_username TEXT,
        display_name TEXT,
        voice_channel TEXT,
        details TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT,
        closed_by INTEGER,
        FOREIGN KEY (closed_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS penal_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        fine REAL NOT NULL DEFAULT 0,
        points INTEGER NOT NULL DEFAULT 0,
        jail_time TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT,
        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bolos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        vehicle TEXT,
        plate TEXT,
        description TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        issued_by INTEGER,
        issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cleared_by INTEGER,
        cleared_at TEXT,
        FOREIGN KEY (issued_by)
            REFERENCES users(id)
            ON DELETE SET NULL,
        FOREIGN KEY (cleared_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS arrest_warrants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        subject_name TEXT NOT NULL,
        reason TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        issued_by INTEGER,
        issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        served_by INTEGER,
        served_at TEXT,
        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE SET NULL,
        FOREIGN KEY (issued_by)
            REFERENCES users(id)
            ON DELETE SET NULL,
        FOREIGN KEY (served_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS charts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        airport TEXT NOT NULL,
        title TEXT NOT NULL,
        chart_type TEXT,
        url TEXT NOT NULL,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by)
            REFERENCES users(id)
            ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS flight_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        callsign TEXT NOT NULL,
        departure TEXT NOT NULL,
        arrival TEXT NOT NULL,
        aircraft TEXT NOT NULL,
        route TEXT,
        altitude TEXT,
        remarks TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cancelled_at TEXT,
        FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email
        ON users(email);

    CREATE INDEX IF NOT EXISTS idx_users_citizen_id
        ON users(citizen_id);

    CREATE INDEX IF NOT EXISTS idx_police_records_user
        ON police_records(user_id);

    CREATE INDEX IF NOT EXISTS idx_emergency_status
        ON emergency_calls(status);

    CREATE INDEX IF NOT EXISTS idx_bolo_status
        ON bolos(status);

    CREATE INDEX IF NOT EXISTS idx_warrant_status
        ON arrest_warrants(status);

    CREATE INDEX IF NOT EXISTS idx_flight_status
        ON flight_plans(status);
`);


// ============================================================
// DATABASE MIGRATION
// ============================================================

function ensureColumn(
    table,
    column,
    definition
) {
    const allowedTables = [
        "users",
        "bank_accounts",
        "transactions",
        "licenses",
        "license_requests",
        "police_records",
        "audit_logs",
        "emergency_calls",
        "penal_codes",
        "bolos",
        "arrest_warrants",
        "charts",
        "flight_plans"
    ];

    if (
        !allowedTables.includes(
            table
        )
    ) {
        throw new Error(
            "Invalid migration table."
        );
    }

    const columns =
        db.prepare(
            `PRAGMA table_info(${table})`
        ).all();

    const exists =
        columns.some(
            item =>
                item.name === column
        );

    if (!exists) {
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
    "users",
    "police_points",
    "INTEGER NOT NULL DEFAULT 0"
);

ensureColumn(
    "emergency_calls",
    "discord_user_id",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "discord_username",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "display_name",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "voice_channel",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "details",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "notes",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "closed_at",
    "TEXT"
);

ensureColumn(
    "emergency_calls",
    "closed_by",
    "INTEGER"
);

ensureColumn(
    "penal_codes",
    "category",
    "TEXT"
);

ensureColumn(
    "penal_codes",
    "fine",
    "REAL NOT NULL DEFAULT 0"
);

ensureColumn(
    "penal_codes",
    "points",
    "INTEGER NOT NULL DEFAULT 0"
);

ensureColumn(
    "penal_codes",
    "jail_time",
    "TEXT"
);

ensureColumn(
    "penal_codes",
    "updated_at",
    "TEXT"
);

ensureColumn(
    "arrest_warrants",
    "details",
    "TEXT"
);

ensureColumn(
    "charts",
    "title",
    "TEXT"
);


// ============================================================
// HELPERS
// ============================================================

function cleanText(
    value,
    maximum = 1000
) {
    return String(
        value ?? ""
    )
        .trim()
        .slice(
            0,
            maximum
        );
}


function normalizeEmail(
    value
) {
    return cleanText(
        value,
        255
    ).toLowerCase();
}


function money(
    value
) {
    return Math.round(
        Number(value) *
        100
    ) / 100;
}


function randomDigits(
    length
) {
    let result = "";

    for (
        let i = 0;
        i < length;
        i++
    ) {
        result +=
            crypto.randomInt(
                0,
                10
            );
    }

    return result;
}


// ============================================================
// ID GENERATORS
// ============================================================

function generateCitizenId() {
    for (
        let attempt = 0;
        attempt < 1000;
        attempt++
    ) {
        const id =
            `GC-${randomDigits(6)}`;

        const exists =
            db.prepare(`
                SELECT id
                FROM users
                WHERE citizen_id = ?
            `).get(id);

        if (!exists) {
            return id;
        }
    }

    throw new Error(
        "Unable to generate citizen ID."
    );
}


function generateAccountNumber() {
    for (
        let attempt = 0;
        attempt < 1000;
        attempt++
    ) {
        const number =
            randomDigits(10);

        const exists =
            db.prepare(`
                SELECT id
                FROM bank_accounts
                WHERE account_number = ?
            `).get(number);

        if (!exists) {
            return number;
        }
    }

    throw new Error(
        "Unable to generate account number."
    );
}


function generatePoliceCallsign() {
    for (
        let attempt = 0;
        attempt < 1000;
        attempt++
    ) {
        const callsign =
            `1A-${randomDigits(3)}`;

        const exists =
            db.prepare(`
                SELECT id
                FROM users
                WHERE police_callsign = ?
            `).get(callsign);

        if (!exists) {
            return callsign;
        }
    }

    throw new Error(
        "Unable to generate police callsign."
    );
}


function generatePilotCallsign() {
    for (
        let attempt = 0;
        attempt < 1000;
        attempt++
    ) {
        const callsign =
            `GC-${randomDigits(4)}`;

        const exists =
            db.prepare(`
                SELECT id
                FROM users
                WHERE pilot_callsign = ?
            `).get(callsign);

        if (!exists) {
            return callsign;
        }
    }

    throw new Error(
        "Unable to generate pilot callsign."
    );
}


// ============================================================
// USER HELPERS
// ============================================================

function findUser(
    identifier
) {
    const input =
        cleanText(
            identifier,
            255
        );

    if (!input) {
        return null;
    }

    const numeric =
        Number(input);

    if (
        Number.isInteger(
            numeric
        ) &&
        numeric > 0
    ) {
        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE id = ?
                LIMIT 1
            `).get(numeric);

        if (user) {
            return user;
        }
    }

    const email =
        normalizeEmail(
            input
        );

    return db.prepare(`
        SELECT *
        FROM users
        WHERE citizen_id = ?
           OR email = ?
           OR LOWER(name) = LOWER(?)
        LIMIT 1
    `).get(
        input,
        email,
        input
    ) || null;
}


function serializeUser(
    user
) {
    if (!user) {
        return null;
    }

    return {
        id:
            user.id,

        name:
            user.name,

        email:
            user.email,

        citizen_id:
            user.citizen_id,

        role:
            user.role,

        police_points:
            Number(
                user.police_points ||
                0
            ),

        police_callsign:
            user.police_callsign ||
            null,

        pilot_callsign:
            user.pilot_callsign ||
            null,

        created_at:
            user.created_at
    };
}


// ============================================================
// AUDIT
// ============================================================

function audit(
    actorId,
    action,
    description
) {
    db.prepare(`
        INSERT INTO audit_logs (
            actor_id,
            action,
            description
        )
        VALUES (?, ?, ?)
    `).run(
        actorId || null,
        cleanText(
            action,
            255
        ),
        cleanText(
            description,
            2000
        )
    );
}


// ============================================================
// BANK HELPERS
// ============================================================

function ensureBankAccount(
    userId
) {
    let account =
        db.prepare(`
            SELECT *
            FROM bank_accounts
            WHERE user_id = ?
        `).get(userId);

    if (!account) {
        db.prepare(`
            INSERT INTO bank_accounts (
                user_id,
                account_number,
                balance
            )
            VALUES (?, ?, ?)
        `).run(
            userId,
            generateAccountNumber(),
            5000
        );

        account =
            db.prepare(`
                SELECT *
                FROM bank_accounts
                WHERE user_id = ?
            `).get(userId);
    }

    return account;
}


// ============================================================
// CALLSIGN HELPERS
// ============================================================

function ensurePoliceCallsign(
    userId
) {
    const user =
        db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(userId);

    if (!user) {
        throw new Error(
            "User not found."
        );
    }

    if (
        user.police_callsign &&
        /^1A-\d{3}$/.test(
            user.police_callsign
        )
    ) {
        return user.police_callsign;
    }

    const callsign =
        generatePoliceCallsign();

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


function ensurePilotCallsign(
    userId
) {
    const user =
        db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(userId);

    if (!user) {
        throw new Error(
            "User not found."
        );
    }

    if (
        user.pilot_callsign &&
        /^GC-\d{4}$/.test(
            user.pilot_callsign
        )
    ) {
        return user.pilot_callsign;
    }

    const callsign =
        generatePilotCallsign();

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
// JWT
// ============================================================

function createToken(
    user
) {
    return jwt.sign(
        {
            id:
                user.id,

            role:
                user.role
        },
        JWT_SECRET,
        {
            expiresIn:
                "30d"
        }
    );
}


// ============================================================
// AUTH
// ============================================================

function authRequired(
    req,
    res,
    next
) {
    const authorization =
        String(
            req.headers.authorization ||
            ""
        );

    if (
        !authorization.startsWith(
            "Bearer "
        )
    ) {
        return res.status(401).json({
            error:
                "Authentication required."
        });
    }

    try {
        const token =
            authorization.slice(7);

        const decoded =
            jwt.verify(
                token,
                JWT_SECRET
            );

        const user =
            db.prepare(`
                SELECT *
                FROM users
                WHERE id = ?
                LIMIT 1
            `).get(
                decoded.id
            );

        if (!user) {
            return res.status(401).json({
                error:
                    "Account not found."
            });
        }

        req.user =
            user;

        next();

    } catch {
        return res.status(401).json({
            error:
                "Your login session is invalid or expired."
        });
    }
}


function requireRoles(
    ...roles
) {
    return (
        req,
        res,
        next
    ) => {
        if (
            !req.user ||
            !roles.includes(
                req.user.role
            )
        ) {
            return res.status(403).json({
                error:
                    "You do not have permission to use this feature."
            });
        }

        next();
    };
}


const requirePolice =
    requireRoles(
        "police",
        "government"
    );

const requirePilot =
    requireRoles(
        "pilot",
        "atc",
        "government"
    );

const requireATC =
    requireRoles(
        "atc",
        "government"
    );

const requireGovernment =
    requireRoles(
        "government"
    );


// ============================================================
// ADMIN ACCOUNT
// ============================================================

function createInitialAdmin() {
    if (
        !ADMIN_EMAIL ||
        !ADMIN_PASSWORD
    ) {
        console.log(
            "Admin environment variables not configured."
        );

        return;
    }

    let admin =
        db.prepare(`
            SELECT *
            FROM users
            WHERE email = ?
        `).get(
            ADMIN_EMAIL
        );

    if (!admin) {
        const passwordHash =
            bcrypt.hashSync(
                ADMIN_PASSWORD,
                12
            );

        const result =
            db.prepare(`
                INSERT INTO users (
                    name,
                    email,
                    password_hash,
                    citizen_id,
                    role,
                    police_points
                )
                VALUES (?, ?, ?, ?, 'government', 0)
            `).run(
                ADMIN_NAME,
                ADMIN_EMAIL,
                passwordHash,
                generateCitizenId()
            );

        ensureBankAccount(
            Number(
                result.lastInsertRowid
            )
        );

        console.log(
            "Government administrator created."
        );

        return;
    }

    if (
        admin.role !==
        "government"
    ) {
        db.prepare(`
            UPDATE users
            SET role = 'government'
            WHERE id = ?
        `).run(
            admin.id
        );
    }

    ensureBankAccount(
        admin.id
    );
}


createInitialAdmin();


// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            ok: true,

            service:
                "Group City Government Portal",

            database:
                "connected",

            voice:
                "enabled",

            time:
                new Date().toISOString()
        });
    }
);


// ============================================================
// REGISTER
// ============================================================

app.post(
    "/api/auth/register",
    (req, res) => {
        try {
            const name =
                cleanText(
                    req.body.name,
                    100
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
                    error:
                        "Name, email and password are required."
                });
            }

            if (
                password.length < 6
            ) {
                return res.status(400).json({
                    error:
                        "Password must be at least 6 characters."
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
                    error:
                        "An account already exists with this email."
                });
            }

            const passwordHash =
                bcrypt.hashSync(
                    password,
                    12
                );

            const result =
                db.prepare(`
                    INSERT INTO users (
                        name,
                        email,
                        password_hash,
                        citizen_id,
                        role,
                        police_points
                    )
                    VALUES (?, ?, ?, ?, 'citizen', 0)
                `).run(
                    name,
                    email,
                    passwordHash,
                    generateCitizenId()
                );

            const userId =
                Number(
                    result.lastInsertRowid
                );

            ensureBankAccount(
                userId
            );

            const user =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE id = ?
                `).get(
                    userId
                );

            return res.status(201).json({
                message:
                    "Account created.",

                token:
                    createToken(
                        user
                    ),

                user:
                    serializeUser(
                        user
                    )
            });

        } catch (error) {
            console.error(
                "Register:",
                error
            );

            return res.status(500).json({
                error:
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
        try {
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
                    LIMIT 1
                `).get(
                    email
                );

            if (
                !user ||
                !bcrypt.compareSync(
                    password,
                    user.password_hash
                )
            ) {
                return res.status(401).json({
                    error:
                        "Invalid email or password."
                });
            }

            ensureBankAccount(
                user.id
            );

            const refreshed =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE id = ?
                `).get(
                    user.id
                );

            return res.json({
                message:
                    "Login successful.",

                token:
                    createToken(
                        refreshed
                    ),

                user:
                    serializeUser(
                        refreshed
                    )
            });

        } catch (error) {
            console.error(
                "Login:",
                error
            );

            return res.status(500).json({
                error:
                    "Unable to log in."
            });
        }
    }
);


// ============================================================
// CURRENT USER
// ============================================================

function currentUserHandler(
    req,
    res
) {
    const user =
        db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(
            req.user.id
        );

    return res.json({
        user:
            serializeUser(
                user
            )
    });
}


app.get(
    "/api/auth/me",
    authRequired,
    currentUserHandler
);

app.get(
    "/api/users/me",
    authRequired,
    currentUserHandler
);


// ============================================================
// BANK
// ============================================================

app.get(
    "/api/bank",
    authRequired,
    (req, res) => {
        const account =
            ensureBankAccount(
                req.user.id
            );

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

        return res.json({
            account: {
                account_number:
                    account.account_number,

                balance:
                    money(
                        account.balance
                    )
            },

            account_number:
                account.account_number,

            balance:
                money(
                    account.balance
                ),

            transactions
        });
    }
);


// ============================================================
// BANK TRANSFER
// ============================================================

app.post(
    "/api/bank/transfer",
    authRequired,
    (req, res) => {
        try {
            const recipientInput =
                cleanText(
                    req.body.recipient,
                    255
                );

            const amount =
                money(
                    req.body.amount
                );

            const description =
                cleanText(
                    req.body.description ||
                    "Bank transfer",
                    500
                );

            if (
                !recipientInput
            ) {
                return res.status(400).json({
                    error:
                        "Recipient is required."
                });
            }

            if (
                !Number.isFinite(
                    amount
                ) ||
                amount <= 0
            ) {
                return res.status(400).json({
                    error:
                        "Transfer amount must be greater than zero."
                });
            }

            const senderAccount =
                ensureBankAccount(
                    req.user.id
                );

            let recipient =
                findUser(
                    recipientInput
                );

            let recipientAccount =
                null;

            if (!recipient) {
                recipientAccount =
                    db.prepare(`
                        SELECT
                            bank_accounts.*,
                            users.id AS recipient_user_id,
                            users.name AS recipient_name,
                            users.email AS recipient_email,
                            users.citizen_id AS recipient_citizen_id
                        FROM bank_accounts
                        JOIN users
                            ON users.id =
                               bank_accounts.user_id
                        WHERE bank_accounts.account_number = ?
                        LIMIT 1
                    `).get(
                        recipientInput
                    );

                if (
                    recipientAccount
                ) {
                    recipient = {
                        id:
                            recipientAccount.recipient_user_id,

                        name:
                            recipientAccount.recipient_name,

                        email:
                            recipientAccount.recipient_email,

                        citizen_id:
                            recipientAccount.recipient_citizen_id
                    };
                }
            }

            if (!recipient) {
                return res.status(404).json({
                    error:
                        "Recipient was not found."
                });
            }

            if (
                recipient.id ===
                req.user.id
            ) {
                return res.status(400).json({
                    error:
                        "You cannot transfer money to yourself."
                });
            }

            if (
                !recipientAccount
            ) {
                recipientAccount =
                    ensureBankAccount(
                        recipient.id
                    );
            }

            const execute =
                db.transaction(() => {
                    const freshSender =
                        db.prepare(`
                            SELECT *
                            FROM bank_accounts
                            WHERE id = ?
                        `).get(
                            senderAccount.id
                        );

                    if (
                        Number(
                            freshSender.balance
                        ) < amount
                    ) {
                        throw new Error(
                            "INSUFFICIENT_FUNDS"
                        );
                    }

                    db.prepare(`
                        UPDATE bank_accounts
                        SET balance =
                            balance - ?
                        WHERE id = ?
                    `).run(
                        amount,
                        senderAccount.id
                    );

                    db.prepare(`
                        UPDATE bank_accounts
                        SET balance =
                            balance + ?
                        WHERE id = ?
                    `).run(
                        amount,
                        recipientAccount.id
                    );

                    db.prepare(`
                        INSERT INTO transactions (
                            account_id,
                            amount,
                            type,
                            description
                        )
                        VALUES (?, ?, ?, ?)
                    `).run(
                        senderAccount.id,
                        -amount,
                        "transfer_out",
                        `${description} to ${recipient.name}`
                    );

                    db.prepare(`
                        INSERT INTO transactions (
                            account_id,
                            amount,
                            type,
                            description
                        )
                        VALUES (?, ?, ?, ?)
                    `).run(
                        recipientAccount.id,
                        amount,
                        "transfer_in",
                        `${description} from ${req.user.name}`
                    );
                });

            execute();

            return res.json({
                message:
                    "Transfer completed.",

                recipient:
                    serializeUser(
                        recipient
                    ),

                amount
            });

        } catch (error) {
            if (
                error.message ===
                "INSUFFICIENT_FUNDS"
            ) {
                return res.status(400).json({
                    error:
                        "Insufficient funds."
                });
            }

            console.error(
                "Transfer:",
                error
            );

            return res.status(500).json({
                error:
                    "Unable to complete transfer."
            });
        }
    }
);


// ============================================================
// LICENSES
// ============================================================

const DEFAULT_LICENSE_TYPES = [
    "Driver License",
    "Commercial Driver License",
    "Firearm License",
    "Pilot License",
    "Business License"
];


app.get(
    "/api/licenses",
    authRequired,
    (req, res) => {
        const existing =
            db.prepare(`
                SELECT *
                FROM licenses
                WHERE user_id = ?
                ORDER BY license_type
            `).all(
                req.user.id
            );

        const pending =
            db.prepare(`
                SELECT *
                FROM license_requests
                WHERE user_id = ?
                  AND status = 'pending'
                ORDER BY id DESC
            `).all(
                req.user.id
            );

        const byType =
            new Map(
                existing.map(
                    item => [
                        item.license_type,
                        item
                    ]
                )
            );

        const types =
            new Set([
                ...DEFAULT_LICENSE_TYPES,
                ...existing.map(
                    item =>
                        item.license_type
                )
            ]);

        const licenses =
            [...types].map(
                type => {
                    const item =
                        byType.get(
                            type
                        );

                    if (item) {
                        return item;
                    }

                    return {
                        id: null,

                        user_id:
                            req.user.id,

                        license_type:
                            type,

                        status:
                            "inactive",

                        issued_by:
                            null,

                        issued_at:
                            null,

                        revoked_at:
                            null
                    };
                }
            );

        return res.json({
            licenses,
            requests:
                pending,
            license_types:
                DEFAULT_LICENSE_TYPES
        });
    }
);


app.post(
    "/api/licenses/request",
    authRequired,
    (req, res) => {
        const licenseType =
            cleanText(
                req.body.license_type,
                100
            );

        if (!licenseType) {
            return res.status(400).json({
                error:
                    "License type is required."
            });
        }

        const active =
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

        if (active) {
            return res.status(409).json({
                error:
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
            return res.status(409).json({
                error:
                    "You already have a pending request."
            });
        }

        const result =
            db.prepare(`
                INSERT INTO license_requests (
                    user_id,
                    license_type,
                    status
                )
                VALUES (?, ?, 'pending')
            `).run(
                req.user.id,
                licenseType
            );

        return res.status(201).json({
            message:
                "License request submitted.",

            request_id:
                Number(
                    result.lastInsertRowid
                )
        });
    }
);


// ============================================================
// POLICE CALLSIGN
// ============================================================

app.get(
    "/api/police/callsign",
    authRequired,
    requirePolice,
    (req, res) => {
        const callsign =
            ensurePoliceCallsign(
                req.user.id
            );

        return res.json({
            callsign,
            police_callsign:
                callsign
        });
    }
);


// ============================================================
// POLICE CITIZEN LOOKUP
// ============================================================

app.get(
    "/api/police/citizen/:identifier",
    authRequired,
    requirePolice,
    (req, res) => {
        const citizen =
            findUser(
                req.params.identifier
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const records =
            db.prepare(`
                SELECT
                    police_records.*,
                    officers.name
                        AS officer_name,
                    officers.police_callsign
                        AS officer_callsign
                FROM police_records
                LEFT JOIN users AS officers
                    ON officers.id =
                       police_records.officer_id
                WHERE police_records.user_id = ?
                ORDER BY police_records.id DESC
            `).all(
                citizen.id
            );

        const licenses =
            db.prepare(`
                SELECT *
                FROM licenses
                WHERE user_id = ?
                ORDER BY license_type
            `).all(
                citizen.id
            );

        const warrants =
            db.prepare(`
                SELECT *
                FROM arrest_warrants
                WHERE user_id = ?
                  AND status = 'active'
                ORDER BY id DESC
            `).all(
                citizen.id
            );

        return res.json({
            citizen:
                serializeUser(
                    citizen
                ),

            user:
                serializeUser(
                    citizen
                ),

            records,
            licenses,
            warrants
        });
    }
);


// ============================================================
// POLICE POINTS
// ============================================================

app.post(
    "/api/police/points",
    authRequired,
    requirePolice,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const points =
            Number(
                req.body.points
            );

        const reason =
            cleanText(
                req.body.reason ||
                "Police points",
                1000
            );

        if (
            !Number.isInteger(
                points
            ) ||
            points <= 0
        ) {
            return res.status(400).json({
                error:
                    "Points must be a positive whole number."
            });
        }

        db.transaction(() => {
            db.prepare(`
                UPDATE users
                SET police_points =
                    police_points + ?
                WHERE id = ?
            `).run(
                points,
                citizen.id
            );

            db.prepare(`
                INSERT INTO police_records (
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
        })();

        return res.json({
            message:
                "Police points added."
        });
    }
);


// ============================================================
// POLICE RECORDS
// ============================================================

app.post(
    "/api/police/records",
    authRequired,
    requirePolice,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const reason =
            cleanText(
                req.body.reason,
                1500
            );

        const points =
            Number(
                req.body.points ||
                0
            );

        if (!reason) {
            return res.status(400).json({
                error:
                    "Record reason is required."
            });
        }

        if (
            !Number.isInteger(
                points
            ) ||
            points < 0
        ) {
            return res.status(400).json({
                error:
                    "Points must be zero or a positive whole number."
            });
        }

        db.transaction(() => {
            db.prepare(`
                INSERT INTO police_records (
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
        })();

        return res.status(201).json({
            message:
                "Police record created."
        });
    }
);


// ============================================================
// ACTIVE 911 CALLS / POLICE RTO
// ============================================================

app.get(
    "/api/police/911",
    authRequired,
    requirePolice,
    (req, res) => {
        const calls =
            db.prepare(`
                SELECT *
                FROM emergency_calls
                WHERE status = 'active'
                ORDER BY id DESC
            `).all();

        return res.json({
            calls,
            count:
                calls.length
        });
    }
);


// ============================================================
// WEBSITE 911 CALL
// ============================================================

app.post(
    "/api/911",
    authRequired,
    (req, res) => {
        const details =
            cleanText(
                req.body.details ||
                "Emergency assistance requested.",
                1500
            );

        const result =
            db.prepare(`
                INSERT INTO emergency_calls (
                    discord_user_id,
                    discord_username,
                    display_name,
                    voice_channel,
                    details,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'active')
            `).run(
                `WEB-${req.user.id}`,
                req.user.email,
                req.user.name,
                "Website 911",
                details
            );

        const call =
            db.prepare(`
                SELECT *
                FROM emergency_calls
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        return res.status(201).json({
            message:
                "911 call submitted.",

            call
        });
    }
);


// ============================================================
// DISCORD 911 INTEGRATION
// ============================================================

app.post(
    "/api/dispatch/911",
    (req, res) => {
        const headerToken =
            cleanText(
                req.headers[
                    "x-dispatch-token"
                ],
                500
            );

        const authorization =
            cleanText(
                req.headers.authorization,
                600
            );

        const bearer =
            authorization.startsWith(
                "Bearer "
            )
                ? authorization.slice(7)
                : "";

        if (
            !DISPATCH_TOKEN ||
            (
                headerToken !==
                    DISPATCH_TOKEN &&
                bearer !==
                    DISPATCH_TOKEN
            )
        ) {
            return res.status(401).json({
                error:
                    "Invalid dispatch token."
            });
        }

        const discordUserId =
            cleanText(
                req.body.discord_user_id,
                100
            );

        const discordUsername =
            cleanText(
                req.body.discord_username,
                255
            );

        const displayName =
            cleanText(
                req.body.display_name ||
                discordUsername,
                255
            );

        const voiceChannel =
            cleanText(
                req.body.voice_channel ||
                "911",
                255
            );

        const details =
            cleanText(
                req.body.details ||
                "Caller entered the 911 Discord voice channel.",
                1500
            );

        if (!discordUserId) {
            return res.status(400).json({
                error:
                    "discord_user_id is required."
            });
        }

        const existing =
            db.prepare(`
                SELECT *
                FROM emergency_calls
                WHERE discord_user_id = ?
                  AND status = 'active'
                ORDER BY id DESC
                LIMIT 1
            `).get(
                discordUserId
            );

        if (existing) {
            return res.json({
                message:
                    "An active 911 call already exists.",

                call:
                    existing
            });
        }

        const result =
            db.prepare(`
                INSERT INTO emergency_calls (
                    discord_user_id,
                    discord_username,
                    display_name,
                    voice_channel,
                    details,
                    status
                )
                VALUES (?, ?, ?, ?, ?, 'active')
            `).run(
                discordUserId,
                discordUsername,
                displayName,
                voiceChannel,
                details
            );

        const call =
            db.prepare(`
                SELECT *
                FROM emergency_calls
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        return res.status(201).json({
            message:
                "911 call created.",

            call
        });
    }
);


// ============================================================
// CLOSE 911 CALL
// ============================================================

app.post(
    "/api/police/911/:id/close",
    authRequired,
    requirePolice,
    (req, res) => {
        const callId =
            Number(
                req.params.id
            );

        const call =
            db.prepare(`
                SELECT *
                FROM emergency_calls
                WHERE id = ?
            `).get(
                callId
            );

        if (!call) {
            return res.status(404).json({
                error:
                    "911 call not found."
            });
        }

        db.prepare(`
            UPDATE emergency_calls
            SET
                status = 'closed',
                closed_at = CURRENT_TIMESTAMP,
                closed_by = ?
            WHERE id = ?
        `).run(
            req.user.id,
            callId
        );

        audit(
            req.user.id,
            "911_CALL_CLOSED",
            `Closed 911 call #${callId}.`
        );

        return res.json({
            message:
                "911 call closed."
        });
    }
);


// ============================================================
// PENAL CODES PUBLIC
// ============================================================

app.get(
    "/api/penal-codes",
    (req, res) => {
        const search =
            cleanText(
                req.query.search ||
                req.query.q,
                255
            );

        let codes;

        if (search) {
            const wildcard =
                `%${search}%`;

            codes =
                db.prepare(`
                    SELECT *
                    FROM penal_codes
                    WHERE code LIKE ? COLLATE NOCASE
                       OR title LIKE ? COLLATE NOCASE
                       OR description LIKE ? COLLATE NOCASE
                       OR category LIKE ? COLLATE NOCASE
                    ORDER BY code COLLATE NOCASE
                `).all(
                    wildcard,
                    wildcard,
                    wildcard,
                    wildcard
                );
        } else {
            codes =
                db.prepare(`
                    SELECT *
                    FROM penal_codes
                    ORDER BY code COLLATE NOCASE
                `).all();
        }

        return res.json({
            penal_codes:
                codes,

            penalCodes:
                codes,

            codes
        });
    }
);


// ============================================================
// POLICE BOLOS
// ============================================================

app.get(
    "/api/police/bolos",
    authRequired,
    requirePolice,
    (req, res) => {
        const search =
            cleanText(
                req.query.search ||
                req.query.q,
                255
            );

        let bolos;

        if (search) {
            const wildcard =
                `%${search}%`;

            bolos =
                db.prepare(`
                    SELECT
                        bolos.*,
                        users.name
                            AS issued_by_name,
                        users.police_callsign
                            AS issued_by_callsign
                    FROM bolos
                    LEFT JOIN users
                        ON users.id =
                           bolos.issued_by
                    WHERE bolos.status = 'active'
                      AND (
                          bolos.subject
                              LIKE ? COLLATE NOCASE
                          OR bolos.vehicle
                              LIKE ? COLLATE NOCASE
                          OR bolos.plate
                              LIKE ? COLLATE NOCASE
                          OR bolos.description
                              LIKE ? COLLATE NOCASE
                          OR bolos.reason
                              LIKE ? COLLATE NOCASE
                      )
                    ORDER BY bolos.id DESC
                `).all(
                    wildcard,
                    wildcard,
                    wildcard,
                    wildcard,
                    wildcard
                );
        } else {
            bolos =
                db.prepare(`
                    SELECT
                        bolos.*,
                        users.name
                            AS issued_by_name,
                        users.police_callsign
                            AS issued_by_callsign
                    FROM bolos
                    LEFT JOIN users
                        ON users.id =
                           bolos.issued_by
                    WHERE bolos.status = 'active'
                    ORDER BY bolos.id DESC
                `).all();
        }

        return res.json({
            bolos
        });
    }
);


app.post(
    "/api/police/bolos/:id/clear",
    authRequired,
    requirePolice,
    (req, res) => {
        const result =
            db.prepare(`
                UPDATE bolos
                SET
                    status = 'cleared',
                    cleared_by = ?,
                    cleared_at =
                        CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'active'
            `).run(
                req.user.id,
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "Active BOLO not found."
            });
        }

        return res.json({
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
    authRequired,
    requirePolice,
    (req, res) => {
        const search =
            cleanText(
                req.query.search ||
                req.query.q,
                255
            );

        let warrants;

        if (search) {
            const wildcard =
                `%${search}%`;

            warrants =
                db.prepare(`
                    SELECT
                        arrest_warrants.*,
                        subject.citizen_id,
                        subject.email,
                        issuer.name
                            AS issued_by_name
                    FROM arrest_warrants
                    LEFT JOIN users AS subject
                        ON subject.id =
                           arrest_warrants.user_id
                    LEFT JOIN users AS issuer
                        ON issuer.id =
                           arrest_warrants.issued_by
                    WHERE arrest_warrants.status = 'active'
                      AND (
                          arrest_warrants.subject_name
                              LIKE ? COLLATE NOCASE
                          OR arrest_warrants.reason
                              LIKE ? COLLATE NOCASE
                          OR arrest_warrants.details
                              LIKE ? COLLATE NOCASE
                          OR subject.citizen_id
                              LIKE ? COLLATE NOCASE
                          OR subject.email
                              LIKE ? COLLATE NOCASE
                      )
                    ORDER BY arrest_warrants.id DESC
                `).all(
                    wildcard,
                    wildcard,
                    wildcard,
                    wildcard,
                    wildcard
                );
        } else {
            warrants =
                db.prepare(`
                    SELECT
                        arrest_warrants.*,
                        subject.citizen_id,
                        subject.email,
                        issuer.name
                            AS issued_by_name
                    FROM arrest_warrants
                    LEFT JOIN users AS subject
                        ON subject.id =
                           arrest_warrants.user_id
                    LEFT JOIN users AS issuer
                        ON issuer.id =
                           arrest_warrants.issued_by
                    WHERE arrest_warrants.status = 'active'
                    ORDER BY arrest_warrants.id DESC
                `).all();
        }

        return res.json({
            warrants
        });
    }
);


app.post(
    "/api/police/warrants/:id/serve",
    authRequired,
    requirePolice,
    (req, res) => {
        const result =
            db.prepare(`
                UPDATE arrest_warrants
                SET
                    status = 'served',
                    served_by = ?,
                    served_at =
                        CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'active'
            `).run(
                req.user.id,
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "Active warrant not found."
            });
        }

        return res.json({
            message:
                "Warrant marked as served."
        });
    }
);


// ============================================================
// PILOT CALLSIGN
// ============================================================

app.get(
    "/api/pilot/callsign",
    authRequired,
    requirePilot,
    (req, res) => {
        const callsign =
            ensurePilotCallsign(
                req.user.id
            );

        return res.json({
            callsign,
            pilot_callsign:
                callsign
        });
    }
);


// ============================================================
// PILOT CHARTS
// ============================================================

app.get(
    "/api/pilot/charts",
    authRequired,
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
                    ORDER BY airport, id DESC
                `).all();
        }

        return res.json({
            charts
        });
    }
);


// ============================================================
// CURRENT FLIGHT PLAN
// ============================================================

app.get(
    "/api/pilot/flight-plan",
    authRequired,
    requirePilot,
    (req, res) => {
        const flightPlan =
            db.prepare(`
                SELECT *
                FROM flight_plans
                WHERE user_id = ?
                  AND status = 'active'
                ORDER BY id DESC
                LIMIT 1
            `).get(
                req.user.id
            );

        return res.json({
            flight_plan:
                flightPlan ||
                null,

            flightPlan:
                flightPlan ||
                null
        });
    }
);


// ============================================================
// FILE FLIGHT PLAN
// ============================================================

app.post(
    "/api/pilot/flight-plan",
    authRequired,
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

        if (
            !departure ||
            !arrival ||
            !aircraft
        ) {
            return res.status(400).json({
                error:
                    "Departure, arrival and aircraft are required."
            });
        }

        let callsign =
            cleanText(
                req.body.callsign,
                30
            );

        if (!callsign) {
            callsign =
                ensurePilotCallsign(
                    req.user.id
                );
        }

        db.prepare(`
            UPDATE flight_plans
            SET
                status = 'cancelled',
                cancelled_at =
                    CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND status = 'active'
        `).run(
            req.user.id
        );

        const result =
            db.prepare(`
                INSERT INTO flight_plans (
                    user_id,
                    callsign,
                    departure,
                    arrival,
                    aircraft,
                    route,
                    altitude,
                    remarks,
                    status
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?,
                    'active'
                )
            `).run(
                req.user.id,
                callsign,
                departure,
                arrival,
                aircraft,
                route,
                altitude,
                remarks
            );

        const flightPlan =
            db.prepare(`
                SELECT *
                FROM flight_plans
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        return res.status(201).json({
            message:
                "Flight plan filed.",

            flight_plan:
                flightPlan,

            flightPlan
        });
    }
);


// ============================================================
// CANCEL FLIGHT PLAN
// ============================================================

app.post(
    "/api/pilot/flight-plan/cancel",
    authRequired,
    requirePilot,
    (req, res) => {
        db.prepare(`
            UPDATE flight_plans
            SET
                status = 'cancelled',
                cancelled_at =
                    CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND status = 'active'
        `).run(
            req.user.id
        );

        return res.json({
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
    authRequired,
    requireATC,
    (req, res) => {
        const flightPlans =
            db.prepare(`
                SELECT
                    flight_plans.*,
                    users.name
                        AS pilot_name,
                    users.citizen_id
                        AS pilot_citizen_id
                FROM flight_plans
                JOIN users
                    ON users.id =
                       flight_plans.user_id
                WHERE flight_plans.status =
                      'active'
                ORDER BY flight_plans.id DESC
            `).all();

        return res.json({
            flight_plans:
                flightPlans,

            flightPlans
        });
    }
);


// ============================================================
// GOVERNMENT USER SEARCH
// ============================================================

app.get(
    "/api/government/users",
    authRequired,
    requireGovernment,
    (req, res) => {
        const search =
            cleanText(
                req.query.search ||
                req.query.q,
                255
            );

        let users;

        if (search) {
            const wildcard =
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
                    WHERE name
                        LIKE ? COLLATE NOCASE
                       OR email
                        LIKE ? COLLATE NOCASE
                       OR citizen_id
                        LIKE ? COLLATE NOCASE
                    ORDER BY id DESC
                    LIMIT 100
                `).all(
                    wildcard,
                    wildcard,
                    wildcard
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
                    ORDER BY id DESC
                    LIMIT 100
                `).all();
        }

        return res.json({
            users:
                users.map(
                    serializeUser
                )
        });
    }
);


// ============================================================
// GOVERNMENT MONEY LEADERBOARD
// ============================================================

function governmentMoneyHandler(
    req,
    res
) {
    const leaderboard =
        db.prepare(`
            SELECT
                users.id,
                users.name,
                users.email,
                users.citizen_id,
                bank_accounts.account_number,
                bank_accounts.balance
            FROM bank_accounts
            JOIN users
                ON users.id =
                   bank_accounts.user_id
            ORDER BY bank_accounts.balance DESC
            LIMIT 100
        `).all();

    return res.json({
        leaderboard,
        users:
            leaderboard
    });
}


app.get(
    "/api/government/money-leaderboard",
    authRequired,
    requireGovernment,
    governmentMoneyHandler
);

app.get(
    "/api/government/money",
    authRequired,
    requireGovernment,
    governmentMoneyHandler
);


// ============================================================
// GOVERNMENT BANK ADJUSTMENT
// ============================================================

app.post(
    "/api/government/bank",
    authRequired,
    requireGovernment,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const amount =
            money(
                req.body.amount
            );

        if (
            !Number.isFinite(
                amount
            ) ||
            amount === 0
        ) {
            return res.status(400).json({
                error:
                    "Amount must not be zero."
            });
        }

        const description =
            cleanText(
                req.body.description ||
                "Government balance adjustment",
                500
            );

        const account =
            ensureBankAccount(
                citizen.id
            );

        const newBalance =
            money(
                Number(
                    account.balance
                ) +
                amount
            );

        if (
            newBalance < 0
        ) {
            return res.status(400).json({
                error:
                    "Balance cannot go below zero."
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
                INSERT INTO transactions (
                    account_id,
                    amount,
                    type,
                    description
                )
                VALUES (?, ?, ?, ?)
            `).run(
                account.id,
                amount,
                "government_adjustment",
                description
            );
        })();

        audit(
            req.user.id,
            "BANK_ADJUSTMENT",
            `${citizen.name}: ${amount}`
        );

        return res.json({
            message:
                "Balance updated.",

            balance:
                newBalance
        });
    }
);


// ============================================================
// GOVERNMENT ROLE
// ============================================================

app.post(
    "/api/government/role",
    authRequired,
    requireGovernment,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const role =
            cleanText(
                req.body.role ||
                req.body.new_role,
                50
            ).toLowerCase();

        const allowedRoles = [
            "citizen",
            "police",
            "pilot",
            "atc",
            "government"
        ];

        if (
            !allowedRoles.includes(
                role
            )
        ) {
            return res.status(400).json({
                error:
                    "Invalid role."
            });
        }

        db.prepare(`
            UPDATE users
            SET role = ?
            WHERE id = ?
        `).run(
            role,
            citizen.id
        );

        if (
            role === "police"
        ) {
            ensurePoliceCallsign(
                citizen.id
            );
        }

        if (
            role === "pilot" ||
            role === "atc"
        ) {
            ensurePilotCallsign(
                citizen.id
            );
        }

        audit(
            req.user.id,
            "ROLE_CHANGED",
            `${citizen.name} changed to ${role}.`
        );

        const updated =
            db.prepare(`
                SELECT *
                FROM users
                WHERE id = ?
            `).get(
                citizen.id
            );

        return res.json({
            message:
                "Role updated.",

            user:
                serializeUser(
                    updated
                )
        });
    }
);


// ============================================================
// GOVERNMENT LICENSE MANAGEMENT
// ============================================================

app.post(
    "/api/government/license",
    authRequired,
    requireGovernment,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const licenseType =
            cleanText(
                req.body.license_type,
                100
            );

        const action =
            cleanText(
                req.body.action ||
                req.body.status,
                50
            ).toLowerCase();

        if (!licenseType) {
            return res.status(400).json({
                error:
                    "License type is required."
            });
        }

        if (
            [
                "grant",
                "approve",
                "active"
            ].includes(
                action
            )
        ) {
            db.prepare(`
                INSERT INTO licenses (
                    user_id,
                    license_type,
                    status,
                    issued_by,
                    issued_at,
                    revoked_at
                )
                VALUES (
                    ?, ?, 'active', ?,
                    CURRENT_TIMESTAMP,
                    NULL
                )
                ON CONFLICT(
                    user_id,
                    license_type
                )
                DO UPDATE SET
                    status = 'active',
                    issued_by =
                        excluded.issued_by,
                    issued_at =
                        CURRENT_TIMESTAMP,
                    revoked_at =
                        NULL
            `).run(
                citizen.id,
                licenseType,
                req.user.id
            );

            audit(
                req.user.id,
                "LICENSE_GRANTED",
                `${licenseType} granted to ${citizen.name}.`
            );

            return res.json({
                message:
                    "License granted."
            });
        }

        if (
            [
                "revoke",
                "revoked",
                "inactive"
            ].includes(
                action
            )
        ) {
            db.prepare(`
                INSERT INTO licenses (
                    user_id,
                    license_type,
                    status,
                    issued_by,
                    revoked_at
                )
                VALUES (
                    ?, ?, 'revoked', ?,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT(
                    user_id,
                    license_type
                )
                DO UPDATE SET
                    status = 'revoked',
                    revoked_at =
                        CURRENT_TIMESTAMP
            `).run(
                citizen.id,
                licenseType,
                req.user.id
            );

            audit(
                req.user.id,
                "LICENSE_REVOKED",
                `${licenseType} revoked from ${citizen.name}.`
            );

            return res.json({
                message:
                    "License revoked."
            });
        }

        return res.status(400).json({
            error:
                "Action must be grant or revoke."
        });
    }
);


// ============================================================
// LICENSE REQUESTS
// ============================================================

app.get(
    "/api/government/license-requests",
    authRequired,
    requireGovernment,
    (req, res) => {
        const requests =
            db.prepare(`
                SELECT
                    license_requests.*,
                    users.name,
                    users.email,
                    users.citizen_id
                FROM license_requests
                JOIN users
                    ON users.id =
                       license_requests.user_id
                WHERE license_requests.status =
                      'pending'
                ORDER BY license_requests.id DESC
            `).all();

        return res.json({
            requests
        });
    }
);


app.post(
    "/api/government/license-requests/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const id =
            Number(
                req.params.id
            );

        const action =
            cleanText(
                req.body.action ||
                req.body.status,
                50
            ).toLowerCase();

        const request =
            db.prepare(`
                SELECT *
                FROM license_requests
                WHERE id = ?
            `).get(
                id
            );

        if (!request) {
            return res.status(404).json({
                error:
                    "License request not found."
            });
        }

        if (
            request.status !==
            "pending"
        ) {
            return res.status(409).json({
                error:
                    "This request has already been reviewed."
            });
        }

        if (
            [
                "approve",
                "approved"
            ].includes(
                action
            )
        ) {
            db.transaction(() => {
                db.prepare(`
                    UPDATE license_requests
                    SET
                        status = 'approved',
                        reviewed_by = ?,
                        reviewed_at =
                            CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    req.user.id,
                    id
                );

                db.prepare(`
                    INSERT INTO licenses (
                        user_id,
                        license_type,
                        status,
                        issued_by,
                        issued_at
                    )
                    VALUES (
                        ?, ?, 'active', ?,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT(
                        user_id,
                        license_type
                    )
                    DO UPDATE SET
                        status = 'active',
                        issued_by =
                            excluded.issued_by,
                        issued_at =
                            CURRENT_TIMESTAMP,
                        revoked_at =
                            NULL
                `).run(
                    request.user_id,
                    request.license_type,
                    req.user.id
                );
            })();

            return res.json({
                message:
                    "License request approved."
            });
        }

        if (
            [
                "deny",
                "denied"
            ].includes(
                action
            )
        ) {
            db.prepare(`
                UPDATE license_requests
                SET
                    status = 'denied',
                    reviewed_by = ?,
                    reviewed_at =
                        CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                req.user.id,
                id
            );

            return res.json({
                message:
                    "License request denied."
            });
        }

        return res.status(400).json({
            error:
                "Action must be approve or deny."
        });
    }
);


// ============================================================
// GOVERNMENT PENAL CODES
// ============================================================

app.get(
    "/api/government/penal-codes",
    authRequired,
    requireGovernment,
    (req, res) => {
        const codes =
            db.prepare(`
                SELECT *
                FROM penal_codes
                ORDER BY code COLLATE NOCASE
            `).all();

        return res.json({
            codes,
            penal_codes:
                codes
        });
    }
);


app.post(
    "/api/government/penal-codes",
    authRequired,
    requireGovernment,
    (req, res) => {
        const code =
            cleanText(
                req.body.code,
                50
            );

        const title =
            cleanText(
                req.body.title,
                255
            );

        const description =
            cleanText(
                req.body.description,
                3000
            );

        const category =
            cleanText(
                req.body.category,
                100
            );

        const fine =
            money(
                req.body.fine ||
                0
            );

        const points =
            Number(
                req.body.points ||
                0
            );

        const jailTime =
            cleanText(
                req.body.jail_time,
                100
            );

        if (
            !code ||
            !title
        ) {
            return res.status(400).json({
                error:
                    "Code and title are required."
            });
        }

        try {
            const result =
                db.prepare(`
                    INSERT INTO penal_codes (
                        code,
                        title,
                        description,
                        category,
                        fine,
                        points,
                        jail_time,
                        created_by
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    code,
                    title,
                    description,
                    category,
                    fine,
                    Number.isFinite(points)
                        ? points
                        : 0,
                    jailTime,
                    req.user.id
                );

            const penalCode =
                db.prepare(`
                    SELECT *
                    FROM penal_codes
                    WHERE id = ?
                `).get(
                    Number(
                        result.lastInsertRowid
                    )
                );

            return res.status(201).json({
                message:
                    "Penal code added.",

                penal_code:
                    penalCode
            });

        } catch (error) {
            if (
                String(
                    error.message
                ).includes(
                    "UNIQUE"
                )
            ) {
                return res.status(409).json({
                    error:
                        "That penal code already exists."
                });
            }

            throw error;
        }
    }
);


app.delete(
    "/api/government/penal-codes/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const result =
            db.prepare(`
                DELETE FROM penal_codes
                WHERE id = ?
            `).run(
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "Penal code not found."
            });
        }

        return res.json({
            message:
                "Penal code deleted."
        });
    }
);


// ============================================================
// GOVERNMENT BOLOS
// ============================================================

app.get(
    "/api/government/bolos",
    authRequired,
    requireGovernment,
    (req, res) => {
        const bolos =
            db.prepare(`
                SELECT *
                FROM bolos
                ORDER BY id DESC
            `).all();

        return res.json({
            bolos
        });
    }
);


app.post(
    "/api/government/bolos",
    authRequired,
    requireGovernment,
    (req, res) => {
        const subject =
            cleanText(
                req.body.subject,
                255
            );

        const vehicle =
            cleanText(
                req.body.vehicle,
                255
            );

        const plate =
            cleanText(
                req.body.plate,
                100
            );

        const description =
            cleanText(
                req.body.description,
                3000
            );

        const reason =
            cleanText(
                req.body.reason,
                1500
            );

        if (!subject) {
            return res.status(400).json({
                error:
                    "BOLO subject is required."
            });
        }

        const result =
            db.prepare(`
                INSERT INTO bolos (
                    subject,
                    vehicle,
                    plate,
                    description,
                    reason,
                    status,
                    issued_by
                )
                VALUES (
                    ?, ?, ?, ?, ?,
                    'active',
                    ?
                )
            `).run(
                subject,
                vehicle,
                plate,
                description,
                reason,
                req.user.id
            );

        const bolo =
            db.prepare(`
                SELECT *
                FROM bolos
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        audit(
            req.user.id,
            "BOLO_CREATED",
            subject
        );

        return res.status(201).json({
            message:
                "BOLO created.",

            bolo
        });
    }
);


app.delete(
    "/api/government/bolos/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const result =
            db.prepare(`
                DELETE FROM bolos
                WHERE id = ?
            `).run(
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "BOLO not found."
            });
        }

        return res.json({
            message:
                "BOLO deleted."
        });
    }
);


// ============================================================
// GOVERNMENT WARRANTS
// ============================================================

app.get(
    "/api/government/warrants",
    authRequired,
    requireGovernment,
    (req, res) => {
        const warrants =
            db.prepare(`
                SELECT *
                FROM arrest_warrants
                ORDER BY id DESC
            `).all();

        return res.json({
            warrants
        });
    }
);


app.post(
    "/api/government/warrants",
    authRequired,
    requireGovernment,
    (req, res) => {
        const citizen =
            findUser(
                req.body.user_id ||
                req.body.subject
            );

        if (!citizen) {
            return res.status(404).json({
                error:
                    "Citizen not found."
            });
        }

        const reason =
            cleanText(
                req.body.reason,
                1500
            );

        const details =
            cleanText(
                req.body.details,
                3000
            );

        if (!reason) {
            return res.status(400).json({
                error:
                    "Warrant reason is required."
            });
        }

        const result =
            db.prepare(`
                INSERT INTO arrest_warrants (
                    user_id,
                    subject_name,
                    reason,
                    details,
                    status,
                    issued_by
                )
                VALUES (
                    ?, ?, ?, ?,
                    'active',
                    ?
                )
            `).run(
                citizen.id,
                citizen.name,
                reason,
                details,
                req.user.id
            );

        const warrant =
            db.prepare(`
                SELECT *
                FROM arrest_warrants
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        audit(
            req.user.id,
            "WARRANT_ISSUED",
            `${citizen.name}: ${reason}`
        );

        return res.status(201).json({
            message:
                "Arrest warrant issued.",

            warrant
        });
    }
);


app.delete(
    "/api/government/warrants/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const result =
            db.prepare(`
                DELETE FROM arrest_warrants
                WHERE id = ?
            `).run(
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "Warrant not found."
            });
        }

        return res.json({
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
    authRequired,
    requireGovernment,
    (req, res) => {
        const charts =
            db.prepare(`
                SELECT *
                FROM charts
                ORDER BY airport, id DESC
            `).all();

        return res.json({
            charts
        });
    }
);


app.post(
    "/api/government/charts",
    authRequired,
    requireGovernment,
    (req, res) => {
        const airport =
            cleanText(
                req.body.airport,
                100
            );

        const title =
            cleanText(
                req.body.title,
                255
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
            !title ||
            !url
        ) {
            return res.status(400).json({
                error:
                    "Airport, title and URL are required."
            });
        }

        if (
            !/^https?:\/\//i.test(
                url
            )
        ) {
            return res.status(400).json({
                error:
                    "Chart URL must start with http:// or https://."
            });
        }

        const result =
            db.prepare(`
                INSERT INTO charts (
                    airport,
                    title,
                    chart_type,
                    url,
                    created_by
                )
                VALUES (?, ?, ?, ?, ?)
            `).run(
                airport,
                title,
                chartType,
                url,
                req.user.id
            );

        const chart =
            db.prepare(`
                SELECT *
                FROM charts
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        return res.status(201).json({
            message:
                "Chart added.",

            chart
        });
    }
);


app.delete(
    "/api/government/charts/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const result =
            db.prepare(`
                DELETE FROM charts
                WHERE id = ?
            `).run(
                Number(
                    req.params.id
                )
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "Chart not found."
            });
        }

        return res.json({
            message:
                "Chart deleted."
        });
    }
);


// ============================================================
// GOVERNMENT AUDIT LOG
// ============================================================

app.get(
    "/api/government/audit",
    authRequired,
    requireGovernment,
    (req, res) => {
        const logs =
            db.prepare(`
                SELECT
                    audit_logs.id,
                    audit_logs.actor_id,
                    audit_logs.action,
                    audit_logs.description,
                    audit_logs.description
                        AS details,
                    audit_logs.created_at,
                    users.name
                        AS actor_name
                FROM audit_logs
                LEFT JOIN users
                    ON users.id =
                       audit_logs.actor_id
                ORDER BY audit_logs.id DESC
                LIMIT 200
            `).all();

        return res.json({
            logs,
            audit:
                logs
        });
    }
);


// ============================================================
// GOVERNMENT PASSCODE
// ============================================================

app.post(
    "/api/government/verify-passcode",
    authRequired,
    requireGovernment,
    (req, res) => {
        const passcode =
            String(
                req.body.passcode ||
                ""
            );

        if (
            !GOVERNMENT_PASSCODE
        ) {
            return res.status(503).json({
                error:
                    "Government passcode is not configured."
            });
        }

        if (
            passcode !==
            GOVERNMENT_PASSCODE
        ) {
            return res.status(401).json({
                error:
                    "Incorrect government passcode."
            });
        }

        return res.json({
            valid: true,

            message:
                "Government passcode verified."
        });
    }
);


// ============================================================
// API 404
// ============================================================

app.use(
    "/api",
    (req, res) => {
        return res.status(404).json({
            error:
                "API endpoint not found."
        });
    }
);


// ============================================================
// STATIC WEBSITE
// ============================================================

const PUBLIC_DIRECTORY =
    path.join(
        __dirname,
        "public"
    );

app.use(
    express.static(
        PUBLIC_DIRECTORY
    )
);


// ============================================================
// WEBSITE FALLBACK
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {
        if (
            req.method ===
            "GET"
        ) {
            const indexFile =
                path.join(
                    PUBLIC_DIRECTORY,
                    "index.html"
                );

            if (
                fs.existsSync(
                    indexFile
                )
            ) {
                return res.sendFile(
                    indexFile
                );
            }
        }

        next();
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
            "Unhandled server error:",
            error
        );

        if (
            res.headersSent
        ) {
            return next(
                error
            );
        }

        return res.status(500).json({
            error:
                "Internal server error."
        });
    }
);


// ============================================================
// HTTP + WEBSITE VOICE SERVER
// ============================================================

const httpServer =
    http.createServer(
        app
    );


// ============================================================
// BUILT-IN WEBSITE VOICE / POLICE RTO
// ============================================================

setupVoiceServer(
    httpServer,
    {
        JWT_SECRET,
        db
    }
);


// ============================================================
// START SERVER
// ============================================================

httpServer.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Group City Government Portal running on port ${PORT}`
        );

        console.log(
            `Database: ${DATABASE_PATH}`
        );

        console.log(
            "Group City Voice + Police RTO online."
        );
    }
);
