// Run: GOOGLE_APPLICATION_CREDENTIALS="./google-auth.json" node server.js

const http = require("http");
const websocket = require("websocket");
const googleCloudSpeech = require("@google-cloud/speech");

const WebSocketServer = websocket.server;

const PORT = 1337;

const speechClient = new googleCloudSpeech.SpeechClient();

let idGenerator = 1;
let socketConnections = [];

function broadcastMessage(data) {
  for (let i = 0; i < socketConnections.length; i += 1) {
    try {
      const socketConnection = socketConnections[i];
      socketConnection.connection.sendUTF(data);
    } catch (err) {
      console.log("broadcastMessage error", i, socketConnection.name, err);
    }
  }
}

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

      if (!isFinal && stability < 0.02) {
        return null;
      }

      const alternative = (result.alternatives || []).reduce((a, c) => {
        const aConfidence = (a && a.confidence) || 0;
        const cConfidence = (c && c.confidence) || 0;
        return a > c ? a : c;
      }, {});

      if (!alternative.transcript) {
        return null;
      }

      return {
        isFinal,
        stability,
        text: alternative.transcript.trim(),
        confidence: alternative.confidence
      };
    })
    .filter(result => !!result);
}

function setupSpeechRecognizeStream({ onData, onError }) {
  return createSpeechRecognizeStream()
    .on("data", data => {
      const results = parseSpeechResults(data);
      onData(results);
    })
    .on("error", err => {
      onError(err);
    });
}

const server = http.createServer((request, response) => {
  console.log("New server request");
});

server.listen(PORT,'0.0.0.0',() => {
  console.log(`Server started listening on port ${PORT}`);
});

const wsServer = new WebSocketServer({
  httpServer: server
});

wsServer.on("request", request => {
  const name = `user${idGenerator}`;
  const socketConnection = {
    id: name,
    name,
    connection: request.accept(null, request.origin),
    recognizeStream: null
  };
  socketConnections.push(socketConnection);
  console.log(
    "New socket request",
    socketConnection.id,
    socketConnections.map(s => s.name)
  );
  idGenerator += 1;

  const onData = results => {
    (results || []).forEach(result => {
      result.id = socketConnection.id;
      result.name = socketConnection.name;
      const json = JSON.stringify(result);
      broadcastMessage(json);
    });
  };
  const onError = err => {
    socketConnection.recognizeStream = null;
    console.log(
      "recognizeStream closed due to error",
      socketConnection.id,
      err.name,
      err.message
    );
  };

  socketConnection.connection.on("message", data => {
    if (data.type === "nameChange" && data.name) {
      socketConnection.name = data.name;
      return;
    }
    if (!socketConnection.recognizeStream) {
      socketConnection.recognizeStream = setupSpeechRecognizeStream({
        onData,
        onError
      });
      console.log("Created new recognizeStream for", socketConnection.id);
    }
    const buffer = new Int16Array(
      data.binaryData,
      0,
      Math.floor(data.byteLength / 2)
    );
    socketConnection.recognizeStream.write(buffer);
  });

  socketConnection.connection.on("close", () => {
    socketConnection.recognizeStream && socketConnection.recognizeStream.end();
    socketConnections = socketConnections.filter(
      c => c.id !== socketConnection.id
    );
    console.log(
      "Socket closed",
      socketConnection.id,
      socketConnections.map(s => s.name)
    );
  });
});
