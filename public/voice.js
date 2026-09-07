const VOICE_SERVER =
    "https://group-city.onrender.com";

const RTC_CONFIG = {
    iceServers: [
        {
            urls:
                "stun:stun.l.google.com:19302"
        },
        {
            urls:
                "stun:stun1.l.google.com:19302"
        }
    ]
};

let voiceSocket = null;
let microphone = null;
let currentRoom = null;

let muted = false;
let deafened = false;

const peers =
    new Map();

const users =
    new Map();

const pendingIce =
    new Map();

function voiceToken() {
    return localStorage.getItem(
        "groupCityToken"
    );
}

function el(id) {
    return document.getElementById(
        id
    );
}

function setVoiceStatus(text) {
    if (
        el("voiceStatus")
    ) {
        el(
            "voiceStatus"
        ).textContent =
            text;
    }
}

function connectVoice() {
    if (
        voiceSocket?.connected
    ) {
        return voiceSocket;
    }

    const token =
        voiceToken();

    if (!token) {
        setVoiceStatus(
            "Please log in first."
        );

        return null;
    }

    voiceSocket =
        io(
            VOICE_SERVER,
            {
                auth: {
                    token
                }
            }
        );

    voiceSocket.on(
        "connect",
        () => {
            setVoiceStatus(
                "Voice system online."
            );
        }
    );

    voiceSocket.on(
        "connect_error",
        error => {
            setVoiceStatus(
                error.message
            );
        }
    );

    voiceSocket.on(
        "voice:counts",
        counts => {
            updateCount(
                "rtoCount",
                counts.rto
            );

            updateCount(
                "call911VoiceCount",
                counts["911"]
            );

            updateCount(
                "unicomCount",
                counts.unicom
            );

            updateCount(
                "westernCount",
                counts.western
            );

            updateCount(
                "easternCount",
                counts.eastern
            );
        }
    );

    voiceSocket.on(
        "voice:user-joined",
        data => {
            users.set(
                data.socket_id,
                {
                    ...data.user,
                    muted: false
                }
            );

            renderUsers();
        }
    );

    voiceSocket.on(
        "voice:user-left",
        data => {
            removePeer(
                data.socket_id
            );
        }
    );

    voiceSocket.on(
        "voice:offer",
        async data => {
            users.set(
                data.from,
                {
                    ...data.user,
                    muted: false
                }
            );

            const peer =
                createPeer(
                    data.from
                );

            await peer.setRemoteDescription(
                data.offer
            );

            await addPendingIce(
                data.from
            );

            const answer =
                await peer.createAnswer();

            await peer.setLocalDescription(
                answer
            );

            voiceSocket.emit(
                "voice:answer",
                {
                    target:
                        data.from,

                    answer:
                        peer.localDescription
                }
            );

            renderUsers();
        }
    );

    voiceSocket.on(
        "voice:answer",
        async data => {
            const peer =
                peers.get(
                    data.from
                );

            if (!peer) {
                return;
            }

            await peer.setRemoteDescription(
                data.answer
            );

            await addPendingIce(
                data.from
            );
        }
    );

    voiceSocket.on(
        "voice:ice",
        async data => {
            const peer =
                peers.get(
                    data.from
                );

            if (
                peer &&
                peer.remoteDescription
            ) {
                await peer.addIceCandidate(
                    data.candidate
                );

                return;
            }

            if (
                !pendingIce.has(
                    data.from
                )
            ) {
                pendingIce.set(
                    data.from,
                    []
                );
            }

            pendingIce
                .get(data.from)
                .push(
                    data.candidate
                );
        }
    );

    voiceSocket.on(
        "voice:mute-status",
        data => {
            const user =
                users.get(
                    data.socket_id
                );

            if (!user) {
                return;
            }

            user.muted =
                data.muted;

            renderUsers();
        }
    );

    return voiceSocket;
}

async function getMicrophone() {
    if (microphone) {
        return microphone;
    }

    microphone =
        await navigator.mediaDevices
            .getUserMedia({
                audio: {
                    echoCancellation:
                        true,

                    noiseSuppression:
                        true,

                    autoGainControl:
                        true
                },

                video: false
            });

    return microphone;
}

