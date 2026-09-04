import type { Env } from '../../../server/env';
import { audit, getOrCreateCategory } from '../../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../../server/http';

function addMonths(date:string,n:number){const d=new Date(`${date}T12:00:00Z`),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
async function before(env:Env,id:string){return env.DB.prepare(`SELECT cp.*,cat.name category_name FROM card_purchases cp LEFT JOIN categories cat ON cat.id=cp.category_id WHERE cp.id=?`).bind(id).first<any>()}

export const onRequestPatch:PagesFunction<Env>=async({request,env,params})=>{try{
  const id=String(params.id),old=await before(env,id);if(!old)throw new HttpError(404,'Compra não encontrada.');
  const locked=await env.DB.prepare("SELECT COUNT(*) n FROM card_installments WHERE purchase_id=? AND status IN ('posted','paid')").bind(id).first<any>();
  const b=await readJson<any>(request),categoryId=await getOrCreateCategory(env,b.categoryName??old.category_name),total=b.totalCents==null?Number(old.total_cents):Number(b.totalCents),count=b.installmentCount==null?Number(old.installment_count):Number(b.installmentCount),purchaseDate=b.purchaseDate??old.purchase_date;
  if(!Number.isInteger(total)||total<=0||!Number.isInteger(count)||count<1||count>60)throw new HttpError(400,'Compra ou parcelas inválidas.');
  const cardId=b.cardId??old.card_id,structuralChange=total!==Number(old.total_cents)||count!==Number(old.installment_count)||purchaseDate!==old.purchase_date||cardId!==old.card_id||!!b.firstDueDate;
  if(Number(locked?.n||0)>0&&structuralChange)throw new HttpError(409,'Não é possível alterar valor, cartão, data ou parcelamento depois que uma parcela foi lançada/paga.');
  const card=await env.DB.prepare('SELECT * FROM cards WHERE id=? AND archived_at IS NULL').bind(cardId).first<any>();if(!card)throw new HttpError(400,'Cartão inválido.');
  const now=nowIso(),statements:any[]=[env.DB.prepare('UPDATE card_purchases SET card_id=?,description=?,total_cents=?,purchase_date=?,category_id=?,installment_count=?,updated_at=?,version=version+1 WHERE id=?').bind(cardId,(b.description??old.description).trim(),total,purchaseDate,categoryId,count,now,id)];
  if(Number(locked?.n||0)===0&&structuralChange){
    const firstRow=await env.DB.prepare('SELECT due_date FROM card_installments WHERE purchase_id=? ORDER BY number LIMIT 1').bind(id).first<any>();
    const first=b.firstDueDate||firstRow?.due_date||purchaseDate;
    statements.push(env.DB.prepare('DELETE FROM card_installments WHERE purchase_id=?').bind(id));
    const base=Math.floor(total/count),rem=total-base*count;
    for(let i=0;i<count;i++)statements.push(env.DB.prepare("INSERT INTO card_installments (id,purchase_id,number,due_date,amount_cents,status,created_at) VALUES (?,?,?,?,?,'planned',?)").bind(uuid(),id,i+1,addMonths(first,i),base+(i===count-1?rem:0),now));
  }
  await env.DB.batch(statements);const after=await before(env,id);await audit(env,'card_purchase.updated','card_purchase',id,old,after);return json({ok:true});
}catch(error){return errorResponse(error)}};

export const onRequestDelete:PagesFunction<Env>=async({env,params})=>{try{const id=String(params.id),old=await before(env,id);if(!old)throw new HttpError(404,'Compra não encontrada.');const locked=await env.DB.prepare("SELECT COUNT(*) n FROM card_installments WHERE purchase_id=? AND status IN ('posted','paid')").bind(id).first<any>();if(Number(locked?.n||0)>0)throw new HttpError(409,'Não é possível excluir uma compra com parcela já lançada ou paga.');await env.DB.prepare('DELETE FROM card_purchases WHERE id=?').bind(id).run();await audit(env,'card_purchase.deleted','card_purchase',id,old,null);return json({ok:true});}catch(error){return errorResponse(error)}};
