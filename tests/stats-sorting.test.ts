import { describe,it,expect } from 'vitest';
import { sortCountries } from '../src/pages/stats/Stats';

describe('Analysis mobile GEO sorting',()=>{
 const rows=[
  {country_code:'LV',country_name:'Latvia',clicks:3},
  {country_code:'DE',country_name:'Germany',clicks:7},
  {country_code:null,country_name:'Не определена',clicks:1}
 ];
 it('sorts descending by stored click count',()=>{
   expect(sortCountries(rows,'desc').map(x=>x.clicks)).toEqual([7,3,1]);
 });
 it('sorts ascending by stored click count',()=>{
   expect(sortCountries(rows,'asc').map(x=>x.clicks)).toEqual([1,3,7]);
 });
 it('does not mutate original records',()=>{
   sortCountries(rows,'asc');
   expect(rows.map(x=>x.clicks)).toEqual([3,7,1]);
 });
});