function createPeer(peerId) {
    if (
        peers.has(peerId)
    ) {
        return peers.get(
            peerId
        );
    }

    const peer =
        new RTCPeerConnection(
            RTC_CONFIG
        );

    peers.set(
        peerId,
        peer
    );

    if (microphone) {
        microphone
            .getTracks()
            .forEach(
                track => {
                    peer.addTrack(
                        track,
                        microphone
                    );
                }
            );
    }

    peer.onicecandidate =
        event => {
            if (
                event.candidate
            ) {
                voiceSocket.emit(
                    "voice:ice",
                    {
                        target:
                            peerId,

                        candidate:
                            event.candidate
                    }
                );
            }
        };

    peer.ontrack =
        event => {
            let audio =
                document.getElementById(
                    `voiceAudio-${peerId}`
                );

            if (!audio) {
                audio =
                    document.createElement(
                        "audio"
                    );

                audio.id =
                    `voiceAudio-${peerId}`;

                audio.autoplay =
                    true;

                audio.playsInline =
                    true;

                audio.style.display =
                    "none";

                document.body
                    .appendChild(
                        audio
                    );
            }

            audio.srcObject =
                event.streams[0];

            audio.muted =
                deafened;

            audio.play()
                .catch(
                    () => {}
                );
        };

    return peer;
}

async function createOffer(
    peerId
) {
    const peer =
        createPeer(
            peerId
        );

    const offer =
        await peer.createOffer();

    await peer.setLocalDescription(
        offer
    );

    voiceSocket.emit(
        "voice:offer",
        {
            target:
                peerId,

            offer:
                peer.localDescription
        }
    );
}

async function addPendingIce(
    peerId
) {
    const peer =
        peers.get(
            peerId
        );

    const candidates =
        pendingIce.get(
            peerId
        ) || [];

    for (
        const candidate
        of candidates
    ) {
        try {
            await peer.addIceCandidate(
                candidate
            );
        } catch (error) {
            console.error(error);
        }
    }

    pendingIce.delete(
        peerId
    );
}

async function joinVoiceRoom(
    room
) {
    try {
        const socket =
            connectVoice();

        if (!socket) {
            return;
        }

        setVoiceStatus(
            "Requesting microphone..."
        );

        await getMicrophone();

        if (!socket.connected) {
            await new Promise(
                resolve => {
                    socket.once(
                        "connect",
                        resolve
                    );
                }
            );
        }

        socket.emit(
            "voice:join",
            {
                room
            },

            async response => {
                if (
                    !response?.ok
                ) {
                    setVoiceStatus(
                        response?.error ||
                        "Unable to join."
                    );

                    return;
                }

                currentRoom =
                    room;

                users.clear();

                users.set(
                    socket.id,
                    {
                        ...response.user,
                        muted
                    }
                );

                for (
                    const participant
                    of response.participants
                ) {
                    users.set(
                        participant.socket_id,
                        {
                            ...participant,
                            muted: false
                        }
                    );

                    await createOffer(
                        participant.socket_id
                    );
                }

                showActiveVoice(
                    response.room
                );

                renderUsers();

                setVoiceStatus(
                    `Connected to ${response.room.name}`
                );
            }
        );

    } catch (error) {
        console.error(error);

        setVoiceStatus(
            "Microphone permission was denied or unavailable."
        );
    }
}

function showActiveVoice(
    room
) {
    const panel =
        el(
            "activeVoice"
        );

    if (panel) {
        panel.hidden =
            false;
    }

    if (
        el("activeVoiceName")
    ) {
        el(
            "activeVoiceName"
        ).textContent =
            room.name;
    }

    if (
        el("activeVoiceFrequency")
    ) {
        el(
            "activeVoiceFrequency"
        ).textContent =
            room.frequency
                ? `${room.frequency} MHz`
                : "";
    }
}

function toggleVoiceMute() {
    muted =
        !muted;

    if (microphone) {
        microphone
            .getAudioTracks()
            .forEach(
                track => {
                    track.enabled =
                        !muted;
                }
            );
    }

    voiceSocket?.emit(
        "voice:mute-status",
        {
            muted
        }
    );

    const me =
        users.get(
            voiceSocket?.id
        );

    if (me) {
        me.muted =
            muted;
    }

    if (
        el("voiceMuteBtn")
    ) {
        el(
            "voiceMuteBtn"
        ).textContent =
            muted
                ? "🎤 Unmute"
                : "🎤 Mute";
    }

    renderUsers();
}

