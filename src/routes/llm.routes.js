import express from 'express';
import { getLLMResponseForUser } from '../controllers/llm.controller.js';

const router = express.Router();

// Ruta para obtener respuesta del LLM para un usuario (sin autenticación)
router.post('/llm-response', getLLMResponseForUser);

export { router };
