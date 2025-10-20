import { AccessToken, AgentDispatchClient , WebhookReceiver, EgressClient, TrackType } from 'livekit-server-sdk';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { s3Client } from './bucket.controller.js';
import dotenv from 'dotenv';
import { updateCameraStatus } from './group.controller.js';

dotenv.config();

const TOGGLE_AUDIO_TRACK_EGRESS = false;
const TOGGLE_S3_HLS_EGRESS = true;
const TOGGLE_AGENT_DISPATCH = true;

// Livekit vars
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;
const livekitHost = process.env.LIVEKIT_URL;
const livekitEgressUrl = 'https://' + livekitHost;
const receiver = new WebhookReceiver(apiKey, apiSecret);
const egressClient = new EgressClient(livekitEgressUrl, apiKey, apiSecret);
const wsAudioPath = '/audio-egress';

// Cloudflare R2 client


function dispatchAudioTrackEgress(event) {
    console.log('[Webhook] Evento track_published de cámara detectado');
    const roomName = event.room.name;
    const track = event.track;
    if (track && track.type === TrackType.AUDIO) {
    const wsUrl = `wss://${process.env.SERVER_ANNOUNCED_URL}${wsAudioPath}?trackID=${encodeURIComponent(track.sid)}&participant=${encodeURIComponent(event.participant.identity)}`;
    egressClient.startTrackEgress(roomName, wsUrl, track.sid)
        .then(info => {
        console.log('[Egress] TrackEgress lanzado:', info.egressId, 'URL:', wsUrl);
        })
        .catch(err => {
        console.error('[Egress] Error lanzando TrackEgress:', err);
        });
    }
}

function dispatchHLSParticipantEgress(event) {
    console.log('[Webhook] Evento participant_joined de cámara detectado');
    const roomName = event.room.name;
    const participantIdentity = event.participant.identity;
    const { 
        CF_KEY_ID, 
        CF_KEY_SECRET, 
        CF_BUCKET_NAME,
        CF_ENDPOINT 
    } = process.env;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const time = `${hh}_${min}_${ss}`;
    const pathPrefix = `recordings/${roomName}/${participantIdentity}/${today}/${time}`;

    const outputs = {
        segments: {
            filenamePrefix: `${pathPrefix}/hls`,
            playlistName: `${pathPrefix}/playlist.m3u8`,
            livePlaylistName: `${pathPrefix}/playlist-live.m3u8`,
            segmentDuration: 10,
            output: {
            case: 's3',
            value: {
                accessKey: CF_KEY_ID || '',
                secret: CF_KEY_SECRET || '',
                bucket: CF_BUCKET_NAME || '',
                endpoint: CF_ENDPOINT || '',
                forcePathStyle: true,
            },
            },
        },
    }
    
    egressClient
        .startParticipantEgress(roomName, participantIdentity, outputs)
        .then(info => {console.log('[Egress] ParticipantEgress HLS lanzado:', info.egressId);})
        .catch(err => {console.error('[Egress] Error lanzando ParticipantEgress HLS:', err);});    
}

async function dispatchAgentForRoom(roomName) {
      const agentName = 'BabyWise_Agent';
      const agentDispatchClient = new AgentDispatchClient(`https://${livekitHost}`, apiKey, apiSecret);

      // create a dispatch request for an agent
      const dispatch = await agentDispatchClient.createDispatch(roomName, agentName);
      console.log('created dispatch', dispatch);

      const dispatches = await agentDispatchClient.listDispatch(roomName);
      console.log(`there are ${dispatches.length} dispatches in ${roomName}`);
}

const handleMediaServerEvent = async (req, res) => {
  try {
    const event = await receiver.receive(req.body, req.get('Authorization'));
    console.log('[Webhook] Evento recibido:', event.event);

    // Iniciar TrackEgress para audio de camaras
    if (TOGGLE_AUDIO_TRACK_EGRESS && event.event === 'track_published' && event.participant.identity.startsWith('camera-')) {
        dispatchAudioTrackEgress(event);
    }
    
    // Lanzar ParticipantEgress HLS a S3 (Backblaze) para cámaras al unirse
    if (TOGGLE_S3_HLS_EGRESS && event.event === 'participant_joined' && event.participant.identity.startsWith('camera-')) {
        dispatchHLSParticipantEgress(event);
    }

    if(event.event === 'participant_left' && event.participant.identity.startsWith('camera-')) {
      console.log("Entrando en participant left")
      const camaraName = event.participant.identity.replace('camera-','')
      const groupId = event.room.name.replace('baby-room-','')
      updateCameraStatus(groupId,camaraName,'OFFLINE')
    }

    if(TOGGLE_AGENT_DISPATCH && event.event === 'room_started'){
        dispatchAgentForRoom(event.room.name);
    }

    res.status(200).send('ok');

  } catch (err) {
    console.error('[Webhook] Error procesando webhook:', err);
    res.status(400).send('invalid webhook');
  }
}

const handleTokenGrant = async (req, res) => {
  const { roomName, participantName } = req.query;
  if (!roomName || !participantName) {
    return res.status(400).send('Missing roomName or participantName query parameters');
  }

  if (!apiKey || !apiSecret || !livekitHost) {
    return res.status(501).send('LiveKit server environment variables not configured.');
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: participantName,
  });

  const videoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  };
  at.addGrant(videoGrant);

  at.toJwt().then(token => {
    res.json({ token });
  }).catch(err => {
    console.error('Error generating token:', err);
    res.status(502).send('Error generating token');
  });
}


export { handleMediaServerEvent, handleTokenGrant };