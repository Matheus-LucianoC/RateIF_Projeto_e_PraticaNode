'use strict';
require('./env').loadEnvFile();
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.RATEIF_ADMIN_EMAIL = process.env.RATEIF_ADMIN_EMAIL || 'admin@rateif.local';
process.env.RATEIF_ADMIN_PASSWORD = process.env.RATEIF_ADMIN_PASSWORD || 'RateIF-Adm#2026!Teste';
process.env.RATEIF_ADMIN_NAME = process.env.RATEIF_ADMIN_NAME || 'Administrador de Teste RateIF';
require('./start').start();
