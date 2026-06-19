// Превращает "вольный" HTML от ИИ в формат, понятный Telegram (parse_mode: 'HTML')
// Telegram поддерживает только: b, strong, i, em, u, ins, s, strike, del,
// span class="tg-spoiler", a, code, pre, blockquote

function sanitizeForTelegram(rawText) {
	let text = rawText || ''

	// 1. Снимаем обёртку ```html ... ``` или просто ``` ... ```
	text = text.replace(/```html\s*/gi, '').replace(/```/g, '')

	// 2. Вырезаем doctype / html / head(...) / body теги целиком
	text = text.replace(/<!DOCTYPE[^>]*>/gi, '')
	text = text.replace(/<\/?html[^>]*>/gi, '')
	text = text.replace(/<head[\s\S]*?<\/head>/gi, '')
	text = text.replace(/<\/?body[^>]*>/gi, '')
	text = text.replace(/<meta[^>]*>/gi, '')
	text = text.replace(/<title[\s\S]*?<\/title>/gi, '')

	// 3. Заголовки -> жирный текст с переносом строки
	text = text.replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gis, '\n<b>$1</b>\n')

	// 4. Параграфы -> просто перенос строки
	text = text.replace(/<\/p>/gi, '\n')
	text = text.replace(/<p[^>]*>/gi, '')

	// 5. Списки: <li> -> "• ...", обёртки ul/ol/li убираем
	text = text.replace(/<li[^>]*>(.*?)<\/li>/gis, '• $1\n')
	text = text.replace(/<\/?ul[^>]*>/gi, '')
	text = text.replace(/<\/?ol[^>]*>/gi, '')

	// 6. div / span (кроме tg-spoiler) -> просто убираем теги, текст оставляем
	text = text.replace(/<span(?!\s+class=["']tg-spoiler["'])[^>]*>/gi, '')
	text = text.replace(/<\/span>(?!.*tg-spoiler)/gi, '')
	text = text.replace(/<\/?div[^>]*>/gi, '\n')

	// 7. <br> -> перенос строки
	text = text.replace(/<br\s*\/?>/gi, '\n')

	// 8. Разрешённые теги нормализуем (strong/em -> b/i), остальные неизвестные теги вырезаем
	text = text.replace(/<strong>/gi, '<b>').replace(/<\/strong>/gi, '</b>')
	text = text.replace(/<em>/gi, '<i>').replace(/<\/em>/gi, '</i>')
	text = text.replace(/<strike>/gi, '<s>').replace(/<\/strike>/gi, '</s>')
	text = text.replace(/<del>/gi, '<s>').replace(/<\/del>/gi, '</s>')
	text = text.replace(/<ins>/gi, '<u>').replace(/<\/ins>/gi, '</u>')

	const allowedTags = /^(b|\/b|i|\/i|u|\/u|s|\/s|a\s+href=["'][^"']*["']|\/a|code|\/code|pre|\/pre|blockquote|\/blockquote|span\s+class=["']tg-spoiler["']|\/span)$/i

	text = text.replace(/<([^>]+)>/g, (match, inner) => {
		return allowedTags.test(inner.trim()) ? match : ''
	})

	// 9. Убираем лишние пустые строки (больше 2 подряд)
	text = text.replace(/\n{3,}/g, '\n\n').trim()

	return text
}

module.exports = { sanitizeForTelegram }