import { upadeteRoleInGroup, updateCameraStatus } from '../controllers/group.controller.js';
import { clients  } from '../index.js';
// Lista global de clientes conectados en memoria


export function setUpClientMessageSocket(socket) {
    console.log(`Cliente conectado: ${socket.id}`);

    // Evento para unirse a una sala (ej. la sala del bebé)
    socket.on('join-room', (data) => {
        socket.join(data.group);
        console.log(`${data.role} ${socket.id} se unió al grupo: ${data.group}`);
        upadeteRoleInGroup(data.groupId, data.UID, data.role)
        // Si es cámara, guardar cameraIdentity
        const clientInfo = { socket, role: data.role, group: data.group };
        if (data.role === 'camera' && data.cameraIdentity) {
            updateCameraStatus(data.groupId,data.baby, "ONLINE")
            clientInfo.cameraIdentity = data.cameraIdentity;
        }
        clients.push(clientInfo); 
    });

    // Nuevo: manejar play-audio
    socket.on('play-audio', ({ group, cameraIdentity, audioUrl }) => {
        // Buscar la cámara destino en clients
        const cameraClient = clients.find(c => c.role === 'camera' && c.group === group && c.cameraIdentity === cameraIdentity);
        if (cameraClient && cameraClient.socket) {
            cameraClient.socket.emit('play-audio', { audioUrl });
            console.log(`[SOCKET] Enviado play-audio a cámara ${cameraIdentity}`);
        } else {
            console.warn(`[SOCKET] No se encontró cámara ${cameraIdentity} en grupo ${group} para play-audio`);
        }
    });

    // Nuevo: manejar stop-audio
    socket.on('stop-audio', ({ group, cameraIdentity }) => {
        const cameraClient = clients.find(c => c.role === 'camera' && c.group === group && c.cameraIdentity === cameraIdentity);
        if (cameraClient && cameraClient.socket) {
            cameraClient.socket.emit('stop-audio');
            console.log(`[SOCKET] Enviado stop-audio a cámara ${cameraIdentity}`);
        } else {
            console.warn(`[SOCKET] No se encontró cámara ${cameraIdentity} en grupo ${group} para stop-audio`);
        }
    });

    // Manejar desconexión explícita de cámara (cuando sale de la pantalla)
    socket.on('camera-disconnect', ({ groupId, cameraName }) => {
        console.log(`[SOCKET] Cámara ${cameraName} dejó de transmitir en el grupo ${groupId}`);
        updateCameraStatus(groupId, cameraName, 'OFFLINE');
    });

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
        const idx = clients.findIndex(c => c.socket.id === socket.id);
        if (idx !== -1) {
            const disconnectedClient = clients[idx];
            
            // Si era una cámara, actualizar su status a OFFLINE
            if (disconnectedClient.role === 'camera' && disconnectedClient.cameraIdentity) {
                const cameraName = disconnectedClient.cameraIdentity.replace('camera-', '');
                const groupId = disconnectedClient.group.replace('baby-room-', '');
                updateCameraStatus(groupId, cameraName, 'OFFLINE');
                console.log(`[SOCKET] Cámara ${cameraName} marcada como OFFLINE en grupo ${groupId}`);
            }
            
            clients.splice(idx, 1);
        }
    });
}