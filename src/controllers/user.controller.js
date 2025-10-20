import { User_DB } from "../domain/user.js"


const registerPushToken = async (req, res) => {
    const { UID, pushToken, platform } = req.body;
    if (!UID || !pushToken || !platform) {
        return res.status(400).json({ error: 'Faltan campos requeridos: UID, pushToken, platform. Fueron recibidos: ' + JSON.stringify(req.body) });
    }
    try {
        const user = await User_DB.findOneAndUpdate(
            { UID },
            { pushToken, platform },
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        return res.status(200).json({ success: true, user });
    } catch (error) {
        console.error('Error registrando token push:', error);
        return res.status(500).json({ error: 'Error interno al registrar token push' });
    }
};

const users = async (req,res)=>{
    try {
        const users = await User_DB.find()
        res.json(users)
    } catch (error) {
        console.log(error)
    }
}

const newUser = async (req,res)=>{
    const {user} = req.body;
    if(user){
        try {
            // Verificar si el usuario ya existe
            const existingUser = await getUserById(user.UID);
            if (existingUser) {
                console.log('User already exists:', user.UID);
                return res.status(200).json(existingUser); // Usuario ya existe, devolver el existente
            }
            
            // Crear nuevo usuario si no existe
            const userDB = new User_DB(user);
            await userDB.save();
            console.log('New user created:', user.UID);
            res.status(201).json(userDB);
        } catch (error) {
            console.error('Error creating user:', error);
            if (error.code === 11000) { // Error de duplicado de MongoDB
                const existingUser = await getUserById(user.UID);
                return res.status(200).json(existingUser);
            }
            res.status(500).json({error: "Error creating user"});
        }
    } else {
        res.status(400).json({error: "User data is required"});
    }
}

async function getUserById(UID){
    const user = await User_DB.findOne({UID})
    return user
}

export {users, newUser, getUserById, registerPushToken}