import { User_DB } from '../domain/user.js';
import { admin } from '../config/firebaseConfig.js';
import { clients } from '../index.js';
import { Event_DB, Event } from "../domain/event.js"
import { Group, Group_DB } from "../domain/group.js"
import { getUserById } from "./user.controller.js"
import { getGroupById } from "./group.controller.js"
import { getLatestSegmentWithDelay } from "../services/recordingService.js"
import { groupActionForEvent } from './group.controller.js';
import { getAudio } from './bucket.controller.js';

// Cooldown en memoria para notificaciones push
const lastPushSent = {}; // { [key]: timestamp }

const events = async (req,res)=>{
    try {
        const events = await Event_DB.find()
        res.json(events)
    } catch (error) {
        console.log(error)
    }
}

const newEvent = async (req,res)=>{
    const {UID, groupId, type} = req.body

    const groupDB = await getGroupById(groupId)
    const userDB = await getUserById(UID)

    if(groupDB && userDB){//Verifico que exista el grupo y el usuario
        const group = new Group(groupDB)
        if(group.users.some(u => u._id.toString() == userDB._id.toString())){ //Verifico que el usuario este en el grupo
            const baby = group.getBabyNameForMember(userDB)
            const event = new Event({group, baby, type})
            const eventDB = new Event_DB(event)
            try {
                await eventDB.save()
                res.status(200).json(eventDB)
            } catch (error) {
                if (error.name === "ValidationError" && error.errors.type.kind === "enum") {
                    return res.status(400).json({ error: "Tipo de evento inválido", type: type });
                }
                res.status(500).json(error)
            }
        }
    }else{
        res.status(404).json({error: "Group or user not found"})
    }

}

const getEventsByGroup = async (req, res) => {
  const { groupId } = req.params;
  try {
    const events = await Event_DB.find(
      {group: groupId}
    )
    if(events){
      res.status(200).json(events)
    }else{
      res.status(400).json({message: "No hay eventos para el grupo"})
    }

  } catch (error) {
    res.status(500).json(error);
  }
};

