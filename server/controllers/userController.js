const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { User } = require('../models/models');

const generateJwt = (id, email, role) => {
    return jwt.sign(
        { id, email, role },
        process.env.SECRET_KEY,
        { expiresIn: '24h' }
    );
};

class UserController {
    async registration(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }

            // Check if user with this email already exists
            const candidate = await User.findOne({ where: { email } });
            if (candidate) {
                return res.status(400).json({ message: 'User with this email already exists' });
            }

            // Hash password
            const hashPassword = await bcrypt.hash(password, 5);

            // Create user
            const user = await User.create({ email, password: hashPassword });

            // Generate JWT token
            const token = generateJwt(user.id, user.email, user.role);

            return res.status(201).json({ token });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async login(req, res) {
        try {
            const { email, password } = req.body;

            if (!email || !password) {
                return res.status(400).json({ message: 'Email and password are required' });
            }

            // Find user by email
            const user = await User.findOne({ where: { email } });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Compare passwords
            const comparePassword = await bcrypt.compare(password, user.password);
            if (!comparePassword) {
                return res.status(400).json({ message: 'Invalid password' });
            }

            // Generate JWT token
            const token = generateJwt(user.id, user.email, user.role);

            return res.json({ token });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async check(req, res) {
        try {
            // Generate new token based on user data from middleware
            const token = generateJwt(req.user.id, req.user.email, req.user.role);
            return res.json({ token });
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new UserController();

