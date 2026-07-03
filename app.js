/**
 * ==========================================================================
 * ПРЕМИУМ-ЛОГИКА И СИНХРОНИЗАЦИЯ МАРШРУТОВ ДЛЯ VVD CPA (ПО ТЗ)
 * Управляет всеми 9 экранами и восстанавливает работу кнопок
 * ==========================================================================
 */

// Главная функция навигации. Принимает ID страницы и элемент, на который кликнули
function switchPage(pageId, navElement = null) {
    // 1. Ищем абсолютно все секции страниц с классом .page
    const pages = document.querySelectorAll('.page');
    
    // 2. Жестко скрываем их, убирая активный класс и сбрасывая отображение
    pages.forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });

    // 3. Находим целевой экран
    const targetPage = document.getElementById(`page-${pageId}`);
    if (targetPage) {
        // Показываем только его в режиме Flex
        targetPage.classList.add('active');
        targetPage.style.display = 'flex';
    } else {
        console.error(`Критическая ошибка каркаса: Экран "page-${pageId}" отсутствует в index.html`);
    }

    // 4. Синхронизируем подсветку активных вкладок (для нижнего дока и верхней ленты отладки)
    if (navElement) {
        // Если кликнули по кнопке, тушим все соседние элементы в этом блоке
        const parent = navElement.parentElement;
        if (parent) {
            const siblings = parent.querySelectorAll('.nav-item, .slide-tag');
            siblings.forEach(item => item.classList.remove('active'));
        }
        navElement.classList.add('active');
    } else {
        // Если переключение вызвано кодом (например, кнопка Назад), находим и подсвечиваем нужные теги
        updateActiveNavState(pageId);
    }
}

// Вспомогательная функция для синхронизации кнопок при программном переключении
function updateActiveNavState(pageId) {
    // Синхронизируем верхний слайдер отладки
    const tags = document.querySelectorAll('.slide-tag');
    tags.forEach(tag => {
        tag.classList.remove('active');
        if (tag.getAttribute('onclick') && tag.getAttribute('onclick').includes(`'${pageId}'`)) {
            tag.add('active');
        }
    });

    // Синхронизируем нижний док-бар 84px
    const navItems = document.querySelectorAll('.app-nav .nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${pageId}'`)) {
            item.classList.add('active');
        }
    });
}

/**
 * БАЗА ДАННЫХ ПРИВАТНЫХ ОФФЕРОВ (ДЛЯ ЭКРАНОВ СМАРТЛИНКОВ 2.1)
 */
const categoriesConfig = {
    adult: { title: "Adult Dating Private SmartLink", payout: "$1.50 за лид", url: "https://vvd-cpa.link" },
    mainstream: { title: "Mainstream Dating Private", payout: "$0.85 за лид", url: "https://vvd-cpa.link" },
    nutra: { title: "Nutra / COD Premium Offers", payout: "$15.20 за подтверждение", url: "https://vvd-cpa.link" },
    crypto: { title: "Crypto / Forex VIP Exclusive", payout: "До $1,200.00 CPA", url: "https://vvd-cpa.link" }
};

// Функция открытия приватного смартлинка
function openCategory(catKey) {
    const cat = categoriesConfig[catKey];
    if (!cat) {
        console.warn(`Конфигурация оффера для "${catKey}" не найдена.`);
        return;
    }

    // Заполняем данными шаблон карточки генератора
    const titleEl = document.getElementById('cat-detail-title');
    const payoutEl = document.getElementById('cat-detail-payout');
    const urlInput = document.getElementById('smartlink-url');

    if (titleEl) titleEl.innerText = cat.title;
    if (payoutEl) payoutEl.innerText = cat.payout;
    
    // Получаем ID пользователя Telegram для создания индивидуального трекинг-хвоста
    const userId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id || "99999";
    if (urlInput) urlInput.value = cat.url + userId;

    // Переводим каркас на экран деталей ссылки
    switchPage('category-detail');
}

// Функция премиум-копирования ссылки с вызовом нативного PopUp мессенджера
function copySmartLink() {
    const input = document.getElementById('smartlink-url');
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999); // Защита для корректного копирования на iOS
    navigator.clipboard.writeText(input.value);

    // Если запущено внутри Telegram, вызываем красивое нативное окно Premium-уровня
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "🔐 Доступ зашифрован",
            message: "Ваша приватная CPA-ссылка скопирована в буфер обмена.",
            buttons: [{ type: "ok", text: "Принять" }]
        });
    } else {
        alert("SmartLink успешно скопирован!");
    }
}

// Демо-обработка создания финансовой заявки на выплату
function processWithdrawMock() {
    if (window.Telegram?.WebApp?.showPopup) {
        window.Telegram.WebApp.showPopup({
            title: "💎 Шлюз активирован",
            message: "Заявка на вывод средств успешно сформирована и отправлена на модерацию в финансовый отдел.",
            buttons: [{ type: "ok", text: "Ожидать" }]
        });
    } else {
        alert("Заявка на выплату успешно создана!");
    }
    switchPage('main'); // Возвращаем каркас на главный экран
}
