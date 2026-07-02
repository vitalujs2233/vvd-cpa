/* ==========================================
   VVD CPA
   telegram.js
========================================== */

"use strict";

/*
==========================================
Telegram Mini App
==========================================
*/

let tg = null;

let telegramUser = null;

let isTelegram = false;

/*
==========================================
Проверяем Telegram
==========================================
*/

if(window.Telegram && window.Telegram.WebApp){

    tg = window.Telegram.WebApp;

    tg.ready();

    tg.expand();

    tg.setHeaderColor("#0B0E14");

    tg.setBackgroundColor("#0B0E14");

    isTelegram = true;

    telegramUser = tg.initDataUnsafe.user;

}

/*
==========================================
Режим разработки
==========================================
*/

if(!isTelegram){

    console.log("DEV MODE");

    telegramUser = {

        id:123456789,

        username:"developer",

        first_name:"Vitaliy",

        last_name:"Developer",

        photo_url:"https://i.pravatar.cc/150"

    };

}

/*
==========================================
App
==========================================
*/

window.App={

    telegram:tg,

    user:telegramUser,

    isTelegram:isTelegram,

    initData:isTelegram ? tg.initData : "",

    initDataUnsafe:isTelegram ? tg.initDataUnsafe : null,

    isAdmin:false

};

/*
==========================================
Получить пользователя
==========================================
*/

function getUser(){

    return App.user;

}

function getUserId(){

    return App.user.id;

}

function getUsername(){

    return App.user.username || "";

}

function getFirstName(){

    return App.user.first_name || "";

}

function getLastName(){

    return App.user.last_name || "";

}

function getPhoto(){

    return App.user.photo_url || "";

}

/*
==========================================
Admin
==========================================
*/

const ADMIN_ID = 123456789;

if(getUserId()===ADMIN_ID){

    App.isAdmin=true;

}
