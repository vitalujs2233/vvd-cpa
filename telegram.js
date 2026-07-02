/* ==========================================
   VVD CPA
   telegram.js
========================================== */

"use strict";

/* ==========================================
   TELEGRAM MINI APP
========================================== */

let tg = null;
let telegramUser = null;
let isTelegram = false;

/* ==========================================
   ИНИЦИАЛИЗАЦИЯ TELEGRAM
========================================== */

if (window.Telegram && window.Telegram.WebApp) {

    tg = window.Telegram.WebApp;

    tg.ready();

    tg.expand();

    try {

        tg.setHeaderColor("#0B0E14");
        tg.setBackgroundColor("#0B0E14");

    } catch (e) {

        console.log("Telegram colors not supported");

    }

    if (tg.initDataUnsafe && tg.initDataUnsafe.user) {

        isTelegram = true;

        telegramUser = tg.initDataUnsafe.user;

    }

}

/* ==========================================
   DEV MODE
========================================== */

if (!telegramUser) {

    console.log("DEV MODE");

    telegramUser = {

        id: 123456789,

        username: "developer",

        first_name: "Vitaliy",

        last_name: "Developer",

        photo_url: "https://i.pravatar.cc/150"

    };

}

/* ==========================================
   APP OBJECT
========================================== */

window.App = {

    telegram: tg,

    user: telegramUser,

    isTelegram: isTelegram,

    initData: tg ? tg.initData : "",

    initDataUnsafe: tg ? tg.initDataUnsafe : null,

    isAdmin: false

};

/* ==========================================
   USER HELPERS
========================================== */

function getUser() {

    return App.user || {};

}

function getUserId() {

    return App.user ? App.user.id : 0;

}

function getUsername() {

    return App.user ? (App.user.username || "") : "";

}

function getFirstName() {

    return App.user ? (App.user.first_name || "") : "";

}

function getLastName() {

    return App.user ? (App.user.last_name || "") : "";

}

function getPhoto() {

    return App.user ? (App.user.photo_url || "") : "";

}

/* ==========================================
   ADMIN
========================================== */

const ADMIN_ID = 123456789;

App.isAdmin = getUserId() === ADMIN_ID;

/* ==========================================
   READY
========================================== */

console.log("Telegram Ready");

console.log(App);
