import {createHash} from 'node:crypto';
import type {z} from 'zod';
import {get,run,tx} from '../db';
import {DomainError} from '../domain';
import {integrationAuthorized} from './authorization';

export function integrationEndpoint<S extends z.ZodType>(name:string,schema:S,write:(input:z.output<S>)=>unknown) {
  return async(request:Request)=>{
    if(!integrationAuthorized(request)) return Response.json({error:'Không có quyền'},{status:401});
    const key=request.headers.get('idempotency-key');
    if(!key || key.length>200) return Response.json({error:'Thiếu idempotency-key hợp lệ'},{status:400});
    let raw:unknown;try{raw=await request.json();}catch{return Response.json({error:'JSON không hợp lệ'},{status:400});}
    const data=schema.safeParse(raw);
    if(!data.success) return Response.json({error:'Dữ liệu đầu vào không hợp lệ'},{status:400});
    const hash=createHash('sha256').update(JSON.stringify(data.data)).digest('hex');
    try {
      const old=get<{payload_hash:string;response_json:string}>('SELECT payload_hash,response_json FROM integration_requests WHERE integration=? AND idempotency_key=?',name,key);
      if(old && old.payload_hash!==hash) return Response.json({error:'Idempotency key đã dùng cho dữ liệu khác'},{status:409});
      if(old) return Response.json(JSON.parse(old.response_json));
      const result=tx(()=>{
        const response=write(data.data);
        run('INSERT INTO integration_requests(integration,idempotency_key,payload_hash,response_json) VALUES (?,?,?,?)',name,key,hash,JSON.stringify(response));
        return response;
      });
      return Response.json(result);
    }catch(e){
      return Response.json({error:e instanceof DomainError ? e.message : 'Không xử lý được dữ liệu tích hợp'},{status:e instanceof DomainError?400:500});
    }
  };
}
