export type CountryClickCount={country_code:string|null;country_name:string;clicks:number};
export const sortCountries=<T extends CountryClickCount>(countries:T[],direction:'asc'|'desc'):T[]=>
  [...countries].sort((a,b)=>direction==='desc'
    ? b.clicks-a.clicks || a.country_name.localeCompare(b.country_name,'ru')
    : a.clicks-b.clicks || a.country_name.localeCompare(b.country_name,'ru'));
