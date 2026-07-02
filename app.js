/* ==========================================
   VVD CPA
   app.js
========================================== */

"use strict";

window.onload=()=>{

    console.log("VVD CPA Started");

    console.log(App.user);

    document.getElementById("username").innerHTML=

        getFirstName()+" "+getLastName();

    document.getElementById("userid").innerHTML=

        "ID: "+getUserId();

    if(getPhoto()){

        document.getElementById("userAvatar").src=

        getPhoto();

    }

    if(App.isAdmin){

        document

        .querySelector(".admin-only")

        .style.display="flex";

    }

};
