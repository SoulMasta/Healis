require('dotenv').config()
const express = require('express')
const cors = require('cors')
const sequelize = require('./db')

PORT = process.env.PORT || 3000

const app = express()

app.use(cors())

app.get('/', (req, res) =>{
    res.json({message: 'ALL WORKING'})
})

const start = async () => {
    try {
        await sequelize.authenticate()
        await sequelize.sync()
        app.listen(PORT, () => console.log(`Server started on PORT ${PORT}: http://localhost:${PORT}`))
    } catch(e) {
        console.log(e)
    }
}

start()

