import {assert,stripAccents} from '../domain';
// Local reference list, no geocoding call. QĐ 19/2025/QĐ-TTg, effective 01/07/2025:
// https://baochinhphu.vn/bang-danh-muc-va-ma-so-cua-34-tinh-thanh-moi-3321-don-vi-hanh-chinh-cap-xa-moi-102250704153652947.htm
export const VIETNAM_PROVINCES=['Hà Nội','Huế','Hải Phòng','Đà Nẵng','Cần Thơ','Hồ Chí Minh','Cao Bằng','Điện Biên','Lai Châu','Sơn La','Lạng Sơn','Quảng Ninh','Thanh Hóa','Nghệ An','Hà Tĩnh','Tuyên Quang','Lào Cai','Thái Nguyên','Phú Thọ','Bắc Ninh','Hưng Yên','Ninh Bình','Quảng Trị','Quảng Ngãi','Gia Lai','Khánh Hòa','Lâm Đồng','Đắk Lắk','Đồng Nai','Tây Ninh','Vĩnh Long','Đồng Tháp','Cà Mau','An Giang'] as const;
export function validateVietnamAddress(raw:string|null|undefined){
  if(!raw?.trim()) return {valid:true,normalized:null,province:null,reason:null};
  const normalized=raw.trim().replace(/\s+/g,' ');
  const key=stripAccents(normalized.toLowerCase()).replace(/[, .]+viet nam$/,'').replace(/[.]/g,'');
  const province=VIETNAM_PROVINCES.find(p=>key.endsWith(stripAccents(p.toLowerCase()))) ?? (/\b(?:tphcm|tp hcm|hcm|sai gon)$/.test(key)?'Hồ Chí Minh':/\bhanoi$/.test(key)?'Hà Nội':null);
  const valid=normalized.length>=8 && normalized.split(/\s+/).length>=3 && !!province;
  return {valid,normalized,province,reason:valid?null:'Địa chỉ cần số nhà/đường hoặc khu vực và kết thúc bằng tỉnh/thành hợp lệ theo danh mục hiện hành'};
}
export function requireVietnamAddress(raw:string|null|undefined){const v=validateVietnamAddress(raw);assert(v.valid,v.reason!);return v;}
