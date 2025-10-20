import mongoose from 'mongoose';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import B2 from 'backblaze-b2';
import { router as bucketRoutes } from './routes/bucket.routes.js';
import { router as userRoutes } from './routes/users.routes.js';
import { router as groupRoutes } from './routes/group.routes.js';
import {router as livekitRoutes} from './routes/livekit.routes.js';
import { router as eventRoutes } from './routes/event.routes.js';
import { router as llmRoutes } from './routes/llm.routes.js';
import { WebSocketServer } from 'ws';
import { setUpAudioEgressSocketServer } from './services/audio/AudioTrackEgress.js';
import { setUpClientMessageSocket } from './services/ClientMessageSocket.js';

dotenv.config();

// Server
const app = express();
app.use(cors());
app.use(express.json());
const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Livekit webhook and egress vars
const wsAudioPath = '/audio-egress';
const wss = new WebSocketServer({ server: httpServer, path: wsAudioPath });

export const clients = [];

// WebSocket server for livekit audio track egress
wss.on('connection', (ws, req) => setUpAudioEgressSocketServer(ws, req));

// Socket connection for mobile clients
io.on('connection', (socket) => {
  console.log('New client connected');
  setUpClientMessageSocket(socket);
});

(async () => {
  try {
    // Conexión a MongoDB
    mongoose.connect(`mongodb+srv://babywise2025:${process.env.MONGO_PW}@babywise.aengkd2.mongodb.net/${process.env.MONGO_DB_NAME}?retryWrites=true&w=majority&appName=${process.env.MONGO_APP_NAME}`)
      .then(() => console.log("-> Conectado a MongoDB"))
      .catch((error) => console.log("-> Error de conexión a MongoDB:", error));

    // Start the HTTP server
    httpServer.listen(PORT, () => {
      console.log(`-> Server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error during server initialization:", error);
  }
})();

app.use(bucketRoutes);
app.use(userRoutes);
app.use(groupRoutes);
app.use(livekitRoutes);
app.use(eventRoutes);
app.use(llmRoutes);

export const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
});