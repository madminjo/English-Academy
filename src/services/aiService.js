// Поддерживаем разные варианты написания ключей Groq ради безопасности
const rawKeys =
	process.env.GROQ_KEYS ||
	process.env.GROQ_API_KEYS ||
	process.env.GROQ_API_KEY ||
	''

// Разбиваем строку по запятым, убираем пробелы и фильтруем пустые элементы
const apiKeys = rawKeys
	? rawKeys
			.split(',')
			.map(k => k.trim())
			.filter(k => k.length > 0)
	: []

let currentKeyIndex = 0

if (apiKeys.length === 0) {
	console.error(
		'❌ [Groq Pool] Критическая ошибка: Ключи GROQ не найдены в переменной окружения .env!',
	)
} else {
	console.log(
		'⚡ [Groq Pool] Сервер успешно запустил пул ротации. Доступно ключей Groq: ' +
			apiKeys.length,
	)
}

/**
 * Функция берет следующий ключ из пула и сдвигает указатель
 */
function getNextApiKey() {
	if (apiKeys.length === 0) {
		throw new Error('Массив API-ключей Groq пуст. Проверь конфигурацию .env')
	}
	const apiKey = apiKeys[currentKeyIndex]
	const index = currentKeyIndex

	// Сразу сдвигаем очередь на следующий ключ для следующего запроса или попытки
	currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length

	return { apiKey, index }
}

/**
 * Умный метод генерации с авто-повтором и сменой ключей Groq при ошибке 429
 * Работает через новый эндпоинт /responses и модель openai/gpt-oss-20b
 */
async function generateContentWithRetry(
	options,
	retries = apiKeys.length || 4,
	baseDelay = 2000,
) {
	let lastError = null
	// Если ключ всего один, даем системе сделать хотя бы 3 попытки на случай сетевого сбоя
	const actualRetries = apiKeys.length === 1 ? 3 : retries

	// Собираем инструкцию Майкла и промпт юзера в один текст для поля "input"
	const systemInstruction =
		options.config?.systemInstruction || options.systemInstruction || ''
	const userPrompt = options.contents || options.prompt || ''

	const fullInput = systemInstruction
		? 'System Instruction: ' +
			systemInstruction +
			'\n\nUser Task: ' +
			userPrompt
		: userPrompt

	for (let attempt = 1; attempt <= actualRetries; attempt++) {
		// Получаем текущий ключ из пула (индекс внутри функции уже сместился на следующий)
		const currentAI = getNextApiKey()

		try {
			// Делаем прямой HTTP-запрос к проверенному эндпоинту Groq
			const response = await fetch('https://api.groq.com/openai/v1/responses', {
				method: 'POST',
				headers: {
					Authorization: 'Bearer ' + currentAI.apiKey,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: 'openai/gpt-oss-20b', // Твоя рабочая модель
					input: fullInput,
				}),
			})

			// Если поймали ошибку сервера (например, 429 или 401)
			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}))
				const statusText =
					errorData.error?.message || 'Код ответа: ' + response.status

				// Создаем объект ошибки со статусом внутри, чтобы поймать его в catch
				const customError = new Error(statusText)
				customError.status = response.status
				throw customError
			}

			const data = await response.json()
			console.log('🔍 [Groq RAW]:', JSON.stringify(data).slice(0, 500))
			// Парсим JSON строго по структуре эндпоинта /responses
			const messageOutput = data.output?.find(item => item.type === 'message')
			const aiText =
				messageOutput?.content?.[0]?.type === 'output_text'
					? messageOutput.content[0].text
					: messageOutput?.content?.[0]?.text || ''

			if (!aiText) {
				throw new Error(
					'Не удалось извлечь текст ответа из JSON структуры Groq',
				)
			}

			// Возвращаем объект со свойством text, чтобы в файле today.js ничего не ломалось
			return {
				text: aiText,
			}
		} catch (error) {
			lastError = error

			console.error('❌ [Groq Error Debug]:', {
				message: error.message,
				status: error.status,
				// Если ошибка сетевая, это поле поможет понять суть
				cause: error.cause,
			})
			const errorMsg = error.message || ''
			// Проверяем, является ли ошибка лимитом (код 429 или текст RESOURCE_EXHAUSTED / quota)
			const isRateLimit =
				error.status === 429 ||
				errorMsg.includes('429') ||
				errorMsg.includes('RESOURCE_EXHAUSTED') ||
				errorMsg.includes('quota')

			// Если поймали лимит и попытки еще остались — уходим на паузу и цикл пойдет к следующему ключу
			if (isRateLimit && attempt < actualRetries) {
				const delay = baseDelay * attempt

				console.warn(
					'[Groq Pool] Ключ на индексе ' +
						currentAI.index +
						' поймал лимит 429. Попытка ' +
						attempt +
						'/' +
						actualRetries +
						'. Спим ' +
						delay +
						'мс и пробуем следующий ключ...',
				)

				await new Promise(resolve => setTimeout(resolve, delay))
				continue // Переходим на следующую итерацию цикла
			}

			// Если ошибка критическая (например, неверный токен 401 или косяк в JSON), ротировать пул нет смысла
			throw error
		}
	}

	throw new Error(
		'Все доступные ключи из пула Groq вернули ошибку 429. Последний лог: ' +
			lastError.message,
	)
}

module.exports = { generateContentWithRetry }
