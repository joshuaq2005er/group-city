require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();


// ============================================================
// CONFIGURATION
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
        process.env.ADMIN_EMAIL || ""
    )
        .trim()
        .toLowerCase();

const ADMIN_PASSWORD =
    String(
        process.env.ADMIN_PASSWORD || ""
    );

const ADMIN_NAME =
    String(
        process.env.ADMIN_NAME ||
        "Group City Government"
    ).trim();


// ============================================================
// DATABASE PATH
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
//
// IMPORTANT:
// There are deliberately NO // JavaScript comments inside
// the SQL string below.
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
// DATABASE MIGRATION HELPER
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


// ============================================================
// MIGRATIONS FOR EXISTING DATABASES
// ============================================================

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
    "emergency_calls",
    "details",
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
// GENERAL HELPERS
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

function normalizeEmail(value) {
    return cleanText(
        value,
        255
    ).toLowerCase();
}

function money(value) {
    return Math.round(
        Number(value) * 100
    ) / 100;
}

function randomDigits(length) {
    let result = "";

    for (
        let index = 0;
        index < length;
        index++
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
// CITIZEN ID
// ============================================================

function generateCitizenId() {
    for (
        let attempt = 0;
        attempt < 100;
        attempt++
    ) {
        const citizenId =
            `GC-${randomDigits(6)}`;

        const exists =
            db.prepare(`
                SELECT id
                FROM users
                WHERE citizen_id = ?
            `).get(
                citizenId
            );

        if (!exists) {
            return citizenId;
        }
    }

    throw new Error(
        "Unable to generate Government ID."
    );
}


// ============================================================
// BANK ACCOUNT NUMBER
// ============================================================

function generateAccountNumber() {
    for (
        let attempt = 0;
        attempt < 100;
        attempt++
    ) {
        const number =
            randomDigits(10);

        const exists =
            db.prepare(`
                SELECT id
                FROM bank_accounts
                WHERE account_number = ?
            `).get(
                number
            );

        if (!exists) {
            return number;
        }
    }

    throw new Error(
        "Unable to generate bank account."
    );
}


// ============================================================
// POLICE CALLSIGN
// ============================================================

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
            `).get(
                callsign
            );

        if (!exists) {
            return callsign;
        }
    }

    throw new Error(
        "Unable to generate police callsign."
    );
}


// ============================================================
// PILOT CALLSIGN
// ============================================================

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
            `).get(
                callsign
            );

        if (!exists) {
            return callsign;
        }
    }

    throw new Error(
        "Unable to generate pilot callsign."
    );
}


// ============================================================
// FIND USER
// ============================================================

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
        Number.isInteger(
            numericId
        ) &&
        numericId > 0
    ) {
        const byId =
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
                WHERE id = ?
                LIMIT 1
            `).get(
                numericId
            );

        if (byId) {
            return byId;
        }
    }

    const normalizedEmail =
        normalizeEmail(input);

    const user =
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
            WHERE citizen_id = ?
               OR email = ?
               OR LOWER(name) = LOWER(?)
            LIMIT 1
        `).get(
            input,
            normalizedEmail,
            input
        );

    return user || null;
}


// ============================================================
// USER SERIALIZER
// ============================================================

function serializeUser(user) {
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
                user.police_points || 0
            ),

        police_callsign:
            user.police_callsign || null,

        pilot_callsign:
            user.pilot_callsign || null,

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
// TOKEN
// ============================================================

function createToken(user) {
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
// AUTH MIDDLEWARE
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

    const token =
        authorization.slice(7);

    try {
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
                    "Account no longer exists."
            });
        }

        req.user = user;

        next();
    } catch {
        return res.status(401).json({
            error:
                "Your login session is invalid or expired."
        });
    }
}


// ============================================================
// ROLE MIDDLEWARE
// ============================================================

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
// ENSURE USER BANK
// ============================================================

