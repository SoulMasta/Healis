MaterialBlocksCtrl.createCard EagerLoadingError [SequelizeEagerLoadingError]: user is associated to material_card using an alias. You've included an alias (User), but it does not match the alias(es) defined in your association (user).
    at material_card._getIncludedAssociation (D:\Healis\server\node_modules\sequelize\lib\model.js:574:15)
    at material_card._validateIncludedElement (D:\Healis\server\node_modules\sequelize\lib\model.js:502:53)
    at D:\Healis\server\node_modules\sequelize\lib\model.js:421:37
    at Array.map (<anonymous>)
    at material_card._validateIncludedElements (D:\Healis\server\node_modules\sequelize\lib\model.js:417:39)
    at material_card.findAll (D:\Healis\server\node_modules\sequelize\lib\model.js:1124:12)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async material_card.findOne (D:\Healis\server\node_modules\sequelize\lib\model.js:1240:12)
    at async material_card.findByPk (D:\Healis\server\node_modules\sequelize\lib\model.js:1221:12)
    at async createCard (D:\Healis\server\controllers\materialBlocksCtrl.js:273:20)

MaterialBlocksCtrl.updateCard EagerLoadingError [SequelizeEagerLoadingError]: user is associated to material_card using an alias. You've included an alias (User), but it does not match the alias(es) defined in your association (user).
    at material_card._getIncludedAssociation (D:\Healis\server\node_modules\sequelize\lib\model.js:574:15)
    at material_card._validateIncludedElement (D:\Healis\server\node_modules\sequelize\lib\model.js:502:53)
    at D:\Healis\server\node_modules\sequelize\lib\model.js:421:37
    at Array.map (<anonymous>)
    at material_card._validateIncludedElements (D:\Healis\server\node_modules\sequelize\lib\model.js:417:39)
    at material_card.findAll (D:\Healis\server\node_modules\sequelize\lib\model.js:1124:12)
    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    at async material_card.findOne (D:\Healis\server\node_modules\sequelize\lib\model.js:1240:12)
    at async material_card.findByPk (D:\Healis\server\node_modules\sequelize\lib\model.js:1221:12)
    at async updateCard (D:\Healis\server\controllers\materialBlocksCtrl.js:355:20)