// Return 24 hourly buckets for the camera identified by cameraUid (can be user id or camera name)
const getEventsByCamera = async (req, res) => {
  try {
    const { groupId, cameraName } = req.params;

    // compute last 24 hours window ending at the next rounded hour in UTC (to include recent events)
    const now = new Date();
    const end = new Date(now);
    end.setUTCMinutes(0, 0, 0);
    if (now.getUTCMinutes() !== 0 || now.getUTCSeconds() !== 0 || now.getUTCMilliseconds() !== 0) {
      // Si no estamos justo en la hora UTC, sumar una hora para incluir la actual
      end.setUTCHours(end.getUTCHours() + 1);
    }
    const start = new Date(end);
    start.setUTCHours(end.getUTCHours() - 23);

    // fetch events for this group and baby name within the time window
    const rawEvents = await Event_DB.find({
      group: groupId,
      baby: cameraName,
      date: { $gte: start, $lt: end }
    }).lean();

    console.log(`[getEventsByCamera] Found ${rawEvents.length} events for camera ${cameraName} in group ${groupId} from ${start.toISOString()} to ${end.toISOString()}`);

    // build 24 hourly buckets (all in UTC)
    const buckets = [];
    for (let i = 0; i < 24; i++) {
      const bucketStart = new Date(start.getTime() + i * 60 * 60 * 1000);
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const inBucket = rawEvents.filter(ev => new Date(ev.date) >= bucketStart && new Date(ev.date) < bucketEnd);
      const crying = inBucket.filter(e => e.type === 'LLANTO').length;
      const movement = inBucket.filter(e => e.type === 'MOVIMIENTO').length;
      buckets.push({ hour: bucketStart.getUTCHours(), crying, movement, timestamp: bucketStart.toISOString() });
    }

    return res.status(200).json({ success: true, data: { events: buckets, period: '24h', generatedAt: new Date().toISOString() } });
  } catch (error) {
    console.error('getEventsByCamera error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};


// Recibe evento de detección del Agent
const receiveDetectionEvent = async (req, res) => {
  console.log('receiveDetectionEvent called with body:', req.body);
  try {
    let { group, baby, type, date } = req.body;
    if (!group || !baby || !type) {
      return res.status(400).json({ error: 'Faltan campos requeridos: group, baby, type' });
    }

    // Normalizar nombre del bebé quitando 'camera-' si está presente
    if (typeof baby === 'string') {
      baby = baby.replace(/^camera-/, '');
    }

    //Ejecutar reglas ante evento
    ejecutarReglasAnteEvento(group,type, baby)
  

    // Buscar el segmento de grabación asociado al evento
    // El room name es el groupId, el participantIdentity es el nombre del bebé
  // Siempre usar la hora del backend para persistir el evento
  const eventDate = new Date();
    let recordingUrl = null;
    let recordingSegmentName = null;

    try {
      console.log(`[EVENT] Buscando segmento de grabación para room=${group}, baby=${baby}, timestamp=${eventDate}`);
      // Delay mínimo (1s) para respuesta rápida - si encuentra segmento, genial; si no, la notificación va al viewer en vivo
      const segment = await getLatestSegmentWithDelay(group, baby, eventDate, 0);
      
      if (segment) {
        recordingUrl = segment.segmentUrl;
        recordingSegmentName = segment.fileName;
        console.log(`[EVENT] Segmento encontrado: ${recordingSegmentName} - ${recordingUrl}`);
      } else {
        console.log(`[EVENT] No se encontró segmento de grabación para este evento`);
      }
    } catch (segmentError) {
      console.error('[EVENT] Error al buscar segmento (continuando sin grabación):', segmentError);
      // No fallar el evento si no se encuentra grabación
    }

    // Persistir evento con URL de grabación (si existe)
    const event = new Event_DB({ 
      group, 
      baby, 
      type, 
      date: eventDate,
      recordingUrl,
      recordingSegmentName
    });
    await event.save();
    console.log(`[EVENT] Evento guardado: ${type} de ${baby} en grupo ${group} a las ${event.date.toLocaleTimeString()}`);

    // Cooldown: solo enviar push si no se envió en los últimos 60 segundos para este grupo-bebé-tipo
    const key = `${group}_${baby}_${type}`;
    const now = Date.now();
    const COOLDOWN_MS = 6000; // 6 segundos

    if (!lastPushSent[key] || now - lastPushSent[key] > COOLDOWN_MS) {
      lastPushSent[key] = now;
        const groupDB = await Group_DB.findById(group).populate('users.user');
        
        const users = (groupDB.users || []).filter(u =>
          u.user.pushToken && 
          u.role !== 'camera' &&
          (u.user.settings?.allowNotifications !== false)
        );
        for (const user of users) {
          const userData = user.user
          const message = {
            token: userData.pushToken,
            notification: {
              title: `Evento detectado`, 
              body: `${type} de ${baby} a las ${event.date.toLocaleTimeString()}`,
            },
            data: {
              group: String(group),
              baby: String(baby),
              type: String(type),
              date: event.date.toISOString(),
              recordingUrl: recordingUrl || '', // Incluir URL de grabación en la notificación
            },
          };
          try {
            console.log('Notificando del evento a', userData.email, recordingUrl ? 'con grabación' : 'sin grabación');
            await admin.messaging().send(message);
          } catch (err) {
            console.error('Error enviando push a', user.user.UID, err);
          }
        }
    } else {
      console.log(`[COOLDOWN] Push no enviado para ${key}, dentro de los ${COOLDOWN_MS / 1000}s`);
    }

    return res.status(201).json({ success: true, event });
  } catch (err) {
    console.error('[EVENT] Error al recibir evento:', err);
    return res.status(500).json({ error: 'Error interno al procesar evento' });
  }
};

async function ejecutarReglasAnteEvento(groupId, evento, baby) {
  console.log(`Buscando acciones configurables ante eventos para el grupo: ${groupId} y el evento: ${evento}`)
  let rule
  rule = await groupActionForEvent(groupId, evento)
  if(rule === -1) return //No hay reglas

  if(rule.action === "reproducir_audio"){
    console.log(clients)
  
    const camaraDelBebe = clients.filter(c => c.group === groupId && c.role === 'camera' && c.cameraIdentity === baby)
    const audioUrl = await getAudio(rule.audio, groupId)
    console.log("URL del audio: ", audioUrl)
    if(camaraDelBebe.length > 0 && audioUrl){
       camaraDelBebe.forEach(cam => {
        if (cam.socket) cam.socket.emit('play-audio', { audioUrl });
      });
    }
  }
  return
}

export { events, newEvent, getEventsByGroup, getEventsByCamera, receiveDetectionEvent };