function toggleVoiceDeafen() {
    deafened =
        !deafened;

    document
        .querySelectorAll(
            'audio[id^="voiceAudio-"]'
        )
        .forEach(
            audio => {
                audio.muted =
                    deafened;
            }
        );

    if (
        el("voiceDeafenBtn")
    ) {
        el(
            "voiceDeafenBtn"
        ).textContent =
            deafened
                ? "🔊 Undeafen"
                : "🔇 Deafen";
    }
}

function leaveVoiceRoom() {
    voiceSocket?.emit(
        "voice:leave",
        {}
    );

    peers.forEach(
        peer => {
            peer.close();
        }
    );

    peers.clear();
    users.clear();
    pendingIce.clear();

    document
        .querySelectorAll(
            'audio[id^="voiceAudio-"]'
        )
        .forEach(
            audio => {
                audio.remove();
            }
        );

    if (microphone) {
        microphone
            .getTracks()
            .forEach(
                track => {
                    track.stop();
                }
            );

        microphone =
            null;
    }

    currentRoom =
        null;

    muted =
        false;

    deafened =
        false;

    if (
        el("activeVoice")
    ) {
        el(
            "activeVoice"
        ).hidden =
            true;
    }

    renderUsers();

    setVoiceStatus(
        "Not connected."
    );
}

function removePeer(
    peerId
) {
    const peer =
        peers.get(
            peerId
        );

    if (peer) {
        peer.close();
    }

    peers.delete(
        peerId
    );

    users.delete(
        peerId
    );

    pendingIce.delete(
        peerId
    );

    document
        .getElementById(
            `voiceAudio-${peerId}`
        )
        ?.remove();

    renderUsers();
}

function renderUsers() {
    const container =
        el(
            "voiceUsers"
        );

    if (!container) {
        return;
    }

    if (
        users.size === 0
    ) {
        container.innerHTML =
            `<p class="muted">No users connected.</p>`;

        return;
    }

    container.innerHTML =
        Array.from(
            users.entries()
        )
            .map(
                ([
                    socketId,
                    user
                ]) => {

                    const you =
                        socketId ===
                        voiceSocket?.id;

                    return `
                        <div class="voice-user">
                            <div>
                                <strong>
                                    ${escapeVoice(
                                        user.display_name
                                    )}
                                </strong>

                                ${
                                    you
                                        ? "<small> (You)</small>"
                                        : ""
                                }

                                <div class="muted">
                                    ${escapeVoice(
                                        user.role
                                    )}
                                </div>
                            </div>

                            <span>
                                ${
                                    user.muted
                                        ? "🔇 Muted"
                                        : "🎙️ Connected"
                                }
                            </span>
                        </div>
                    `;
                }
            )
            .join("");
}

function updateCount(
    id,
    count
) {
    const element =
        el(id);

    if (element) {
        element.textContent =
            `${Number(
                count || 0
            )} connected`;
    }
}

function escapeVoice(value) {
    return String(
        value || ""
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

document.addEventListener(
    "DOMContentLoaded",
    () => {

        document
            .querySelectorAll(
                "[data-voice-room]"
            )
            .forEach(
                button => {
                    button.addEventListener(
                        "click",
                        () => {
                            joinVoiceRoom(
                                button.dataset.voiceRoom
                            );
                        }
                    );
                }
            );

        el(
            "voiceMuteBtn"
        )?.addEventListener(
            "click",
            toggleVoiceMute
        );

        el(
            "voiceDeafenBtn"
        )?.addEventListener(
            "click",
            toggleVoiceDeafen
        );

        el(
            "voiceLeaveBtn"
        )?.addEventListener(
            "click",
            leaveVoiceRoom
        );

        if (
            voiceToken()
        ) {
            connectVoice();
        }
    }
);

window.joinVoiceRoom =
    joinVoiceRoom;

window.leaveVoiceRoom =
    leaveVoiceRoom;
