const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

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


function setupVoiceServer(httpServer, options) {
    const {
        JWT_SECRET,
        db
    } = options;


    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: [
                "GET",
                "POST"
            ]
        }
    });


    // ============================================================
    // AUTHENTICATION
    // ============================================================

    io.use((socket, next) => {
        try {
            const token =
                socket.handshake.auth?.token;


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
                `).get(decoded.id);


            if (!user) {
                return next(
                    new Error(
                        "Account not found."
                    )
                );
            }


            socket.user = user;


            next();

        } catch (error) {
            next(
                new Error(
                    "Invalid login session."
                )
            );
        }
    });


    // ============================================================
    // USER IDENTITY
    // ============================================================
    //
    // IMPORTANT:
    //
    // We send BOTH callsigns to voice.js.
    //
    // voice.js will decide which one to display:
    //
    // 911 / RTO
    //      police_callsign
    //
    // UNICOM / WESTERN / EASTERN
    //      pilot_callsign
    //
    // ============================================================

    function identity(user) {
        return {
            id:
                user.id,

            name:
                user.name,

            role:
                user.role,


            // ====================================================
            // POLICE CALLSIGN
            // Example:
            // 1A-123
            // ====================================================

            police_callsign:
                user.police_callsign ||
                null,


            // ====================================================
            // PILOT CALLSIGN
            // Example:
            // GC-1234
            // ====================================================

            pilot_callsign:
                user.pilot_callsign ||
                null,


            // ====================================================
            // OLD CALLSIGN FIELD
            //
            // Keep this so older parts of your website
            // do not break.
            // ====================================================

            callsign:
                user.police_callsign ||
                user.pilot_callsign ||
                null,


            // ====================================================
            // DISPLAY NAME
            //
            // DO NOT put callsign here anymore.
            //
            // voice.js adds the correct callsign depending
            // on which voice channel you are connected to.
            // ====================================================

            display_name:
                user.name
        };
    }


    // ============================================================
    // GET PARTICIPANTS
    // ============================================================

    async function participants(room) {
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


    // ============================================================
    // SEND VOICE COUNTS
    // ============================================================

    async function sendCounts() {
        const counts = {};


        for (
            const room
            of Object.keys(VOICE_CHANNELS)
        ) {

            counts[room] =
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


    // ============================================================
    // LEAVE CURRENT ROOM
    // ============================================================

    async function leaveRoom(socket) {
        if (!socket.voiceRoom) {
            return;
        }


        const oldRoom =
            socket.voiceRoom;


        socket.leave(
            oldRoom
        );


        socket
            .to(oldRoom)
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


    // ============================================================
    // SOCKET CONNECTION
    // ============================================================

    io.on(
        "connection",
        socket => {


            // ====================================================
            // SEND AVAILABLE VOICE CHANNELS
            // ====================================================

            socket.emit(
                "voice:channels",
                VOICE_CHANNELS
            );


            sendCounts();


            // ====================================================
            // JOIN VOICE ROOM
            // ====================================================

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
                    // CHECK CHANNEL EXISTS
                    // =================================================

                    if (!channel) {
                        return callback?.({
                            ok: false,

                            error:
                                "Voice channel not found."
                        });
                    }


                    // =================================================
                    // POLICE RTO PERMISSION
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
                            ok: false,

                            error:
                                "Police RTO is restricted to police."
                        });

                    }


                    // =================================================
                    // LEAVE OLD ROOM FIRST
                    // =================================================

                    await leaveRoom(
                        socket
                    );


                    // =================================================
                    // GET PEOPLE ALREADY IN ROOM
                    // =================================================

                    const existing =
                        await participants(
                            room
                        );


                    // =================================================
                    // JOIN ROOM
                    // =================================================

                    socket.join(
                        room
                    );


                    socket.voiceRoom =
                        room;


                    // =================================================
                    // TELL OTHER PEOPLE THAT USER JOINED
                    // =================================================

                    socket
                        .to(room)
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
                    // SEND JOIN RESULT BACK TO USER
                    // =================================================

                    callback?.({
                        ok: true,

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


            // ====================================================
            // WEBRTC OFFER
            // ====================================================

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


            // ====================================================
            // WEBRTC ANSWER
            // ====================================================

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


            // ====================================================
            // WEBRTC ICE CANDIDATES
            // ====================================================

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


            // ====================================================
            // MUTE STATUS
            // ====================================================

            socket.on(
                "voice:mute-status",
                data => {

                    if (!socket.voiceRoom) {
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


            // ====================================================
            // LEAVE VOICE
            // ====================================================

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


            // ====================================================
            // DISCONNECT
            // ====================================================

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


    // ============================================================
    // RETURN SOCKET SERVER
    // ============================================================

    return io;
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    setupVoiceServer,
    VOICE_CHANNELS
};
