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

    function identity(user) {
        let callsign = null;

        if (
            user.role === "police" ||
            user.role === "government"
        ) {
            callsign =
                user.police_callsign ||
                null;
        }

        if (
            !callsign &&
            (
                user.role === "pilot" ||
                user.role === "atc"
            )
        ) {
            callsign =
                user.pilot_callsign ||
                null;
        }

        return {
            id: user.id,
            name: user.name,
            role: user.role,
            callsign,
            display_name:
                callsign
                    ? `${callsign} | ${user.name}`
                    : user.name
        };
    }

    async function participants(room) {
        const sockets =
            await io
                .in(room)
                .fetchSockets();

        return sockets.map(
            socket => ({
                socket_id: socket.id,
                ...identity(socket.user)
            })
        );
    }

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

    async function leaveRoom(socket) {
        if (!socket.voiceRoom) {
            return;
        }

        const oldRoom =
            socket.voiceRoom;

        socket.leave(oldRoom);

        socket
            .to(oldRoom)
            .emit(
                "voice:user-left",
                {
                    socket_id:
                        socket.id
                }
            );

        socket.voiceRoom = null;

        await sendCounts();
    }

    io.on(
        "connection",
        socket => {

            socket.emit(
                "voice:channels",
                VOICE_CHANNELS
            );

            sendCounts();

            socket.on(
                "voice:join",
                async (
                    data,
                    callback
                ) => {
                    const room =
                        String(
                            data?.room || ""
                        );

                    const channel =
                        VOICE_CHANNELS[room];

                    if (!channel) {
                        return callback?.({
                            ok: false,
                            error:
                                "Voice channel not found."
                        });
                    }

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

                    await leaveRoom(socket);

                    const existing =
                        await participants(room);

                    socket.join(room);

                    socket.voiceRoom =
                        room;

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

                    callback?.({
                        ok: true,
                        room: channel,
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

module.exports = {
    setupVoiceServer,
    VOICE_CHANNELS
};
