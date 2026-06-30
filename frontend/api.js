const API="http://localhost:8000";
async function getProfile(){return fetch(API+"/profile").then(r=>r.json())}
