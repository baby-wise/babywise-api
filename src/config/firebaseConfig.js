import * as firebaseAdmin  from 'firebase-admin';
import { readFileSync } from 'node:fs';

export const admin = firebaseAdmin.default;
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
const CONFIG_FILE_PATH = './firebase.json'; 
let serviceAccountConfig;

// 1. Intentar usar la Variable de Entorno
if (serviceAccountJson) {
  try {
    serviceAccountConfig = JSON.parse(serviceAccountJson);
  } catch (error) {
    console.error("ERROR: No se pudo parsear la variable FIREBASE_SERVICE_ACCOUNT como JSON. Intentando leer el archivo...", error);
  }
}

// 2. Si la Variable de Entorno NO existe o falló el parseo, intentar usar el Archivo Local
if (!serviceAccountConfig) {
  try {
    const fileContent = readFileSync(CONFIG_FILE_PATH, 'utf8');
    serviceAccountConfig = JSON.parse(fileContent);
  } catch (error) {
    console.error(`ERROR: No se pudo leer o parsear el archivo de configuración: ${CONFIG_FILE_PATH}.`, error);
  }
}

//Inicialización Final
if (serviceAccountConfig) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountConfig)
  });
  console.log('Firebase Admin SDK inicializado correctamente.');
} else {
  console.error("ERROR CRÍTICO: No se pudo inicializar Firebase Admin SDK. Faltan credenciales.");
}