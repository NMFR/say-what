// Run:
// GOOGLE_APPLICATION_CREDENTIALS="./google-auth.json" node server.js

var http = require("http");
var websocket = require("websocket");
const googleCloudSpeech = require("@google-cloud/speech");

var WebSocketServer = websocket.server;

var server = http.createServer(function(request, response) {
  // process HTTP request. Since we're writing just WebSockets
  // server we don't have to implement anything.
  console.log("server request");
});
server.listen(1337, function() {
  console.log("server started");
});

// create the server
wsServer = new WebSocketServer({
  httpServer: server
});

// WebSocket server
wsServer.on("request", function(request) {
  console.log("socket started");

  const speechClient = new googleCloudSpeech.SpeechClient();

  // Create a recognize stream
  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 16000,
        languageCode: "en-US"
      },
      interimResults: true // If you want interim results, set this to true
    })
    .on("error", console.error)
    .on("data", data =>
      process.stdout.write(
        data.results[0] && data.results[0].alternatives[0]
          ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
          : `\n\nReached transcription time limit, press Ctrl+C\n`
      )
    );

  var connection = request.accept(null, request.origin);

  // This is the most important callback for us, we'll handle
  // all messages from users here.
  connection.on("message", function(data) {
    const buffer = new Int16Array(
      data.binaryData,
      0,
      Math.floor(data.byteLength / 2)
    );
    //const buffer = Int16Array.from(data);
    //const buffer = data;
    //console.log(data);
    //console.log(buffer[0], buffer[1]);
    // Write the data chunk in the stream
    recognizeStream.write(buffer);
    // console.log("socket message");
    // const buffer = new Int16Array(
    //   message,
    //   0,
    //   Math.floor(message.byteLength / 2)
    // );
    // // const buffer = new Float32Array(message);
    // // console.log(message);
    // // console.log(JSON.stringify(message));
    // // console.log(buffer);
    // // console.log(buffer[0], buffer[1]);
    // recognizeStream.write(message);
  });

  connection.on("close", function(connection) {
    console.log("socket close", connection);
    recognizeStream.end();
    // close user connection
  });
});
