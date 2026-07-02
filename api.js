/* ============================================
   VVD CPA
   api.js
============================================ */

"use strict";

/*
==========================================
НАСТРОЙКИ API
==========================================
*/

const API = {

    BASE_URL: "https://your-domain.com/api",

};

/*
==========================================
Универсальный запрос
==========================================
*/

async function apiRequest(url, method = "GET", data = null){

    const options = {

        method,

        headers:{
            "Content-Type":"application/json"
        }

    };

    if(data){

        options.body = JSON.stringify(data);

    }

    try{

        const response = await fetch(

            API.BASE_URL + url,

            options

        );

        if(!response.ok){

            throw new Error("API Error");

        }

        return await response.json();

    }

    catch(error){

        console.error(error);

        showToast("Ошибка соединения");

        return null;

    }

}

/*
==========================================
Регистрация пользователя
==========================================
*/

async function registerUser(){

    return await apiRequest(

        "/register",

        "POST",

        {

            telegram_id:getUserId(),

            username:getUsername(),

            first_name:getFirstName(),

            last_name:getLastName(),

            photo:getPhoto(),

            init_data:App.initData

        }

    );

}

/*
==========================================
Баланс
==========================================
*/

async function loadBalance(){

    return await apiRequest(

        "/balance/" + getUserId()

    );

}

/*
==========================================
Статистика
==========================================
*/

async function loadStatistics(){

    return await apiRequest(

        "/statistics/" + getUserId()

    );

}

/*
==========================================
Офферы
==========================================
*/

async function loadOffers(){

    return await apiRequest(

        "/offers"

    );

}

/*
==========================================
Получить ссылку
==========================================
*/

async function createOfferLink(offerId){

    return await apiRequest(

        "/offer/link",

        "POST",

        {

            telegram_id:getUserId(),

            offer_id:offerId

        }

    );

}

/*
==========================================
Вывод средств
==========================================
*/

async function withdraw(data){

    return await apiRequest(

        "/withdraw",

        "POST",

        data

    );

}
