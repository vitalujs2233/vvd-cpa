/**
 * ==========================================================================
 * НАДЁЖНАЯ МАРШРУТИЗАЦИЯ ДЛЯ VVD CPA (СТРОГО ПО МАКЕТУ)
 * ИСПРАВЛЯЕТ НАЛОЖЕНИЕ ЭКРАНОВ И ОЖИВЛЯЕТ КНОПКИ
 * ==========================================================================
 */

function switchPage(pageId, navElement = null) {
    // 1. Находим абсолютно все экраны в приложении
    const pages = document.querySelectorAll('.page');
    
    // 2. Скрываем каждый экран, чтобы они не выстраивались в одну длинную ленту
    pages.forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none'; 
    });

    // 3. Находим именно тот экран, который нажал пользователь
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        // Показываем только его
        targetPage.classList.add('active');
        targetPage.style.display = 'flex';
    } else {
        console.error(`Экран "page-${pageId}" не найден в файле index.html`);
    }

    // 4. Красим нажатую кнопку в меню в фиолетовый цвет, а остальные тушим
    if (navElement) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        navElement.classList.add('active');
    }

    // 5. Автоматически прокручиваем страницу наверх при переключении
    const appContent = document.getElementById('app');
    if (appContent) appContent.scrollTop = 0;
}

/**
 * КОНФИГУРАЦИЯ ОФФЕРОВ ДЛЯ ВНУТРЕННИХ ЭКРАНОВ (КАТЕГОРИИ 2.1 - 2.7)
 */
const categoriesConfig = {
    adult: { title: "Adult Dating SmartLink", payout: "$1.50" },
    mainstream: { title: "Mainstream Dating", payout: "$0.85" },
    nutra: { title: "Nutra Offers", payout: "$15.20" },
    crypto: { title: "Crypto Private", payout: "Dynamic" }
};

// Функция для кнопок "Получить ссылку" или клика по категории
function openCategory(catKey) {
    const cat = categoriesConfig[catKey];
    if (!cat) return;

    // Подставляем текст в карточку оффера
    const titleEl = document.getElementById('cat-detail-title');
    const payoutEl = document.getElementById('cat-detail-payout');
    const urlInput = document.getElementById('smartlink-url');

    if (titleEl) titleEl.innerText = cat.title;
    if (payoutEl) payoutEl.innerText = cat.payout;
    
    // Генерируем ссылку под Telegram ID пользователя
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "77777";
    if (urlInput) urlInput.value = `https://vvd-cpa.link{catKey}?wm=${userId}`;

    // Переключаем на экран генератора ссылки
    switchPage('category-detail');
}

// Копирование ссылки
function copySmartLink() {
    const input = document.getElementById('smartlink-url');
    if (!input) return;

    input.select();
    navigator.clipboard.writeText(input.value);

    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "Успешно",
            message: "Приватный SmartLink скопирован!",
            buttons: [{ type: "ok" }]
        });
    } else {
        alert("Ссылка скопирована!");
    }
}

// Вывод средств
function processWithdrawMock() {
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "Заявка принята",
            message: "Выплата успешно поставлена в очередь обработки.",
            buttons: [{ type: "ok" }]
        });
    } else {
        alert("Заявка на выплату создана!");
    }
    switchPage('main');
}
