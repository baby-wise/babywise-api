import { admin } from "../config/firebaseConfig.js";

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: Token no proporcionado o formato inválido.' });
  }

  const idToken = authHeader.split(' ')[1]; // Extraer el token después de "Bearer "
  // console.log("Id token: "+idToken)

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error al verificar el token de ID:', error.message);
    return res.status(403).json({ error: 'Acceso denegado: Token de ID no válido o expirado.' });
  }
};

export { authenticateToken };