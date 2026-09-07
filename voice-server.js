const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");


// ============================================================
// VOICE CHANNELS
// ============================================================

const VOICE_CHANNELS = {

    rto: {
        id: "rto",
        name: "Police RTO",
        policeOnly: true
    },

    "911": {
        id: "911",
        name: "911 Emergency"
    },

    unicom: {
        id: "unicom",
        name: "UNICOM",
        frequency: "122.500"
    },

    western: {
        id: "western",
        name: "Western Center",
        frequency: "128.600"
    },

    eastern: {
        id: "eastern",
        name: "Eastern Center",
        frequency: "119.600"
    }

};


// ============================================================
// SETUP VOICE SERVER
// ============================================================

function setupVoiceServer(
    httpServer,
    options
) {

    const {
        JWT_SECRET,
        db
    } = options;


    const io =
        new Server(
            httpServer,
            {
                cors: {
                    origin: "*",

                    methods: [
                        "GET",
                        "POST"
                    ]
                }
            }
        );


    // ========================================================
    // GENERATE UNIQUE POLICE CALLSIGN
    // FORMAT: 1A-123
    // ========================================================

    function generatePoliceCallsign() {

        for (
            let attempt = 0;
            attempt < 1000;
            attempt++
        ) {

            const number =
                String(
                    Math.floor(
                        Math.random() *
                        999
                    ) + 1
                ).padStart(
                    3,
                    "0"
                );


            const callsign =
                `1A-${number}`;


            const existing =
                db.prepare(`
                    SELECT id
                    FROM users
                    WHERE police_callsign = ?
                    LIMIT 1
                `).get(
                    callsign
                );


            if (!existing) {
                return callsign;
            }
        }


        throw new Error(
            "Could not generate police callsign."
        );
    }


    // ========================================================
    // GENERATE UNIQUE PILOT CALLSIGN
    // FORMAT: GC-1234
    // ========================================================

    function generatePilotCallsign() {

        for (
            let attempt = 0;
            attempt < 1000;
            attempt++
        ) {

            const number =
                String(
                    Math.floor(
                        Math.random() *
                        9999
                    ) + 1
                ).padStart(
                    4,
                    "0"
                );


            const callsign =
                `GC-${number}`;


            const existing =
                db.prepare(`
                    SELECT id
                    FROM users
                    WHERE pilot_callsign = ?
                    LIMIT 1
                `).get(
                    callsign
                );


            if (!existing) {
                return callsign;
            }
        }


        throw new Error(
            "Could not generate pilot callsign."
        );
    }


    // ========================================================
    // ENSURE USER HAS REQUIRED CALLSIGNS
    // ========================================================

    function ensureUserCallsigns(
        user
    ) {

        // ====================================================
        // POLICE
        // ====================================================

        if (
            user.role === "police" &&
            !user.police_callsign
        ) {

            const callsign =
                generatePoliceCallsign();


            db.prepare(`
                UPDATE users
                SET police_callsign = ?
                WHERE id = ?
            `).run(
                callsign,
                user.id
            );


            user.police_callsign =
                callsign;
        }


        // ====================================================
        // PILOT
        // ====================================================

        if (
            user.role === "pilot" &&
            !user.pilot_callsign
        ) {

            const callsign =
                generatePilotCallsign();


            db.prepare(`
                UPDATE users
                SET pilot_callsign = ?
                WHERE id = ?
            `).run(
                callsign,
                user.id
            );


            user.pilot_callsign =
                callsign;
        }


        // ====================================================
        // ATC
        //
        // ATC also needs an aviation callsign.
        // ====================================================

        if (
            user.role === "atc" &&
            !user.pilot_callsign
        ) {

            const callsign =
                generatePilotCallsign();


            db.prepare(`
                UPDATE users
                SET pilot_callsign = ?
                WHERE id = ?
            `).run(
                callsign,
                user.id
            );


            user.pilot_callsign =
                callsign;
        }


        // ====================================================
        // GOVERNMENT
        //
        // Government gets BOTH:
        //
        // Police: 1A-123
        // Pilot:  GC-1234
        // ====================================================

        if (
            user.role === "government"
        ) {

            // ------------------------------------------------
            // POLICE CALLSIGN
            // ------------------------------------------------

            if (
                !user.police_callsign
            ) {

                const policeCallsign =
                    generatePoliceCallsign();


                db.prepare(`
                    UPDATE users
                    SET police_callsign = ?
                    WHERE id = ?
                `).run(
                    policeCallsign,
                    user.id
                );


                user.police_callsign =
                    policeCallsign;
            }


            // ------------------------------------------------
            // PILOT CALLSIGN
            // ------------------------------------------------

            if (
                !user.pilot_callsign
            ) {

                const pilotCallsign =
                    generatePilotCallsign();


                db.prepare(`
                    UPDATE users
                    SET pilot_callsign = ?
                    WHERE id = ?
                `).run(
                    pilotCallsign,
                    user.id
                );


                user.pilot_callsign =
                    pilotCallsign;
            }
        }


        return user;
    }


    // ========================================================
    // AUTHENTICATION
    // ========================================================

    io.use(
        (
            socket,
            next
        ) => {

            try {

                const token =
                    socket.handshake
                        .auth
                        ?.token;


                if (!token) {

                    return next(
                        new Error(
                            "Authentication required."
                        )
                    );

                }


                const decoded =
                    jwt.verify(
                        token,
                        JWT_SECRET
                    );


                const user =
                    db.prepare(`
                        SELECT
                            id,
                            name,
                            email,
                            citizen_id,
                            role,
                            police_callsign,
                            pilot_callsign
                        FROM users
                        WHERE id = ?
                    `).get(
                        decoded.id
                    );


                if (!user) {

                    return next(
                        new Error(
                            "Account not found."
                        )
                    );

                }


                // =================================================
                // MAKE SURE THE ACCOUNT HAS THE CORRECT CALLSIGNS
                // =================================================

                ensureUserCallsigns(
                    user
                );


                socket.user =
                    user;


                console.log(
                    "Voice login:",
                    user.name,
                    "Role:",
                    user.role,
                    "Police:",
                    user.police_callsign,
                    "Pilot:",
                    user.pilot_callsign
                );


                next();


            } catch (error) {

                console.error(
                    "Voice authentication error:",
                    error
                );


                next(
                    new Error(
                        "Invalid login session."
                    )
                );

            }

        }
    );


    // ========================================================
    // USER IDENTITY
    // ========================================================

    function identity(
        user
    ) {

        return {

            id:
                user.id,

            name:
                user.name,

            role:
                user.role,


            // =================================================
            // SEND POLICE CALLSIGN
            // =================================================

            police_callsign:
                user.police_callsign ||
                null,


            // =================================================
            // SEND PILOT CALLSIGN
            // =================================================

            pilot_callsign:
                user.pilot_callsign ||
                null,


            // =================================================
            // OLD FALLBACK CALLSIGN FIELD
            // =================================================

            callsign:
                user.police_callsign ||
                user.pilot_callsign ||
                null,


            // =================================================
            // NAME ONLY
            //
            // voice.js will add the correct callsign.
            // =================================================

            display_name:
                user.name

        };
    }


    // ========================================================
    // GET PARTICIPANTS
    // ========================================================

    async function participants(
        room
    ) {

        const sockets =
            await io
                .in(room)
                .fetchSockets();


        return sockets.map(
            socket => ({

                socket_id:
                    socket.id,

                ...identity(
                    socket.user
                )

            })
        );
    }


    // ========================================================
    // SEND COUNTS
    // ========================================================

    async function sendCounts() {

        const counts = {};


        for (
            const room
            of Object.keys(
                VOICE_CHANNELS
            )
        ) {

            counts[
                room
            ] =
                (
                    await io
                        .in(room)
                        .fetchSockets()
                ).length;

        }


        io.emit(
            "voice:counts",
            counts
        );
    }


    // ========================================================
    // LEAVE CURRENT ROOM
    // ========================================================

    async function leaveRoom(
        socket
    ) {

        if (
            !socket.voiceRoom
        ) {
            return;
        }


        const oldRoom =
            socket.voiceRoom;


        socket.leave(
            oldRoom
        );


        socket
            .to(
                oldRoom
            )
            .emit(
                "voice:user-left",
                {

                    socket_id:
                        socket.id

                }
            );


        socket.voiceRoom =
            null;


        await sendCounts();
    }


    // ========================================================
    // CONNECTION
    // ========================================================

    io.on(
        "connection",
        socket => {


            // =================================================
            // SEND CHANNELS
            // =================================================

            socket.emit(
                "voice:channels",
                VOICE_CHANNELS
            );


            sendCounts();


            // =================================================
            // JOIN CHANNEL
            // =================================================

            socket.on(
                "voice:join",
                async (
                    data,
                    callback
                ) => {


                    const room =
                        String(
                            data?.room ||
                            ""
                        );


                    const channel =
                        VOICE_CHANNELS[
                            room
                        ];


                    // =================================================
                    // INVALID ROOM
                    // =================================================

                    if (
                        !channel
                    ) {

                        return callback?.({

                            ok:
                                false,

                            error:
                                "Voice channel not found."

                        });

                    }


                    // =================================================
                    // POLICE RTO SECURITY
                    // =================================================

                    if (
                        channel.policeOnly &&
                        ![
                            "police",
                            "government"
                        ].includes(
                            socket.user.role
                        )
                    ) {

                        return callback?.({

                            ok:
                                false,

                            error:
                                "Police RTO is restricted to police."

                        });

                    }


                    // =================================================
                    // LEAVE OLD CHANNEL
                    // =================================================

                    await leaveRoom(
                        socket
                    );


                    // =================================================
                    // GET EXISTING USERS
                    // =================================================

                    const existing =
                        await participants(
                            room
                        );


                    // =================================================
                    // JOIN
                    // =================================================

                    socket.join(
                        room
                    );


                    socket.voiceRoom =
                        room;


                    // =================================================
                    // TELL EXISTING USERS
                    // =================================================

                    socket
                        .to(
                            room
                        )
                        .emit(
                            "voice:user-joined",
                            {

                                socket_id:
                                    socket.id,

                                user:
                                    identity(
                                        socket.user
                                    )

                            }
                        );


                    // =================================================
                    // RESPONSE
                    // =================================================

                    callback?.({

                        ok:
                            true,

                        room:
                            channel,

                        user:
                            identity(
                                socket.user
                            ),

                        participants:
                            existing

                    });


                    await sendCounts();

                }
            );


            // =================================================
            // WEBRTC OFFER
            // =================================================

            socket.on(
                "voice:offer",
                data => {

                    io.to(
                        data.target
                    ).emit(
                        "voice:offer",
                        {

                            from:
                                socket.id,

                            offer:
                                data.offer,

                            user:
                                identity(
                                    socket.user
                                )

                        }
                    );

                }
            );


            // =================================================
            // WEBRTC ANSWER
            // =================================================

            socket.on(
                "voice:answer",
                data => {

                    io.to(
                        data.target
                    ).emit(
                        "voice:answer",
                        {

                            from:
                                socket.id,

                            answer:
                                data.answer

                        }
                    );

                }
            );


            // =================================================
            // ICE
            // =================================================

            socket.on(
                "voice:ice",
                data => {

                    io.to(
                        data.target
                    ).emit(
                        "voice:ice",
                        {

                            from:
                                socket.id,

                            candidate:
                                data.candidate

                        }
                    );

                }
            );


            // =================================================
            // MUTE STATUS
            // =================================================

            socket.on(
                "voice:mute-status",
                data => {

                    if (
                        !socket.voiceRoom
                    ) {
                        return;
                    }


                    socket
                        .to(
                            socket.voiceRoom
                        )
                        .emit(
                            "voice:mute-status",
                            {

                                socket_id:
                                    socket.id,

                                muted:
                                    Boolean(
                                        data.muted
                                    )

                            }
                        );

                }
            );


            // =================================================
            // LEAVE
            // =================================================

            socket.on(
                "voice:leave",
                async (
                    data,
                    callback
                ) => {

                    await leaveRoom(
                        socket
                    );


                    callback?.({
                        ok: true
                    });

                }
            );


            // =================================================
            // DISCONNECT
            // =================================================

            socket.on(
                "disconnect",
                async () => {


                    if (
                        socket.voiceRoom
                    ) {

                        socket
                            .to(
                                socket.voiceRoom
                            )
                            .emit(
                                "voice:user-left",
                                {

                                    socket_id:
                                        socket.id

                                }
                            );

                    }


                    await sendCounts();

                }
            );

        }
    );


    return io;
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
    setupVoiceServer,
    VOICE_CHANNELS
};
