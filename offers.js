/* ============================================
   VVD CPA
   offers.js
============================================ */

"use strict";

/*
============================================
Офферы
============================================
*/

let offers = [

    {
        id:1,
        name:"Adult Dating WW",
        payout:"$1.20"
    },

    {
        id:2,
        name:"Mainstream Dating",
        payout:"$0.95"
    },

    {
        id:3,
        name:"Adult US",
        payout:"$1.50"
    }

];

/*
============================================
Получить ссылку
============================================
*/

async function getOfferLink(offerId){

    // Пока сервер не написан

    const link =
`https://vvd-cpa.com/click?user=${getUserId()}&offer=${offerId}`;

    document.getElementById("offerLink").value = link;

    linkModal.classList.add("active");

}

/*
============================================
Кнопки
============================================
*/

document.addEventListener("DOMContentLoaded",()=>{

    const buttons=document.querySelectorAll(".offer-btn");

    buttons.forEach(button=>{

        button.onclick=()=>{

            getOfferLink(

                button.dataset.offer

            );

        };

    });

});
