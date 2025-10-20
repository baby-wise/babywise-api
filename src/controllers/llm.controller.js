// NOTE: per front-end request, we do NOT persist responses server-side here.
// This controller always generates a fresh response based on the incoming
// conversation and the group's events.

import { Event_DB } from '../domain/event.js';
import { Group_DB } from '../domain/group.js';

// Función helper para obtener la fecha actual en formato YYYY-MM-DD
const getCurrentDate = () => {
  const now = new Date();
  return now.toISOString().split('T')[0];
};

// Función helper para obtener eventos reales - COPIADO EXACTO de getEventsByCamera
const getRealEventsData = async (groupUID, cameraUid) => {
  try {
    console.log('=== COPIANDO LÓGICA EXACTA DE getEventsByCamera ===');
    console.log('Input params - groupUID:', groupUID, 'cameraUid:', cameraUid);
    console.log('cameraUid type:', typeof cameraUid, 'length:', cameraUid?.length);
    
    // Si no hay cameraUid, devolver datos vacíos
    if (!cameraUid || cameraUid === 'undefined' || cameraUid === 'null' || cameraUid.trim() === '') {
      console.log('❌ Invalid cameraUid detected, devolviendo datos vacíos');
      console.log('cameraUid value:', cameraUid);
      return getEmptyEventsData(groupUID);
    }

    // EXACTAMENTE IGUAL que getEventsByCamera
    console.log('🔍 Buscando grupo con cameraUid:', cameraUid);
    const group = await Group_DB.findOne({ 'cameras.user': cameraUid });
    if (!group) {
      console.log('❌ Camera not found in any group for cameraUid:', cameraUid);
      return getEmptyEventsData(groupUID);
    }
    console.log('✅ Grupo encontrado:', group._id, 'con', group.cameras.length, 'cámaras');

    const cameraObj = group.cameras.find(c => String(c.user) === String(cameraUid) || (c.user && String(c.user._id) === String(cameraUid)));
    if (!cameraObj) {
      console.log('❌ Camera object not found in cameras array');
      console.log('Available cameras:', group.cameras.map(c => ({ user: c.user, name: c.name })));
      return getEmptyEventsData(groupUID);
    }
    
    const cameraName = cameraObj.name;
    console.log('✅ Camera/baby name found:', cameraName);

    // EXACTAMENTE IGUAL: compute last 24 hours window ending at current rounded hour
    const now = new Date();
    const end = new Date(now);
    end.setMinutes(0,0,0); // Round to hour
    const start = new Date(end);
    start.setHours(end.getHours() - 23); // 24 hours ago

    console.log(`Buscando eventos desde ${start.toISOString()} hasta ${new Date(end.getTime() + (60 * 60 * 1000)).toISOString()}`);

    // EXACTAMENTE IGUAL: fetch events for this group and baby name within the time window
    const query = {
      group: group._id,
      baby: cameraName,
      date: { $gte: start, $lte: new Date(end.getTime() + (60 * 60 * 1000)) }
    };
    console.log('🔍 Query para eventos:', JSON.stringify(query, null, 2));
    
    const rawEvents = await Event_DB.find(query).lean();
    console.log(`📊 Raw events found: ${rawEvents.length}`);
    
    if (rawEvents.length > 0) {
      console.log('Primeros 3 eventos encontrados:');
      rawEvents.slice(0, 3).forEach((event, i) => {
        console.log(`  ${i+1}. Tipo: ${event.type}, Baby: ${event.baby}, Fecha: ${event.date}`);
      });
    } else {
      console.log('❌ NO se encontraron eventos para:');
      console.log('  - Grupo ID:', group._id);
      console.log('  - Baby name:', cameraName);
      console.log('  - Rango fechas:', start.toISOString(), 'a', new Date(end.getTime() + (60 * 60 * 1000)).toISOString());
    }

    // EXACTAMENTE IGUAL: build 24 hourly buckets
    const buckets = [];
    for (let i = 0; i < 24; i++) {
      const bucketStart = new Date(start.getTime() + i * 60 * 60 * 1000);
      const bucketEnd = new Date(bucketStart.getTime() + 60 * 60 * 1000);
      const inBucket = rawEvents.filter(ev => new Date(ev.date) >= bucketStart && new Date(ev.date) < bucketEnd);
      const crying = inBucket.filter(e => e.type === 'LLANTO').length;
      const movement = inBucket.filter(e => e.type === 'MOVIMIENTO').length;
      buckets.push({ hour: bucketStart.getHours(), crying, movement, timestamp: bucketStart.toISOString() });
    }

    // Calcular totales y picos
    const totalCrying = buckets.reduce((sum, bucket) => sum + bucket.crying, 0);
    const totalMovement = buckets.reduce((sum, bucket) => sum + bucket.movement, 0);
    const peakCryingHour = buckets.reduce((max, bucket) => bucket.crying > max.crying ? bucket : max);
    const peakMovementHour = buckets.reduce((max, bucket) => bucket.movement > max.movement ? bucket : max);

    console.log(`TOTALES CALCULADOS: ${totalCrying} llanto, ${totalMovement} movimiento`);
    console.log(`PICOS: llanto a las ${peakCryingHour.hour}:00 (${peakCryingHour.crying}), movimiento a las ${peakMovementHour.hour}:00 (${peakMovementHour.movement})`);

    return {
      groupId: groupUID,
      events: buckets,
      totalCrying,
      totalMovement,
      peakCryingHour,
      peakMovementHour,
      period: '24h',
      generatedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Error obteniendo eventos reales:', error);
    return getEmptyEventsData(groupUID);
  }
};

// Función helper para datos vacíos
const getEmptyEventsData = (groupUID) => {
  return {
    groupId: groupUID,
    events: [],
    totalCrying: 0,
    totalMovement: 0,
    peakCryingHour: { hour: 0, crying: 0 },
    peakMovementHour: { hour: 0, movement: 0 }
  };
};

// Función helper para generar prompt dinámico usando UID, cameraUid, conversation y el último mensaje
const generatePrompt = async (UID, cameraUid, conversation = [], userMessage = '') => {
  const currentDate = getCurrentDate();

  // Obtener datos reales de la base de datos para la cámara específica
  const realEventsData = await getRealEventsData(UID, cameraUid);

  // Conversation formatting: include role and text for clarity
  const conversationText = (conversation || []).map(m => `(${m.role}) ${m.text}`).join('\n');

  // Extract key metrics from real events
  const { totalCrying, totalMovement, peakCryingHour, peakMovementHour } = realEventsData;

  // Prompt instructions: be concise and answer taking into account conversation + events
  const now = new Date();
  const timeRange = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')} del ${currentDate}`;
  
  return `Eres un asistente experto en cuidado infantil. Responde en español de forma natural y conversacional.

DATOS DISPONIBLES DEL BEBÉ (últimas 24 horas hasta ${timeRange}):
- Llanto: ${totalCrying} episodios
- Movimiento: ${totalMovement} episodios  
- Pico de llanto: ${peakCryingHour.hour}:00 (${peakCryingHour.crying} episodios)
- Pico de movimiento: ${peakMovementHour.hour}:00 (${peakMovementHour.movement} episodios)

Conversación previa:
${conversationText}

Pregunta: "${userMessage}"

INSTRUCCIONES:
- Responde de forma natural y conversacional
- USA los datos del bebé SOLO cuando sea relevante para la pregunta
- Si preguntan por resumen/estadísticas del bebé, entonces sí usa todos los datos
- Si es una pregunta general (saludo, etc.), responde normalmente sin mencionar datos
- Sé útil y amigable`;
};

// Función para generar respuesta usando Pollinations (simple y directo)
const generateLLMResponse = async (prompt) => {
  console.log('=== POLLINATIONS DEBUG ===');
  console.log('Prompt completo enviado:');
  console.log(prompt);
  console.log('========================');
  
  try {
    const requestBody = {
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      model: 'openai',
      jsonMode: false
    };

    console.log('Request body a enviar:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BabyWise-App/1.0'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Pollinations response status:', response.status);
    console.log('Pollinations response headers:', response.headers);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Pollinations error response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const responseText = await response.text();
    console.log('Pollinations respuesta RAW:', responseText);
    console.log('Longitud de respuesta:', responseText.length);
    
    const trimmedResponse = responseText.trim();
    console.log('Respuesta final después de trim:', trimmedResponse);
    
    return trimmedResponse;

  } catch (error) {
    console.error('Error detallado con Pollinations:', error);
    return 'Disculpa, no puedo procesar tu consulta en este momento.';
  }
};

const getLLMResponseForUser = async (req, res) => {
  try {
    // Debug logging
    console.log('=== DEBUG getLLMResponseForUser ===');
    console.log('req.method:', req.method);
    console.log('req.headers:', req.headers);
    console.log('req.body:', req.body);

    const { UID, cameraUid, conversation, userMessage } = req.body || {};

    if (!UID) {
      console.log('UID not found in request');
      return res.status(400).json({ 
        success: false,
        error: 'UID is required'
      });
    }

    console.log('Datos recibidos:');
    console.log('  - UID:', UID);
    console.log('  - cameraUid:', cameraUid, 'type:', typeof cameraUid);
    console.log('  - conversation length:', conversation?.length || 0);
    console.log('  - userMessage:', userMessage);

    // Build prompt using incoming conversation and userMessage for specific camera
    const prompt = await generatePrompt(UID, cameraUid, conversation || [], userMessage || '');
    console.log('Prompt generado (trunc):', prompt.substring(0, 200));

    // Always generate a fresh response (no caching/storage)
    console.log('Llamando a generateLLMResponse...');
    const llmResponse = await generateLLMResponse(prompt);
    console.log('generateLLMResponse terminó exitosamente. Respuesta recibida:', llmResponse ? 'SÍ' : 'NO');

    // Return the response directly to the front-end
    console.log('Preparando respuesta JSON...');
    const currentDate = getCurrentDate();
    console.log('Fecha actual obtenida:', currentDate);
    
    const responseObj = {
      success: true,
      response: llmResponse,
      date: currentDate,
      cached: false
    };
    
    console.log('Enviando respuesta exitosa al cliente:', responseObj.success);
    return res.status(200).json(responseObj);

  } catch (error) {
    console.error('Error en getLLMResponseForUser:', error);
    
    // Asegurar que siempre devolvemos JSON válido
    try {
      return res.status(500).json({ 
        success: false,
        error: "Error interno del servidor al generar respuesta LLM",
        details: error.message || 'Error desconocido'
      });
    } catch (jsonError) {
      console.error('Error enviando respuesta JSON:', jsonError);
      // Último recurso: enviar texto plano
      return res.status(500).send('Error interno del servidor');
    }
  }
};

export { getLLMResponseForUser };
