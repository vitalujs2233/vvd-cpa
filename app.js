/**
 * ==========================================================================
 * ЛОГИКА ИНТЕРФЕЙСА И МАРШРУТИЗАЦИИ ДЛЯ VVD CPA (ТОЧНО ПО МАКЕТУ)
 * ==========================================================================
 */

// Главная навигационная функция для переключения между всеми 21 экранами приложения
function switchPage(pageId, navElement = null) {
    // Находим абсолютно все секции с классом page и скрываем их
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.style.display = 'none');

    // Отображаем нужный в данный момент экран
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        targetPage.style.display = 'flex';
    }

    // Если переключение произошло через нижнее фиксированное Bottom Menu
    if (navElement) {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        navElement.classList.add('active');
    }
}

// Конфигурационный объект для динамического заполнения экранов категорий офферов (Экраны 2.1 - 2.7)
const categoriesConfig = {
    adult: { title: "Adult Dating", icon: "🔞", payout: "$1.50", url: "https://vvd-cpa.link" },
    mainstream: { title: "Mainstream Dating", icon: "❤️", payout: "$0.85", url: "https://vvd-cpa.link" },
    nutra: { title: "Nutra Offers", icon: "🥦", payout: "$15.20", url: "https://vvd-cpa.link" },
    crypto: { title: "Crypto Trading", icon: "🪙", payout: "$12.00", url: "https://vvd-cpa.link" },
    finance: { title: "Finance Cards", icon: "💳", payout: "$5.40", url: "https://vvd-cpa.link" },
    gaming: { title: "Gaming Mobile", icon: "🎮", payout: "$1.10", url: "https://vvd-cpa.link" },
    utilities: { title: "Utilities / VPN", icon: "⚙️", payout: "$0.45", url: "https://vvd-cpa.link" }
};

// Функция открытия конкретной категории офферов и подстановки метрик
function openCategory(catKey) {
    const cat = categoriesConfig[catKey];
    if (!cat) return;

    // Обновляем текстовые и визуальные блоки на вложенном экране
    document.getElementById('cat-detail-title').innerText = cat.title;
    document.getElementById('cat-detail-icon').innerText = cat.icon;
    document.getElementById('cat-detail-payout').innerText = cat.payout;
    
    // Пытаемся взять реальный Telegram ID вебмастера для создания уникального SmartLink
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "12345";
    document.getElementById('smartlink-url').value = cat.url + userId;

    // Переключаем интерфейс на экран деталей оффера
    switchPage('category-detail');
}

// Функция копирования сгенерированной ссылки в буфер обмена смартфона
function copySmartLink() {
    const input = document.getElementById('smartlink-url');
    input.select();
    input.setSelectionRange(0, 99999); // Для корректной работы на iOS устройствах
    navigator.clipboard.writeText(input.value);

    // Вызываем нативный попап Telegram WebApp, если приложение открыто в мессенджере
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "Успешно",
            message: "Ваш уникальный SmartLink скопирован!",
            buttons: [{ type: "ok" }]
        });
    } else {
        alert("Скопировано в буфер обмена!");
    }
}

// Демонстрационная обработка создания заявки на вывод денег (Экран 6.0)
function processWithdrawMock() {
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "Заявка отправлена",
            message: "Финансовый отдел VVD CPA проверит транзакцию в течение 24 часов.",
            buttons: [{ type: "ok" }]
        });
    } else {
        alert("Заявка успешно создана и отправлена на модерацию!");
    }
    switchPage('profile');
}

// Переход к деталям конкретной финансовой транзакции
function openWithdrawDetail() {
    switchPage('withdraw-detail');
}

// Переход к админским подразделам управления системой
function openAdminSub(subPage) {
    switchPage(`admin-${subPage}`);
}
