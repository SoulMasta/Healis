const express = require('express');
const { sendReactApp, navigate } = require('./pageHandlers');

const router = express.Router();

router.get('/', sendReactApp);
router.get('/navigate', navigate('workspace'));
router.post('/desk', async (req, res) => {
    const {name, description, userId} = req.body;
    const desk = await Desk.create({name, description, userId});
    res.json(desk);
});

module.exports = router;