function ensureBankAccount(userId) {
    let account =
        db.prepare(`
            SELECT *
            FROM bank_accounts
            WHERE user_id = ?
        `).get(
            userId
        );

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
            `).get(
                userId
            );
    }

    return account;
}


// ============================================================
// ENSURE CALLSIGNS
// ============================================================

function ensurePoliceCallsign(
    userId
) {
    let user =
        db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(
            userId
        );

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
    let user =
        db.prepare(`
            SELECT *
            FROM users
            WHERE id = ?
        `).get(
            userId
        );

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
// ADMIN BOOTSTRAP
// ============================================================

function createInitialAdmin() {
    if (
        !ADMIN_EMAIL ||
        !ADMIN_PASSWORD
    ) {
        console.log(
            "ADMIN_EMAIL or ADMIN_PASSWORD is not set. Skipping admin bootstrap."
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

        admin =
            db.prepare(`
                SELECT *
                FROM users
                WHERE id = ?
            `).get(
                Number(
                    result.lastInsertRowid
                )
            );

        console.log(
            "Initial government administrator created."
        );
    } else {
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
                `).get(
                    email
                );

            if (existing) {
                return res.status(409).json({
                    error:
                        "An account already exists with that email."
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

            const token =
                createToken(
                    user
                );

            return res.status(201).json({
                message:
                    "Account created.",

                token,

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

            if (!user) {
                return res.status(401).json({
                    error:
                        "Invalid email or password."
                });
            }

            const valid =
                bcrypt.compareSync(
                    password,
                    user.password_hash
                );

            if (!valid) {
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

            const token =
                createToken(
                    refreshed
                );

            return res.json({
                message:
                    "Login successful.",

                token,

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

            if (!recipientInput) {
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
                            ON users.id = bank_accounts.user_id
                        WHERE bank_accounts.account_number = ?
                        LIMIT 1
                    `).get(
                        recipientInput
                    );

                if (recipientAccount) {
                    recipient =
                        {
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

            if (!recipientAccount) {
                recipientAccount =
                    ensureBankAccount(
                        recipient.id
                    );
            }

            const transfer =
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
                        money(
                            freshSender.balance
                        ) < amount
                    ) {
                        throw new Error(
                            "Insufficient funds."
                        );
                    }

                    db.prepare(`
                        UPDATE bank_accounts
                        SET balance = balance - ?
                        WHERE id = ?
                    `).run(
                        amount,
                        senderAccount.id
                    );

                    db.prepare(`
                        UPDATE bank_accounts
                        SET balance = balance + ?
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

            transfer();

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
                "Insufficient funds."
            ) {
                return res.status(400).json({
                    error:
                        error.message
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
// LICENSE TYPES
// ============================================================

const DEFAULT_LICENSE_TYPES = [
    "Driver License",
    "Commercial Driver License",
    "Firearm License",
    "Pilot License",
    "Business License"
];


// ============================================================
// GET LICENSES
// ============================================================

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
            [...types].map(type => {
                const license =
                    byType.get(type);

                if (license) {
                    return license;
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
            });

        return res.json({
            licenses
        });
    }
);


// ============================================================
// REQUEST LICENSE
// ============================================================

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
                    "You already have a pending request for this license."
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
// POLICE CITIZEN SEARCH
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
                    officers.name AS officer_name,
                    officers.police_callsign AS officer_callsign
                FROM police_records
                LEFT JOIN users AS officers
                    ON officers.id = police_records.officer_id
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
// POLICE RECORD
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
                req.body.points || 0
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

            if (points > 0) {
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
// ACTIVE 911 CALLS
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
            calls
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
                    "An active 911 call already exists for this Discord user.",

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

        return res.json({
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
// BOLOS
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
                        users.name AS issued_by_name,
                        users.police_callsign AS issued_by_callsign
                    FROM bolos
                    LEFT JOIN users
                        ON users.id = bolos.issued_by
                    WHERE bolos.status = 'active'
                      AND (
                            bolos.subject LIKE ? COLLATE NOCASE
                         OR bolos.vehicle LIKE ? COLLATE NOCASE
                         OR bolos.plate LIKE ? COLLATE NOCASE
                         OR bolos.description LIKE ? COLLATE NOCASE
                         OR bolos.reason LIKE ? COLLATE NOCASE
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
                        users.name AS issued_by_name,
                        users.police_callsign AS issued_by_callsign
                    FROM bolos
                    LEFT JOIN users
                        ON users.id = bolos.issued_by
                    WHERE bolos.status = 'active'
                    ORDER BY bolos.id DESC
                `).all();
        }

        return res.json({
            bolos
        });
    }
);


// ============================================================
// CLEAR BOLO
// ============================================================

app.post(
    "/api/police/bolos/:id/clear",
    authRequired,
    requirePolice,
    (req, res) => {
        const id =
            Number(
                req.params.id
            );

        const result =
            db.prepare(`
                UPDATE bolos
                SET
                    status = 'cleared',
                    cleared_by = ?,
                    cleared_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'active'
            `).run(
                req.user.id,
                id
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
// WARRANTS
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
                        issuer.name AS issued_by_name
                    FROM arrest_warrants
                    LEFT JOIN users AS subject
                        ON subject.id = arrest_warrants.user_id
                    LEFT JOIN users AS issuer
                        ON issuer.id = arrest_warrants.issued_by
                    WHERE arrest_warrants.status = 'active'
                      AND (
                            arrest_warrants.subject_name LIKE ? COLLATE NOCASE
                         OR arrest_warrants.reason LIKE ? COLLATE NOCASE
                         OR arrest_warrants.details LIKE ? COLLATE NOCASE
                         OR subject.citizen_id LIKE ? COLLATE NOCASE
                         OR subject.email LIKE ? COLLATE NOCASE
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
                        issuer.name AS issued_by_name
                    FROM arrest_warrants
                    LEFT JOIN users AS subject
                        ON subject.id = arrest_warrants.user_id
                    LEFT JOIN users AS issuer
                        ON issuer.id = arrest_warrants.issued_by
                    WHERE arrest_warrants.status = 'active'
                    ORDER BY arrest_warrants.id DESC
                `).all();
        }

        return res.json({
            warrants
        });
    }
);


// ============================================================
// SERVE WARRANT
// ============================================================

app.post(
    "/api/police/warrants/:id/serve",
    authRequired,
    requirePolice,
    (req, res) => {
        const id =
            Number(
                req.params.id
            );

        const result =
            db.prepare(`
                UPDATE arrest_warrants
                SET
                    status = 'served',
                    served_by = ?,
                    served_at = CURRENT_TIMESTAMP
                WHERE id = ?
                  AND status = 'active'
            `).run(
                req.user.id,
                id
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

        if (
            airport &&
            airport.toLowerCase() !==
                "all"
        ) {
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
// ACTIVE PILOT FLIGHT PLAN
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
                flightPlan || null,

            flightPlan:
                flightPlan || null
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

        let callsign =
            cleanText(
                req.body.callsign,
                20
            ).toUpperCase();

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

        const existing =
            db.prepare(`
                SELECT id
                FROM flight_plans
                WHERE user_id = ?
                  AND status = 'active'
                LIMIT 1
            `).get(
                req.user.id
            );

        if (existing) {
            return res.status(409).json({
                error:
                    "You already have an active flight plan."
            });
        }

        if (!callsign) {
            callsign =
                ensurePilotCallsign(
                    req.user.id
                );
        }

        if (
            !/^GC-\d{4}$/.test(
                callsign
            )
        ) {
            return res.status(400).json({
                error:
                    "Pilot callsign must use GC- followed by exactly 4 numbers."
            });
        }

        const usedByUser =
            db.prepare(`
                SELECT id
                FROM users
                WHERE pilot_callsign = ?
                  AND id != ?
            `).get(
                callsign,
                req.user.id
            );

        if (usedByUser) {
            return res.status(409).json({
                error:
                    "That callsign belongs to another pilot."
            });
        }

        const activeCallsign =
            db.prepare(`
                SELECT id
                FROM flight_plans
                WHERE callsign = ?
                  AND status = 'active'
                  AND user_id != ?
            `).get(
                callsign,
                req.user.id
            );

        if (activeCallsign) {
            return res.status(409).json({
                error:
                    "That callsign is currently in use."
            });
        }

        db.prepare(`
            UPDATE users
            SET pilot_callsign = ?
            WHERE id = ?
        `).run(
            callsign,
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
            `).run(
                req.user.id,
                callsign,
                departure,
                arrival,
                aircraft,
                route || null,
                altitude || null,
                remarks || null
            );

        const plan =
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

            callsign,

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
    authRequired,
    requirePilot,
    (req, res) => {
        const result =
            db.prepare(`
                UPDATE flight_plans
                SET
                    status = 'cancelled',
                    cancelled_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
                  AND status = 'active'
            `).run(
                req.user.id
            );

        if (
            result.changes === 0
        ) {
            return res.status(404).json({
                error:
                    "You do not have an active flight plan."
            });
        }

        return res.json({
            message:
                "Flight plan cancelled."
        });
    }
);


// ============================================================
// ATC ACTIVE FLIGHT PLANS
// ============================================================

app.get(
    "/api/atc/flight-plans",
    authRequired,
    requireATC,
    (req, res) => {
        const plans =
            db.prepare(`
                SELECT
                    flight_plans.*,
                    users.name AS pilot_name,
                    users.citizen_id,
                    users.email
                FROM flight_plans
                JOIN users
                    ON users.id = flight_plans.user_id
                WHERE flight_plans.status = 'active'
                ORDER BY flight_plans.id DESC
            `).all();

        return res.json({
            flight_plans:
                plans,

            flightPlans:
                plans
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

        if (!search) {
            return res.json({
                users: []
            });
        }

        const wildcard =
            `%${search}%`;

        const users =
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
                WHERE name LIKE ? COLLATE NOCASE
                   OR email LIKE ? COLLATE NOCASE
                   OR citizen_id LIKE ? COLLATE NOCASE
                ORDER BY name COLLATE NOCASE ASC
                LIMIT 50
            `).all(
                wildcard,
                wildcard,
                wildcard
            );

        return res.json({
            users
        });
    }
);


// ============================================================
// GOVERNMENT MONEY LEADERBOARD
// ============================================================

function moneyLeaderboardHandler(
    req,
    res
) {
    const users =
        db.prepare(`
            SELECT
                users.id,
                users.name,
                users.email,
                users.citizen_id,
                users.role,
                bank_accounts.account_number,
                bank_accounts.balance
            FROM users
            JOIN bank_accounts
                ON bank_accounts.user_id = users.id
            ORDER BY bank_accounts.balance DESC
            LIMIT 100
        `).all();

    return res.json({
        users,
        leaderboard:
            users
    });
}

app.get(
    "/api/government/money-leaderboard",
    authRequired,
    requireGovernment,
    moneyLeaderboardHandler
);

app.get(
    "/api/government/money",
    authRequired,
    requireGovernment,
    moneyLeaderboardHandler
);


// ============================================================
// GOVERNMENT BANK ACTION
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

        const description =
            cleanText(
                req.body.description ||
                "Government bank adjustment",
                1000
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

        if (newBalance < 0) {
            return res.status(400).json({
                error:
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
                INSERT INTO transactions (
                    account_id,
                    amount,
                    type,
                    description
                )
                VALUES (?, ?, 'government_adjustment', ?)
            `).run(
                account.id,
                amount,
                description
            );

            audit(
                req.user.id,
                "BANK_ADJUSTMENT",
                `${req.user.name} adjusted ${citizen.name}'s bank balance by ${amount}. ${description}`
            );
        })();

        return res.json({
            message:
                "Bank balance updated.",

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
            ].includes(action)
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
                    ?,
                    ?,
                    'active',
                    ?,
                    CURRENT_TIMESTAMP,
                    NULL
                )
                ON CONFLICT(user_id, license_type)
                DO UPDATE SET
                    status = 'active',
                    issued_by = excluded.issued_by,
                    issued_at = CURRENT_TIMESTAMP,
                    revoked_at = NULL
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
                "revoked"
            ].includes(action)
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
                    ?,
                    ?,
                    'revoked',
                    ?,
                    CURRENT_TIMESTAMP
                )
                ON CONFLICT(user_id, license_type)
                DO UPDATE SET
                    status = 'revoked',
                    revoked_at = CURRENT_TIMESTAMP
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

        if (
            [
                "remove",
                "delete"
            ].includes(action)
        ) {
            db.prepare(`
                DELETE FROM licenses
                WHERE user_id = ?
                  AND license_type = ?
            `).run(
                citizen.id,
                licenseType
            );

            audit(
                req.user.id,
                "LICENSE_REMOVED",
                `${licenseType} removed from ${citizen.name}.`
            );

            return res.json({
                message:
                    "License removed."
            });
        }

        return res.status(400).json({
            error:
                "Invalid license action."
        });
    }
);


// ============================================================
// GOVERNMENT ROLE ACTION
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

        let policeCallsign =
            citizen.police_callsign;

        let pilotCallsign =
            citizen.pilot_callsign;

        if (
            role === "police" ||
            role === "government"
        ) {
            policeCallsign =
                ensurePoliceCallsign(
                    citizen.id
                );
        }

        if (
            role === "pilot" ||
            role === "atc" ||
            role === "government"
        ) {
            pilotCallsign =
                ensurePilotCallsign(
                    citizen.id
                );
        }

        audit(
            req.user.id,
            "ROLE_CHANGED",
            `${citizen.name}'s role changed to ${role}.`
        );

        return res.json({
            message:
                "Role updated.",

            role,

            police_callsign:
                policeCallsign,

            pilot_callsign:
                pilotCallsign
        });
    }
);


// ============================================================
// GOVERNMENT LICENSE REQUESTS
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
                    users.name AS user_name,
                    users.email,
                    users.citizen_id
                FROM license_requests
                JOIN users
                    ON users.id = license_requests.user_id
                WHERE license_requests.status = 'pending'
                ORDER BY license_requests.id ASC
            `).all();

        return res.json({
            requests
        });
    }
);


// ============================================================
// REVIEW LICENSE REQUEST
// ============================================================

app.post(
    "/api/government/license-requests/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const requestId =
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
                SELECT
                    license_requests.*,
                    users.name AS user_name
                FROM license_requests
                JOIN users
                    ON users.id = license_requests.user_id
                WHERE license_requests.id = ?
                  AND license_requests.status = 'pending'
            `).get(
                requestId
            );

        if (!request) {
            return res.status(404).json({
                error:
                    "Pending license request not found."
            });
        }

        if (
            action === "approve" ||
            action === "approved"
        ) {
            db.transaction(() => {
                db.prepare(`
                    UPDATE license_requests
                    SET
                        status = 'approved',
                        reviewed_by = ?,
                        reviewed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(
                    req.user.id,
                    requestId
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
                        ?,
                        ?,
                        'active',
                        ?,
                        CURRENT_TIMESTAMP
                    )
                    ON CONFLICT(user_id, license_type)
                    DO UPDATE SET
                        status = 'active',
                        issued_by = excluded.issued_by,
                        issued_at = CURRENT_TIMESTAMP,
                        revoked_at = NULL
                `).run(
                    request.user_id,
                    request.license_type,
                    req.user.id
                );

                audit(
                    req.user.id,
                    "LICENSE_REQUEST_APPROVED",
                    `${request.license_type} request approved for ${request.user_name}.`
                );
            })();

            return res.json({
                message:
                    "License request approved."
            });
        }

        if (
            action === "deny" ||
            action === "denied"
        ) {
            db.prepare(`
                UPDATE license_requests
                SET
                    status = 'denied',
                    reviewed_by = ?,
                    reviewed_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(
                req.user.id,
                requestId
            );

            audit(
                req.user.id,
                "LICENSE_REQUEST_DENIED",
                `${request.license_type} request denied for ${request.user_name}.`
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
// GOVERNMENT PENAL CODE MANAGEMENT
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
        try {
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
                Math.max(
                    0,
                    money(
                        req.body.fine || 0
                    )
                );

            const points =
                Math.max(
                    0,
                    Math.floor(
                        Number(
                            req.body.points || 0
                        )
                    )
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
                    description || null,
                    category || null,
                    fine,
                    points,
                    jailTime || null,
                    req.user.id
                );

            audit(
                req.user.id,
                "PENAL_CODE_CREATED",
                `${code} - ${title}`
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
                    "Penal code created.",

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

            console.error(
                "Create penal code:",
                error
            );

            return res.status(500).json({
                error:
                    "Unable to create penal code."
            });
        }
    }
);

app.delete(
    "/api/government/penal-codes/:id",
    authRequired,
    requireGovernment,
    (req, res) => {
        const id =
            Number(
                req.params.id
            );

        const code =
            db.prepare(`
                SELECT *
                FROM penal_codes
                WHERE id = ?
            `).get(
                id
            );

        if (!code) {
            return res.status(404).json({
                error:
                    "Penal code not found."
            });
        }

        db.prepare(`
            DELETE FROM penal_codes
            WHERE id = ?
        `).run(
            id
        );

        audit(
            req.user.id,
            "PENAL_CODE_DELETED",
            `${code.code} - ${code.title}`
        );

        return res.json({
            message:
                "Penal code deleted."
        });
    }
);


// ============================================================
// GOVERNMENT BOLOS
// ============================================================

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
                2000
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
                VALUES (?, ?, ?, ?, ?, 'active', ?)
            `).run(
                subject,
                vehicle || null,
                plate || null,
                description || null,
                reason || null,
                req.user.id
            );

        audit(
            req.user.id,
            "BOLO_CREATED",
            `BOLO created for ${subject}.`
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
        const id =
            Number(
                req.params.id
            );

        const bolo =
            db.prepare(`
                SELECT *
                FROM bolos
                WHERE id = ?
            `).get(
                id
            );

        if (!bolo) {
            return res.status(404).json({
                error:
                    "BOLO not found."
            });
        }

        db.prepare(`
            DELETE FROM bolos
            WHERE id = ?
        `).run(
            id
        );

        audit(
            req.user.id,
            "BOLO_DELETED",
            `BOLO deleted for ${bolo.subject}.`
        );

        return res.json({
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
                VALUES (?, ?, ?, ?, 'active', ?)
            `).run(
                citizen.id,
                citizen.name,
                reason,
                details || null,
                req.user.id
            );

        audit(
            req.user.id,
            "WARRANT_ISSUED",
            `Arrest warrant issued for ${citizen.name}: ${reason}`
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
        const id =
            Number(
                req.params.id
            );

        const warrant =
            db.prepare(`
                SELECT *
                FROM arrest_warrants
                WHERE id = ?
            `).get(
                id
            );

        if (!warrant) {
            return res.status(404).json({
                error:
                    "Warrant not found."
            });
        }

        db.prepare(`
            DELETE FROM arrest_warrants
            WHERE id = ?
        `).run(
            id
        );

        audit(
            req.user.id,
            "WARRANT_DELETED",
            `Warrant deleted for ${warrant.subject_name}.`
        );

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
                    "Chart URL must begin with http:// or https://."
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
                chartType || null,
                url,
                req.user.id
            );

        audit(
            req.user.id,
            "CHART_ADDED",
            `${title} added for ${airport}.`
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
        const id =
            Number(
                req.params.id
            );

        const chart =
            db.prepare(`
                SELECT *
                FROM charts
                WHERE id = ?
            `).get(
                id
            );

        if (!chart) {
            return res.status(404).json({
                error:
                    "Chart not found."
            });
        }

        db.prepare(`
            DELETE FROM charts
            WHERE id = ?
        `).run(
            id
        );

        audit(
            req.user.id,
            "CHART_DELETED",
            `${chart.title} deleted from ${chart.airport}.`
        );

        return res.json({
            message:
                "Chart deleted."
        });
    }
);


// ============================================================
// GOVERNMENT AUDIT
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
                    audit_logs.description AS details,
                    audit_logs.created_at,
                    users.name AS actor_name
                FROM audit_logs
                LEFT JOIN users
                    ON users.id = audit_logs.actor_id
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
// GOVERNMENT PASSCODE VERIFICATION
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
                    "Government passcode has not been configured."
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
// STATIC FRONTEND
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
// FRONTEND FALLBACK
// ============================================================

app.use(
    (req, res, next) => {
        if (
            req.method === "GET"
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
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Group City Government Portal running on port ${PORT}`
        );

        console.log(
            `Database: ${DATABASE_PATH}`
        );
    }
);
