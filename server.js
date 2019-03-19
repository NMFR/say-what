// Run: GOOGLE_APPLICATION_CREDENTIALS="./google-auth.json" node server.js

const http = require("http");
const websocket = require("websocket");
const googleCloudSpeech = require("@google-cloud/speech");

const WebSocketServer = websocket.server;

const PORT = 1337;
// DEADLINE_EXCEEDED

const speechClient = new googleCloudSpeech.SpeechClient();

function createSpeechRecognizeStream() {
  return speechClient.streamingRecognize({
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "en-US"
    },
    interimResults: true
  });
}

function parseSpeechResults(data) {
  return ((data && data.results) || [])
    .filter(result => !!result)
    .map(result => {
      const isFinal = result.isFinal;
      const stability = result.stability;
      const alternatives = (result.alternatives || []).reduce((a, c) => {
        const aConfidence = (a && a.confidence) || 0;
        const cConfidence = (c && c.confidence) || 0;
        return a > c ? a : c;
      }, {});

      if (!alternatives.transcript) {
        return null;
      }

      return {
        isFinal,
        stability,
        text: alternatives.transcript,
        confidence: alternatives.confidence
      };
    })
    .filter(result => !!result);
}

function setupSpeechRecognizeStream({ onData, onError }) {
  return createSpeechRecognizeStream()
    .on("error", err => {
      console.error("google.error", err);
      console.error("google.error.name", err.name);
      console.error("google.error.code", err.code);
      console.error("google.error.message", err.message);

      onError(err);
    })
    .on("data", data => {
      console.log(
        "google.data",
        JSON.stringify(data),
        data.results[0] && data.results[0].alternatives[0]
          ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
          : `\n\nReached transcription time limit, press Ctrl+C\n`
      );

      const results = parseSpeechResults(data);

      console.log(results);

      onData(results);
    });
}

const server = http.createServer((request, response) => {
  console.log("New server request");
});

server.listen(PORT, () => {
  console.log(`Server started listening on port ${PORT}`);
});

const wsServer = new WebSocketServer({
  httpServer: server
});

wsServer.on("request", request => {
  console.log("New socket request");

  const connection = request.accept(null, request.origin);

  const onData = results => {
    (results || []).forEach(result => {
      connection.sendUTF(JSON.stringify(result));
    });
  };
  const onError = err => {
    console.log("Created new recognizeStream due to error");
    recognizeStream = setupSpeechRecognizeStream({ onData, onError });
  };

  let recognizeStream = setupSpeechRecognizeStream({ onData, onError });

  connection.on("message", data => {
    const buffer = new Int16Array(
      data.binaryData,
      0,
      Math.floor(data.byteLength / 2)
    );
    recognizeStream.write(buffer);
  });

  connection.on("close", connection => {
    console.log("Socket closed", connection);
    recognizeStream.end();
  });
});
