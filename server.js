// ============================================================
// GOVERNMENT PORTAL
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


// ============================================================
// CONFIGURATION
// ============================================================

const PORT =
    Number(process.env.PORT || 3000);

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


// ============================================================
// EXPRESS
// ============================================================

const app = express();

app.use(cors());

app.use(
    express.json({
        limit: "1mb"
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

`);


// ============================================================
// LICENSE TYPES
// ============================================================

const LICENSE_TYPES = [

    "Driver's License",

    "Pilot License",

    "Boating License",

    "Business License"

];


// ============================================================
// HELPER FUNCTIONS
// ============================================================

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


function getUserById(id) {

    return db.prepare(`

        SELECT

            id,

            email,

            name,

            citizen_id,

            role,

            police_points,

            created_at

        FROM users

        WHERE id = ?

    `).get(id);
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

        req.user.role !== "police" &&

        req.user.role !== "government"

    ) {

        return res.status(403).json({

            message:
                "Police access required."

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
        req.user.role !== "government"
    ) {

        return res.status(403).json({

            message:
                "Government access required."

        });

    }


    next();

}


function normalizeEmail(
    email
) {

    return String(
        email || ""
    )
        .trim()
        .toLowerCase();

}


function cleanText(
    value,
    maxLength = 255
) {

    return String(
        value || ""
    )
        .trim()
        .slice(
            0,
            maxLength
        );

}


// ============================================================
// INITIAL GOVERNMENT ACCOUNT
// ============================================================

function createInitialGovernment() {

    if (

        !ADMIN_PASSWORD ||

        ADMIN_PASSWORD === "CHANGE_ME"

    ) {

        console.warn(

            "WARNING: ADMIN_PASSWORD has not been configured."

        );

        return;

    }


    const normalizedAdminEmail =
        normalizeEmail(
            ADMIN_EMAIL
        );


    const existing =
        db.prepare(`

            SELECT id

            FROM users

            WHERE email = ?

        `).get(
            normalizedAdminEmail
        );


    // --------------------------------------------------------
    // ADMIN ALREADY EXISTS
    // --------------------------------------------------------

    if (existing) {

        db.prepare(`

            UPDATE users

            SET role = 'government'

            WHERE id = ?

        `).run(
            existing.id
        );


        console.log(

            `Government admin verified: ${ADMIN_EMAIL}`

        );


        return;

    }


    // --------------------------------------------------------
    // CREATE ADMIN
    // --------------------------------------------------------

    const passwordHash =
        bcrypt.hashSync(

            ADMIN_PASSWORD,

            12

        );


    const citizenId =
        generateCitizenId();


    const transaction =
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

                    normalizedAdminEmail,

                    passwordHash,

                    ADMIN_NAME,

                    citizenId

                );


            const userId =
                result.lastInsertRowid;


            const accountNumber =
                generateAccountNumber();


            const accountResult =
                db.prepare(`

                    INSERT INTO bank_accounts

                    (
                        user_id,
                        account_number,
                        balance
                    )

                    VALUES (?, ?, 0)

                `).run(

                    userId,

                    accountNumber

                );


            db.prepare(`

                INSERT INTO audit_logs

                (
                    actor_id,
                    action,
                    description
                )

                VALUES (?, ?, ?)

            `).run(

                userId,

                "INITIAL_GOVERNMENT",

                "Initial government administrator account created."

            );


            return {

                userId,

                accountId:
                    accountResult.lastInsertRowid

            };

        });


    transaction();


    console.log(

        `Initial government account created: ${ADMIN_EMAIL}`

    );

}


createInitialGovernment();


// ============================================================
// HEALTH CHECK
// ============================================================

app.get(

    "/api/health",

    (req, res) => {

        res.json({

            online: true,

            service:
                "Government Portal"

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
                req.body.password || ""
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


        const passwordHash =
            bcrypt.hashSync(

                password,

                12

            );


        const citizenId =
            generateCitizenId();


        try {

            const result =
                db.transaction(() => {

                    // ------------------------------------------------
                    // IMPORTANT:
                    // If the registered email matches ADMIN_EMAIL,
                    // the account becomes government.
                    // Otherwise it becomes citizen.
                    // ------------------------------------------------

                    const role =
                        email ===
                        normalizeEmail(
                            ADMIN_EMAIL
                        )
                            ? "government"
                            : "citizen";


                    const userResult =
                        db.prepare(`

                            INSERT INTO users

                            (
                                email,
                                password_hash,
                                name,
                                citizen_id,
                                role
                            )

                            VALUES (?, ?, ?, ?, ?)

                        `).run(

                            email,

                            passwordHash,

                            name,

                            citizenId,

                            role

                        );


                    const userId =
                        userResult.lastInsertRowid;


                    const accountNumber =
                        generateAccountNumber();


                    db.prepare(`

                        INSERT INTO bank_accounts

                        (
                            user_id,
                            account_number,
                            balance
                        )

                        VALUES (?, ?, 0)

                    `).run(

                        userId,

                        accountNumber

                    );


                    if (
                        role === "government"
                    ) {

                        createAudit(

                            userId,

                            "GOVERNMENT_ACCOUNT",

                            `${name} registered as the configured government administrator.`

                        );

                    }


                    return userId;

                })();


            const user =
                getUserById(
                    result
                );


            const token =
                createToken(
                    user
                );


            res.status(201).json({

                token,

                user

            });

        } catch (error) {

            console.error(error);


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
                req.body.password || ""
            );


        const user =
            db.prepare(`

                SELECT *

                FROM users

                WHERE email = ?

            `).get(email);


        if (!user) {

            return res.status(401).json({

                message:
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

                message:
                    "Invalid email or password."

            });

        }


        const safeUser =
            getUserById(
                user.id
            );


        const token =
            createToken(
                safeUser
            );


        res.json({

            token,

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
                req.user

        });

    }

);


// ============================================================
// USER INFORMATION
// ============================================================

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


        // --------------------------------------------------------
        // VALIDATION
        // --------------------------------------------------------

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


        if (
            amount > 1000000000
        ) {

            return res.status(400).json({

                message:
                    "Amount is too large."

            });

        }


        const transferAmount =
            Math.round(
                amount * 100
            ) / 100;


        // --------------------------------------------------------
        // SENDER
        // --------------------------------------------------------

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


        // --------------------------------------------------------
        // RECIPIENT
        //
        // Accepts:
        //
        // Email
        // Citizen ID
        // Bank account number
        // --------------------------------------------------------

        const normalizedRecipient =
            normalizeEmail(
                recipient
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

                    OR bank_accounts.account_number = ?

                LIMIT 1

            `).get(

                normalizedRecipient,

                recipient,

                recipient

            );


        if (!target) {

            return res.status(404).json({

                message:
                    "Recipient was not found."

            });

        }


        // --------------------------------------------------------
        // PREVENT SELF TRANSFER
        // --------------------------------------------------------

        if (
            target.id === req.user.id
        ) {

            return res.status(400).json({

                message:
                    "You cannot send money to yourself."

            });

        }


        // --------------------------------------------------------
        // CHECK BALANCE
        // --------------------------------------------------------

        if (

            senderAccount.balance <
            transferAmount

        ) {

            return res.status(400).json({

                message:
                    "Insufficient funds."

            });

        }


        // --------------------------------------------------------
        // TRANSFER
        // --------------------------------------------------------

        try {

            db.transaction(() => {

                // ----------------------------------------------
                // Remove money from sender
                // ----------------------------------------------

                db.prepare(`

                    UPDATE bank_accounts

                    SET balance =
                        balance - ?

                    WHERE id = ?

                `).run(

                    transferAmount,

                    senderAccount.id

                );


                // ----------------------------------------------
                // Add money to recipient
                // ----------------------------------------------

                db.prepare(`

                    UPDATE bank_accounts

                    SET balance =
                        balance + ?

                    WHERE id = ?

                `).run(

                    transferAmount,

                    target.account_id

                );


                // ----------------------------------------------
                // Sender transaction
                // ----------------------------------------------

                db.prepare(`

                    INSERT INTO transactions

                    (
                        account_id,
                        amount,
                        type,
                        description
                    )

                    VALUES (?, ?, ?, ?)

                `).run(

                    senderAccount.id,

                    -transferAmount,

                    "transfer",

                    `Sent $${transferAmount.toFixed(2)} to ${target.name}. ${description}`

                );


                // ----------------------------------------------
                // Recipient transaction
                // ----------------------------------------------

                db.prepare(`

                    INSERT INTO transactions

                    (
                        account_id,
                        amount,
                        type,
                        description
                    )

                    VALUES (?, ?, ?, ?)

                `).run(

                    target.account_id,

                    transferAmount,

                    "transfer",

                    `Received $${transferAmount.toFixed(2)} from ${req.user.name}. ${description}`

                );


                // ----------------------------------------------
                // Audit
                // ----------------------------------------------

                createAudit(

                    req.user.id,

                    "BANK_TRANSFER",

                    `${req.user.name} sent $${transferAmount.toFixed(2)} to ${target.name}.`

                );

            })();


            const updatedAccount =
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

                message:
                    "Money sent successfully.",

                recipient: {

                    name:
                        target.name,

                    citizen_id:
                        target.citizen_id

                },

                account:
                    updatedAccount

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


                    if (license) {

                        return license;

                    }


                    return {

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

                SELECT *

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

    "/api/police/citizen/:citizenId",

    requireAuth,

    requirePolice,

    (req, res) => {

        const citizen =
            db.prepare(`

                SELECT

                    id,

                    name,

                    citizen_id,

                    role,

                    police_points,

                    created_at

                FROM users

                WHERE id = ?

                OR citizen_id = ?

            `).get(

                req.params.citizenId,

                req.params.citizenId

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

                WHERE police_records.user_id = ?

                ORDER BY police_records.id DESC

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

        const citizenId =
            Number(
                req.body.citizen_id
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


        if (
            !Number.isInteger(
                citizenId
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid citizen ID."

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
            getUserById(
                citizenId
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

        const citizenId =
            Number(
                req.body.citizen_id
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


        if (
            !Number.isInteger(
                citizenId
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid citizen ID."

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
                    "Invalid points value."

            });

        }


        const citizen =
            getUserById(
                citizenId
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

                100

            );


        if (!search) {

            return res.json({

                users: []

            });

        }


        const like =
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

                    created_at

                FROM users

                WHERE

                    name LIKE ?

                    OR email LIKE ?

                    OR citizen_id LIKE ?

                ORDER BY id DESC

                LIMIT 50

            `).all(

                like,

                like,

                like

            );


        res.json({

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

        const userId =
            Number(
                req.body.user_id
            );


        const amount =
            Number(
                req.body.amount
            );


        const description =
            cleanText(

                req.body.description,

                255

            );


        if (
            !Number.isInteger(
                userId
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid user ID."

            });

        }


        if (

            !Number.isFinite(amount) ||

            amount === 0

        ) {

            return res.status(400).json({

                message:
                    "Amount must be a valid non-zero number."

            });

        }


        if (!description) {

            return res.status(400).json({

                message:
                    "Description is required."

            });

        }


        const account =
            db.prepare(`

                SELECT *

                FROM bank_accounts

                WHERE user_id = ?

            `).get(
                userId
            );


        const targetUser =
            getUserById(
                userId
            );


        if (

            !account ||

            !targetUser

        ) {

            return res.status(404).json({

                message:
                    "Citizen bank account not found."

            });

        }


        const newBalance =
            account.balance +
            amount;


        if (
            newBalance < 0
        ) {

            return res.status(400).json({

                message:
                    "This transaction would create a negative balance."

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

                VALUES (?, ?, ?, ?)

            `).run(

                account.id,

                amount,

                amount > 0
                    ? "deposit"
                    : "withdrawal",

                description

            );


            createAudit(

                req.user.id,

                "BANK_ACTION",

                `${req.user.name} changed ${targetUser.name}'s balance by $${amount}. ${description}`

            );

        })();


        res.json({

            message:
                "Bank transaction applied."

        });

    }

);


// ============================================================
// GOVERNMENT LICENSE MANAGEMENT
// ============================================================

app.post(

    "/api/government/license",

    requireAuth,

    requireGovernment,

    (req, res) => {

        const userId =
            Number(
                req.body.user_id
            );


        const licenseType =
            cleanText(

                req.body.license_type,

                100

            );


        const status =
            cleanText(

                req.body.status,

                30

            );


        if (
            !Number.isInteger(
                userId
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid user ID."

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

            status !== "active" &&

            status !== "revoked"

        ) {

            return res.status(400).json({

                message:
                    "Invalid license status."

            });

        }


        const user =
            getUserById(
                userId
            );


        if (!user) {

            return res.status(404).json({

                message:
                    "Citizen not found."

            });

        }


        const existing =
            db.prepare(`

                SELECT *

                FROM licenses

                WHERE user_id = ?

                AND license_type = ?

            `).get(

                userId,

                licenseType

            );


        if (existing) {

            if (
                status === "active"
            ) {

                db.prepare(`

                    UPDATE licenses

                    SET

                        status = 'active',

                        issued_by = ?,

                        issued_at =
                            CURRENT_TIMESTAMP,

                        revoked_at = NULL

                    WHERE id = ?

                `).run(

                    req.user.id,

                    existing.id

                );

            } else {

                db.prepare(`

                    UPDATE licenses

                    SET

                        status = 'revoked',

                        revoked_at =
                            CURRENT_TIMESTAMP

                    WHERE id = ?

                `).run(

                    existing.id

                );

            }

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

                VALUES (?, ?, ?, ?, ?)

            `).run(

                userId,

                licenseType,

                status,

                req.user.id,

                status === "active"
                    ? new Date().toISOString()
                    : null

            );

        }


        createAudit(

            req.user.id,

            "LICENSE_UPDATE",

            `${req.user.name} changed ${user.name}'s ${licenseType} status to ${status}.`

        );


        res.json({

            message:
                "License updated."

        });

    }

);


// ============================================================
// GOVERNMENT ROLE MANAGEMENT
// ============================================================

app.post(

    "/api/government/role",

    requireAuth,

    requireGovernment,

    (req, res) => {

        const userId =
            Number(
                req.body.user_id
            );


        const role =
            cleanText(

                req.body.role,

                30

            );


        const allowedRoles = [

            "citizen",

            "police",

            "government"

        ];


        if (
            !Number.isInteger(
                userId
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid user ID."

            });

        }


        if (
            !allowedRoles.includes(
                role
            )
        ) {

            return res.status(400).json({

                message:
                    "Invalid role."

            });

        }


        const targetUser =
            getUserById(
                userId
            );


        if (!targetUser) {

            return res.status(404).json({

                message:
                    "Citizen not found."

            });

        }


        db.prepare(`

            UPDATE users

            SET role = ?

            WHERE id = ?

        `).run(

            role,

            userId

        );


        createAudit(

            req.user.id,

            "ROLE_CHANGE",

            `${req.user.name} changed ${targetUser.name}'s role from ${targetUser.role} to ${role}.`

        );


        res.json({

            message:
                "User role updated."

        });

    }

);


// ============================================================
// GOVERNMENT AUDIT LOG
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

                    users.name AS actor_name

                FROM audit_logs

                LEFT JOIN users

                    ON users.id =
                        audit_logs.actor_id

                ORDER BY audit_logs.id DESC

                LIMIT 100

            `).all();


        res.json({

            audit

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

                    license_requests.id,

                    license_requests.license_type,

                    license_requests.status,

                    license_requests.government_note,

                    license_requests.created_at,

                    users.id AS user_id,

                    users.name AS user_name,

                    users.email,

                    users.citizen_id

                FROM license_requests

                INNER JOIN users

                    ON users.id =
                        license_requests.user_id

                ORDER BY license_requests.id DESC

                LIMIT 100

            `).all();


        res.json({

            requests

        });

    }

);


// ============================================================
// GOVERNMENT APPROVE / DENY LICENSE REQUEST
// ============================================================

app.post(

    "/api/government/license-requests/:id",

    requireAuth,

    requireGovernment,

    (req, res) => {

        const requestId =
            Number(
                req.params.id
            );


        const status =
            cleanText(

                req.body.status,

                30

            );


        const note =
            cleanText(

                req.body.note,

                500

            );


        if (

            status !== "approved" &&

            status !== "denied"

        ) {

            return res.status(400).json({

                message:
                    "Status must be approved or denied."

            });

        }


        const request =
            db.prepare(`

                SELECT *

                FROM license_requests

                WHERE id = ?

            `).get(
                requestId
            );


        if (!request) {

            return res.status(404).json({

                message:
                    "License request not found."

            });

        }


        if (
            request.status !== "pending"
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

                note,

                requestId

            );


            if (
                status === "approved"
            ) {

                const existing =
                    db.prepare(`

                        SELECT id

                        FROM licenses

                        WHERE user_id = ?

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

                            revoked_at = NULL

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
// 404 API
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
// FRONTEND
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

    (error, req, res, next) => {

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
            "Government Portal is running."
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
