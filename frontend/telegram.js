/* ============================================
   VVD CPA
   telegram.js
============================================ */

"use strict";

const tg = window.Telegram.WebApp;

// Инициализация Mini App
tg.ready();
tg.expand();

// Цвета Telegram
tg.setHeaderColor("#0B0E14");
tg.setBackgroundColor("#0B0E14");

// Объект приложения
window.App = {

    telegram: tg,

    user: null,

    isAdmin: false,

    initData: "",

    initDataUnsafe: null

};

// Получение данных Telegram
function initTelegram(){

    App.initData = tg.initData;

    App.initDataUnsafe = tg.initDataUnsafe;

    if(!tg.initDataUnsafe.user){

        console.error("Telegram user not found");

        return;

    }

    App.user = tg.initDataUnsafe.user;

    console.log(App.user);

}

// Получение информации пользователя
function getUser(){

    return App.user;

}

// Telegram ID
function getUserId(){

    return App.user.id;

}

// Username
function getUsername(){

    return App.user.username || "";

}

// Имя
function getFirstName(){

    return App.user.first_name || "";

}

// Фамилия
function getLastName(){

    return App.user.last_name || "";

}

// Фото
function getPhoto(){

    return App.user.photo_url || "";

}

initTelegram();
