(function () {

    // just place a div at top right
    var div = document.createElement('div');
    div.setAttribute("id", "typist-transcript");
    div.style.position = 'fixed';
    div.style.top = 0;
    div.style.right = 0;
    div.textContent = 'Injected!';
    document.body.appendChild(div);

    function findLastTranscript(containerDomElem, userId) {
        if (!containerDomElem) {
            return null;
        }

        const children = containerDomElem.children || [];
        for (let i = children.length - 1; i >= 0; i -= 1) {
            const child = children[i];
            const childUserId = child.getAttribute("userId");
            if (childUserId === userId) {
                return child;
            }
        }

        return null;
    }

    function addTranscript(containerDomElem, result) {
        if (
            containerDomElem &&
            result &&
            result.text &&
            (result.isFinal || result.stability > 0.05)
        ) {
            let last = findLastTranscript(containerDomElem, result.id);
            let lastIsFinal =
                last && last.className && last.className.indexOf("final") >= 0;

            const newElement = !last || lastIsFinal;
            if (newElement) {
                last = document.createElement("div");
                last.setAttribute("userId", result.id || "");
                containerDomElem.appendChild(last);
                lastIsFinal = false;
            }

            last.innerHTML = `${
                result.name ? `<span>${result.name}</span>` : ""
                }${result.text}`;
            if (result.isFinal) {
                last.className = "final";
            }
        }
    }

    function addTranscripts(containerDomElem, results) {
        if (containerDomElem && results && results.length) {
            let lastNotFinal = null;
            for (let i = 0; i < results.length; i += 1) {
                const result = results[i];
                if (!result.isFinal) {
                    lastNotFinal = result;
                } else {
                    addTranscript(containerDomElem, result);
                    lastNotFinal = null;
                }
            }

            if (lastNotFinal) {
                addTranscript(containerDomElem, lastNotFinal);
            }
        }
    }

    const transcriptContainer = document.getElementById("typist-transcript");

    const WebSocket = window.WebSocket || window.MozWebSocket;

    function createWebSocket() {
        const connection = new WebSocket("ws://35.246.228.54:80");

        connection.onopen = function () {
            console.log("onopen");
        };

        connection.onerror = function (error) {
            console.log("onerror", error);
        };

        connection.onmessage = function (message) {
            // console.log("onmessage", message);

            try {
                var json = JSON.parse(message.data);
                console.log(json);
                addTranscript(transcriptContainer, json);
            } catch (e) {
                console.log("This doesn't look like a valid JSON: ", message.data);

            }
        };

        return connection;
    }

    let socket = createWebSocket();

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    function getAudioStream() {
        return navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    googEchoCancellation: "false",
                    googAutoGainControl: "false",
                    googNoiseSuppression: "false",
                    googHighpassFilter: "false"
                }
            }
        });
    }

    function startRecording(stream) {
        const audioContext = new AudioContext();
        if (!audioContext) {
            return;
        }

        const inputPoint = audioContext.createGain();
        const microphone = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        const scriptProcessor = inputPoint.context.createScriptProcessor(
            2048,
            2,
            2
        );

        microphone.connect(inputPoint);
        inputPoint.connect(analyser);
        inputPoint.connect(scriptProcessor);
        scriptProcessor.connect(inputPoint.context.destination);
        // This is for registering to the “data” event of audio stream, without overwriting the default scriptProcessor.onAudioProcess function if there is one.
        scriptProcessor.addEventListener("audioprocess", onStreamAudioData);
    }

    const ConversionFactor = 2 ** (16 - 1) - 1; // 32767
    const onStreamAudioData = e => {
        const floatSamples = e.inputBuffer.getChannelData(0);
        if (socket && socket.readyState === socket.OPEN) {
            const intSamples = Int16Array.from(
                floatSamples.map(n => n * ConversionFactor)
            );
            socket.send(intSamples);
        }
    };

    async function main() {
        const stream = await getAudioStream();
        startRecording(stream);
    }

    main();

})();
