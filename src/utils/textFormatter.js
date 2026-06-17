/**
 * Бронебойный очиститель текста для Telegram
 */
function sanitizeForTelegram(text) {
	if (!text) return ''

	// 1. УБИВАЕМ ВООБЩЕ ВСЕ ТЕГИ (HTML и Markdown), чтобы начать с чистого листа
	// Это гарантирует, что никакие "битые" теги не пройдут
	let clean = text
		.replace(/<[^>]*>/g, '') // Удаляет любой HTML
		.replace(/\*\*(.*?)\*\*/g, '$1') // Убирает Markdown **
		.replace(/\*(.*?)\*/g, '$1') // Убирает Markdown *
		.replace(/```.*?```/gs, '') // Убирает блоки кода

	// 2. ВРУЧНУЮ ВОССТАНАВЛИВАЕМ только наши заголовки
	// Telegram примет только эти правильно закрытые теги
	clean = clean
		.replace(/📊 (.*?):/g, '📊 <b>$1:</b>')
		.replace(/💡 (.*?):/g, '💡 <b>$1:</b>')
		.replace(/👑 (.*?):/g, '👑 <b>$1:</b>')
		.replace(/🚀 (.*?):/g, '🚀 <b>$1:</b>')
		.replace(/⚠️ (.*?):/g, '⚠️ <b>$1:</b>')
		// Майкл: — делаем курсивом
		.replace(/Майкл:(.*?)\n/gi, '<i>Майкл:$1</i>\n')

	// 3. Защита от лимита Telegram (4096 символов)
	if (clean.length > 4000) {
		clean = clean.substring(0, 4000) + '\n\n... (текст слишком длинный, бро)'
	}

	return clean
}

module.exports = { sanitizeForTelegram }
