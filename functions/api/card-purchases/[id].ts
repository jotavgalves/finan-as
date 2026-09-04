import type { Env } from '../../../server/env';
import { audit, getOrCreateCategory } from '../../../server/repository';
import { errorResponse, HttpError, json, nowIso, readJson, uuid } from '../../../server/http';

function addMonths(date:string,n:number){const d=new Date(`${date}T12:00:00Z`),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+n);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
async function before(env:Env,id:string){return env.DB.prepare(`SELECT cp.*,cat.name category_name FROM card_purchases cp LEFT JOIN categories cat ON cat.id=cp.category_id WHERE cp.id=?`).bind(id).first<any>()}
async function hasSettledInstallment(env:Env,id:string){const r=await env.DB.prepare(`SELECT COUNT(*) n FROM entries e WHERE e.card_purchase_id=? AND e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM settlements st WHERE st.entry_id=e.id)`).bind(id).first<any>();return Number(r?.n||0)>0}

export const onRequestPatch:PagesFunction<Env>=async({request,env,params})=>{try{
  const id=String(params.id),old=await before(env,id);if(!old)throw new HttpError(404,'Compra não encontrada.');
  const b=await readJson<any>(request),categoryId=await getOrCreateCategory(env,b.categoryName??old.category_name),total=b.totalCents==null?Number(old.total_cents):Number(b.totalCents),count=b.installmentCount==null?Number(old.installment_count):Number(b.installmentCount),purchaseDate=b.purchaseDate??old.purchase_date,description=(b.description??old.description).trim(),cardId=b.cardId??old.card_id;
  if(!Number.isInteger(total)||total<=0||!Number.isInteger(count)||count<1||count>60)throw new HttpError(400,'Compra ou parcelas inválidas.');
  const card=await env.DB.prepare('SELECT * FROM cards WHERE id=? AND archived_at IS NULL').bind(cardId).first<any>();if(!card)throw new HttpError(400,'Cartão inválido.');
  const structuralChange=total!==Number(old.total_cents)||count!==Number(old.installment_count)||purchaseDate!==old.purchase_date||cardId!==old.card_id||!!b.firstDueDate;
  if(structuralChange&&await hasSettledInstallment(env,id))throw new HttpError(409,'Não é possível alterar valor, cartão, data ou parcelamento depois que uma parcela foi paga.');
  const now=nowIso(),statements:any[]=[env.DB.prepare('UPDATE card_purchases SET card_id=?,description=?,total_cents=?,purchase_date=?,category_id=?,installment_count=?,updated_at=?,version=version+1 WHERE id=?').bind(cardId,description,total,purchaseDate,categoryId,count,now,id)];
  if(structuralChange){
    const firstRow=await env.DB.prepare('SELECT due_date FROM card_installments WHERE purchase_id=? ORDER BY number LIMIT 1').bind(id).first<any>();const first=b.firstDueDate||firstRow?.due_date||purchaseDate;
    statements.push(env.DB.prepare('UPDATE entries SET deleted_at=?,updated_at=?,version=version+1 WHERE card_purchase_id=? AND deleted_at IS NULL').bind(now,now,id));
    statements.push(env.DB.prepare('DELETE FROM card_installments WHERE purchase_id=?').bind(id));
    const base=Math.floor(total/count),rem=total-base*count;
    for(let i=0;i<count;i++){
      const installmentId=uuid(),entryId=uuid(),amount=base+(i===count-1?rem:0),due=addMonths(first,i),entryDescription=count>1?`${description} · ${i+1}/${count}`:description;
      statements.push(env.DB.prepare("INSERT INTO card_installments (id,purchase_id,number,due_date,amount_cents,status,created_at) VALUES (?,?,?,?,?,'planned',?)").bind(installmentId,id,i+1,due,amount,now));
      statements.push(env.DB.prepare("INSERT INTO entries (id,kind,description,amount_cents,competence_date,due_date,category_id,account_id,status,payment_method,card_purchase_id,card_installment_id,created_at,updated_at,version) VALUES (?,'expense',?,?,?,?,?,?,'planned','Crédito',?,?,?,?,1)").bind(entryId,entryDescription,amount,purchaseDate,due,categoryId,card.payment_account_id||null,id,installmentId,now,now));
    }
  }else{
    const installments=await env.DB.prepare('SELECT id,number FROM card_installments WHERE purchase_id=? ORDER BY number').bind(id).all<any>();
    for(const installment of installments.results||[]){const entryDescription=count>1?`${description} · ${installment.number}/${count}`:description;statements.push(env.DB.prepare('UPDATE entries SET description=?,category_id=?,account_id=?,updated_at=?,version=version+1 WHERE card_installment_id=? AND deleted_at IS NULL').bind(entryDescription,categoryId,card.payment_account_id||null,now,installment.id));}
  }
  await env.DB.batch(statements);const after=await before(env,id);await audit(env,'card_purchase.updated','card_purchase',id,old,after);return json({ok:true});
}catch(error){return errorResponse(error)}};

export const onRequestDelete:PagesFunction<Env>=async({env,params})=>{try{const id=String(params.id),old=await before(env,id);if(!old)throw new HttpError(404,'Compra não encontrada.');if(await hasSettledInstallment(env,id))throw new HttpError(409,'Não é possível excluir uma compra com parcela já paga. Exclua/reverta primeiro as baixas relacionadas.');const now=nowIso();await env.DB.batch([env.DB.prepare('UPDATE entries SET deleted_at=?,updated_at=?,version=version+1 WHERE card_purchase_id=? AND deleted_at IS NULL').bind(now,now,id),env.DB.prepare('DELETE FROM card_purchases WHERE id=?').bind(id)]);await audit(env,'card_purchase.deleted','card_purchase',id,old,null);return json({ok:true});}catch(error){return errorResponse(error)}};
