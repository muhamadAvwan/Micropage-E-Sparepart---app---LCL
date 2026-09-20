const express = require('express');
const { verifyLogin } = require('../controllers/authController');
const { loginRateLimit } = require('../middleware/loginRateLimit');

const router = express.Router();

router.post('/login', loginRateLimit, verifyLogin);

module.exports = router;