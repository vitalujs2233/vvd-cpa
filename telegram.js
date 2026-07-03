/**
 * ==========================================================================
 * TELEGRAM WEBAPP API INTEGRATION — VVD CPA
 * Бесшовная интеграция с мессенджером и получение данных пользователя
 * ==========================================================================
 */

const tg = window.Telegram?.WebApp;

function initTelegramApp() {
    if (!tg) {
        console.warn("Приложение запущено вне клиента Telegram. Включен режим локальной отладки.");
        return;
    }

    // Сообщаем Telegram, что каркас полностью загрузился и готов к отображению
    tg.ready();
    
    // Раскрываем приложение на максимум, убирая лишние пустые зоны сверху и снизу
    tg.expand();

    // Красим верхнюю статус-панель телефона в глубокий цвет фона по вашему ТЗ
    if (tg.setHeaderColor) {
        tg.setHeaderColor('#070A14');
    }

    // Извлекаем реальные данные зашедшего в Mini App пользователя
    const user = tg.initDataUnsafe?.user;
    if (user) {
        // Формируем имя: приоритет на имя/фамилию, если нет — берем никнейм
        const fullName = user.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user.username || "Webmaster");
        const userHandle = user.username ? `@${user.username}` : `ID: ${user.id}`;

        // Подставляем имя во все текстовые ID на экранах приложения
        const mainNameEl = document.getElementById('main-username');
        const profileNameEl = document.getElementById('profile-username');
        const handleEls = document.querySelectorAll('.user-handle');

        if (mainNameEl) mainNameEl.innerText = fullName;
        if (profileNameEl) profileNameEl.innerText = fullName;
        
        handleEls.forEach(el => {
            el.innerText = userHandle;
        });

        // Если у пользователя загружена аватарка в Telegram, подтягиваем её в интерфейс
        if (user.photo_url) {
            const mainAvatarEl = document.getElementById('main-avatar');
            const profileAvatarEl = document.getElementById('profile-avatar');
            
            if (mainAvatarEl) mainAvatarEl.src = user.photo_url;
            if (profileAvatarEl) profileAvatarEl.src = user.photo_url;
        }
    }
}

// Запускаем инициализацию сразу после того, как браузер построит DOM-дерево
document.addEventListener("DOMContentLoaded", initTelegramApp);
