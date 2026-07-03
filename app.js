/**
 * ==========================================================================
 * КОРРЕКТНАЯ ПРЕМИУМ-ЛОГИКА И МАРШРУТИЗАЦИЯ ДЛЯ VVD CPA
 * СВЯЗЫВАЕТ ВСЕ 9 ЭКРАНОВ И КНОПКИ ИЗ ТЗ
 * ==========================================================================
 */

// Главная функция переключения экранов. Работает и для верхнего слайдера, и для нижнего меню
function switchPage(pageId, navElement = null) {
    // Находим все секции страниц
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none'; // Жестко скрываем для гарантии
    });

    // Показываем целевую страницу
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'flex';
    } else {
        console.error(`Ошибка маршрутизации: Экран с ID "page-${pageId}" не найден в HTML.`);
    }

    // Обновляем визуальный активный статус кнопок в меню (если клик был оттуда)
    if (navElement) {
        const navItems = document.querySelectorAll('.nav-item, .slide-tag');
        navItems.forEach(item => item.classList.remove('active'));
        navElement.classList.add('active');
    } else {
        // Если переключили кодом (например, кнопка Назад), синхронизируем верхний слайдер tags
        const tags = document.querySelectorAll('.slide-tag');
        tags.forEach(tag => {
            if (tag.getAttribute('onclick') === `switchPage('${pageId}')`) {
                document.querySelectorAll('.slide-tag').forEach(t => t.classList.remove('active'));
                tag.classList.add('active');
            }
        });
    }
}

// Конфигурация данных для приватных SmartLink категорий (Экраны 2.1 и далее)
const categoriesConfig = {
    adult: { title: "Adult Dating Private", payout: "$1.50 за лид", url: "https://vvd-cpa.link" },
    mainstream: { title: "Mainstream Dating", payout: "$0.85 за лид", url: "https://vvd-cpa.link" },
    nutra: { title: "Nutra / COD Offers", payout: "$15.20 за подтверждение", url: "https://vvd-cpa.link" },
    crypto: { title: "Crypto / Forex Private", payout: "До $1,200.00 CPA", url: "https://vvd-cpa.link" }
};

// Функция открытия вложенного экрана деталей оффера при клике на категорию
function openCategory(catKey) {
    const cat = categoriesConfig[catKey];
    if (!cat) {
        console.warn(`Конфигурация для категории "${catKey}" не найдена.`);
        return;
    }

    // Заполняем данными шаблон внутри page-category-detail
    const titleEl = document.getElementById('cat-detail-title');
    const payoutEl = document.getElementById('cat-detail-payout');
    const urlInput = document.getElementById('smartlink-url');

    if (titleEl) titleEl.innerText = cat.title;
    if (payoutEl) payoutEl.innerText = cat.payout;
    
    // Интегрируем реальный Telegram ID юзера, если доступен
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "88888";
    if (urlInput) urlInput.value = cat.url + userId;

    // Переводим пользователя на экран генератора ссылки
    switchPage('category-detail');
}

// Функция премиум-копирования ссылки с вызовом нативного Telegram UI PopUp
function copySmartLink() {
    const input = document.getElementById('smartlink-url');
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999); // Адаптация под iOS Safari в Telegram
    navigator.clipboard.writeText(input.value);

    // Если запущено внутри Telegram, показываем красивое дорогое системное окно
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "🔐 Ссылка защищена",
            message: "Ваш приватный SmartLink скопирован в буфер обмена.",
            buttons: [{ type: "ok", text: "Отлично" }]
        });
    } else {
        alert("Скопировано в буфер обмена!");
    }
}

// Эмуляция успешного вывода средств
function processWithdrawMock() {
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "💎 Заявка создана",
            message: "Транзакция отправлена в финансовый шлюз. Ожидайте выплату в течение 24 часов.",
            buttons: [{ type: "ok", text: "Понятно" }]
        });
    } else {
        alert("Заявка успешно отправлена на модерацию!");
    }
    switchPage('main'); // Возвращаем на главную после выплаты
}
