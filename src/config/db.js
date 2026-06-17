const { Pool } = require('pg')

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: {
		rejectUnauthorized: false,
	},
	// Увеличиваем таймауты для борьбы с cold start бесплатного тарифа Neon
	connectionTimeoutMillis: 10000, // 10 секунд на подключение вместо дефолтных 2х
	idleTimeoutMillis: 30000, // удерживать соединение открытым 30 секунд
	max: 10, // максимальное количество одновременных коннектов
})

pool.on('connect', () => {
	// Лог вызовется только один раз для конкретного соединения
	console.log('✅ PostgreSQL: Создано новое соединение в пуле')
})

pool.on('error', err => {
	console.error('❌ Непредвиденная ошибка в пуле PostgreSQL:', err.message)
})

module.exports = pool
